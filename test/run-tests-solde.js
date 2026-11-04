#!/usr/bin/env node
// US#174 — garde de solde d'epic : `backlog.js epicmaster --settle-check --stdin` + consignes des briefs.
// Zéro dépendance. Usage : node test/run-tests-solde.js (exit 0 si tout passe).
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

const PKG = path.join(__dirname, '..', 'promptimizer');
const BACKLOG = path.join(PKG, 'scripts', 'backlog.js');
const em = require(path.join(PKG, 'lib', 'epicmaster.js'));
let pass = 0;
const failures = [];
function ok(cond, label) { if (cond) pass++; else { failures.push(label); console.log('  ✗ ' + label); } }

function cli(input) {
  const r = spawnSync(process.execPath, [BACKLOG, 'epicmaster', '--settle-check', '--stdin'], { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', cwd: __dirname });
  return { code: r.status, text: (r.stdout || '') + (r.stderr || '') };
}
const dette = (o) => Object.assign({ item: 'd', us: '#1', importance: 'haute', raison: 'hors périmètre' }, o || {});

let r = cli({ a_trancher: [{ item: 'x', maquette: false }] });
ok(r.code === 1 && /À trancher non soldé : x/.test(r.text) && /Solde : NON — 1 point/.test(r.text), 'à trancher sans maquette -> exit 1');
r = cli({ a_trancher: [{ item: 'x', maquette: true }] });
ok(r.code === 0 && /Solde : OK/.test(r.text), 'à trancher avec maquette -> OK');
r = cli({});
ok(r.code === 0 && /Solde : OK/.test(r.text), 'entrée vide -> OK');
r = cli({ dette: [dette({ importance: 'moyenne' })], arbitrage_rounds: 0 });
ok(r.code === 1 && /Dette non éligible/.test(r.text), 'dette moyenne bloquante au tour 0');
r = cli({ a_trancher: [{ item: 'x', maquette: false }], arbitrage_rounds: 2 });
ok(r.code === 0 && /Solde : OK/.test(r.text) && /sera converti en Dette non résolu après arbitrage/.test(r.text), 'US#176 : à trancher non maquette, tour 2 -> OK + avertissement');
r = cli({ a_trancher: [{ item: 'x', maquette: false }], arbitrage_rounds: 0 });
ok(r.code === 1 && /Solde : NON/.test(r.text), 'US#176 : même point, tour 0 -> NON');
r = cli({ dette: [dette({ importance: 'moyenne' })], non_verifie: [{ item: 'n', geste_humain: false }], arbitrage_rounds: 2 });
ok(r.code === 0 && /Solde : OK/.test(r.text), 'US#176 : dette non éligible + non vérifié, tour 2 -> OK');
const fs = require('fs');
const blk = (f) => { const m = fs.readFileSync(path.join(PKG, 'commands', f), 'utf8').match(/- `arbitrage_rounds` vaut[\s\S]*?arbitrage ».\n/); return m ? m[0] : null; };
ok(blk('epicmaster.md') && blk('epicmaster.md') === blk('pickymaster.md'), 'US#176 : arbitrage_rounds défini à l\'identique dans epicmaster.md et pickymaster.md');
r = cli({ dette: [dette({ raison: ' ' })] });
ok(r.code === 1 && /Dette non éligible/.test(r.text), 'dette sans raison -> exit 1');
r = cli({ dette: [dette(), dette({ item: 'e', importance: 'critique' })], arbitrage_rounds: 0 });
ok(r.code === 1 && /Trop de dette \(2 > 1\)/.test(r.text), '2 dettes, tour 0 -> exit 1');
r = cli({ dette: [dette(), dette({ item: 'e' })], arbitrage_rounds: 2 });
ok(r.code === 0 && /Solde : OK/.test(r.text) && /Trop de dette/.test(r.text), '2 dettes, tour 2 -> OK + avertissement');
r = cli({ dette: [dette()] });
ok(r.code === 0, '1 dette éligible -> OK');
r = cli({ non_verifie: [{ item: 'n', geste_humain: false }] });
ok(r.code === 1 && /Non vérifié vérifiable : n/.test(r.text), 'non vérifié sans geste humain -> exit 1');
r = cli({ non_verifie: [{ item: 'n', geste_humain: true, cause: 'mot de passe' }] });
ok(r.code === 0, 'non vérifié geste humain + cause -> OK');
r = cli({ non_verifie: [{ item: 'n', geste_humain: true }] });
ok(r.code === 1 && /cause manquante/.test(r.text), 'geste humain sans cause -> exit 1');
r = cli('{pas du json');
ok(r.code === 1 && /Usage/.test(r.text), 'JSON invalide -> usage + exit 1');

const s = em.settleCheck({ dette: [dette()], a_trancher: [], non_verifie: [] });
ok(s.ok && Array.isArray(s.problems) && Array.isArray(s.warnings) && em.DEBT_MAX === 1 && em.ARBITRAGE_MAX_ROUNDS === 2, 'settleCheck pure + constantes');

const lot = { id: 9, title: 'T', scope: 's', model_hint: 'sonnet', effort_hint: 'medium' };
ok(/jamais en Dette/.test(em.renderBrief(lot, null, null, null)), 'brief sous-agent : jamais en Dette');
ok(/geste humain/.test(em.renderBrief(lot, null, null, null)), 'brief sous-agent : geste humain');
const rb = em.renderReviewBrief({ version: 1, lots: [] }, [1, 2], {});
const rbText = rb && rb.text ? rb.text : '';
ok(!rb.ok || /Problèmes confirmés sont des Défauts/.test(rbText), 'brief relecteur : Problèmes confirmés = Défauts');

if (failures.length) { console.log(`Solde : ${failures.length} échec(s)`); process.exit(1); }
console.log(`Solde : ${pass} OK`);
