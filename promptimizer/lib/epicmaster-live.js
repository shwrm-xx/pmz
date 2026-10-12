'use strict';
// État LIVE d'une session maître (lot #136) — .vibe-agent/epicmaster-live.json.
// Alimenté par : `backlog.js epicmaster --live-seed` (lot #141 : PLAN COMPLET — epic, vagues, lots
// `pending` avec modèle·effort, depends_on, tokens estimés), `backlog.js start|done|note` quand
// l'owner est « master/lot-* » (CLI), et par les hooks SubagentStart/SubagentStop
// (hooks/subagent-live.js). Lu par `backlog.js epicmaster --live` (rendu compact/détaillé), par la
// statusline (segment de repli) et par la bande au-dessus de la saisie (mods/epicmaster-band/hooks/live.ts).
//
// Schéma v1 (additif, rétrocompatible) :
//   racine : v, updated_at, epic, wave:{current,total}, finished, to_decide:[{id,title,reason}], lots, agents
//   lot    : id, title, owner, status (pending|running|done|failed), wave, model, effort, tokens,
//            tokens_basis (comparable|base|measured), depends_on, verify (verdict de clôture), started_at, done_at, note
//
// Fail-open ABSOLU : aucune fonction publique ne lève ; toute erreur d'E/S ou de JSON -> no-op /
// valeur vide. Écriture atomique (fsjson). Course possible entre deux sous-agents qui écrivent au
// même instant : on relit juste avant d'écrire, au pire une mise à jour est perdue (état indicatif,
// jamais source de vérité — celle-ci reste backlog.json).
const fs = require('fs');
const path = require('path');
const os = require('os');
const { readJson, writeAtomic } = require('./fsjson');

const LIVE_FILE = 'epicmaster-live.json';
const OWNER_RE = /^master\/lot-/;
const STALE_MS = 6 * 3600 * 1000;       // un « en cours » plus vieux que ça est présumé mort
const KEEP_DONE_MS = 24 * 3600 * 1000;  // un lot fait disparaît de l'état au bout de 24 h
const MAX_LOTS = 200;
const MAX_AGENTS = 100;
const MAX_STR = 200;
const MAX_NOTE = 300;

