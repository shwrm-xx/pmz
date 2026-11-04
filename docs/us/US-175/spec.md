# Spec US#175 — Procédure maître de solde

<!-- spec-v2 -->

- US : #175
- epic : Solde d'epic

## Récit

En tant qu'utilisateur d'`/epicmaster` et d'`/pickymaster`,
je veux que la session maître trie, corrige et vérifie le solde avant de conclure,
afin qu'une epic close ne laisse ni question en suspens ni dette de confort.

## Cadrage d'exécution

- Fichiers visés : `promptimizer/commands/epicmaster.md`, `promptimizer/commands/pickymaster.md`, `promptimizer/templates/epicmaster-handoff.md`, `README.md`, `ARCHITECTURE.md`.
- Contrat (procédure à écrire dans l'étape « Consolidation finale », à l'identique dans les deux commandes) :
  - **Relecture opus** : ses « Problèmes confirmés » sont des **Défauts**, toujours corrigés dans l'US d'arbitrages, jamais en Dette. Son « Non vérifié confirmé » est vérifié dans l'US d'arbitrages, sauf s'il exige un geste humain.
  - **Tri** en 3 catégories :
    - **Défaut** : critère raté, problème confirmé, ou item dans le périmètre d'une US → corrigé.
    - **Finition** : tout point mineur, dans le périmètre ou non → corrigé.
    - **Dette** : un point hors périmètre, d'importance `haute` ou `critique`, avec la raison du report (il exige une conception ou plus d'un commit) ; au plus **1** par epic.
    - Pas de catégorie « Écarté ». Les « À trancher » techniques vont à l'arbitre opus, ceux d'expérience utilisateur à `AskUserQuestion`, comme aujourd'hui.
  - **US d'arbitrages** : elle porte tous les Défauts, Finitions, décisions et vérifications « Non vérifié » réalisables sans geste humain.
  - **Garde de solde** : après la clôture de l'US d'arbitrages et avant le handoff, le maître lance `node ~/.claude/promptimizer/scripts/backlog.js epicmaster --settle-check --stdin`. Le JSON a la forme `{dette:[{item,us,importance,raison}], a_trancher:[{item,maquette}], non_verifie:[{item,geste_humain,cause}], arbitrage_rounds}`.
    - « Solde : NON » → un second tour d'arbitrages : nouvelle US d'arbitrages sur les points listés, exécutée et close.
    - Au plus **2 tours**. Au-delà, chaque point restant passe en Dette avec la mention « non résolu après arbitrage » et garde importance et raison.
    - Le résumé final cite la sortie de la garde.
  - **Handoff** (`epicmaster-handoff.md`) : chaque item de « Dette consolidée » prend la forme `item (US#N) — importance — raison du report`. « Non vérifié » ne liste que les points qui exigent un geste humain, avec leur cause. Le résumé final à l'utilisateur n'a plus de ligne « À trancher » hors maquettes.
  - **README** et **ARCHITECTURE** : décrire le solde d'epic (3 catégories, dette ≤ 1, garde `--settle-check`, 2 tours).
- Dépend de : aucune (le CLI `--settle-check` est figé dans la spec de l'US#174).
- Modèle · effort : sonnet · medium.

## Décisions

- Pas de catégorie « Écarté », plafond de dette à 1 (choix de l'utilisateur).
- Au plus 2 tours d'arbitrages, pour éviter les boucles.

## Critères d'acceptation

1. Étant donné `epicmaster.md`, alors l'étape Arbitrages décrit le tri Défaut / Finition / Dette, la garde `--settle-check` et la limite de 2 tours. Ce critère vaut aussi pour `pickymaster.md`.
2. Aucune des deux commandes ne contient plus « Problèmes confirmés » suivi de « vont en **Dette** ».
3. Le gabarit `epicmaster-handoff.md` présente une dette sous la forme « item (US) — importance — raison ».
4. README et ARCHITECTURE mentionnent `--settle-check` et le plafond de dette à 1.
5. `node test/run-tests.js` reste vert, y compris les tests existants qui inspectent ces commandes.

## Hors périmètre

- Implémentation de `--settle-check` et des briefs : US#174.
- Bump de version et release : faits après l'epic.

## Preuve de clôture

- `git grep -q settle-check -- promptimizer/commands && git grep -q importance -- promptimizer/templates/epicmaster-handoff.md`
- `node test/run-tests.js`
