#!/usr/bin/env node
// US#189 — `backlog.js doctor --state [--fix]` : fichiers d'état figés détectés (orange), purgés par
// --fix, second passage vert ; `archive --repair` câblé. Bac à sable temp, zéro réseau.
// Usage : node test/run-tests-doctor-state.js (exit 0 si tout passe).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const BACKLOG = path.join(__dirname, '..', 'promptimizer', 'scripts', 'backlog.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-dstate-'));
let pass = 0;
const failures = [];
function ok(c, l) { if (c) pass++; else { failures.push(l); console.log('  ✗ ' + l); } }
const run = (cwd, args) => { const r = spawnSync(process.execPath, [BACKLOG].concat(args), { cwd, encoding: 'utf8' }); return (r.stdout || '') + (r.stderr || ''); };
const sh = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const w = (root, rel, txt) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, txt); };

// Cas 1 : fleet 8 j + alerte au mauvais seeded_at + consignes hors dépôt
const A = path.join(TMP, 'a'); fs.mkdirSync(A); sh(A, ['init', '-q']);
w(A, '.vibe-agent/fleet.json', JSON.stringify({ version: 1, lots: [{ id: 1, session_owner: 'x' }], updated_at: new Date(Date.now() - 8 * 86400000).toISOString() }));
w(A, '.vibe-agent/epicmaster-live.json', JSON.stringify({ v: 1, seeded_at: '2026-11-06T09:00:00.000Z', lots: {}, agents: {} }));
w(A, '.vibe-agent/epicmaster-concurrency-alert.json', JSON.stringify({ x: '2026-10-29T14:00:00.000Z' }));
w(A, '.vibe-agent/consignes-sous-agent.md', 'Dépôt : /ailleurs/autre-depot.\n');
let o = run(A, ['doctor', '--state']);
ok(/ORANGE/.test(o), 'orange sur état figé');
ok(/fleet\.json/.test(o) && /alerte de concurrence/.test(o) && /consignes-sous-agent/.test(o), 'fleet, alerte, consignes signalés');
ok(fs.existsSync(path.join(A, '.vibe-agent/fleet.json')), 'sans --fix : rien supprimé');
o = run(A, ['doctor', '--state', '--fix']);
ok(/VERT/.test(o) && !fs.existsSync(path.join(A, '.vibe-agent/fleet.json')) && !fs.existsSync(path.join(A, '.vibe-agent/epicmaster-concurrency-alert.json')) && !fs.existsSync(path.join(A, '.vibe-agent/consignes-sous-agent.md')), '--fix purge');
ok(/VERT/.test(run(A, ['doctor', '--state'])) && !/\[orange\]/.test(run(A, ['doctor', '--state'])), 'second passage vert');

// Cas 2 : alerte conforme au live conservée ; consignes dans le dépôt conservées
const B = path.join(TMP, 'b'); fs.mkdirSync(B); sh(B, ['init', '-q']);
w(B, '.vibe-agent/epicmaster-live.json', JSON.stringify({ v: 1, seeded_at: 'S1', lots: {}, agents: {} }));
w(B, '.vibe-agent/epicmaster-concurrency-alert.json', JSON.stringify({ 'S1:w1': 't' }));
w(B, '.vibe-agent/consignes-sous-agent.md', `Dépôt : ${B}.\n`);
ok(/VERT/.test(run(B, ['doctor', '--state'])), 'état sain : vert');

