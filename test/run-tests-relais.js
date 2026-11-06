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
r = hook('post-tool-use.js', { session_id: 'P', tool_name: 'mcp__ccd_session__start_session', tool_input: { title: 'Scope — X', prompt: '/pmz:scope --plan /tmp/p.md' }, tool_response: { content: [{ type: 'text', text: JSON.stringify({ session_id: 'local_288cdc04-ce28-4c32-b0d9-4fbc7a4546e4' }) }] } });
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
hook('post-tool-use.js', { session_id: 'S', tool_name: 'mcp__ccd_session__start_session', tool_input: { title: 'Session maître — X', prompt: 'Invoque le skill pmz:epicmaster.' }, tool_response: { session_id: 'local_eaf8672a-8516' } });
r = hook('user-prompt-submit.js', { session_id: 'S', prompt: EVT });
ok(r.json && r.json.decision === 'block', 'Scope relais : événement de la maître écarté');
hook('user-prompt-submit.js', { session_id: 'M', prompt: '/pmz:epicmaster' });
ok(roles.getRole(repo, 'M').role === 'master', 'Maître : rôle master');
r = hook('user-prompt-submit.js', { session_id: 'M', prompt: EVT });
ok(!r.json || r.json.decision !== 'block', 'Maître non relais : porte les événements');
r = hook('user-prompt-submit.js', { session_id: 'M', prompt: 'suite' });
ok(!/Titre de CETTE session/.test(ctx(r)), 'Maître : se titre elle-même (rôle survit à l\'état partagé)');

// --- US#184 ---
const initiated = (o) => hook('post-tool-use.js', Object.assign({ tool_name: 'mcp__ccd_session__start_session' }, o));
// Critère 1 : prompt de carte -> maître, pas de titre HS
for (const p of ['Invoque le skill `pmz:epicmaster`', 'invoque le skill pmz:pickymaster']) {
  r = hook('user-prompt-submit.js', { session_id: 'C1', prompt: p });
  ok(roles.getRole(repo, 'C1').role === 'master' && !/HS\]/.test(ctx(r)), 'US184-1 : prompt de carte -> master sans titre HS (' + p.slice(-18) + ')');
}
ok(!roles.isMasterInvocation('Corrige le skill pmz:scope'), 'US184-1 : prompt ordinaire non maître');
// repli Skill (PostToolUse)
hook('post-tool-use.js', { session_id: 'C1b', tool_name: 'Skill', tool_input: { skill: 'pmz:epicmaster' } });
ok(roles.getRole(repo, 'C1b').role === 'master', 'US184-1 : repli appel Skill -> master');
// Critère 2 : relay seulement sur démarrage réel, levé après clôture / 7 j
initiated({ session_id: 'R1', tool_input: { title: 'Session maître — Y', prompt: 'Invoque le skill pmz:epicmaster.', initiation: 'own_initiative' }, tool_response: { status: 'proposed', task_id: 'task_ab12cd34' } });
ok(!roles.isRelay(repo, 'R1'), 'US184-2 : proposition own_initiative -> pas de relay');
initiated({ session_id: 'R1', tool_input: { title: 'Session maître — Y', prompt: 'Invoque le skill pmz:epicmaster.' }, tool_response: { session_id: 'local_288cdc04-ce28' } });
ok(roles.isRelay(repo, 'R1'), 'US184-2 : démarrage réel -> relay');
hook('post-tool-use.js', { session_id: 'R1', tool_name: 'Bash', tool_input: { command: 'node scripts/close-batch.js' }, tool_response: { stdout: '' } });
ok(!roles.isRelay(repo, 'R1'), 'US184-2 : relay levé après clôture');
ok(!roles.launchesChainSession({ title: 'Corriger', prompt: 'voir la session maître de hier' }), 'US184-2 : plus de match sur chaîne libre');
{
  const f = roles.rolesFile(repo); const all = JSON.parse(fs.readFileSync(f, 'utf8'));
  all.R1 = { relay: true, relay_at: Date.now() - 8 * 24 * 3600 * 1000, at: Date.now() };
  fs.writeFileSync(f, JSON.stringify(all));
  ok(roles.isRelay(repo, 'R1') === false, 'US184-2 : relay_at > 7 j -> isRelay faux');
}
// Critères 3 et 4 : state par sid, élagage
{
  const stLib = require(path.join(PKG, 'lib', 'state.js'));
  const A = Object.assign({}, stLib.DEFAULT_STATE, { session_id: 'A', self_title: 'titre A' });
  stLib.saveState(repo, 'A', A);
  stLib.saveState(repo, 'B', Object.assign({}, stLib.DEFAULT_STATE, { session_id: 'B', self_title: 'titre B' }));
  const fa = JSON.parse(fs.readFileSync(path.join(repo, '.vibe-agent', 'session-state', 'A.json'), 'utf8'));
  ok(fa.self_title === 'titre A' && stLib.loadState(repo, 'A').self_title === 'titre A' && stLib.loadState(repo, 'B').self_title === 'titre B', 'US184-3 : state de A intact après save de B');
  const dir = path.join(repo, '.vibe-agent', 'session-state');
  for (let i = 0; i < 51; i++) fs.writeFileSync(path.join(dir, `old${i}.json`), '{}');
  stLib.saveState(repo, 'Z', Object.assign({}, stLib.DEFAULT_STATE, { session_id: 'Z' }));
  ok(fs.readdirSync(dir).filter((f) => f.endsWith('.json')).length === 50 && fs.existsSync(path.join(dir, 'Z.json')), 'US184-4 : élagage à 50 fichiers');
  // migration : ancien fichier unique lu en repli, non supprimé
  fs.writeFileSync(path.join(repo, '.vibe-agent', 'session-state.json'), JSON.stringify({ session_id: 'LEG', self_title: 'ancien' }));
  ok(stLib.loadState(repo, 'LEG').self_title === 'ancien' && fs.existsSync(path.join(repo, '.vibe-agent', 'session-state.json')), 'US184-3 : repli sur l\'ancien fichier unique');
  ok(stLib.loadState(repo, 'AUTRE').self_title === null, 'US184-3 : ancien fichier d\'une autre session ignoré');
}
// Critère 5 : set_session_title -> title + epic
fs.writeFileSync(path.join(repo, '.vibe-agent', 'epic'), 'Fiabilité\n');
hook('post-tool-use.js', { session_id: 'T1', tool_name: 'mcp__ccd_session_mgmt__set_session_title', tool_input: { session_id: 'self', title: '[XXX · EP#1–#2] Fiabilité' } });
ok(roles.getRole(repo, 'T1').title === '[XXX · EP#1–#2] Fiabilité' && roles.getRole(repo, 'T1').epic === 'Fiabilité', 'US184-5 : set_session_title -> title + epic dans session-roles');

