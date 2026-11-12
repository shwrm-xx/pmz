'use strict';
// État de session : UN FICHIER PAR session_id, .vibe-agent/session-state/<sid>.json (US#184) —
// plus d'écrasement entre sessions vivantes. Sans sid : _default.json. Élagage à 50 fichiers (mtime).
// Repli de lecture sur l'ancien fichier unique session-state.json (migration silencieuse, jamais
// supprimé). Écriture atomique, fail-silent. No-op si le projet n'est pas initialisé.
const fs = require('fs');
const path = require('path');
const { vibeDir, isInitialized } = require('./project');
const { writeAtomic } = require('./fsjson');

const DEFAULT_STATE = {
  session_id: null,
  session_start_reminded: false, // anti-spam du rappel SessionStart (1×/session)
  closure_reminded_for_batch: false,
  cost_reminded_for_batch: false, // anti-spam de l'alerte coût par lot (lot #43) : 1× par
  // lot·session, réarmé quand le working tree redevient propre (nouveau lot, cf. stop.js)
  cost_watermark: null, // OpenCode (lot #54) : id du dernier message assistant déjà compté
  // en coût — un même message final vu par plusieurs session.idle n'est agrégé qu'une fois.
  // Inutilisé côté Claude Code (turnstats scanne l'offset transcript, pas de double-comptage).
  prompt_reminders: {}, // anti-spam des rappels UserPromptSubmit (clé -> true)
  self_title: null, // dernier titre « self » injecté (la session courante se titre elle-même)
  plan_session: false, // lot #130 : cette session a fait de la CONCEPTION (mode plan de
  // Claude Code, ou /pmz:scope qui pose un epic / ajoute des lots). Lu à la session
  // SUIVANTE (previousSessionMeta) pour la titrer « [XXX · Plan] <epic> ».
};

const MAX_STATE_FILES = 50;

function legacyFile(root) {
  return path.join(vibeDir(root), 'session-state.json');
}

function stateDir(root) {
  return path.join(vibeDir(root), 'session-state');
}

function safeName(sid) {
  const n = String(sid || '').replace(/[^A-Za-z0-9_-]/g, '_');
  return n || '_default';
}

function fileForSid(root, sid) {
  return path.join(stateDir(root), `${safeName(sid)}.json`);
}

function readObj(file) {
  try {
    const o = JSON.parse(fs.readFileSync(file, 'utf8'));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch (_) {
    return null;
  }
}

// Fichier d'état le plus récemment écrit (mtime), ou null. Sert UNIQUEMENT aux appels sans sid
// (CLI / hooks hors périmètre) ; les hooks de session passent toujours leur sid.
function newestStateFile(root) {
  try {
    const dir = stateDir(root);
    let best = null;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const m = fs.statSync(path.join(dir, f)).mtimeMs;
      if (!best || m > best.m) best = { file: path.join(dir, f), m };
    }
    return best && best.file;
  } catch (_) {
    return null;
  }
}

function loadState(root, sid) {
  if (!isInitialized(root)) {
    return Object.assign({}, DEFAULT_STATE, { session_id: sid || null });
  }
  let st = readObj(fileForSid(root, sid));
  if (!st) {
    // Migration silencieuse : ancien fichier unique, valable seulement s'il décrit CETTE session.
    const old = readObj(legacyFile(root));
    st = old && (!sid || !old.session_id || old.session_id === sid) ? old : {};
  }
  const merged = Object.assign({}, DEFAULT_STATE, st);
  if (sid) merged.session_id = sid;
  return merged;
}

function pruneStates(root, keepFile) {
  try {
    const dir = stateDir(root);
    const all = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
      const full = path.join(dir, f);
      return { full, m: fs.statSync(full).mtimeMs };
    });
    if (all.length <= MAX_STATE_FILES) return;
    all.sort((a, b) => b.m - a.m);
    let kept = 0;
    for (const e of all) {
      if (e.full === keepFile || kept < MAX_STATE_FILES) { kept++; continue; }
      try { fs.unlinkSync(e.full); } catch (_) { /* fail-silent */ }
    }
  } catch (_) { /* fail-silent */ }
}

function saveState(root, sid, state) {
  if (!isInitialized(root)) return false;
  try { fs.mkdirSync(stateDir(root), { recursive: true }); } catch (_) { return false; }
  const file = fileForSid(root, sid);
  const ok = writeAtomic(file, state);
  if (ok) pruneStates(root, file);
  return ok;
}

// Alias historiques : sid = celui de l'état (loadSessionState) ou state.session_id (save).
function loadSessionState(root, sessionId) {
  return loadState(root, sessionId);
}

function saveSessionState(root, state) {
  return saveState(root, state && state.session_id, state);
}

// Meta de la session demandée (`sid`) lue BRUTE (aucun reset, aucune écriture). Sans sid : le
// fichier le plus récent (compat des appelants CLI qui ignorent le sid — cf. Dette US#184), puis
// l'ancien fichier unique. Sert à suggestedTitle (lib/lot.js) : `id` pour l'attribution du lot
// clos, `plan` pour titrer une session de conception « [XXX · Plan] <epic> » (lot #130).
function previousSessionMeta(root, sid) {
  if (!isInitialized(root)) return { id: null, plan: false };
  let st = null;
  if (sid) st = readObj(fileForSid(root, sid)) || { session_id: sid };
  else {
    const nf = newestStateFile(root);
    st = (nf && readObj(nf)) || readObj(legacyFile(root));
  }
  if (!st) return { id: null, plan: false };
  return { id: st.session_id || null, plan: st.plan_session === true };
}

function previousSessionId(root, sid) {
  return previousSessionMeta(root, sid).id;
}

// Marque une session comme session de conception (lot #130). Écriture BRUTE et idempotente.
// `sid` fourni : son fichier ; sinon (CLI/hook sans sid) le fichier le plus récent, à défaut _default.
function markPlanSession(root, sid) {
  if (!isInitialized(root)) return false;
  const file = sid ? fileForSid(root, sid) : (newestStateFile(root) || fileForSid(root, null));
  let st = readObj(file);
  if (!st) {
    const old = !sid && !newestStateFile(root) ? readObj(legacyFile(root)) : null;
    st = old || (sid ? { session_id: sid } : {});
  }
  if (st.plan_session === true) return true; // déjà marquée : aucune réécriture
  st.plan_session = true;
  try { fs.mkdirSync(stateDir(root), { recursive: true }); } catch (_) { return false; }
  const ok = writeAtomic(file, st);
  if (ok) pruneStates(root, file);
  return ok;
}

module.exports = {
  loadState, saveState, loadSessionState, saveSessionState, previousSessionId, previousSessionMeta,
  markPlanSession, DEFAULT_STATE, MAX_STATE_FILES,
};
