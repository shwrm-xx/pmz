#!/usr/bin/env node
// US#185 — fichier live juste : rattachement FIFO, filtre session, phases, verrou, timeout, alerte.
// Zéro dépendance, bac à sable temporaire (jamais le ~/.claude réel). Usage : node test/run-tests-live.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-live-'));
process.env.CLAUDE_CONFIG_DIR = path.join(SANDBOX, 'cfg'); // jamais le vrai ~/.claude
delete process.env.PMZ_NO_LIVE_MIRROR;
delete process.env.PMZ_DISABLE;

const PKG = path.join(__dirname, '..', 'promptimizer');
const BKLG = path.join(PKG, 'scripts', 'backlog.js');
const HOOK = path.join(PKG, 'hooks', 'subagent-live.js');
const live = require(path.join(PKG, 'lib', 'epicmaster-live.js'));
const em = require(path.join(PKG, 'lib', 'epicmaster.js'));

let pass = 0;
const failures = [];
function ok(cond, label) { if (cond) pass++; else { failures.push(label); console.log('  ✗ ' + label); } }

function cli(args) {
  const r = spawnSync(process.execPath, [BKLG].concat(args), { encoding: 'utf8', env: process.env });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function hook(repo, event, sid, agent) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: event, cwd: repo, session_id: sid, agent_id: agent, agent_type: 'general-purpose' }),
    encoding: 'utf8', env: process.env,
  });
  return { code: r.status, out: r.stdout || '' };
}
function mkRepo(name, n) {
  const repo = path.join(SANDBOX, name);
  fs.mkdirSync(repo, { recursive: true });
  execFileSync('git', ['init', '-q', repo]);
  fs.writeFileSync(path.join(repo, 'a.txt'), '1');
  execFileSync('git', ['-C', repo, 'add', '.']);
  execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init']);
  for (let i = 1; i <= n; i++) {
    cli(['add', '--cwd', repo, '--title', 'Lot ' + i, '--model', 'sonnet', '--effort', 'low', '--epic', 'E', '--perimeter', `lib/p${i}/**`]);
  }
  return repo;
}
const lf = (repo) => path.join(repo, '.vibe-agent', 'epicmaster-live.json');
const rd = (repo) => JSON.parse(fs.readFileSync(lf(repo), 'utf8'));
const seed = (repo, sid, extra) => cli(['epicmaster', '--cwd', repo, '--live-seed', '--epic', 'E', '--session', sid].concat(extra || []));
const start = (repo, id) => cli(['start', '--cwd', repo, '--id', String(id), '--owner', `master/lot-${id}`]);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// ── Critères 1 à 4 : un maître, trois US, phases ─────────────────────────────────────────────
{
  const repo = mkRepo('repo-main', 4);
  const A = 'sid-maitre-A', B = 'sid-autre-B';
  let r = seed(repo, A);
  ok(r.code === 0 && /État live semé/.test(r.out), 'semis : exit 0');
  let st = rd(repo);
  ok(st.master_session_id === A && st.phase === 'waves' && Array.isArray(st.launch_queue) && st.launch_queue.length === 0 && st.finished === false,
    'semis : master_session_id, phase waves, file vide, finished faux');

  // 1. start x3 (ordre 3, 1, 2 — pas l'ordre des ids) puis 3 SubagentStart : rattachement FIFO.
  start(repo, 3); start(repo, 1); start(repo, 2);
  ok(JSON.stringify(rd(repo).launch_queue) === '[3,1,2]', 'start : launch_queue = ordre des start');
  hook(repo, 'SubagentStart', A, 'ag-x'); hook(repo, 'SubagentStart', A, 'ag-y'); hook(repo, 'SubagentStart', A, 'ag-z');
  st = rd(repo);
  ok(st.agents['ag-x'].lot === 3 && st.agents['ag-y'].lot === 1 && st.agents['ag-z'].lot === 2, 'critère 1 : chaque agent porte l\'US de son start (FIFO)');
  ok(st.launch_queue.length === 0, 'critère 1 : file consommée');

  // 2. Filtre session : un agent d'une autre session laisse le live inchangé (start ET stop).
  const before = fs.readFileSync(lf(repo), 'utf8');
  const hs = hook(repo, 'SubagentStart', B, 'ag-foreign');
  hook(repo, 'SubagentStop', B, 'ag-x');
  ok(hs.code === 0 && !hs.out.trim() && fs.readFileSync(lf(repo), 'utf8') === before, 'critère 2 : SubagentStart/Stop d\'une autre session -> live inchangé');
  ok(live.recordSubagent(repo, 'start', { agent_id: 'ag-f2', session_id: B }) === false && !rd(repo).agents['ag-f2'], 'critère 2 : recordSubagent ignore aussi (lib)');

  // 3. Phases : toutes les US closes + phase review -> finished faux, agent de consolidation tracé.
  for (const id of [1, 2, 3]) cli(['done', '--cwd', repo, '--id', String(id), '--verify-verdict', 'ok', '--commit', 'abc1234', '--no-session', '--no-occupancy']);
  st = rd(repo);
  ok(['1', '2', '3'].every((k) => st.lots[k].status === 'done') && st.finished === false, 'critère 3 : lots clos mais phase waves -> finished faux');
  r = cli(['epicmaster', '--cwd', repo, '--phase', 'review']);
  ok(r.code === 0 && rd(repo).phase === 'review' && rd(repo).finished === false, 'critère 3 : --phase review -> finished faux');
  hook(repo, 'SubagentStart', A, 'ag-review');
  st = rd(repo);
  ok(st.agents['ag-review'] && st.agents['ag-review'].lot === null && st.agents['ag-review'].kind === 'review', 'critère 3 : agent de relecture tracé (lot null, kind review)');
  ok(/review/.test(live.renderDetailed(Object.assign(live.summarize(st), { _agents: st.agents }))), 'rendu détaillé : l\'agent de consolidation porte sa phase');
  hook(repo, 'SubagentStop', A, 'ag-review');
  ok(!!rd(repo).agents['ag-review'].stopped_at, 'critère 3 : arrêt de l\'agent de consolidation tracé');
  for (const p of ['arbitrage', 'settle']) { cli(['epicmaster', '--cwd', repo, '--phase', p]); ok(rd(repo).phase === p && rd(repo).finished === false, `phase ${p} : finished faux`); }
  r = cli(['epicmaster', '--cwd', repo, '--phase', 'bogus']);
  ok(r.code === 1 && /Refusé/.test(r.out) && rd(repo).phase === 'settle', '--phase invalide -> exit 1, phase inchangée');
  cli(['epicmaster', '--cwd', repo, '--phase', 'done']);
  ok(rd(repo).phase === 'done' && rd(repo).finished === true, 'critère 3 : --phase done -> finished vrai');
  const noLive = mkRepo('repo-nolive', 1);
  ok(cli(['epicmaster', '--cwd', noLive, '--phase', 'done']).code === 1 && !fs.existsSync(lf(noLive)), '--phase sans live semé -> exit 1, aucun fichier');

  // --live-add-lot : l'US d'arbitrages entre dans wave_plan.
  r = cli(['epicmaster', '--cwd', repo, '--live-add-lot', '--id', '4', '--wave', 'arbitrages']);
  st = rd(repo);
  const w = (st.wave_plan || []).find((x) => x.label === 'arbitrages');
  ok(r.code === 0 && w && w.ids.length === 1 && w.ids[0] === 4 && st.lots['4'] && st.lots['4'].status === 'pending' && st.lots['4'].wave === w.index && st.wave.total === w.index,
    '--live-add-lot : US semée pending dans une vague « arbitrages » du wave_plan');
  ok(cli(['epicmaster', '--cwd', repo, '--live-add-lot', '--id', '999', '--wave', 'arbitrages']).code === 1, '--live-add-lot : US inconnue -> exit 1');

  // 4. Timeout -> reopened, jamais done.
  start(repo, 4);
  cli(['done', '--cwd', repo, '--id', '4', '--verify-verdict', 'timeout', '--commit', 'abc1234', '--no-session', '--no-occupancy']);
  st = rd(repo);
  ok(st.lots['4'].status === 'reopened' && st.lots['4'].verify === 'timeout', 'critère 4 : verdict timeout -> lot reopened');
  ok(/1 rouvert/.test(live.renderLive(repo, {}).text), 'critère 4 : le rendu compact signale le lot rouvert');
}

