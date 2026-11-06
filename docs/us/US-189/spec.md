# Spec US#189 — Docs, doctor --state, assainissement cocina+ecpv3, release v2.18.0

<!-- spec-v2 -->

- US : #189
- epic : Fiabilité sous-sessions

## Récit

En tant que Marwan,
je veux une doc à jour, un diagnostic des fichiers d'état figés, les deux projets gouvernés assainis et la version publiée,
afin que les postes voient la mise à jour et que cocina et ecpv3 repartent sur un état vrai.

## Cadrage d'exécution

- Fichiers visés (PMZ) : `ARCHITECTURE.md`, `README.md`, `CHANGELOG.md`, `CLAUDE.md`, `promptimizer/VERSION`, `promptimizer/.claude-plugin/plugin.json`, `promptimizer/install/doctor.js`, `test/run-tests.js` (enregistrement des suites `run-tests-live.js`, `run-tests-stop.js`, `run-tests-archive.js`, `run-tests-sessions.js`, `run-tests-doctor-state.js` dans la liste ~L10659), `test/run-tests-doctor-state.js`. Hors PMZ : `/Users/marwan.elachmar/repos-mh/cocina` et `/Users/marwan.elachmar/repos-mh/ecpv3` (fichiers `.vibe-agent/{fleet.json, epicmaster-concurrency-alert.json, consignes-sous-agent.md, archive/, lot-counter.json, handoff.md}`, `CLAUDE.md`, `.claude/agents/`, `.gitignore`, `CHANGELOG.md`).
- Contrat :
  - `backlog.js doctor --state [--fix]` (exposé aussi par `/doctor`) : détecte `fleet.json` vide ou > 7 j, alerte dont `seeded_at` ≠ live, `consignes-sous-agent.md` pointant hors dépôt, `.claude/agents/*` d'une epic close, `lot-counter.json`/`handoff.md` versionnés contre `.gitignore` ; `--fix` purge/`git rm --cached` après affichage ; sortie vert/orange/rouge.
  - Docs : ARCHITECTURE (hook SubagentStop existe, 4k/sonnet, `phase`, state par session, verrou maître, FIFO), README (commandes `sessions`, `archive --repair`, `doctor --state`), CHANGELOG « Release v2.18.0 » datée.
  - Assainissement, **un commit dédié par projet, `git status` lu avant, rien poussé** : `archive --repair` ; suppression `fleet.json` figé, alerte, `consignes-sous-agent.md` (+ ligne `CLAUDE.md:26` cocina) ; `git rm --cached lot-counter.json handoff.md` (ecpv3) ; dédoublonnage titres CHANGELOG ; suppression `.claude/agents/mh-lot-*` et `doc-lot-*` (ecpv3). **Signaler sans agir** : cocina `main` a 20 commits non poussés ; specs US-60/61 d'ecpv3 hors git.
  - Release v2.18.0 selon la section « Release » de `CLAUDE.md` (bump VERSION + plugin.json, tests verts lus, commit `chore(release): v2.18.0`, `git push origin main`, `publish-plugin.js --push`, commande colègue restituée).
- Dépend de : #184, #185, #186, #187, #188.
- Modèle · effort : sonnet · medium.

## Décisions

- Release fusionnée dans cette US (micro-US sinon).
- Les commits dans cocina et ecpv3 ne sont pas poussés — décision humaine.

## Critères d'acceptation

1. Étant donné un bac à sable avec un `fleet.json` de 8 jours et une alerte au mauvais `seeded_at`, quand `doctor --state` s'exécute, alors les deux sont signalés (orange) et `--fix` les purge ; un second passage est vert.
2. Étant donné les 5 nouvelles suites, quand `node test/run-tests.js` s'exécute, alors elles sont exécutées et vertes.
3. Étant donné cocina et ecpv3 après assainissement, alors `doctor --state` est vert, `archive/index.md` n'a plus de `verify:inconnu` pour les US avec `closed_verify`, un seul en-tête, CHANGELOG sans « US#N US#N ».
4. Étant donné la release faite, alors `promptimizer/VERSION` = `2.18.0`, tag `v2.18.0` sur `main`, branche `plugin-release` poussée.

## Hors périmètre

- Tout nouveau correctif de code PMZ découvert pendant l'assainissement : nouvelle US (régression) plutôt qu'élargissement.

## Preuve de clôture

- `node test/run-tests.js && grep -q '^2.18.0' promptimizer/VERSION`.

## Notes

- Doc en retard constatée : `ARCHITECTURE.md:413` (« pas de hook SubagentStop »), `:798-800` (6k/opus vs 4k/sonnet).