// Cas 3 : lot-counter/handoff versionnés contre .gitignore + agents d'une epic close
const C = path.join(TMP, 'c'); fs.mkdirSync(C); sh(C, ['init', '-q']);
sh(C, ['config', 'user.email', 't@t']); sh(C, ['config', 'user.name', 't']);
w(C, '.vibe-agent/lot-counter.json', '{}'); w(C, '.vibe-agent/handoff.md', 'x');
w(C, '.vibe-agent/backlog.json', JSON.stringify({ lots: [{ id: 1, status: 'done' }] }));
w(C, '.claude/agents/mh-lot-sonnet.md', 'agent'); w(C, '.claude/agents/autre.md', 'agent');
sh(C, ['add', '-A', '-f']); sh(C, ['commit', '-q', '-m', 'init']);
w(C, '.gitignore', '/.vibe-agent/lot-counter.json\n/.vibe-agent/handoff.md\n');
o = run(C, ['doctor', '--state']);
ok(/ORANGE/.test(o) && /lot-counter\.json versionné/.test(o) && /handoff\.md versionné/.test(o) && /mh-lot-sonnet/.test(o), 'versionnés + agents epic close signalés');
run(C, ['doctor', '--state', '--fix']);
ok(sh(C, ['ls-files', '.vibe-agent/lot-counter.json']).stdout.trim() === '' && fs.existsSync(path.join(C, '.vibe-agent/lot-counter.json')), 'git rm --cached (fichier conservé)');
ok(!fs.existsSync(path.join(C, '.claude/agents/mh-lot-sonnet.md')) && fs.existsSync(path.join(C, '.claude/agents/autre.md')), 'agent *-lot-* purgé, autre conservé');
ok(!/\[orange\]/.test(run(C, ['doctor', '--state'])), 'cas 3 : second passage vert');

// archive --repair câblé (dry-run sans archive : aucune erreur)
o = run(A, ['archive', '--repair', '--dry-run']);
ok(/archive --repair \(dry-run\) : verify 0/.test(o), 'archive --repair --dry-run câblé');

// US#194 — doctor « hooks inexécutables » + session-title --scope (plugin de test en bac à sable)
const PKG = path.join(__dirname, '..', 'promptimizer');
const mkPlugin = (name) => { const d = path.join(TMP, name); fs.cpSync(PKG, d, { recursive: true }); return d; };
const doctorOut = (plugin) => { const r = spawnSync(process.execPath, [path.join(plugin, 'install', 'doctor.js'), '--no-pause'], { encoding: 'utf8', env: Object.assign({}, process.env, { CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_CONFIG_DIR: path.join(TMP, 'cfg'), PMZ_NO_UPDATE_CHECK: '1' }) }); return (r.stdout || '') + (r.stderr || ''); };
const P1 = mkPlugin('plugin-ok');
o = doctorOut(P1);
ok(/Hooks exécutables : OK/.test(o), 'doctor : plugin complet, contrôle hooks vert');
const P2 = mkPlugin('plugin-cut');
fs.rmSync(path.join(P2, 'hooks', 'stop.js'));
o = doctorOut(P2);
ok(/Statut : rouge/.test(o) && /fichier manquant .*stop\.js/.test(o) && /claude plugin update pmz@pmz-marketplace/.test(o), 'doctor : hook manquant -> rouge, chemin nommé, commande de réinstallation');
const D = path.join(TMP, 'd'); fs.mkdirSync(D); sh(D, ['init', '-q']); 
const runPlugin = (plugin, cwd, args) => { const r = spawnSync(process.execPath, [path.join(plugin, 'scripts', 'backlog.js')].concat(args), { cwd, encoding: 'utf8' }); return { out: (r.stdout || '').trim(), code: r.status }; };
const trg = require('../promptimizer/lib/trigram');
trg.writeTrigram(D, 'COC'); const tri = trg.readTrigram(D);
ok(tri === 'COC', 'trigramme COC posé');
let t = runPlugin(P1, D, ['session-title', '--scope', 'Réparer nommage']);
ok(t.out === `[${tri} · Scope] Réparer nommage` && t.code === 0, 'session-title --scope : ligne [XXX · Scope] seule, exit 0');
t = runPlugin(P2, D, ['session-title', '--scope', 'Réparer nommage']);
ok(t.out === `[${tri} · Scope] Réparer nommage\nhooks PMZ hors service — lance /pmz:doctor` && t.code === 0, 'session-title --scope : plugin amputé -> 2e ligne, exit 0');

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
console.log(`doctor-state : ${pass} OK · ${failures.length} échec(s)`);
process.exit(failures.length ? 1 : 0);
