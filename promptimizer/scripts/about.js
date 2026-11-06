#!/usr/bin/env node
'use strict';
// Affichage court : version installée de PMZ + epic/lot en cours du projet courant.
const { gitRoot, isInitialized } = require('../lib/project');
const { readEpic } = require('../lib/lot');
const { loadBacklog, currentLot, nextLot, blockedByOf, progress } = require('../lib/backlog');
const { readVersion } = require('../lib/version');
const { parseCwd } = require('../lib/cli');
const rtkStatus = require('../lib/rtk-status');
const rtkMetrics = require('../lib/rtk-metrics');
const { rtkStatusLine } = require('../lib/messages');

// Best-effort, jamais bloquant : une panne RTK (binaire, fs) ne doit jamais faire
// disparaître le reste de /pmz:about.
function rtkLine(root) {
  try {
    return rtkStatusLine(rtkStatus.computeStatus({ root }), rtkMetrics.snapshot());
  } catch (_) {
    return null;
  }
}

function main() {
  const version = readVersion() || 'inconnue';
  const lines = ['## Promptimizer', '', `Version : ${version}`, ''];

  const root = gitRoot(parseCwd());
  if (!root || !isInitialized(root)) {
    lines.push('Projet : non initialisé (ou hors-git)');
    process.stdout.write(lines.join('\n') + '\n');
    return;
  }
  const rtk = rtkLine(root);
  if (rtk) lines.push(rtk, '');

  const b = loadBacklog(root);
  const p = progress(b);
  const cur = currentLot(b);
  const nxt = nextLot(b);
  // Le champ epic du lot (en cours, sinon prochain) prime sur le label global du projet.
  const epic = (cur && cur.epic) || (nxt && nxt.epic) || readEpic(root);

  lines.push(`Epic : ${epic}`);
  if (!b.lots.length) {
    lines.push('US en cours : (aucun plan d\'US)');
  } else {
    lines.push(`Progression : ${p.done}/${p.total} US faites`);
    if (cur) lines.push(`US en cours : #${cur.id} ${cur.title}`);
    else if (nxt) {
      const bl = blockedByOf(b, nxt);
      lines.push(`Prochaine US : #${nxt.id} ${nxt.title}`
        + (bl.length ? ` — ⚠️ bloqué par ${bl.map((d) => '#' + d).join(', ')}` : ''));
    }
    else lines.push('US en cours : (aucune — toutes faites ou abandonnées)');
  }
  process.stdout.write(lines.join('\n') + '\n');
}

try { main(); } catch (_) { process.stdout.write('## Promptimizer\n\nVersion : inconnue\n'); }
process.exit(0);