// ── Critère 5 : verrou du semis ──────────────────────────────────────────────────────────────
{
  const repo = mkRepo('repo-lock', 2);
  seed(repo, 'A'); start(repo, 1);
  const before = fs.readFileSync(lf(repo), 'utf8');
  let r = seed(repo, 'B');
  ok(r.code === 1 && /Refusé/.test(r.out) && fs.readFileSync(lf(repo), 'utf8') === before, 'critère 5 : second --live-seed d\'une autre session refusé (exit 1, live intact)');
  ok(seed(repo, 'A').code === 0, 'critère 5 : même session -> relance permise');
  start(repo, 1);
  r = seed(repo, 'B', ['--force']);
  ok(r.code === 0 && rd(repo).master_session_id === 'B', 'critère 5 : --force passe outre');
  // Live périmé (> 6 h) : pas de verrou.
  const st = rd(repo);
  st.updated_at = new Date(Date.now() - 7 * 3600 * 1000).toISOString();
  fs.writeFileSync(lf(repo), JSON.stringify(st));
  ok(seed(repo, 'C').code === 0 && rd(repo).master_session_id === 'C', 'verrou : live de plus de 6 h -> pas de refus');
  // Aucun lot running : pas de verrou.
  ok(seed(repo, 'D').code === 0 && rd(repo).master_session_id === 'D', 'verrou : aucun lot running -> pas de refus');
  ok(live.seedFromPlan(repo, { lots: [{ id: 1, title: 'x' }] }, null, { sessionId: 'D2' }).ok === true, 'verrou : seedFromPlan lib sans conflit -> ok');

  // selectLots / planMaster : US `in_progress` tenues par un autre maître.
  seed(repo, 'A', ['--force']); start(repo, 2);
  const b = JSON.parse(fs.readFileSync(path.join(repo, '.vibe-agent', 'backlog.json'), 'utf8'));
  const s1 = em.selectLots(b, { foreignMaster: true });
  ok(!s1.selected.some((l) => l.id === 2) && s1.excluded.some((x) => x.lot.id === 2 && /autre session maître/.test(x.reason)), 'selectLots : in_progress master/* d\'un autre maître exclue');
  ok(em.selectLots(b, {}).selected.some((l) => l.id === 2), 'selectLots : sans autre maître, l\'US en cours reste reprise');
  const bTier = JSON.parse(JSON.stringify(b)); bTier.lots.find((l) => l.id === 2).session_owner = 'autre-owner';
  ok(em.selectLots(bTier, { foreignMaster: true }).selected.some((l) => l.id === 2), 'selectLots : owner non « master/ » -> conservée');
  ok(em.planMaster(repo, b, { sid: 'B' }).excluded.some((x) => x.id === 2) && !em.planMaster(repo, b, { sid: 'A' }).excluded.some((x) => x.id === 2),
    'planMaster : exclusion seulement vue d\'une autre session que le maître du live');
}

