'use strict';
// Accueil du 1er démarrage (lot #144) : UN message unique, au premier SessionStart « startup »
// qui suit l'install, qui indique les deux commandes utiles (init du projet, statusline opt-in).
// Marqueur persistant sous l'état PMZ (plugin : CLAUDE_PLUGIN_DATA/state, survit aux updates ;
// manuel : ~/.claude/promptimizer/state). Fail-open absolu : au moindre doute -> null (silence).
//
// Une mise à jour d'une install EXISTANTE (le dossier d'état contient déjà autre chose) ne
// ré-accueille pas : le marqueur est posé en silence, pas de bruit pour les utilisateurs actuels.
const fs = require('fs');
const path = require('path');
const cdir = require('./claude-dir');

const MARKER = 'welcomed.json';

function stateDir() { return process.env.PMZ_STATE_DIR || cdir.stateDir(); }

function writeMarker(dir) {
  fs.mkdirSync(dir, { recursive: true });
  // flag 'wx' : atomique, un seul démarrage concurrent gagne la course.
  fs.writeFileSync(path.join(dir, MARKER), JSON.stringify({ at: new Date().toISOString() }) + '\n', { flag: 'wx' });
}

// Texte injecté (instruction au modèle de relayer UNE fois). Préfixe de commande selon le canal :
// plugin -> /pmz:<cmd> ; manuel -> /<cmd>.
function welcomeMessage() {
  const p = cdir.isPluginContext() ? '/pmz:' : '/';
  return [
    'Promptimizer vient d\'être installé (premier démarrage). Dis-le UNE seule fois à l\'utilisateur, en 2 lignes :',
    `- ${p}init : pose le socle Promptimizer dans le projet courant (après confirmation) ;`,
    `- ${p}statusline : barre d'état optionnelle (version, US, occupation du contexte) — opt-in.`,
    `(${p}doctor vérifie l'installation.)`,
  ].join('\n');
}

// Renvoie le message du 1er démarrage et pose le marqueur, sinon null. Ne rejoue jamais.
function firstRunWelcome() {
  try {
    const dir = stateDir();
    if (fs.existsSync(path.join(dir, MARKER))) return null;
    let existing = false;
    try { existing = fs.readdirSync(dir).length > 0; } catch (_) { /* dossier absent = install neuve */ }
    writeMarker(dir);
    return existing ? null : welcomeMessage();
  } catch (_) {
    return null;
  }
}

module.exports = { firstRunWelcome, welcomeMessage, MARKER };
