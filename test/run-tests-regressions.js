#!/usr/bin/env node
// US#161 — Mesure des régressions post-clôture : add --regression-of, show --quality, export.
// Zéro dépendance. Usage : node test/run-tests-regressions.js (exit 0 si tout passe).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const PKG = path.join(__dirname, '..', 'promptimizer');
const BACKLOG = path.join(PKG, 'scripts', 'backlog.js');
let pass = 0;
const failures = [];
function ok(cond, label) { if (cond) pass++; else { failures.push(label); console.log('  ✗ ' + label); } }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-regress-'));
spawnSync('git', ['init', '-q'], { cwd: root });
fs.mkdirSync(path.join(root, '.vibe-agent'), { recursive: true });
const mk = (id, status, model, effort, extra) => Object.assign({ id, title: `US ${id}`, status, scope: `fait ${id}`, model_hint: model, effort_hint: effort }, extra || {});
const b = { version: 1, next_id: 6, lots: [
  mk(1, 'done', 'sonnet', 'medium', { reopened: [{ at: '2026-10-29T10:00:00Z', note: 'x' }] }),
  mk(2, 'done', 'sonnet', 'medium'),
  mk(3, 'done', 'opus', 'high'),
  mk(4, 'todo', 'sonnet', 'medium'),
  mk(5, 'done', 'sonnet', 'low'), // legacy : aucun champ regression_of / reopened
] };
fs.writeFileSync(path.join(root, '.vibe-agent', 'backlog.json'), JSON.stringify(b));

function run(args) {
  const r = spawnSync(process.execPath, [BACKLOG, ...args, '--cwd', root], { encoding: 'utf8' });
  return (r.stdout || '') + (r.stderr || '');
}
const load = () => JSON.parse(fs.readFileSync(path.join(root, '.vibe-agent', 'backlog.json'), 'utf8'));

// 1. add --regression-of : close OK, ouverte/inexistante refusées.
let t = run(['add', '--title', 'Fix régression', '--scope', 'fait quand : ok', '--model', 'sonnet', '--effort', 'medium', '--regression-of', '2']);
ok(/ajoutée/.test(t) && /régression de : #2/.test(t), 'add --regression-of <close> accepté');
ok(load().lots.some((l) => l.title === 'Fix régression' && l.regression_of === 2), 'regression_of persisté');
const n0 = load().lots.length;
t = run(['add', '--title', 'X', '--scope', 'fait quand : ok', '--model', 'sonnet', '--regression-of', '4']);
ok(/Refusé/.test(t) && /close/.test(t), 'refus si US non close');
t = run(['add', '--title', 'X', '--scope', 'fait quand : ok', '--model', 'sonnet', '--regression-of', '99']);
ok(/Refusé/.test(t) && /inexistante/.test(t), 'refus si US inexistante');
ok(load().lots.length === n0, 'aucun lot créé sur refus');

// 2. show --quality : par modèle et par effort, lecture seule.
const before = fs.readFileSync(path.join(root, '.vibe-agent', 'backlog.json'), 'utf8');
t = run(['show', '--quality']);
ok(/modèle sonnet : 3 closes, 1 réouvertures, 1 régressions/.test(t), 'quality : sonnet 3 closes / 1 réouv. / 1 régr.');
ok(/modèle sonnet · effort medium : 2 closes, 1 réouvertures, 1 régressions, taux 100 %/.test(t), 'quality : sonnet·medium + taux');
ok(/modèle opus : 1 closes, 0 réouvertures, 0 régressions, taux 0 %/.test(t), 'quality : opus 0');
ok(/sonnet · effort low : 1 closes, 0 réouvertures, 0 régressions/.test(t), 'quality : legacy → 0');
ok(fs.readFileSync(path.join(root, '.vibe-agent', 'backlog.json'), 'utf8') === before, 'quality lecture seule');

// 3. export : colonne regression_of.
t = run(['export', '--format', 'csv']);
const lines = t.trim().split('\n');
const idx = lines[0].split(',').indexOf('regression_of');
ok(idx >= 0, 'export : colonne regression_of');
const fix = lines.find((l) => l.includes('Fix régression'));
ok(fix && fix.split(',')[idx] === '2', 'export : valeur 2 sur la régression');
const legacy = lines.find((l) => /^5,/.test(l));
ok(legacy && legacy.split(',')[idx] === '', 'export : legacy vide');

// 4. Docs.
const scope = fs.readFileSync(path.join(PKG, 'commands', 'scope.md'), 'utf8');
const close = fs.readFileSync(path.join(PKG, 'commands', 'close-batch.md'), 'utf8');
ok(/--regression-of/.test(scope), 'scope.md mentionne --regression-of');
ok(/--regression-of/.test(close), 'close-batch.md mentionne --regression-of');

if (failures.length) { console.log(`${failures.length} échec(s), ${pass} ok`); process.exit(1); }
console.log(`run-tests-regressions : ${pass} ok`);
