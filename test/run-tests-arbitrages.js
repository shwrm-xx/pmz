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

fs.rmSync(sbx, { recursive: true, force: true });
console.log(`arbitrages : ${fail ? fail + ' échec(s)' : 'OK'}`);
process.exit(fail ? 1 : 0);
