#!/usr/bin/env node
// US#164 — Liaison maquettes validées vers US suivantes : brief, injection epicmaster, validate, consignes.
// Zéro dépendance. Usage : node test/run-tests-maquettes-liaison.js (exit 0 si tout passe).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const MQ = path.join(REPO, 'promptimizer', 'scripts', 'maquette.js');
const em = require(path.join(REPO, 'promptimizer', 'lib', 'epicmaster.js'));
let pass = 0;
const failures = [];
function ok(cond, label) { if (cond) pass++; else { failures.push(label); console.log('  ✗ ' + label); } }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-mqliai-'));
spawnSync('git', ['init', '-q'], { cwd: root });
const run = (...a) => spawnSync('node', [MQ, ...a, '--cwd', root], { encoding: 'utf8', env: Object.assign({}, process.env, { PMZ_NO_OPEN: '1' }) });
const rd = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const specOf = (id) => path.join('docs', 'us', 'US-' + id, 'spec.md');

// Aucune maquette.
const r0 = run('brief', '--id', '7');
ok(r0.status === 0 && /Aucune maquette pour l'US 7\./.test(r0.stdout), 'brief sans maquette : message dédié, exit 0');

// US#7 : 2 maquettes (une validée), spec liée.
run('new', '--id', '7', '--slug', 'liste', '--title', 'Liste');
run('new', '--id', '7', '--slug', 'brouillon', '--title', 'Brouillon');
const f = path.join(root, 'docs', 'us', 'US-7', 'maquettes', 'liste.html');
fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</body>', '<div class="etat" data-etat="extra"></div></body>'));
fs.writeFileSync(path.join(root, specOf(7)), '# Spec US#7\n');
run('link', '--id', '7', '--slug', 'liste');
run('link', '--id', '7', '--slug', 'brouillon');

const rd0 = run('brief', '--id', '7');
ok(!/^Maquettes validées/m.test(rd0.stdout) && /Aucune maquette validée/.test(rd0.stdout), 'brief : aucune validée signalée');
ok(/Non validées \(ne pas suivre\)[\s\S]*liste/.test(rd0.stdout), 'brief : brouillons sous « Non validées »');

// validate : INDEX + spec marquée une seule fois.
const rv = run('validate', '--id', '7', '--slug', 'liste');
ok(/Validée/.test(rv.stdout), 'validate ok');
run('validate', '--id', '7', '--slug', 'liste');
const spec = rd(specOf(7));
ok((spec.match(/\(validée\)/g) || []).length === 1, 'validate : « (validée) » une seule fois dans la spec');
ok(/\[liste\]\([^)]*liste\.html\) \(validée\)/.test(spec) && !/brouillon\.html\) \(validée\)/.test(spec), 'validate : seule la ligne de la maquette validée est marquée');

const rb = run('brief', '--id', '7');
ok(/^Maquettes validées/m.test(rb.stdout), 'brief : section « Maquettes validées »');
ok(/- liste · docs\/us\/US-7\/maquettes\/liste\.html · états : [a-z, ]*nominal[a-z, ]*extra · index : \.\.\/\.\.\/maquettes-index\.html/.test(rb.stdout), 'brief : slug, chemin, états, lien index');
ok(/Non validées \(ne pas suivre\)[\s\S]*- brouillon/.test(rb.stdout) && !/validées[\s\S]*- brouillon[\s\S]*Non validées/.test(rb.stdout), 'brief : brouillon à part');

// validate sans spec : message sans échec.
run('new', '--id', '9', '--slug', 'x', '--title', 'X');
const rn = run('validate', '--id', '9', '--slug', 'x');
ok(rn.status === 0 && /Validée/.test(rn.stdout), 'validate sans spec : sans échec');

// epicmaster --brief (renderBrief) : injection / avertissement.
const lot = (id, spec) => ({ id, title: 'T' + id, status: 'todo', model_hint: 'sonnet', effort_hint: 'medium', scope: 'x', verify: 'v', spec });
fs.mkdirSync(path.join(root, 'docs', 'us', 'US-8'), { recursive: true });
fs.writeFileSync(path.join(root, specOf(8)), '# Spec US#8\n\n## Maquettes\n\n- [liste](../US-7/maquettes/liste.html)\n');
const b8 = em.renderBrief(lot(8, specOf(8)), { lots: [] }, null, root);
ok(/Maquettes validées/.test(b8) && b8.includes('docs/us/US-7/maquettes/liste.html'), 'renderBrief : section injectée pour la US citée');
ok(!/^⚠ Maquettes non validées/m.test(b8), 'renderBrief : pas d\'avertissement quand validée');

fs.mkdirSync(path.join(root, 'docs', 'us', 'US-10'), { recursive: true });
fs.writeFileSync(path.join(root, specOf(10)), '# Spec US#10\n\n## Maquettes\n\n- [brouillon](../US-7/maquettes/brouillon.html)\n');
const b10 = em.renderBrief(lot(10, specOf(10)), { lots: [] }, null, root);
ok(b10.split('\n')[0] === '⚠ Maquettes non validées : ne pas coder l\'UI, signale-le dans « À trancher ».', 'renderBrief : avertissement en première ligne');

fs.mkdirSync(path.join(root, 'docs', 'us', 'US-11'), { recursive: true });
fs.writeFileSync(path.join(root, specOf(11)), '# Spec US#11\n\nPas d\'écran.\n');
const b11 = em.renderBrief(lot(11, specOf(11)), { lots: [] }, null, root);
ok(!/Maquettes validées|⚠ Maquettes/.test(b11), 'renderBrief : spec sans section « Maquettes » inchangée');

// Consignes (présence).
const cmd = (n) => fs.readFileSync(path.join(REPO, 'promptimizer', 'commands', n + '.md'), 'utf8');
for (const n of ['epicmaster', 'pickymaster']) {
  const t = cmd(n);
  ok(/le brief contient les maquettes validées/.test(t) && !/lis les maquettes liées à ta spec/.test(t), `${n}.md : consigne « le brief contient les maquettes validées »`);
}
ok(/--depends <id Maquettes>/.test(cmd('scope')) && /cite les\s+maquettes validées/.test(cmd('scope')), 'scope.md : depends + fait quand cite les maquettes validées');

fs.rmSync(root, { recursive: true, force: true });
console.log(`maquettes-liaison : ${pass} ok, ${failures.length} échec(s)`);
process.exit(failures.length ? 1 : 0);