// ── Critère 6 : alerte de concurrence rejouée sur nouvelle epic ──────────────────────────────
{
  const repo = mkRepo('repo-alert', 2);
  const alertFile = path.join(repo, '.vibe-agent', live.ALERT_FILE);
  fs.mkdirSync(path.join(repo, '.vibe-agent'), { recursive: true });
  fs.writeFileSync(alertFile, JSON.stringify({ w1: '2020-01-01T00:00:00.000Z' })); // ancien format, ancienne epic
  const round = (n) => {
    seed(repo, 'A', ['--force']); start(repo, 1); start(repo, 2);
    hook(repo, 'SubagentStart', 'A', 'a' + n);
    return hook(repo, 'SubagentStop', 'A', 'a' + n); // série stricte sur une vague de 2 US
  };
  const r1 = round(1);
  ok(/concurrence restée à 1/.test(r1.out), 'critère 6 : alerte émise sur la première epic');
  const k1 = Object.keys(JSON.parse(fs.readFileSync(alertFile, 'utf8')));
  ok(k1.length === 1 && k1[0] === `${rd(repo).seeded_at}:w1`, 'critère 6 : clé = <seeded_at>:w1 (ancienne clé purgée au semis)');
  start(repo, 1); start(repo, 2);
  hook(repo, 'SubagentStart', 'A', 'again');
  ok(!hook(repo, 'SubagentStop', 'A', 'again').out.trim(), 'alerte : une seule fois par vague et par epic');
  sleep(5);
  const r2 = round(2);
  ok(/concurrence restée à 1/.test(r2.out), 'critère 6 : nouveau semis -> alerte rejouée pour la nouvelle epic');
  ok(Object.keys(JSON.parse(fs.readFileSync(alertFile, 'utf8'))).every((k) => k.startsWith(rd(repo).seeded_at + ':')), 'critère 6 : seules les clés de l\'epic courante subsistent');
}

