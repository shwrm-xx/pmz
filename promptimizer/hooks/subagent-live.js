#!/usr/bin/env node
'use strict';
// SubagentStart / SubagentStop : tient à jour .vibe-agent/epicmaster-live.json (lot #136) pour que
// `backlog.js epicmaster --live` et la statusline sachent combien de sous-agents tournent pendant une
// session maître. Silencieux et NON BLOQUANT : aucune sortie, toujours exit 0. N'écrit que si une
// session maître est en cours (lib/epicmaster-live.js) — sans elle, aucun fichier n'est créé.
// US#155 — alerte de concurrence : à l'arrêt d'un sous-agent, si SON intervalle n'a chevauché
// aucun autre sous-agent alors que sa vague compte >= 2 US, le maître a lancé en série. On émet
// alors UN `systemMessage` (non bloquant, une fois par vague) ; sinon toujours silencieux.
process.on('uncaughtException', () => process.exit(0));
process.on('unhandledRejection', () => process.exit(0));
const { armFailOpen } = require('../lib/guard');
const { SETTINGS_TIMEOUT_S, watchdogMs } = require('../lib/timeouts');
armFailOpen(watchdogMs(SETTINGS_TIMEOUT_S.default));
const { disabled } = require('../lib/env');
if (disabled()) process.exit(0);

const { parseHookInput } = require('../lib/stdin');
const { gitRoot } = require('../lib/project');
const live = require('../lib/epicmaster-live');
const path = require('path');
const { readJson, writeAtomic } = require('../lib/fsjson');

const ALERT_FILE = 'epicmaster-concurrency-alert.json';

function t(iso) { const n = Date.parse(iso); return Number.isFinite(n) ? n : null; }

// Retourne le message d'alerte (string) ou '' : concurrence restée à 1 sur une vague >= 2 US.
function concurrencyAlert(root, input) {
  const st = live.load(root);
  if (Number(st.max_parallel) === 1) return ''; // plafond volontaire à 1 : la série est voulue
  const a = st.agents && st.agents[String(input.agent_id || '')];
  if (!a || !a.stopped_at) return '';
  const a0 = t(a.started_at), a1 = t(a.stopped_at);
  if (a0 == null || a1 == null) return '';
  const lots = Object.values(st.lots || {}).filter((l) => l && typeof l === 'object');
  const lot = a.lot != null ? st.lots[String(a.lot)] : null;
  const wave = lot && lot.wave ? Number(lot.wave) : null;
  const waveSize = wave ? lots.filter((l) => Number(l.wave) === wave).length : lots.filter((l) => l.status === 'running').length;
  if (waveSize < 2) return '';
  const overlapped = Object.values(st.agents).some((b) => {
    if (!b || b === a) return false;
    const b0 = t(b.started_at), b1 = b.stopped_at ? t(b.stopped_at) : Infinity;
    return b0 != null && b0 < a1 && (b1 == null || b1 > a0);
  });
  if (overlapped) return '';
  const key = wave ? 'w' + wave : 'x';
  const file = path.join(root, '.vibe-agent', ALERT_FILE);
  const seen = readJson(file, {});
  if (!seen || typeof seen !== 'object' || seen[key]) return '';
  seen[key] = new Date().toISOString();
  writeAtomic(file, seen);
  return `PMZ : concurrence restée à 1 sur une vague de ${waveSize} US${wave ? ' (vague ' + wave + ')' : ''}. `
    + 'Lance tous les Agent de la vague dans UN seul message, avec run_in_background: true, puis une place libérée part à l\'US éligible suivante (pipeline glissant).';
}

function main() {
  const input = parseHookInput();
  const name = String(input.hook_event_name || '');
  const event = /stop/i.test(name) ? 'stop' : /start/i.test(name) ? 'start' : null;
  if (!event) return;
  const root = gitRoot(input.cwd || process.cwd());
  if (!root) return;
  live.recordSubagent(root, event, input);
  if (event === 'stop') {
    let msg = '';
    try { msg = concurrencyAlert(root, input); } catch (_) { msg = ''; }
    if (msg) process.stdout.write(JSON.stringify({ systemMessage: msg }));
  }
}

try { main(); } catch (_) { /* fail-open */ }
process.exit(0);
