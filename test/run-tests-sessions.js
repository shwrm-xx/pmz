#!/usr/bin/env node
// US#188 — surface « où se passe quoi » : sessions, statusline, bande, logs nommés, notifications.
// Zéro dépendance, bac à sable temporaire (jamais le ~/.claude réel). Usage : node test/run-tests-sessions.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-sessions-'));
process.env.CLAUDE_CONFIG_DIR = path.join(SANDBOX, 'cfg');
delete process.env.PMZ_NO_LIVE_MIRROR;
delete process.env.PMZ_DISABLE;
delete process.env.PMZ_NOTIFY;

const PKG = path.join(__dirname, '..', 'promptimizer');
const BKLG = path.join(PKG, 'scripts', 'backlog.js');
const STATUS = path.join(PKG, 'scripts', 'statusline.js');
const HOOK = path.join(PKG, 'hooks', 'subagent-live.js');
const live = require(path.join(PKG, 'lib', 'epicmaster-live.js'));
const fleetLib = require(path.join(PKG, 'lib', 'fleet.js'));
const notify = require(path.join(PKG, 'lib', 'notify.js'));
const outFb = require(path.join(PKG, 'lib', 'output-fallback.js'));

let pass = 0;
const failures = [];
function ok(cond, label) { if (cond) pass++; else { failures.push(label); console.log('  ✗ ' + label); } }

function cli(args) {
  const r = spawnSync(process.execPath, [BKLG].concat(args), { encoding: 'utf8', env: process.env });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function hook(repo, event, sid, agent, type) {
  spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: event, cwd: repo, session_id: sid, agent_id: agent, agent_type: type || 'general-purpose' }),
    encoding: 'utf8', env: process.env,
  });
}
function statusline(repo, sid) {
  const r = spawnSync(process.execPath, [STATUS], { input: JSON.stringify({ cwd: repo, session_id: sid }), encoding: 'utf8', env: process.env });
  return (r.stdout || '').trim();
}
function mkRepo(name, n) {
  const repo = path.join(SANDBOX, name);
  fs.mkdirSync(repo, { recursive: true });
  execFileSync('git', ['init', '-q', repo]);
  fs.writeFileSync(path.join(repo, 'a.txt'), '1');
  execFileSync('git', ['-C', repo, 'add', '.']);
  execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init']);
  for (let i = 1; i <= n; i++) {
    cli(['add', '--cwd', repo, '--title', 'Lot ' + i, '--model', 'sonnet', '--effort', 'low', '--epic', 'Fiabilité', '--perimeter', `lib/p${i}/**`]);
  }
  return repo;
}

const M = 'maitre1abcdef', S = 'scope02ghijkl', D = 'fille03mnopqr';
const repo = mkRepo('repo', 4);
const rolesFile = path.join(repo, '.vibe-agent', 'session-roles.json');
fs.writeFileSync(rolesFile, JSON.stringify({
  [M]: { role: 'master', title: '[EM] Maître', epic: 'Fiabilité', at: Date.now() },
  [S]: { role: 'scope', title: '[Scope] Découpe', epic: 'Fiabilité', at: Date.now() - 3600 * 1000 },
}));
cli(['epicmaster', '--cwd', repo, '--live-seed', '--epic', 'Fiabilité', '--session', M]);
cli(['start', '--cwd', repo, '--id', '1', '--owner', 'master/lot-1']);
cli(['start', '--cwd', repo, '--id', '2', '--owner', 'master/lot-2']);
hook(repo, 'SubagentStart', M, 'ag-1', 'general-purpose');
hook(repo, 'SubagentStart', M, 'ag-2', 'Explore');
fleetLib.upsertLot(repo, { id: 3, session_owner: D, state: 'in_progress', title: 'Fille', perimeter: ['lib/p3/**'] });