function clipStr(s, n) { s = s == null ? '' : String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function nowIso(now) { return new Date(now == null ? Date.now() : now).toISOString(); }
function ts(iso) { const t = Date.parse(iso); return Number.isFinite(t) ? t : null; }

function isMasterOwner(owner) { return typeof owner === 'string' && OWNER_RE.test(owner); }
function livePath(root) { return path.join(root, '.vibe-agent', LIVE_FILE); }

function emptyState() { return { v: 1, updated_at: null, lots: {}, agents: {} }; }

function load(root) {
  try {
    const raw = readJson(livePath(root), null);
    if (!raw || typeof raw !== 'object') return emptyState();
    const st = {
      v: 1,
      updated_at: raw.updated_at || null,
      lots: raw.lots && typeof raw.lots === 'object' && !Array.isArray(raw.lots) ? raw.lots : {},
      agents: raw.agents && typeof raw.agents === 'object' && !Array.isArray(raw.agents) ? raw.agents : {},
    };
    // Champs de plan (lot #141) : conservés tels quels s'ils existent, jamais inventés.
    if (typeof raw.epic === 'string') st.epic = raw.epic;
    if (raw.wave && typeof raw.wave === 'object' && !Array.isArray(raw.wave)) st.wave = raw.wave;
    if (typeof raw.finished === 'boolean') st.finished = raw.finished;
    if (Array.isArray(raw.to_decide)) st.to_decide = raw.to_decide;
    if (typeof raw.seeded_at === 'string') st.seeded_at = raw.seeded_at;
    return st;
  } catch (_) { return emptyState(); }
}

function prune(st, now) {
  const t = now == null ? Date.now() : now;
  for (const [id, l] of Object.entries(st.lots)) {
    if (!l || typeof l !== 'object') { delete st.lots[id]; continue; }
    if (l.status === 'done' || l.status === 'failed') {
      const d = ts(l.done_at || l.updated_at);
      if (d != null && t - d > KEEP_DONE_MS) delete st.lots[id];
    }
  }
  const ids = Object.keys(st.lots);
  if (ids.length > MAX_LOTS) {
    ids.sort((a, b) => (ts(st.lots[a].updated_at) || 0) - (ts(st.lots[b].updated_at) || 0))
      .slice(0, ids.length - MAX_LOTS).forEach((id) => { delete st.lots[id]; });
  }
  const aIds = Object.keys(st.agents);
  if (aIds.length > MAX_AGENTS) {
    // on écarte d'abord les agents arrêtés, les plus anciens en tête
    aIds.sort((a, b) => {
      const A = st.agents[a] || {}, B = st.agents[b] || {};
      const sa = A.stopped_at ? 0 : 1, sb = B.stopped_at ? 0 : 1;
      return sa - sb || (ts(A.started_at) || 0) - (ts(B.started_at) || 0);
    }).slice(0, aIds.length - MAX_AGENTS).forEach((id) => { delete st.agents[id]; });
  }
  return st;
}

function save(root, st, now) {
  try {
    st.updated_at = nowIso(now);
    st.root = path.resolve(root);
    prune(st, now);
    const ok = writeAtomic(livePath(root), st);
    mirrorGlobal(root, st);
    return ok;
  } catch (_) { return false; }
}

// Copie globale PAR PROJET <config>/promptimizer/epicmaster-live/<slug>.json (`root` + `seeded_at`
// dedans) : une session maître ouverte hors du dépôt qu'elle pilote retrouve SON plan (la bande ne
// prend qu'une copie semée après le /epicmaster de sa propre session). Une copie par projet : deux
// sessions maître de projets différents ne s'écrasent plus. L'ancienne copie unique
// (<config>/promptimizer/epicmaster-live.json, partagée par tous les projets) est supprimée.
// Best-effort, jamais bloquant ; PMZ_NO_LIVE_MIRROR=1 la désactive (tests).
function configDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}
function globalLiveDir() { return path.join(configDir(), 'promptimizer', 'epicmaster-live'); }
function liveSlug(root) {
  const abs = path.resolve(String(root));
  let h = 0x811c9dc5; // FNV-1a 32 bits : stable, sans dépendance
  for (let i = 0; i < abs.length; i++) { h ^= abs.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  const base = path.basename(abs).replace(/[^\w.-]+/g, '-').slice(0, 40) || 'projet';
  return `${base}-${h.toString(16).padStart(8, '0')}`;
}
function globalLivePath(root) { return path.join(globalLiveDir(), liveSlug(root) + '.json'); }
function mirrorGlobal(root, st) {
  try {
    if (process.env.PMZ_NO_LIVE_MIRROR) return;
    fs.mkdirSync(globalLiveDir(), { recursive: true });
    writeAtomic(globalLivePath(root), st);
    try { fs.unlinkSync(path.join(configDir(), 'promptimizer', LIVE_FILE)); } catch (_) { /* absente */ }
  } catch (_) { /* indicatif */ }
}

// ── Plan complet : vague courante + fin de plan (lot #141) ────────────────────────────────
// Ne s'applique qu'à un état SEMÉ (racine `wave` présente, cf. seedFromPlan) : un état sans plan
// (start/done sans --live-seed) reste tel quel, la bande retombe alors sur son heuristique.
// vague courante = plus petite vague des lots encore ouverts (pending/running) ; plus aucun lot
// ouvert -> dernière vague + finished=true. Un lot `failed` est terminal (il ne bloque pas la fin).
function refreshProgress(st) {
  if (!st || !st.wave || typeof st.wave !== 'object') return;
  const total = Number(st.wave.total);
  if (!Number.isFinite(total) || total < 1) return;
  const lots = Object.values(st.lots).filter((l) => l && typeof l === 'object');
  const open = lots.filter((l) => l.status === 'pending' || l.status === 'running');
  const waves = open.map((l) => Number(l.wave)).filter((n) => Number.isFinite(n) && n >= 1);
  if (open.length && waves.length) st.wave = { current: Math.min(total, Math.min(...waves)), total };
  else if (!open.length) st.wave = { current: total, total };
  st.finished = open.length === 0 && lots.length > 0;
}

// ── Alimentation par la CLI (start / done / note) ─────────────────────────────────────────
// `lot` = lot du backlog (id, title, note) ; `owner` = session_owner du lot AVANT clôture (doneLot
// le vide) ; `extra.verdict` (done) = verdict verify de clôture : `failed` fait passer le lot en
// `failed` (la bande l'affiche en rouge) ; ok / none / timeout / absent -> `done` (un timeout n'est
// pas une preuve d'échec ni de réussite : on ne l'invente pas en rouge). N'écrit RIEN si l'owner
// n'est pas « master/lot-* » : un `start` hors session maître ne doit jamais créer de fichier live.
function recordLot(root, kind, lot, owner, now, extra) {
  try {
    if (!root || !lot || lot.id == null || !isMasterOwner(owner)) return false;
    const st = load(root);
    const key = String(lot.id);
    const t = nowIso(now);
    const prev = st.lots[key] && typeof st.lots[key] === 'object' ? st.lots[key] : {};
    const cur = Object.assign({}, prev, {
      id: lot.id, title: clipStr(lot.title, MAX_STR), owner: clipStr(owner, MAX_STR), updated_at: t,
    });
    if (!cur.model && lot.model_hint) cur.model = clipStr(lot.model_hint, 30);
    if (!cur.effort && lot.effort_hint) cur.effort = clipStr(lot.effort_hint, 20);
    if (kind === 'start') {
      Object.assign(cur, { status: 'running', started_at: t, done_at: null });
      delete cur.verify; // relance d'un lot rouge : l'ancien verdict ne vaut plus
    } else if (kind === 'done') {
      const verdict = extra && typeof extra.verdict === 'string' ? extra.verdict : null;
      Object.assign(cur, { status: verdict === 'failed' ? 'failed' : 'done', done_at: t });
      if (verdict) cur.verify = verdict;
      // Tokens RÉELS (lot #142, `done --tokens N`) : remplacent l'estimation du semis, marqués
      // `measured` — jamais déduits ; absent/invalide -> l'estimation reste telle quelle.
      const tk = extra && Number(extra.tokens);
      if (extra && extra.tokens != null && Number.isFinite(tk) && tk > 0) { cur.tokens = Math.round(tk); cur.tokens_basis = 'measured'; }
      if (!cur.started_at) cur.started_at = lot.started_at || t;
    } else if (kind === 'note') {
      if (!cur.status) Object.assign(cur, { status: 'running', started_at: lot.started_at || t });
      cur.note = clipStr(lot.note, MAX_NOTE);
      // `note --decide` (lot #142) : la note devient une entrée de `to_decide` (une par lot,
      // la dernière raison remplace la précédente) — la bande compte « N à trancher ».
      if (extra && extra.decide) {
        const list = Array.isArray(st.to_decide) ? st.to_decide.filter((x) => x && String(x.id) !== key) : [];
        list.push({ id: lot.id, title: clipStr(lot.title, MAX_STR), reason: clipStr(lot.note, MAX_NOTE) });
        st.to_decide = list;
      }
    } else return false;
    st.lots[key] = cur;
    refreshProgress(st);
    return save(root, st, now);
  } catch (_) { return false; }
}
const recordStart = (root, lot, owner, now) => recordLot(root, 'start', lot, owner, now);
const recordDone = (root, lot, owner, now, verdict, tokens) => recordLot(root, 'done', lot, owner, now, { verdict, tokens });
const recordNote = (root, lot, owner, now, decide) => recordLot(root, 'note', lot, owner, now, { decide: !!decide });

// ── Semis du plan complet (lot #141) — `backlog.js epicmaster --live-seed` ───────────────
// `plan` = planMaster(...) (lib/epicmaster.js) ; `b` = backlog (estimation de tokens par famille
// comparable, backlog.estimateCost — à défaut, le socle d'un sous-agent, marqué `tokens_basis:
// 'base'` : un plancher, jamais présenté comme mesuré). Repart d'un état NEUF : lots (tous
// `pending`, avec vague, modèle·effort, depends_on, tokens estimés), vagues, epic ; les agents et
// lots d'une session précédente sont écartés. Les lots bloqués du plan passent en `to_decide`.
// Retourne { ok, lots, waves, epic } ; ok=false (rien écrit) si le plan est vide ou l'E/S échoue.
function seedFromPlan(root, plan, b, opts, now) {
  try {
    const o = opts || {};
    if (!root || !plan || !Array.isArray(plan.lots) || !plan.lots.length) return { ok: false, lots: 0, waves: 0, epic: null };
    let baseTokens = 60000, estimate = null;
    try { baseTokens = require('./epicmaster').SUBAGENT_BASE_TOKENS || baseTokens; } catch (_) { /* plancher par défaut */ }
    try { estimate = require('./backlog').estimateCost; } catch (_) { /* pas d'estimation */ }
    const full = new Map(((b && Array.isArray(b.lots)) ? b.lots : []).map((l) => [l.id, l]));
    const waveOf = new Map();
    for (const w of (plan.waves || [])) for (const id of (w.ids || [])) waveOf.set(id, w.index);
    const t = nowIso(now);
    const st = emptyState();
    st.updated_at = t;
    st.seeded_at = t; // la bande d'une session n'adopte qu'un plan semé après son propre /epicmaster
    for (const l of plan.lots) {
      let tokens = baseTokens, basis = 'base';
      try {
        const est = estimate && full.get(l.id) ? estimate(b, full.get(l.id)) : null;
        if (est && Number.isFinite(est.avg) && est.avg > 0) { tokens = Math.round(est.avg); basis = 'comparable'; }
      } catch (_) { /* plancher */ }
      st.lots[String(l.id)] = {
        id: l.id, title: clipStr(l.title, MAX_STR), status: 'pending', wave: waveOf.get(l.id) || null,
        model: l.model || null, effort: l.effort || null, tokens, tokens_basis: basis,
        depends_on: Array.isArray(l.depends_on) ? l.depends_on.slice() : [],
        started_at: null, done_at: null, updated_at: t,
      };
    }
    const epics = [...new Set(plan.lots.map((l) => l.epic).filter(Boolean))];
    st.epic = clipStr(o.epic || epics.join(' + ') || 'epicmaster', 60);
    const total = (plan.waves || []).length || 1;
    st.wave = { current: 1, total };
    st.finished = false;
    st.to_decide = (plan.blocked || []).map((x) => ({ id: x.id, title: clipStr(x.title, MAX_STR), reason: clipStr(x.reason, MAX_NOTE) }));
    refreshProgress(st);
    const wrote = save(root, st, now);
    return { ok: !!wrote, lots: plan.lots.length, waves: total, epic: st.epic };
  } catch (_) { return { ok: false, lots: 0, waves: 0, epic: null }; }
}

// ── Alimentation par les hooks SubagentStart / SubagentStop ───────────────────────────────
// N'écrit que si une session maître est en cours (fichier présent avec au moins un lot « running ») :
// les sous-agents d'une session ordinaire ne doivent pas faire apparaître le fichier. Rattachement
// au lot : seulement s'il n'y a qu'UN lot running sans agent actif — sinon l'agent reste non lié
// (le hook ne reçoit ni prompt ni id de lot : jamais de rattachement inventé).
function recordSubagent(root, event, input, now) {
  try {
    if (!root || !input || !input.agent_id) return false;
    const id = clipStr(input.agent_id, MAX_STR);
    const st = load(root);
    const running = Object.keys(st.lots).filter((k) => st.lots[k] && st.lots[k].status === 'running');
    if (!running.length) return false;
    const t = nowIso(now);
    if (event === 'start') {
      let lotId = null;
      const free = running.filter((k) => !Object.values(st.agents).some((a) => a && !a.stopped_at && a.lot === Number(k)));
      if (free.length === 1) lotId = Number(free[0]);
      st.agents[id] = { id, type: clipStr(input.agent_type || '', 60) || null, started_at: t, stopped_at: null, lot: lotId };
    } else if (event === 'stop') {
      const a = st.agents[id];
      if (!a || typeof a !== 'object') return false; // arrêt d'un agent jamais vu : on n'invente rien
      a.stopped_at = t;
    } else return false;
    return save(root, st, now);
  } catch (_) { return false; }
}

// ── Lecture / résumé ──────────────────────────────────────────────────────────────────────
function summarize(st, now) {
  const t = now == null ? Date.now() : now;
  const s = { running: [], stale: [], done: [], pending: [], failed: [], agents_active: [], agents_stopped: 0, updated_at: (st && st.updated_at) || null };
  if (!st) return s;
  // Un plan non touché depuis plus de STALE_MS est présumé mort : ses `pending` / `failed` ne comptent plus.
  const u0 = ts(st.updated_at);
  const planAlive = u0 == null || t - u0 <= STALE_MS;
  for (const l of Object.values(st.lots || {})) {
    if (!l || typeof l !== 'object') continue;
    if (l.status === 'done') s.done.push(l);
    else if (l.status === 'failed') { if (planAlive) s.failed.push(l); }
    else if (l.status === 'pending') { if (planAlive) s.pending.push(l); }
    else if (l.status === 'running') {
      const u = ts(l.updated_at);
      (u != null && t - u > STALE_MS ? s.stale : s.running).push(l);
    }
  }
  const byId = (a, b) => a.id - b.id;
  s.running.sort(byId); s.stale.sort(byId); s.done.sort(byId); s.pending.sort(byId); s.failed.sort(byId);
  if (st.epic) s.epic = st.epic;
  if (st.wave) s.wave = st.wave;
  if (typeof st.finished === 'boolean') s.finished = st.finished;
  for (const a of Object.values(st.agents || {})) {
    if (!a || typeof a !== 'object') continue;
    if (a.stopped_at) s.agents_stopped++;
    else {
      const u = ts(a.started_at);
      if (u == null || t - u <= STALE_MS) s.agents_active.push(a);
    }
  }
  return s;
}
function isActive(sum) { return !!sum && (sum.running.length > 0 || sum.agents_active.length > 0); }

function ago(iso, now) {
  const u = ts(iso);
  if (u == null) return '?';
  const m = Math.max(0, Math.round(((now == null ? Date.now() : now) - u) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

const NO_STATE = 'Aucun état live (session maître non démarrée) — .vibe-agent/epicmaster-live.json est alimenté par '
  + '`backlog.js start|done|note` avec `--owner master/lot-<id>` et par les hooks SubagentStart/SubagentStop.';

function isEmptySum(sum) {
  return !sum.running.length && !sum.stale.length && !sum.done.length && !sum.agents_active.length
    && !(sum.pending || []).length && !(sum.failed || []).length;
}

function renderCompact(sum) {
  if (!sum || isEmptySum(sum)) return NO_STATE;
  const bits = [];
  bits.push(sum.running.length ? `${sum.running.length} en cours (${sum.running.map((l) => '#' + l.id).join(', ')})` : '0 en cours');
  if (sum.done.length) bits.push(`${sum.done.length} fait${sum.done.length > 1 ? 's' : ''}`);
  if ((sum.pending || []).length) bits.push(`${sum.pending.length} en attente`);
  if ((sum.failed || []).length) bits.push(`${sum.failed.length} verify rouge (${sum.failed.map((l) => '#' + l.id).join(', ')})`);
  if (sum.stale.length) bits.push(`${sum.stale.length} périmé${sum.stale.length > 1 ? 's' : ''} (${sum.stale.map((l) => '#' + l.id).join(', ')})`);
  bits.push(`${sum.agents_active.length} sous-agent${sum.agents_active.length > 1 ? 's' : ''} actif${sum.agents_active.length > 1 ? 's' : ''}`);
  return 'Epicmaster live : ' + bits.join(' · ');
}

function renderDetailed(sum, now) {
  if (!sum || isEmptySum(sum)) return NO_STATE;
  const L = [renderCompact(sum)];
  const lotLine = (mark, l, extra) => {
    const ag = Object.values(extra.agents).filter((a) => a && a.lot === l.id && !a.stopped_at).length;
    let s = `  ${mark} #${l.id} ${l.title || ''}${l.owner ? ` — ${l.owner}` : ''}`;
    if (l.status === 'pending') {
      const dep = Array.isArray(l.depends_on) && l.depends_on.length ? ` · attend ${l.depends_on.map((d) => '#' + d).join(', ')}` : '';
      s += `${l.wave ? ` · vague ${l.wave}` : ''}${dep}`;
    } else if (l.status === 'failed') s += ` · verify rouge il y a ${ago(l.done_at || l.updated_at, now)}`;
    else if (l.status === 'done') s += ` · fait il y a ${ago(l.done_at || l.updated_at, now)}`;
    else s += ` · depuis ${ago(l.started_at, now)}${ag ? ` · ${ag} sous-agent${ag > 1 ? 's' : ''}` : ''}`;
    if (l.note) s += `\n      note : ${l.note}`;
    return s;
  };
  const ctx = { agents: sum._agents || {} };
  if (sum.running.length) { L.push('En cours :'); sum.running.forEach((l) => L.push(lotLine('▶', l, ctx))); }
  if (sum.stale.length) { L.push(`Périmés (aucune mise à jour depuis plus de ${STALE_MS / 3600000} h — session morte ?) :`); sum.stale.forEach((l) => L.push(lotLine('⚠', l, ctx))); }
  if ((sum.failed || []).length) { L.push('Verify rouge :'); sum.failed.forEach((l) => L.push(lotLine('✗', l, ctx))); }
  if ((sum.pending || []).length) { L.push('En attente :'); sum.pending.forEach((l) => L.push(lotLine('⧗', l, ctx))); }
  if (sum.done.length) { L.push('Faits :'); sum.done.forEach((l) => L.push(lotLine('✔', l, ctx))); }
  if (sum.agents_active.length) {
    L.push('Sous-agents actifs :');
    for (const a of sum.agents_active) {
      L.push(`  ⚙ ${a.type || 'agent'} ${String(a.id).slice(0, 12)} · depuis ${ago(a.started_at, now)}${a.lot != null ? ` · lot #${a.lot}` : ' · lot non rattaché'}`);
    }
  }
  return L.join('\n');
}

// Point d'entrée CLI : { text, summary } — jamais d'exception.
function renderLive(root, opts) {
  try {
    const o = opts || {};
    const st = load(root);
    const sum = summarize(st, o.now);
    sum._agents = st.agents;
    const text = o.detailed ? renderDetailed(sum, o.now) : renderCompact(sum);
    const { _agents, ...json } = sum;
    return { text, summary: json };
  } catch (_) { return { text: NO_STATE, summary: null }; }
}

// Segment statusline (« EM ▶2 ✔1 ⚙3 »). '' si rien d'actif : un maître terminé / un projet sans
// session maître ne laisse aucun bruit dans la barre. Lecture d'un seul petit fichier.
function statusSegment(root, now) {
  try {
    const sum = summarize(load(root), now);
    if (!isActive(sum)) return '';
    const parts = ['EM'];
    if (sum.running.length) parts.push(`▶${sum.running.length}`);
    if (sum.done.length) parts.push(`✔${sum.done.length}`);
    if (sum.agents_active.length) parts.push(`⚙${sum.agents_active.length}`);
    return parts.join(' ');
  } catch (_) { return ''; }
}

module.exports = {
  LIVE_FILE, globalLivePath, globalLiveDir, liveSlug, OWNER_RE, STALE_MS, NO_STATE, isMasterOwner, livePath, load, summarize, isActive,
  recordStart, recordDone, recordNote, recordSubagent, seedFromPlan, refreshProgress, renderCompact, renderDetailed, renderLive, statusSegment,
};
