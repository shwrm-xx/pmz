#!/usr/bin/env node
// Chaîne Plan → Scope → session maître (retour utilisateur 2026-11-04) : rôles par session_id,
// sessions relais muettes sur <side-sessions-event>, titres stables malgré l'état partagé écrasé.
// Usage : node test/run-tests-relais.js (exit 0 si tout passe). Bac à sable : dossier temp.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const PKG = path.join(__dirname, '..', 'promptimizer');
const HOOKS = path.join(PKG, 'hooks');
const roles = require(path.join(PKG, 'lib', 'roles.js'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-relais-'));

let pass = 0;
const failures = [];
function ok(c, l) { if (c) pass++; else { failures.push(l); console.log('  ✗ ' + l); } }

const repo = path.join(TMP, 'repo');
fs.mkdirSync(path.join(repo, '.vibe-agent'), { recursive: true });
fs.writeFileSync(path.join(repo, 'CLAUDE.md'), '# x\n');
execFileSync('git', ['init', '-q'], { cwd: repo });

const env = Object.assign({}, process.env, { CLAUDE_CONFIG_DIR: path.join(TMP, 'cfg'), PMZ_STATE_DIR: path.join(TMP, 'st') });
delete env.PMZ_DISABLED;
function hook(file, input) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, file)], { input: JSON.stringify(Object.assign({ cwd: repo }, input)), encoding: 'utf8', env });
  let json = null;
  try { json = r.stdout.trim() ? JSON.parse(r.stdout) : null; } catch (_) { json = 'invalid'; }
  return { code: r.status, json };
}
const ctx = (r) => (r.json && r.json.hookSpecificOutput && r.json.hookSpecificOutput.additionalContext) || '';
const EVT = '<side-sessions-event>\nLa session Scope a fini un tour.\n</side-sessions-event>';

// --- lib/roles ---
ok(roles.isSideSessionsEvent(EVT) && !roles.isSideSessionsEvent('salut <side-sessions-event>'), 'roles : détection du prompt synthétique en tête seulement');
ok(roles.launchesChainSession({ title: 'Scope — Avis', prompt: '/pmz:scope --plan /x.md' }), 'roles : start_session Scope reconnu');
ok(roles.launchesChainSession({ title: 'Session maître — Avis', prompt: 'Invoque le skill pmz:epicmaster.' }), 'roles : start_session maître reconnu');
ok(!roles.launchesChainSession({ title: 'Corriger le bug', prompt: 'Corrige le scope du test.' }), 'roles : start_session ordinaire ignoré');

// --- Session Plan : rôle plan, puis relais après start_session Scope ---
let r = hook('user-prompt-submit.js', { session_id: 'P', prompt: 'planifie X', permission_mode: 'plan' });
ok(/· Plan\]/.test(ctx(r)), 'Plan : titre « [XXX · Plan] » en mode plan');
ok(roles.getRole(repo, 'P').role === 'plan', 'Plan : rôle persisté');
r = hook('user-prompt-submit.js', { session_id: 'P', prompt: EVT, permission_mode: 'plan' });
ok(!r.json || r.json.decision !== 'block', 'Plan non relais : événement non filtré');
r = hook('post-tool-use.js', { session_id: 'P', tool_name: 'mcp__ccd_session__start_session', tool_input: { title: 'Scope — X', prompt: '/pmz:scope --plan /tmp/p.md' }, tool_response: {} });
ok(r.code === 0 && !r.json, 'post-tool-use start_session : silencieux');
ok(roles.isRelay(repo, 'P'), 'Plan : relais après lancement de la Scope');

// --- Sous-session Scope (hérite du mode plan) : titre Scope stable malgré l'état partagé écrasé ---
r = hook('user-prompt-submit.js', { session_id: 'S', prompt: '/pmz:scope --plan /tmp/p.md', permission_mode: 'plan' });
ok(/· Scope\]/.test(ctx(r)), 'Scope : titre « [XXX · Scope] » malgré le mode plan');
hook('user-prompt-submit.js', { session_id: 'OTHER', prompt: 'autre chose' }); // écrase session-state.json
r = hook('user-prompt-submit.js', { session_id: 'S', prompt: 'continue', permission_mode: 'plan' });
ok(!/· Plan\]/.test(ctx(r)), 'Scope : jamais retitrée « Plan » après écrasement de l\'état partagé');
ok(roles.getRole(repo, 'S').role === 'scope', 'Scope : rôle scope conservé');

// --- Plan relais : événement écarté, prompt humain passe, titre figé ---
r = hook('user-prompt-submit.js', { session_id: 'P', prompt: EVT });
ok(r.code === 0 && r.json && r.json.decision === 'block', 'Plan relais : <side-sessions-event> écarté (block)');
r = hook('user-prompt-submit.js', { session_id: 'P', prompt: 'une vraie question' });
ok(r.code === 0 && (!r.json || r.json.decision !== 'block'), 'Plan relais : prompt humain jamais bloqué');
ok(!/· HS\]/.test(ctx(r)), 'Plan relais hors mode plan : pas retitrée « HS »');

// --- Scope lance la session maître : relais ; la maître, elle, reçoit ses événements ---
hook('post-tool-use.js', { session_id: 'S', tool_name: 'mcp__ccd_session__start_session', tool_input: { title: 'Session maître — X', prompt: 'Invoque le skill pmz:epicmaster.' } });
r = hook('user-prompt-submit.js', { session_id: 'S', prompt: EVT });
ok(r.json && r.json.decision === 'block', 'Scope relais : événement de la maître écarté');
hook('user-prompt-submit.js', { session_id: 'M', prompt: '/pmz:epicmaster' });
ok(roles.getRole(repo, 'M').role === 'master', 'Maître : rôle master');
r = hook('user-prompt-submit.js', { session_id: 'M', prompt: EVT });
ok(!r.json || r.json.decision !== 'block', 'Maître non relais : porte les événements');
r = hook('user-prompt-submit.js', { session_id: 'M', prompt: 'suite' });
ok(!/Titre de CETTE session/.test(ctx(r)), 'Maître : se titre elle-même (rôle survit à l\'état partagé)');

// --- Fail-open ---
fs.writeFileSync(roles.rolesFile(repo), '{pas du json');
r = hook('user-prompt-submit.js', { session_id: 'P', prompt: EVT });
ok(r.code === 0 && (!r.json || r.json.decision !== 'block'), 'roles illisible : fail-open, rien bloqué');
r = hook('post-tool-use.js', { session_id: 'P', tool_name: 'mcp__ccd_session__start_session', tool_input: 'nimporte' });
ok(r.code === 0, 'post-tool-use start_session entrée invalide : exit 0');

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
console.log(`relais : ${pass} OK · ${failures.length} échec(s)`);
process.exit(failures.length ? 1 : 0);