// ── Critère 1 : une ligne par session, rôle / epic / US / état ──────────────────────────────
{
  const r = cli(['sessions', '--cwd', repo, '--json']);
  let rows = [];
  try { rows = JSON.parse(r.out); } catch (_) { /* rows vide */ }
  const by = (sid6) => rows.find((x) => x.sid6 === sid6) || {};
  ok(r.code === 0 && rows.length === 3, 'critère 1 : 3 sessions (2 rôles + 1 fille D3), une ligne chacune');
  ok(by(M.slice(0, 6)).role === 'master' && by(M.slice(0, 6)).epic === 'Fiabilité' && by(M.slice(0, 6)).us === 'US#1,US#2'
    && /^waves/.test(by(M.slice(0, 6)).state) && /2 agents/.test(by(M.slice(0, 6)).state) && by(M.slice(0, 6)).alive === 'oui', 'critère 1 : maître = rôle, epic, US#1,US#2, état waves · 2 agents, vivante');
  ok(by(S.slice(0, 6)).role === 'scope' && by(S.slice(0, 6)).us === '—' && by(S.slice(0, 6)).alive === 'oui', 'critère 1 : session scope listée, sans US');
  ok(by(D.slice(0, 6)).role === 'fille' && by(D.slice(0, 6)).us === 'US#3' && /^D3/.test(by(D.slice(0, 6)).state), 'critère 1 : fille D3 = US#3');
  const t = cli(['sessions', '--cwd', repo]).out.trimEnd().split('\n');
  ok(/^titre \| rôle \| sid6 \| vivante/.test(t[0]) && t.length === 4, 'critère 1 : tableau texte, en-tête + 3 lignes');
  const lr = live.renderLive(repo, { sessions: true });
  ok(/\| master \|/.test(lr.text), '--live --sessions : même vue');
  // « vivante » = événement < 6 h : un maître au live vieux de 8 h passe à « non ».
  const old = Date.now() + 8 * 3600 * 1000;
  const rows8 = require(path.join(PKG, 'lib', 'backlog.js')).sessionsRows(repo, old);
  ok(rows8.every((x) => x.alive === 'non'), 'vivante : événement > 6 h -> non');
}

