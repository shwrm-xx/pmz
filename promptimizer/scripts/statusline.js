#!/usr/bin/env node
'use strict';
// Statusline Promptimizer (lot #45, opt-in) — invoquée par Claude Code via le champ
// `statusLine` de settings.json (une commande qui reçoit un JSON sur stdin et dont la
// PREMIÈRE ligne de stdout devient la barre d'état). N'affiche qu'UNE ligne :
//   PMZ v<version> · <epic> · US#<id> <titre> · <faits>/<total> · [EM ▶n ✔n ⚙n] · ctx <occupation>
// Sources : VERSION du paquet, backlog du projet courant (déduit du cwd du workspace),
// occupation temps réel lue dans le transcript de la session.
//
// Fail-open TOTAL : une statusline ne doit jamais bruiter ni casser une session. Toute
// erreur (require corrompu, transcript illisible, projet non initialisé) → ligne vide et
// exit 0. Préambule fail-open AVANT tout require (module absent/corrompu ⇒ exit 0 muet).
process.on('uncaughtException', () => { process.exit(0); });
process.on('unhandledRejection', () => { process.exit(0); });

function emit(line) { process.stdout.write((line || '') + '\n'); process.exit(0); }

let parseHookInput, disabled, readVersion, gitRoot, isInitialized, readEpic,
  loadBacklog, currentLot, lotOwnedBy, nextLot, blockedByOf, progress, readLastOccupancy, statusLineText;
try {
  ({ parseHookInput } = require('../lib/stdin'));
  ({ disabled } = require('../lib/env'));
  ({ readVersion } = require('../lib/version'));
  ({ gitRoot, isInitialized } = require('../lib/project'));
  ({ readEpic } = require('../lib/lot'));
  ({ loadBacklog, currentLot, lotOwnedBy, nextLot, blockedByOf, progress } = require('../lib/backlog'));
  ({ readLastOccupancy } = require('../lib/occupancy'));
  ({ statusLineText } = require('../lib/messages'));
} catch (_) { emit(''); }

function main() {
  if (disabled()) emit(''); // kill-switch : statusline muette, comme les autres signaux PMZ.

  const input = parseHookInput();
  const version = readVersion() || null;
  const cwd = (input.workspace && input.workspace.current_dir) || input.cwd || process.cwd();
  const transcript = input.transcript_path || null;

  // Occupation temps réel — indépendante de l'état projet (marche même hors-git).
  let occ = null;
  try { occ = readLastOccupancy(transcript); } catch (_) { occ = null; }

  const info = { version, occ };
  try {
    const root = gitRoot(cwd);
    if (root && isInitialized(root)) {
      const b = loadBacklog(root);
      const sid = input.session_id || null;
      let isMaster = false;
      try { isMaster = !!sid && require('../lib/epicmaster-live').isMasterSession(root, require('../lib/epicmaster-live').load(root), sid); } catch (_) { /* fail-open */ }
      // US propre à la session (US#188) : l'owner « master/… » en maître, sinon owner = sid ; à défaut,
      // comportement historique (in_progress puis prochaine).
      let own = null;
      try { own = sid ? lotOwnedBy(b, sid, isMaster) : null; } catch (_) { own = null; }
      const cur = own || currentLot(b);
      const nxt = nextLot(b);
      info.epic = (cur && cur.epic) || (nxt && nxt.epic) || readEpic(root) || null;
      const lot = cur || nxt;
      // Un PROCHAIN lot bloqué par une dépendance ouverte porte un ⚠ (lot #97) : blockedByOf est
      // pur et sans E/S, sûr à chaque refresh de statusline (et le try/catch englobant reste le filet).
      if (lot) info.lot = { id: lot.id, title: lot.title, blocked: !cur && blockedByOf(b, nxt).length > 0 };
      if (b.lots && b.lots.length) {
        const p = progress(b);
        info.done = p.done;
        info.total = p.total;
      }
      // Segment de repli (lot #136) : état live de la session maître, vide hors session maître.
      // « EM … » seulement en session maître ; « D3 #N » dans une session fille de vague (US#188).
      const segs = [];
      try { const em = require('../lib/epicmaster-live').statusSegment(root, undefined, sid || undefined); if (em) segs.push(em); } catch (_) { /* fail-open */ }
      try { const fl = sid ? require('../lib/fleet').lotForSession(root, sid) : null; if (fl) segs.push(`D3 #${fl.id}`); } catch (_) { /* fail-open */ }
      info.live = segs.join(' ') || null;
    }
  } catch (_) { /* projet illisible → on garde version + occupation */ }

  let line = statusLineText(info);
  // Badge de retard (US#182) : cache seul, ni spawn ni réseau. Juste après « PMZ v<version> ».
  try {
    const c = require('../lib/update-check').readCached();
    if (c && c.behind && c.latest && version) {
      const head = `PMZ v${version}`;
      if (line.startsWith(head)) line = head + ` · ↑ v${c.latest}` + line.slice(head.length);
    }
  } catch (_) { /* fail-open */ }
  emit(line);
}

try { main(); } catch (_) { emit(''); }
