#!/usr/bin/env node
'use strict';
// UserPromptSubmit : détecte init/scaffold et demandes trop larges. Anti-spam 1×/session.
// Non bloquant : ne bloque jamais un prompt.
process.on('uncaughtException', () => process.exit(0));
process.on('unhandledRejection', () => process.exit(0));
const { armFailOpen } = require('../lib/guard');
const { SETTINGS_TIMEOUT_S, watchdogMs } = require('../lib/timeouts');
armFailOpen(watchdogMs(SETTINGS_TIMEOUT_S.default));
const { disabled } = require('../lib/env');
if (disabled()) process.exit(0);

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseHookInput } = require('../lib/stdin');
const { injectContext, passThrough } = require('../lib/output');
const { gitRoot, isFullyInitialized } = require('../lib/project');
const { autoInitGitAndBootstrap } = require('../lib/bootstrap');
const { loadSessionState, saveSessionState } = require('../lib/state');
const { loadBacklog, currentLot, progress } = require('../lib/backlog');
const {
  MSG_LARGE, MSG_INIT_BEFORE_CODE, autoInitMessage, largeWithPlanMessage, occupancyPromptMessage,
  selfTitleMessage, modelMismatchMessage, turnBudgetPromptMessage,
} = require('../lib/messages');
const lotLib = require('../lib/lot');
const occupancy = require('../lib/occupancy');
const turnstats = require('../lib/turnstats');
const turnbudget = require('../lib/turnbudget');
const { readLastModel, modelsDiffer, hintResolvableClaude } = require('../lib/modelwatch');

const OCC_PROMPT_THRESHOLD = 500000;

