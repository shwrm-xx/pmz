#!/usr/bin/env node
// US#159 — Arbitrages epicmaster : avertissement --why et contenu du brief. Bac à sable uniquement.
// Zéro dépendance. Usage : node test/run-tests-arbitrages.js (exit 0 si tout passe).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');

const PKG = path.join(__dirname, '..', 'promptimizer');
const CLI = path.join(PKG, 'scripts', 'backlog.js');
let fail = 0;
function ok(c, l) { if (!c) { fail++; console.log('  ✗ ' + l); } }

const sbx = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-us159-'));
const state = path.join(sbx, 'state');
fs.mkdirSync(state);
execFileSync('git', ['init', '-q', sbx]);
const env = Object.assign({}, process.env, { PMZ_STATE_DIR: state });
function add(extra) {
  const r = spawnSync(process.execPath, [CLI, 'add', '--cwd', sbx, '--title', 'Essai'].concat(extra), { encoding: 'utf8', env });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const WARN = /Choix coûteux/;

// 1. Avertit, sans refuser (exit 0 + US ajoutée), pour opus et pour high/xhigh sans --why.
for (const [label, args] of [
  ['opus', ['--model', 'opus']],
  ['effort high', ['--model', 'sonnet', '--effort', 'high']],
  ['effort xhigh', ['--model', 'sonnet', '--effort', 'xhigh']],
]) {
  const r = add(args);
  ok(r.code === 0 && /ajoutée/.test(r.out) && !/^Refusé/m.test(r.out), `${label} sans --why : US ajoutée (pas de refus)`);
  ok(WARN.test(r.out) && /--why/.test(r.out), `${label} sans --why : avertissement émis`);
}

// 2. Muet avec --why, ou sur sonnet medium/low/sans effort.
ok(!WARN.test(add(['--model', 'opus', '--effort', 'high', '--why', 'arbitrage de conception']).out), 'opus high + --why : pas d\'avertissement');
ok(!WARN.test(add(['--model', 'sonnet', '--effort', 'medium']).out), 'sonnet medium : pas d\'avertissement');
ok(!WARN.test(add(['--model', 'sonnet']).out), 'sonnet sans effort : pas d\'avertissement');

// 3. Helper : fail-open sur entrées farfelues.
const bl = require(path.join(PKG, 'lib', 'backlog'));
ok(bl.costlyChoiceWarning(undefined, undefined, undefined) === '', 'helper : entrées vides -> chaîne vide');
ok(bl.costlyChoiceWarning('Opus', null, '   ') !== '', 'helper : --why blanc compte comme absent');

// 4. renderBrief porte plafond de tours/contexte et règle sonnet/opus.
const em = require(path.join(PKG, 'lib', 'epicmaster'));
const brief = em.renderBrief({ id: 1, title: 'T', model_hint: 'sonnet', effort_hint: 'medium', scope: 's', verify: 'v', perimeter: [], depends_on: [] }, null, '/x');
ok(/Plafond : ~\d+ tours d'outils ou contexte à ~\d+ %/.test(brief), 'brief : plafond de tours et de contexte');
ok(/rapport PARTIEL/.test(brief), 'brief : rapport partiel au plafond');
ok(/itère en sonnet/.test(brief) && /jugement final/.test(brief) && /en opus/.test(brief), 'brief : itérer en sonnet, juger en opus');

// 5. US#171 — rapport (Décidé / À trancher), kind arbitrages, brief de l'arbitre, spec « Décisions ».
ok(/Dette \/ Décidé \/ À trancher \/ Bloc CHANGELOG/.test(brief), 'brief : sections Décidé et À trancher');
ok(/expérience utilisateur ou un contrat visible/.test(brief) && /choix — raison — comment revenir/.test(brief), 'brief : règle d\'éligibilité À trancher + format Décidé');
ok(/jamais « Aucun »/.test(brief) && /Non vérifié/.test(brief), 'brief : section vide omise, doute -> Non vérifié');
const briefArb = em.renderBrief({ id: 2, kind: 'arbitrages', title: 'A', model_hint: 'sonnet', effort_hint: 'medium', scope: 's', verify: 'v', perimeter: [], depends_on: [] }, null, '/x');
ok(/^Arbitrages : toutes les décisions sont prises — pas d'À trancher/.test(briefArb), 'brief arbitrages : 1re ligne = consigne');
ok(/Dette \/ Décidé \/ Bloc CHANGELOG/.test(briefArb) && !/Dette \/ Décidé \/ À trancher/.test(briefArb), 'brief arbitrages : « À trancher » retiré des sections');
ok(!/^- À trancher : SEULEMENT/m.test(briefArb), 'brief arbitrages : pas de règle d\'éligibilité À trancher');

const rk = add(['--model', 'sonnet', '--kind', 'arbitrages']);
ok(rk.code === 0 && /ajoutée/.test(rk.out), 'add --kind arbitrages : accepté');
const bk = JSON.parse(fs.readFileSync(path.join(sbx, '.vibe-agent', 'backlog.json'), 'utf8'));
ok(bk.lots.some((l) => l.kind === 'arbitrages'), 'add --kind arbitrages : kind écrit dans le backlog');
ok(bk.lots.every((l) => l.kind === undefined || l.kind === 'arbitrages'), 'US ordinaires : pas de kind');
const rbad = add(['--model', 'sonnet', '--kind', 'autre']);
ok(/^Refusé/m.test(rbad.out) && !/ajoutée/.test(rbad.out), 'add --kind autre : refusé');

function arbiter(input) {
  const r = spawnSync(process.execPath, [CLI, 'epicmaster', '--arbiter-brief', '--stdin', '--cwd', sbx], { encoding: 'utf8', env, input });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const two = arbiter(JSON.stringify({ items: [
  { id: '#171', point: 'point Alpha', options: ['opt un', 'opt deux'], recommended: 1 },
  { id: '#172', point: 'point Beta', options: ['opt trois', 'opt quatre'], recommended: 0 },
] }));
ok(two.code === 0 && /#171/.test(two.out) && /#172/.test(two.out) && /opt un/.test(two.out) && /opt quatre/.test(two.out), 'arbiter-brief : 2 ids et options citées');
ok(/Décisions/.test(two.out) && /Actions/.test(two.out) && /opus/.test(two.out) && /Aucune escalade/.test(two.out), 'arbiter-brief : sections Décisions/Actions, opus, sans escalade');
const none = arbiter('{"items":[]}');
ok(none.code === 0 && /Aucun item technique : pas d'arbitre\./.test(none.out), 'arbiter-brief : items vides -> pas d\'arbitre, exit 0');
const emptyIn = arbiter('');
ok(emptyIn.code === 0 && /Aucun item technique/.test(emptyIn.out), 'arbiter-brief : entrée vide -> pas d\'arbitre, exit 0');
const badJson = arbiter('{pas du json');
ok(badJson.code === 0 && /Usage/.test(badJson.out), 'arbiter-brief : JSON invalide -> usage, exit 0');

ok(bl.SPEC_REQUIRED_SECTIONS.includes('Décisions'), 'spec : Décisions requise');
fs.mkdirSync(path.join(sbx, 'docs'), { recursive: true });
fs.writeFileSync(path.join(sbx, 'docs', 's.md'), '## Récit\n## Critères d\'acceptation\n## Hors périmètre\n## Preuve de clôture\n## Notes\n');
ok(bl.checkSpecStructure(sbx, 'docs/s.md').missing.includes('Décisions'), 'spec sans Décisions : refus cite Décisions');
ok(/^## Décisions/m.test(fs.readFileSync(path.join(PKG, 'templates', 'spec-template.md'), 'utf8')), 'gabarit : section ## Décisions');

fs.rmSync(sbx, { recursive: true, force: true });
// 6. US#172 — procédure maître (docs).
const rdc = (f) => fs.readFileSync(path.join(__dirname, '..', 'promptimizer', f), 'utf8');
for (const f of ['epicmaster', 'pickymaster']) {
  const t = rdc('commands/' + f + '.md');
  ok(/Arbitrages/.test(t) && /--arbiter-brief/.test(t) && /AskUserQuestion/.test(t) && /--kind arbitrages/.test(t) && /attends/.test(t) && /close-wave/.test(t), f + '.md : étape Arbitrages complète');
  ok(/tranche et exécute les arbitrages/.test(t.split('\n')[1]), f + '.md : description à jour');
}
ok(/Décidé cette session/.test(rdc('templates/epicmaster-handoff.md')) && /Dette/.test(rdc('templates/epicmaster-handoff.md')), 'handoff maître : Décidé + Dette');
ok(/« Décisions »/.test(rdc('commands/scope.md')) && /plus de 2 questions ouvertes/.test(rdc('commands/scope.md')), 'scope.md : section Décisions + règle > 2 questions');

console.log(`arbitrages : ${fail ? fail + ' échec(s)' : 'OK'}`);
process.exit(fail ? 1 : 0);
