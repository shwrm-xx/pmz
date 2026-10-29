#!/usr/bin/env node
// Garde-fou maquettes (v2.12.1) : une US à écrans ne part jamais en parallèle de l'US « Maquettes »
// de son epic, le brief n'est jamais silencieux, la relecture compare maquettes ↔ UI.
// Zéro dépendance. Usage : node test/run-tests-maquettes-garde.js (exit 0 si tout passe).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const em = require(path.join(REPO, 'promptimizer', 'lib', 'epicmaster.js'));
let pass = 0;
const failures = [];
function ok(cond, label) { if (cond) pass++; else { failures.push(label); console.log('  ✗ ' + label); } }

const lot = (id, title, o) => Object.assign({ id, title, status: 'todo', epic: 'E', model_hint: 'sonnet', effort_hint: 'medium',
  scope: 'x', verify: 'v', perimeter: ['src/' + id + '/**'], depends_on: [] }, o || {});

// Scénario #236/#237 : Maquettes + US à écrans, périmètres disjoints, sans --depends.
const b = { lots: [lot(236, 'Maquettes — E', { perimeter: ['docs/us/**'] }), lot(237, 'Écran liste'), lot(238, 'Autre epic', { epic: 'F' })] };
const mw = em.planMasterWaves(b, b.lots);
const waveOf = (id) => mw.waves.findIndex((w) => w.some((l) => l.id === id));
ok(waveOf(236) === 0 && waveOf(237) === 1, 'planMasterWaves : US à écrans après l\'US Maquettes de son epic');
ok(waveOf(238) === 0, 'planMasterWaves : une autre epic reste en parallèle');
ok(em.effectiveDeps(b, b.lots[1]).includes(236) && em.effectiveDeps(b, b.lots[0]).length === 0, 'effectiveDeps : implicite, jamais sur l\'US Maquettes elle-même');

// US Maquettes ouverte mais non embarquée → l'US à écrans est bloquée, pas lancée.
const mw2 = em.planMasterWaves(b, [b.lots[1]]);
ok(mw2.waves.length === 0 && mw2.blocked.length === 1 && /#236/.test(mw2.blocked[0].reason), 'Maquettes non embarquée : US à écrans bloquée');

// US Maquettes close → dépendance satisfaite ; abandonnée → ignorée.
const b3 = { lots: [lot(236, 'Maquettes — E', { status: 'done' }), lot(237, 'Écran liste')] };
ok(em.planMasterWaves(b3, [b3.lots[1]]).waves.length === 1, 'Maquettes close : US à écrans lançable');
const b4 = { lots: [lot(236, 'Maquettes — E', { status: 'dropped' }), lot(237, 'Écran liste')] };
ok(em.effectiveDeps(b4, b4.lots[1]).length === 0, 'Maquettes abandonnée : pas de dépendance implicite');

// Brief : spec sans section « Maquettes » alors que l'epic a une US Maquettes → alerte en tête.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-mqgarde-'));
spawnSync('git', ['init', '-q'], { cwd: root });
fs.mkdirSync(path.join(root, 'docs', 'us', 'US-237'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs', 'us', 'US-237', 'spec.md'), '# Spec US#237\n\nÉcran liste.\n');
const br = em.renderBrief(b.lots[1], b, null, root);
ok(/^⚠ Maquettes non validées : l'epic a une US Maquettes \(#236\)/.test(br.split('\n')[0]), 'renderBrief : alerte même sans section « Maquettes »');
ok(/Dépend de : #236/.test(br), 'renderBrief : dépendance implicite affichée');
const brF = em.renderBrief(b.lots[2], b, null, root);
ok(!/⚠ Maquettes/.test(brF), 'renderBrief : pas d\'alerte hors epic à maquettes');

// Relecture opus : consigne de comparaison maquettes ↔ UI.
const done = (id) => lot(id, 'T' + id, { status: 'done', closed_commit: 'abc' + id, closed_at: '2026-10-29T0' + (id % 10) });
const rv = em.renderReviewBrief({ lots: [done(1), done(2)] }, [1, 2]);
ok(rv.ok && /compare les maquettes validées/.test(rv.text), 'renderReviewBrief : comparaison maquettes ↔ UI');

// Consignes.
const cmd = (n) => fs.readFileSync(path.join(REPO, 'promptimizer', 'commands', n + '.md'), 'utf8');
for (const n of ['epicmaster', 'pickymaster']) ok(/Garde-fou maquettes/.test(cmd(n)) && /ne lance pas\*\* l'US/.test(cmd(n)), `${n}.md : garde-fou maquettes`);
ok(/en dépendent\s+\*\*implicitement\*\*/.test(cmd('scope')) && !/s'y alignent à la livraison/.test(cmd('scope')), 'scope.md : plus de parallèle maquettes ↔ écrans');

console.log(`\n${pass} ok, ${failures.length} échec(s)`);
process.exit(failures.length ? 1 : 0);