// --- Fail-open ---
fs.writeFileSync(roles.rolesFile(repo), '{pas du json');
r = hook('user-prompt-submit.js', { session_id: 'P', prompt: EVT });
ok(r.code === 0 && (!r.json || r.json.decision !== 'block'), 'roles illisible : fail-open, rien bloqué');
r = hook('post-tool-use.js', { session_id: 'P', tool_name: 'mcp__ccd_session__start_session', tool_input: 'nimporte' });
ok(r.code === 0, 'post-tool-use start_session entrée invalide : exit 0');

// --- US#190 : startedForReal strict, master le plus récent, hooks.json ---
ok(!roles.startedForReal({ status: 'proposed', task_id: 'task_ab1', note: 'voir /tmp/local_288cdc04-ce28/x' }), 'US190-5 : local_ hors champ d\'id -> pas un démarrage réel');
ok(!roles.startedForReal('proposé, cf local_288cdc04-ce28'), 'US190-5 : texte libre -> faux');
ok(roles.startedForReal({ content: [{ type: 'text', text: '{"session_id":"local_288cdc04-ce28"}' }] }), 'US190-5 : champ session_id dans un texte JSON -> vrai');
roles.setRole(repo, 'M-old', { role: 'master' });
roles.setRole(repo, 'M-new', { role: 'master' });
roles.setRole(repo, 'PL', { role: 'plan' });
ok(roles.latestMasterSid(repo) === 'M-new' || roles.latestMasterSid(repo) === 'M-old', 'US190-3 : latestMasterSid ignore les rôles non master');
ok(roles.latestMasterSid(path.join(TMP, 'absent')) === null, 'US190-3 : latestMasterSid fail-open (null)');
const hj = JSON.parse(fs.readFileSync(path.join(HOOKS, 'hooks.json'), 'utf8'));
const pm = hj.hooks.PostToolUse[0].matcher.split('|');
ok(pm.includes('Skill') && pm.includes('mcp__ccd_session_mgmt__set_session_title'), 'US190-1 : hooks.json PostToolUse couvre Skill + set_session_title');
ok(/Skill\|mcp__ccd_session_mgmt__set_session_title/.test(fs.readFileSync(path.join(PKG, 'install', 'merge-settings.js'), 'utf8')), 'US190-1 : merge-settings couvre Skill + set_session_title');
ok(/markPlanSession\(planRoot, input\.session_id\)/.test(fs.readFileSync(path.join(HOOKS, 'pre-tool-use.js'), 'utf8')), 'US190-4 : markPlanSession reçoit le sid');

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
console.log(`relais : ${pass} OK · ${failures.length} échec(s)`);
process.exit(failures.length ? 1 : 0);
