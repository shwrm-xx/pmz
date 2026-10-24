---
name: promptimizer
description: >-
  Gouvernance de session vibecoding (Claude Code desktop). À utiliser pour : nouveau projet,
  init projet, scaffold, setup Claude Code, optimisation de session, économie de tokens,
  cache read, relecture de contexte, coût tokens, clôture d'US, changelog, commit, handoff,
  session fraîche. Initialise les projets prudemment, réduit le contexte relu, force une
  clôture propre des US, et fournit un delta AGENTS.md pour Codex.
---

# Promptimizer

Système standalone qui rend automatiques trois disciplines, par le chemin le **moins coûteux
en contexte**. La qualité reste obligatoire ; on l'obtient avec le minimum de relecture.

## 1. Initialiser un projet (prudent, après confirmation)
Quand un projet n'est pas initialisé (présence de `.vibe-agent/` absente) :
1. **Proposer** la création du socle, ne rien écrire sans accord de l'utilisateur.
2. Sur accord : `node ${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap-project.js --augment`
   (crée `.vibe-agent/`, `CLAUDE.md`, `AGENTS.md`, `CHANGELOG.md` s'ils manquent — jamais
   d'écrasement, repo git uniquement, jamais le code applicatif). Sur un **projet en cours**
   dont `CLAUDE.md`/`AGENTS.md` existent déjà, `--augment` ajoute en fin de fichier la
   section « Règles Promptimizer » taguée (`pmz:rules:start/end`) — append-only, idempotent,
   réversible en supprimant le bloc.
3. Finaliser `CLAUDE.md`/`AGENTS.md` avec **lecture minimale** (déduire la stack des seuls
   manifestes), sans les rallonger. Puis proposer une première US courte.

## 2. Budget de contexte
- Préférer `git status`, `git diff`, `git grep`, lecture partielle, résumé local.
- Éviter : relecture complète d'un fichier inchangé, scan large du repo, handoff long.
- Le coût réel est suivi par paliers de tokens (alerte `systemMessage` en fin de tour).
  Audit ponctuel : `node ${CLAUDE_PLUGIN_ROOT}/scripts/audit-context.js`.

## 2bis. Lotir une grosse demande
Demande large (plusieurs sujets, ≥ 6 puces, refactor global…) : proposer un découpage en
**2 à 5 US**, le faire valider en une question, puis le persister via `/scope` ou
`node ${CLAUDE_PLUGIN_ROOT}/scripts/backlog.js add --title "…" --scope "…"` (+ `start --id N`).
Au découpage, proposer aussi un **nom de plan court (≤ 3 mots, validé par l'utilisateur)** et le
poser sur chaque US via `--epic "<NomDePlan>"` : c'est lui qui nomme le plan dans le titre de
session (`[XXX · US#Y] NomDePlan · résumé` — `#Y` = id backlog global, seul numéro
affiché). Sans nom de plan, la session s'affiche `[XXX · US#Y] résumé` ; une session sans US
s'affiche `[XXX · HS] résumé`.
`/scope` pense la parallélisation d'office (périmètre ou « série » motivé par US) et se
termine **toujours** par la préparation de la **session maître** :
`backlog.js epicmaster --epic "…" --write-handoff` calcule les vagues (périmètres disjoints en
parallèle, US sans périmètre seules en vol), le parallélisme borné, le budget de contexte du
maître et son modèle, puis écrit le handoff maître — la session de scope **ne démarre aucune
US**. La session fraîche suivante reçoit ce handoff et lance `/epicmaster`.

## 2ter. Session maître (`/epicmaster`)
Lance **toutes les US ouvertes** du backlog (une epic ou plusieurs) en **sous-agents**, chacune au
**modèle + effort préconisés** par l'US, après **une** confirmation (US classées par epic,
toutes cochées, décochables : `--skip`). Vague par vague, jamais plus de sous-agents en vol que le
parallélisme affiché ; le maître ne relit **jamais** la sortie brute d'un sous-agent (rapport
≤ 250 mots, sections fixes), commite **par périmètre**, clôt (`done --verify-verdict`), et
s'arrête à la borne « N US par session maître » ou dès que le hook Stop prescrit une session
fraîche — les US restantes restent ouvertes, `/epicmaster` les reprend. Sortie : handoff
consolidé (`templates/epicmaster-handoff.md`) avec **dette** et **à trancher**.

**Règle de découpe** : 1 US = 1 session sous ~300k tokens, 1 commit, un critère
« fait quand : … » vérifiable. Une US qui dépasse l'un de ces trois → la redécouper plutôt
que de le grossir.

## 3. Clôturer une US
`node ${CLAUDE_PLUGIN_ROOT}/scripts/close-batch.js` puis :
vérification ciblée → `CHANGELOG.md` → commit (français, court) → handoff < 800 tokens
**écrit dans `.vibe-agent/handoff.md`** (écrasé ; 1re ligne `<!-- pmz:handoff:manual -->`) →
recommander une session fraîche (le handoff y est injecté automatiquement au démarrage ;
à défaut, un handoff auto mécanique est écrit par le hook Stop à chaque fin de tour).

## Définition de « fini »
demande littérale traitée · scope creep évité · vérification ciblée · erreurs/zones non
vérifiées listées · CHANGELOG à jour · docs stables à jour si besoin · commit fait ·
handoff court · session fraîche recommandée.

## Delta Codex
Codex utilise `AGENTS.md` comme instructions persistantes (même socle de règles). Pas de hooks
côté Codex : l'auto-activation complète reste portée par Claude Code. Voir le wrapper optionnel
`pmz-codex`.
