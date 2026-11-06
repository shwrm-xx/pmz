#!/usr/bin/env node
'use strict';
// US#187 — archive exacte + `archive --repair` (lib/archive.js), toujours en bac à sable.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PKG = path.join(__dirname, '..', 'promptimizer');
const ar = require(path.join(PKG, 'lib', 'archive.js'));
const bl = require(path.join(PKG, 'lib', 'backlog.js'));
const rd = (p) => fs.readFileSync(p, 'utf8');
let fail = 0;
function ok(c, l) { if (!c) { fail++; console.log('  ✗ ' + l); } }

const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-ar-'));
const git = (...a) => execFileSync('git', a, { cwd: d, encoding: 'utf8' });
git('init', '-q'); git('config', 'user.email', 't@t.t'); git('config', 'user.name', 't');
fs.writeFileSync(path.join(d, 'seed.txt'), 's'); git('add', '-A'); git('commit', '-q', '-m', 'init');
const idxPath = path.join(d, '.vibe-agent', 'archive', 'index.md');
const countOf = (re) => (rd(idxPath).match(re) || []).length;

// 1. setClosedVerify resynchronise l'index (critère 1).
const lot = bl.addLot(d, 'Lot un', null, 'sonnet');
bl.startLot(d, lot.id);
bl.doneLot(d, lot.id, 'abc1234');
ok(/^#0001 .*verify:inconnu/m.test(rd(idxPath)), 'doneLot : ligne d\'index en verify:inconnu avant le verdict');
bl.setClosedVerify(d, lot.id, 'ok');
ok(/^#0001 .*verify:OK/m.test(rd(idxPath)), 'setClosedVerify(ok) -> verify:OK');
ok(ar.normVerify('failed') === 'ÉCHEC' && ar.normVerify('none') === 'aucune' && ar.normVerify('timeout') === 'TIMEOUT', 'mapping failed/none/timeout');

// 2. Fiche avec note objet (critère 2).
const w = ar.writeFiche(d, 1, ar.ficheSkeleton({ id: 1, title: 'Lot un', epic: { a: 1, b: 'x' }, date: '2026-01-01', commit: 'abc1234', verify: 'ok' }), { title: { k: 'v' } });
ok(w.ok && !/\[object Object\]/.test(rd(ar.ficheFile(d, 1))), 'fiche : objet aplati, jamais [object Object]');
ok(!/\[object Object\]/.test(rd(idxPath)), 'index : aucun [object Object]');

// 3. En-têtes anciens/doublés (critère 4).
const legacy = '<!-- pmz:archive:index -->\n# Archive PMZ — index des US closes\n\n';
fs.writeFileSync(idxPath, legacy + legacy + '#0001 | 2026-01-01 | abc1234 | epic:T | verify:inconnu | fiche:oui | Lot un\n');
ar.appendIndexLine(d, { id: 2, title: 'Deux' });
ok(countOf(/^# Archive PMZ/gm) === 1 && countOf(/pmz:archive:index -->/g) === 1, 'ensureIndex/append : un seul en-tête');
ok(/^#0002 /m.test(rd(idxPath)) && /^#0001 /m.test(rd(idxPath)), 'entrées conservées');

// 4. repair (critère 5) : verify:inconnu, deux en-têtes, fiche [object Object] + raw.
fs.writeFileSync(idxPath, legacy + legacy + '#0001 | 2026-01-01 | abc1234 | epic:T | verify:inconnu | fiche:oui | Lot un\n');
fs.writeFileSync(ar.ficheFile(d, 1), ar.ficheMarker(1) + '\n# US#1 — x\n\nnote : [object Object]\n');
ar.writeRaw(d, 1, 'Fait\nTravail réel\nDécidé\nchoix — raison — retour\n');
fs.writeFileSync(ar.ficheFile(d, 7), ar.ficheMarker(7) + '\n# US#7\n\n[object Object]\n'); // sans raw
const dry = ar.repair(d, { dryRun: true });
ok(dry.verify === 1 && dry.headers >= 1 && dry.fiches === 1 && dry.fiches_sans_raw.join() === '7', 'repair --dry-run : comptes ' + JSON.stringify(dry));
ok(countOf(/^# Archive PMZ/gm) === 2, 'repair --dry-run : rien écrit');
const r1 = ar.repair(d);
ok(r1.ok && r1.verify === 1 && r1.fiches === 1, 'repair : réparations comptées ' + JSON.stringify(r1));
ok(/^#0001 .*verify:OK/m.test(rd(idxPath)) && countOf(/^# Archive PMZ/gm) === 1, 'repair : verify réécrit depuis closed_verify, en-tête unique');
ok(!/\[object Object\]/.test(rd(ar.ficheFile(d, 1))) && /Travail réel/.test(rd(ar.ficheFile(d, 1))), 'repair : fiche régénérée depuis raw/');
ok(/\[object Object\]/.test(rd(ar.ficheFile(d, 7))), 'repair : fiche sans raw non supprimée, signalée');
const before = rd(idxPath) + rd(ar.ficheFile(d, 1));
const r2 = ar.repair(d);
ok(r2.verify === 0 && r2.headers === 0 && r2.fiches === 0 && before === rd(idxPath) + rd(ar.ficheFile(d, 1)), 'repair : second passage sans effet (idempotent)');

fs.rmSync(d, { recursive: true, force: true });
console.log(fail ? `archive : ${fail} échec(s)` : 'archive : OK');
process.exit(fail ? 1 : 0);