const INIT_RE = /(nouveau projet|initialise|initialiser|scaffold|setup|from scratch|cr[ée]er? un projet|bootstrap)/i;
const BROAD_RE = /(refactor (complet|global|tout)|partout|tout le (projet|code|repo)|et aussi|pendant que tu y es|tant qu'on y est|toutes les|tous les fichiers)/i;

function isBroad(prompt) {
  if (!prompt) return false;
  if (BROAD_RE.test(prompt)) return true;
  const bullets = (prompt.match(/(^|\n)\s*([-*]|\d+\.)/g) || []).length;
  return prompt.length > 1500 || bullets >= 6;
}

function main() {
  const input = parseHookInput();
  const cwd = input.cwd || process.cwd();
  const prompt = String(input.prompt || '');
  const root = gitRoot(cwd);
  if (!root) {
    // Aucun .git du tout : si le prompt ressemble à un vrai démarrage de projet,
    // on initialise nous-mêmes (git init + scaffold + commit) — rien à écraser
    // par construction (copyIfAbsent). Sinon comportement inchangé : on ne touche
    // à rien hors repo git.
    if (INIT_RE.test(prompt)) {
      try {
        const result = autoInitGitAndBootstrap(cwd);
        if (result.ok) {
          return injectContext('UserPromptSubmit', autoInitMessage({ gitInitDone: true, committed: result.committed }));
        }
      } catch (_) {
        /* fail-open : on retombe sur passThrough ci-dessous */
      }
    }
    return passThrough();
  }

  const initialized = isFullyInitialized(root);
  const sid = input.session_id || null;
  const st = loadSessionState(root, sid);

  // Session de CONCEPTION (lot #130) : le mode plan de Claude Code est porté par le champ
  // commun `permission_mode` du payload hook. Marqué ici — l'état est déjà réécrit en fin de
  // hook, coût nul — pour que la session SUIVANTE titre celle-ci « [XXX · Plan] <epic> ».
  // Champ optionnel côté Claude Code : absent => rien, jamais d'erreur.
  if (input.permission_mode === 'plan') st.plan_session = true;

  st.prompt_reminders = st.prompt_reminders || {};
  const parts = [];

  // Titre de la session COURANTE (« self ») — jamais la précédente (retour utilisateur 2026-10-12).
  // Injecté au 1er prompt, puis seulement quand le titre change (lot démarré, scope posé) — jamais à
  // chaque tour. Nomenclature non posée : question une seule fois par session. Session maître
  // (/epicmaster) : elle se titre elle-même, on se tait.
  const isMasterPrompt = /^\s*\/(pmz:)?epicmaster\b/.test(prompt);
  if (isMasterPrompt) st.master_session = true; // seule exclue : la session maître se titre elle-même
  if (initialized && !st.master_session) {
    const nomenclature = !lotLib.nomenclatureSet(root);
    const t = lotLib.currentSessionTitle(root, sid, { plan: st.plan_session === true });
    if (t) {
      if (nomenclature && st.prompt_reminders.nomenclature) {
        // Question déjà posée, toujours sans trigramme : sans réponse on renomme quand même
        // (trigramme par défaut), une seule fois — jamais muet (US#151).
        if (!st.prompt_reminders.nomenclature_fallback) {
          st.prompt_reminders.nomenclature_fallback = true;
          st.self_title = t.title;
          parts.push(selfTitleMessage(t.title, { compose: t.compose, fallback: true }));
        }
      } else if (t.title !== st.self_title) {
        if (nomenclature) st.prompt_reminders.nomenclature = true;
        st.self_title = t.title;
        parts.push(selfTitleMessage(t.title, { compose: t.compose, nomenclature }));
      }
    }
  } else if (!initialized && !isMasterPrompt) {
    // Projet non initialisé (US#151) : « [XXX? · HS] … » une fois par session. L'état n'étant pas
    // persisté sans .vibe-agent, anti-spam par marqueur temporaire (fail-open : au pire on redit).
    try {
      const mk = path.join(os.tmpdir(), `pmz-title-${String(sid || 'nosid').replace(/[^A-Za-z0-9_-]/g, '_')}`);
      if (!fs.existsSync(mk)) {
        fs.writeFileSync(mk, '1');
        parts.push(selfTitleMessage(lotLib.uninitSessionTitle(root), { uninit: true }));
      }
    } catch (_) { /* fail-open */ }
  }

  let msg = null;
  let key = null;
  if (!initialized && INIT_RE.test(prompt)) { key = 'init_before_code'; msg = MSG_INIT_BEFORE_CODE; }
  else if (isBroad(prompt)) {
    key = 'broad';
    // Plan de lots déjà en place → rattacher plutôt que redécouper.
    try {
      const b = loadBacklog(root);
      msg = b.lots.length ? largeWithPlanMessage(progress(b), currentLot(b)) : MSG_LARGE;
    } catch (_) {
      msg = MSG_LARGE;
    }
  }

  if (msg && key) {
    if (!st.prompt_reminders[key]) { // déjà rappelé cette session sinon
      st.prompt_reminders[key] = true;
      parts.push(msg);
    }
  }

  // Vigie modèle réel vs préconisé (lot #42) : au 1er prompt du lot en cours (anti-spam
  // 1×/session — prompt_reminders repart à zéro sur nouvelle session_id, cf. lib/state.js),
  // si le modèle qui répond ce tour diffère du model_hint, nudge. Fail-open : toute erreur
  // (backlog absent, transcript illisible) => pas de nudge, jamais de blocage du prompt.
  try {
    if (!st.prompt_reminders.model_mismatch) {
      const b = loadBacklog(root);
      const cur = currentLot(b);
      // Silence si le hint désigne un runtime tiers (ollama/gpt/…) : CC ne peut pas s'y
      // basculer, donc ni vigie ni suggestion /model (lot #55, hintResolvableClaude).
      if (cur && cur.model_hint && hintResolvableClaude(cur.model_hint)) {
        const actualModel = readLastModel(input.transcript_path);
        if (actualModel && modelsDiffer(cur.model_hint, actualModel)) {
          st.prompt_reminders.model_mismatch = true;
          parts.push(modelMismatchMessage(cur, actualModel));
        }
      }
    }
  } catch (_) {
    /* fail-open : pas de nudge modèle ce tour */
  }

  // Nudge occupation haute — indépendant du init/broad ci-dessus, 1×/palier
  // (clé occ_<bucket> distincte des autres rappels, même state prompt_reminders).
  try {
    const occ = occupancy.readLastOccupancy(input.transcript_path);
    if (occ != null && occ >= OCC_PROMPT_THRESHOLD) {
      const bucket = occupancy.bucketIndex(occ);
      const occKey = `occ_${bucket}`;
      if (!st.prompt_reminders[occKey]) {
        st.prompt_reminders[occKey] = true;
        parts.push(occupancyPromptMessage(occ, bucket));
      }
    }
  } catch (_) {
    /* fail-open : pas de nudge occupation ce tour */
  }

  // BUDGET DE TOURS (lot #124) — canal DÉCISIF. Le Stop rappelle et prescrit dans un
  // `systemMessage`, visible par l'utilisateur mais JAMAIS réinjecté au modèle : Claude ne le
  // lit pas et continue donc à étirer la session. L'injection ici est le seul levier qui agisse
  // sur son comportement. Volontairement limitée au palier de PRESCRIPTION (pas au simple
  // rappel) : chaque injection coûte du contexte, on ne la paye qu'au moment où l'action
  // demandée change (amener le lot à un point de commit, proposer la clôture).
  // Anti-spam PROPRE au canal (état 'turnbudget-prompt', cf. turnbudget.CHANNELS) : le Stop du
  // même tour ne doit pas consommer le palier de celui-ci. Compteur lu SANS incrémenter
  // (turnstats.readTurnCount) — il n'avance qu'au Stop.
  try {
    const tb = turnbudget.evaluate(root, sid, turnstats.readTurnCount(sid), 'prompt');
    if (tb && tb.stage === 'prescribe') parts.push(turnBudgetPromptMessage(tb));
  } catch (_) {
    /* fail-open : pas d'injection de budget ce tour */
  }

  saveSessionState(root, st);
  if (parts.length) return injectContext('UserPromptSubmit', parts.join('\n\n'));
  return passThrough();
}

main();
process.exit(0);
