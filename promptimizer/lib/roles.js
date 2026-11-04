'use strict';
// Rôle de chaque session de la chaîne Plan → Scope → session maître, KEYÉ PAR session_id dans
// .vibe-agent/session-roles.json (retour utilisateur 2026-11-04). Distinct de session-state.json,
// fichier UNIQUE que chaque session écrase à son tour (loadSessionState remet les drapeaux à zéro
// dès qu'un autre session_id l'a écrit) : avec trois sessions vivantes, le drapeau « scope » s'y
// perdait et la sous-session Scope se retitrait « [XXX · Plan] ».
//   role  : 'plan' | 'scope' | 'master' — sert au titre « self » ;
//   relay : true dès que la session a lancé (ou proposé) la session suivante de la chaîne — elle
//           « ne bouge plus » : les <side-sessions-event> que l'app lui envoie sont filtrés.
// Fail-silent : toute erreur => lecture vide / écriture ignorée. No-op hors projet initialisé.
const fs = require('fs');
const path = require('path');
const { vibeDir, isInitialized } = require('./project');
const { writeAtomic } = require('./fsjson');

const MAX_ENTRIES = 50; // borne : on garde les sessions les plus récentes

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
  return getRole(root, sid).relay === true;
}

// Prompt synthétique de l'app : un enfant lancé par cette session a fini un tour.
function isSideSessionsEvent(prompt) {
  return /^\s*<side-sessions-event>/.test(String(prompt || ''));
}

// start_session qui lance (ou propose) la session suivante de la chaîne : Scope ou session maître.
function launchesChainSession(toolInput) {
  const ti = toolInput && typeof toolInput === 'object' ? toolInput : {};
  const text = `${ti.title || ''}\n${ti.prompt || ''}`;
  return /pmz:(scope|epicmaster|pickymaster)\b|^\s*\/(scope|epicmaster|pickymaster)\b|^\s*scope\s+[—–-]|session ma[iî]tre/im.test(text);
}

module.exports = { rolesFile, getRole, setRole, isRelay, isSideSessionsEvent, launchesChainSession };
