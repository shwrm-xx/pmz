'use strict';
// Rôle de chaque session de la chaîne Plan → Scope → session maître, KEYÉ PAR session_id dans
// .vibe-agent/session-roles.json (retour utilisateur 2026-11-04). Distinct de session-state.json,
// fichier UNIQUE que chaque session écrase à son tour (loadSessionState remet les drapeaux à zéro
// dès qu'un autre session_id l'a écrit) : avec trois sessions vivantes, le drapeau « scope » s'y
// perdait et la sous-session Scope se retitrait « [XXX · Plan] ».
//   role  : 'plan' | 'scope' | 'master' — sert au titre « self » ;
//   relay : true dès que la session a RÉELLEMENT démarré la session suivante de la chaîne (US#184 :
//           jamais sur une simple proposition) — elle « ne bouge plus » : les <side-sessions-event>
//           que l'app lui envoie sont filtrés. `relay_at` horodate la pose ; levé par clearRelay
//           (clôture) ou automatiquement après 7 jours (fail-open) ;
//   title / epic : titre « self » et epic de la session (alimentent la vue sessions).
// Fail-silent : toute erreur => lecture vide / écriture ignorée. No-op hors projet initialisé.
const fs = require('fs');
const path = require('path');
const { vibeDir, isInitialized } = require('./project');
const { writeAtomic } = require('./fsjson');

const MAX_ENTRIES = 50; // borne : on garde les sessions les plus récentes
const RELAY_TTL_MS = 7 * 24 * 3600 * 1000; // relais oublié : levé après 7 jours

function rolesFile(root) {
  return path.join(vibeDir(root), 'session-roles.json');
}

function readAll(root) {
  try {
    const o = JSON.parse(fs.readFileSync(rolesFile(root), 'utf8'));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch (_) {
    return {};
  }
}

function getRole(root, sid) {
  if (!sid) return {};
  const e = readAll(root)[sid];
  return e && typeof e === 'object' ? e : {};
}

// Fusionne `patch` dans l'entrée de `sid`. Le rôle déjà posé n'est jamais rétrogradé
// (scope/master priment sur plan : une Scope héritant du mode plan reste « scope »).
function setRole(root, sid, patch) {
  if (!sid || !isInitialized(root)) return false;
  try {
    const all = readAll(root);
    const cur = all[sid] && typeof all[sid] === 'object' ? all[sid] : {};
    const next = Object.assign({}, cur, patch);
    if (patch.relay === true && cur.relay !== true) next.relay_at = Date.now();
    if (cur.role && cur.role !== 'plan' && patch.role === 'plan') next.role = cur.role;
    if (JSON.stringify(next) === JSON.stringify(cur)) return true; // rien à réécrire
    next.at = Date.now();
    all[sid] = next;
    const keys = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0));
    const pruned = {};
    for (const k of keys.slice(0, MAX_ENTRIES)) pruned[k] = all[k];
    return writeAtomic(rolesFile(root), pruned);
  } catch (_) {
    return false;
  }
}

function isRelay(root, sid) {
  const e = getRole(root, sid);
  if (e.relay !== true) return false;
  const t = Number(e.relay_at || e.at || 0);
  return !(t && Date.now() - t > RELAY_TTL_MS);
}

// Lève le relais (clôture de la chaîne). No-op si la session n'est pas relais.
function clearRelay(root, sid) {
  if (!sid || !isInitialized(root)) return false;
  try {
    const all = readAll(root);
    const cur = all[sid];
    if (!cur || typeof cur !== 'object' || (cur.relay === undefined && cur.relay_at === undefined)) return true;
    delete cur.relay;
    delete cur.relay_at;
    cur.at = Date.now();
    return writeAtomic(rolesFile(root), all);
  } catch (_) {
    return false;
  }
}

// Prompt synthétique de l'app : un enfant lancé par cette session a fini un tour.
function isSideSessionsEvent(prompt) {
  return /^\s*<side-sessions-event>/.test(String(prompt || ''));
}

// Invocation de la session maître : « /pmz:epicmaster » en tête de prompt, ou le prompt de carte
// « Invoque le skill `pmz:epicmaster` » (backticks optionnels, n'importe où dans le texte).
const MASTER_SLASH_RE = /^\s*\/(pmz:)?(epicmaster|pickymaster)\b/i;
const MASTER_SKILL_RE = /\bskill\s+`?pmz:(epicmaster|pickymaster)\b/i;
function isMasterInvocation(prompt) {
  const p = String(prompt || '');
  return MASTER_SLASH_RE.test(p) || MASTER_SKILL_RE.test(p);
}

// Appel `Skill` (PostToolUse) qui lance la maître.
function isMasterSkillName(name) {
  return /^(pmz:)?(epicmaster|pickymaster)$/.test(String(name || '').trim());
}

// start_session qui lance la session suivante de la chaîne : session maître (titre débutant par
// « Session maître » ou prompt invoquant epicmaster/pickymaster) ou Scope (titre débutant par
// « Scope », ou prompt invoquant /pmz:scope). Plus de match sur une chaîne libre (US#184).
function launchesChainSession(toolInput) {
  const ti = toolInput && typeof toolInput === 'object' ? toolInput : {};
  const title = String(ti.title || '');
  const prompt = String(ti.prompt || '');
  if (/^\s*session ma[iî]tre/i.test(title) || isMasterInvocation(prompt)) return true;
  return /^\s*scope\s*[—–-]/i.test(title) || /^\s*\/(pmz:)?scope\b|\bskill\s+`?pmz:scope\b/i.test(prompt);
}

// start_session RÉEL : la réponse porte un id de session « local_… » (une simple proposition
// own_initiative / offer n'en a pas).
function startedForReal(toolResponse) {
  try {
    const txt = typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse || '');
    return /\blocal_[A-Za-z0-9][A-Za-z0-9-]{5,}/.test(txt);
  } catch (_) {
    return false;
  }
}

module.exports = {
  rolesFile, getRole, setRole, isRelay, clearRelay, isSideSessionsEvent, isMasterInvocation,
  isMasterSkillName, launchesChainSession, startedForReal, RELAY_TTL_MS,
};