// ── Purge globale (> 7 jours) et fail-open ───────────────────────────────────────────────────
{
  const dir = live.globalLiveDir();
  fs.mkdirSync(dir, { recursive: true });
  const old = path.join(dir, 'vieux-00000000.json'), fresh = path.join(dir, 'recent-00000000.json');
  fs.writeFileSync(old, '{}'); fs.writeFileSync(fresh, '{}');
  const t8 = new Date(Date.now() - 8 * 24 * 3600 * 1000), t2 = new Date(Date.now() - 2 * 24 * 3600 * 1000);
  fs.utimesSync(old, t8, t8); fs.utimesSync(fresh, t2, t2);
  const repo = mkRepo('repo-purge', 1);
  seed(repo, 'A');
  ok(!fs.existsSync(old) && fs.existsSync(fresh) && fs.existsSync(live.globalLivePath(fs.realpathSync(repo))), 'purge globale : > 7 j supprimée, récente et courante conservées');
  for (const inp of ['', '{pas du json', JSON.stringify({ hook_event_name: 'SubagentStart' })]) {
    const r = spawnSync(process.execPath, [HOOK], { input: inp, encoding: 'utf8', env: process.env });
    ok(r.status === 0 && !(r.stdout || '').trim(), 'fail-open : hook exit 0 muet sur entrée invalide');
  }
}

// ── Consignes des briefs ─────────────────────────────────────────────────────────────────────
for (const f of ['epicmaster.md', 'pickymaster.md']) {
  const t = fs.readFileSync(path.join(PKG, 'commands', f), 'utf8');
  ok(/`start --id <id>` \*\*puis\*\* l'`Agent`/.test(t), `${f} : prescrit start puis Agent, dans l'ordre`);
  ok(/--phase review/.test(t) && /--phase arbitrage/.test(t) && /--phase settle/.test(t) && /--phase done/.test(t), `${f} : prescrit les phases review/arbitrage/settle/done`);
  ok(/--live-add-lot\s+--id <id> --wave "arbitrages"/.test(t) && /--force/.test(t), `${f} : prescrit --live-add-lot et --force`);
}

// US#190 : sid maître = session de rôle master (pas l'état le plus récent)
{
  const repo = mkRepo('repo-master-sid', 1);
  const state = require(path.join(PKG, 'lib', 'state.js'));
  const roles = require(path.join(PKG, 'lib', 'roles.js'));
  state.markPlanSession(repo, 'MASTERAAAA1');
  const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  sleepMs(30);
  state.markPlanSession(repo, 'OTHERBBBBB2');
  roles.setRole(repo, 'MASTERAAAA1', { role: 'master' });
  ok(live.currentSid(repo) === 'MASTERAAAA1', 'US190-3 : currentSid préfère la session master');
  cli(['epicmaster', '--cwd', repo, '--live-seed', '--epic', 'E']);
  ok(rd(repo).master_session_id === 'MASTERAAAA1', 'US190-3 : --live-seed sans --session sème le sid master');
}

try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) { /* nettoyage best-effort */ }
console.log(`\n${pass} ok, ${failures.length} échec(s)`);
process.exit(failures.length ? 1 : 0);