// ── Critère 3 + statusline : US propre, EM seulement en maître, D3 #N en fille ───────────────
{
  cli(['done', '--cwd', repo, '--id', '1', '--owner', 'master/lot-1', '--verify-verdict', 'none']);
  const r1 = cli(['start', '--cwd', repo, '--id', '4', '--owner', S]);
  const sm = statusline(repo, M), ss = statusline(repo, S), sd = statusline(repo, D);
  ok(/\bEM\b/.test(sm), 'statusline maître : segment EM');
  ok(/US#4/.test(ss) && !/\bEM\b/.test(ss), `critère 3 : session non maître avec owner = sid -> US#4 et pas EM (${r1.code}) « ${ss} »`);
  ok(/D3 #3/.test(sd) && !/\bEM\b/.test(sd), 'statusline fille : D3 #3, pas de EM');
  ok(live.statusSegment(repo) !== '' && /^EM/.test(live.statusSegment(repo)), 'statusSegment sans sid : comportement historique');
}

// ── Critères 2 : bande (rendu texte des segments, TS chargé via --experimental-strip-types) ──
{
  const liveTs = pathToFileURL(path.join(PKG, 'mods', 'epicmaster-band', 'hooks', 'live.ts')).href;
  const script = `
    import * as L from ${JSON.stringify(liveTs)};
    const now = Date.parse('2026-11-06T12:00:00Z');
    const mk = (phase) => JSON.stringify({ updated_at: new Date(now - 60000).toISOString(), epic: 'Fiab', phase,
      lots: { 1: { id: 1, title: 'A', status: 'done', wave: 1 }, 2: { id: 2, title: 'B', status: 'done', wave: 1 } },
      agents: { x: { id: 'x', type: 'pmz-reviewer', lot: null, kind: 'review', started_at: new Date(now - 1000).toISOString(), stopped_at: null },
                y: { id: 'y', type: 'general-purpose', lot: 2, started_at: new Date(now - 1000).toISOString(), stopped_at: null } } });
    const v = L.parseLive(mk('review'), now);
    const d = L.parseLive(mk('done'), now);
    const fleet = L.parseFleet(JSON.stringify({ lots: [{ id: 7, state: 'in_progress', session_owner: 'abc' }] }));
    const roles = JSON.stringify({ abcdef12: { role: 'master', title: 'M', epic: 'Fiab', at: now - 1000 } });
    console.log(JSON.stringify({ head: L.bandHead(v), finished: v.finished, phase: L.phaseLabel(v), doneFinished: d.finished,
      agents: v.agents.map(L.agentLine), fleet: L.fleetLabel(fleet), sessions: L.sessionsText(roles, mk('review'), null, now) }));
  `;
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', script], { encoding: 'utf8' });
  let o = null;
  try { o = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch (_) { /* o null */ }
  ok(!!o, 'bande : live.ts chargeable (strip-types) ' + (r.stderr || '').slice(0, 120));
  if (o) {
    ok(/relecture/.test(o.head) && o.phase === 'relecture' && o.finished === false, 'critère 2 : phase review -> « relecture », pas terminé');
    ok(o.doneFinished === true, 'bande : phase done -> terminé');
    ok(o.agents.includes('⚙ #2 general-purpose') && o.agents.includes('⚙ relecture pmz-reviewer'), 'bande : ligne d\'agent = #N + subagent_type (ou phase)');
    ok(/D3 · 1 US en vol \(#7 in_progress\)/.test(o.fleet), 'bande : vague D3 affichée');
    ok(/^titre \| rôle/.test(o.sessions) && /\| master \| abcdef \| oui \|/.test(o.sessions), 'bande : bouton Sessions = même tableau');
  }
  const reg = fs.readFileSync(path.join(PKG, 'mods', 'epicmaster-band', 'hooks', 'register.tsx'), 'utf8');
  ok(/label="Sessions"/.test(reg) && /bandHead\(view\)/.test(reg) && /parseFleet/.test(reg), 'bande : bouton Sessions, phase et vagues D3 câblés dans register.tsx');
}

// ── Critère 4 : logs nommés ──────────────────────────────────────────────────────────────────
{
  const rel = outFb.writeFullLog(repo, 'echo x', 'out', '', { sid: 'abcdef123456', usId: 12, title: 'Ma session', now: Date.now() });
  const name = rel ? path.basename(rel) : '';
  ok(/^\d{8}-\d{4}-US12-abcdef-[a-z0-9]{4}\.log$/.test(name), `critère 4 : nom du log (${name})`);
  const first = rel ? fs.readFileSync(path.join(repo, rel), 'utf8').split('\n')[0] : '';
  ok(/^# Session abcdef/.test(first) && /Ma session/.test(first) && /US#12/.test(first), 'critère 4 : première ligne « # Session abcdef · titre · US#12 »');
  ok(/^\d{8}-\d{4}-sans-xxxxxx-[a-z0-9]{4}\.md$/.test(outFb.logName({}, 'md')), 'logName sans US ni sid : sans / xxxxxx');
  const ctx = outFb.logContext(repo, S, Date.now());
  ok(ctx.sid === S && ctx.title === '[Scope] Découpe' && ctx.usId === 4, 'logContext : titre (roles) et US tenue (session_owner = sid)');
}

// ── Critère 5 : notifications (opt-in inchangé) ─────────────────────────────────────────────
{
  const calls = [];
  const realSend = notify.send;
  notify.send = (t, b) => { calls.push(t + '|' + b); return true; };
  try {
    const r2 = mkRepo('repo-n', 3);
    cli(['epicmaster', '--cwd', r2, '--live-seed', '--epic', 'Fiabilité', '--session', 'sidN']);
    const lot = (id) => ({ id, title: 'L' + id });
    live.recordStart(r2, lot(1), 'master/lot-1');
    live.recordDone(r2, lot(1), 'master/lot-1', undefined, 'failed');
    ok(calls.length === 1 && /verify rouge/.test(calls[0]), 'critère 5 : verdict failed -> notify appelé une fois');
    live.recordStart(r2, lot(2), 'master/lot-2');
    live.recordDone(r2, lot(2), 'master/lot-2', undefined, 'ok');
    ok(calls.length === 1, 'verdict ok : aucune notification');
    live.recordNote(r2, Object.assign(lot(3), { note: 'choix UX' }), 'master/lot-3', undefined, true);
    ok(calls.length === 2 && /à trancher/.test(calls[1]), 'nouveau point à trancher -> notification');
    live.recordSubagent(r2, 'start', { agent_id: 'a1', agent_type: 'Explore', session_id: 'sidN' });
    live.recordStart(r2, lot(3), 'master/lot-3');
    live.recordSubagent(r2, 'start', { agent_id: 'a2', agent_type: 'Explore', session_id: 'sidN' });
    const n0 = calls.length;
    live.recordSubagent(r2, 'stop', { agent_id: 'a2', session_id: 'sidN' });
    ok(calls.length === n0 + 1 && /sous-agent terminé/.test(calls[n0]), 'fin de sous-agent -> notification');
    const n1 = calls.length;
    const sp = live.setPhase(r2, 'done');
    ok(calls.length === n1 + 1 && sp.ok && /session maître terminée/.test(calls[n1]), 'fin de maître (phase done) -> notification');
    live.setPhase(r2, 'done');
    ok(calls.length === n1 + 1, 'phase done répétée : pas de doublon');
  } finally { notify.send = realSend; }
  // Opt-in : sans PMZ_NOTIFY=1, le vrai send ne lance rien.
  let spawned = 0;
  ok(notify.notifyVerifyRed({ id: 1, title: 'x' }, { spawn: () => { spawned++; return {}; } }) === false && spawned === 0, 'opt-in : PMZ_NOTIFY absent -> aucun envoi');
  process.env.PMZ_NOTIFY = '1';
  notify.notifyVerifyRed({ id: 1, title: 'x' }, { platform: 'darwin', spawn: () => { spawned++; return {}; } });
  delete process.env.PMZ_NOTIFY;
  ok(spawned === 1, 'opt-in : PMZ_NOTIFY=1 -> un lancement stubé');
}

fs.rmSync(SANDBOX, { recursive: true, force: true });
console.log(failures.length ? `\n${failures.length} échec(s), ${pass} ok` : `\nTous les tests passent (${pass}).`);
process.exit(failures.length ? 1 : 0);
