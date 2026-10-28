#!/usr/bin/env node
'use strict';
// US#155 — Parallélisme réel : consignes de lancement groupé / pipeline glissant (epicmaster.md,
// pickymaster.md) et alerte de concurrence de hooks/subagent-live.js. Lancé par test/run-tests.js.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const PKG = path.join(__dirname, '..', 'promptimizer');
const HOOK = path.join(PKG, 'hooks', 'subagent-live.js');
const rd = (p) => fs.readFileSync(p, 'utf8');
let fail = 0;
function ok(c, l) { if (!c) { fail++; console.log('  ✗ ' + l); } }

// 1. Consignes des deux commandes (identiques : étapes 2 à 4 gardées synchrones par pickymaster).
for (const f of ['epicmaster.md', 'pickymaster.md']) {
  const s = rd(path.join(PKG, 'commands', f));
  ok(/Lancement groupé/.test(s) && /UN SEUL message/.test(s), f + ' : tous les Agent de la vague dans UN SEUL message');
  ok(/run_in_background: true/.test(s) && /Jamais un `Agent` par message/.test(s), f + ' : run_in_background, jamais un Agent par message');
  ok(/Pipeline glissant/.test(s) && /sans attendre les\s+autres/.test(s) && /place libérée part/.test(s), f + ' : pipeline glissant (place libérée -> US éligible suivante)');
  ok(/subagent-live/.test(s) && /concurrence reste à 1/.test(s), f + ' : mentionne l\'alerte subagent-live');
  ok(!/Attends le rapport de \*\*tous\*\*/.test(s), f + ' : plus de barrière de vague stricte');
}

// 2. Hook : alerte si la concurrence reste à 1 sur une vague >= 2 US.
const iso = () => new Date().toISOString();
function mkRepo(name, waves) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-par-' + name + '-'));
  execFileSync('git', ['init', '-q', d]);
  fs.mkdirSync(path.join(d, '.vibe-agent'), { recursive: true });
  const lots = {};
  waves.forEach((w, i) => { lots[i + 1] = { id: i + 1, title: 'Lot ' + (i + 1), status: w === 2 ? 'pending' : 'running', wave: w, owner: 'master/lot-' + (i + 1), started_at: iso(), updated_at: iso() }; });
  fs.writeFileSync(path.join(d, '.vibe-agent', 'epicmaster-live.json'), JSON.stringify({ v: 1, updated_at: iso(), lots, agents: {} }));
  return d;
}
function hook(d, ev, id) {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ hook_event_name: ev, cwd: d, agent_id: id, agent_type: 'general-purpose' }), encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '').trim() };
}
const wait = (ms) => { const t = Date.now() + ms; while (Date.now() < t); };

// 2a. Série (un agent à la fois) sur une vague de 2 -> alerte une seule fois.
let d = mkRepo('serie', [1, 1]);
ok(hook(d, 'SubagentStart', 'a1').out === '', 'hook : start silencieux');
wait(15);
let r = hook(d, 'SubagentStop', 'a1');
let msg = {};
try { msg = JSON.parse(r.out); } catch (_) { /* vide */ }
ok(r.code === 0 && /concurrence restée à 1 sur une vague de 2 US/.test(msg.systemMessage || '') && /UN seul message/.test(msg.systemMessage || '') && /run_in_background/.test(msg.systemMessage || ''),
  'hook : concurrence 1 sur vague de 2 US -> alerte (systemMessage, exit 0)');
wait(15);
hook(d, 'SubagentStart', 'a2'); wait(15);
ok(hook(d, 'SubagentStop', 'a2').out === '', 'hook : alerte émise une seule fois par vague');
fs.rmSync(d, { recursive: true, force: true });

// 2b. Parallèle (chevauchement) -> silencieux.
d = mkRepo('para', [1, 1]);
hook(d, 'SubagentStart', 'b1'); wait(10); hook(d, 'SubagentStart', 'b2'); wait(10);
ok(hook(d, 'SubagentStop', 'b1').out === '' && hook(d, 'SubagentStop', 'b2').out === '', 'hook : agents qui se chevauchent -> aucune alerte');
fs.rmSync(d, { recursive: true, force: true });

// 2c. Vague d'une seule US -> silencieux.
d = mkRepo('solo', [1, 2]);
hook(d, 'SubagentStart', 'c1'); wait(15);
ok(hook(d, 'SubagentStop', 'c1').out === '', 'hook : vague d\'une US -> aucune alerte');
fs.rmSync(d, { recursive: true, force: true });

// 2d. Fail-open : entrées invalides / désactivé -> exit 0 muet.
for (const inp of ['', '{bad', '{}']) {
  const x = spawnSync(process.execPath, [HOOK], { input: inp, encoding: 'utf8' });
  ok(x.status === 0 && !(x.stdout || '').trim(), 'hook : fail-open (' + JSON.stringify(inp) + ')');
}

console.log(fail ? `parallélisme : ${fail} échec(s)` : 'parallélisme : OK');
process.exit(fail ? 1 : 0);
