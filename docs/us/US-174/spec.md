# Spec US#174 — Garde de solde et briefs

<!-- spec-v2 -->

- US : #174
- epic : Solde d'epic

## Récit

En tant qu'utilisateur d'`/epicmaster`,
je veux qu'une epic se solde entièrement par l'US d'arbitrages, avec une dette exceptionnelle et importante,
afin de ne plus recevoir des livraisons « vertes » accompagnées de défauts et de questions renvoyés en dette.

## Cadrage d'exécution

- Fichiers visés : `promptimizer/lib/epicmaster.js`, `promptimizer/scripts/backlog.js`, `test/run-tests-solde.js` (nouveau), `test/run-tests.js` (enregistrement du nouveau fichier de test seulement).
- Contrat :
  - **Nouvelle fonction pure** `settleCheck(input)` dans `lib/epicmaster.js`, exportée. Elle retourne `{ ok, problems: [string], warnings: [string] }`.
  - **Entrée** (JSON) : `{ "dette": [{"item","us","importance","raison"}], "a_trancher": [{"item","maquette"}], "non_verifie": [{"item","geste_humain","cause"}], "arbitrage_rounds": <int> }`. Un champ absent vaut tableau vide ou 0.
  - **Règles** (chaque violation produit une ligne dans `problems`) :
    1. Tout `a_trancher` avec `maquette !== true` → « À trancher non soldé : <item> ».
    2. Toute `dette` dont `importance` n'est ni `haute` ni `critique`, ou dont `raison` est vide → « Dette non éligible : <item> — à corriger dans l'US d'arbitrages ».
    3. Plus de `DEBT_MAX = 1` dette → « Trop de dette (N > 1) ». Si `arbitrage_rounds >= ARBITRAGE_MAX_ROUNDS = 2`, la ligne passe en `warnings` et non en `problems`. La règle 2 reste bloquante dans tous les cas.
    4. Tout `non_verifie` avec `geste_humain !== true` → « Non vérifié vérifiable : <item> — à vérifier dans l'US d'arbitrages ». Un `non_verifie` avec `geste_humain: true` mais sans `cause` → « cause manquante ».
  - **CLI** : `backlog.js epicmaster --settle-check --stdin` lit le JSON sur stdin. Il imprime `Solde : OK` (avec les éventuels avertissements) et sort en exit 0, ou `Solde : NON — N point(s) à reprendre` suivi d'une puce par point, et sort en exit 1. Un JSON invalide affiche l'usage et sort en exit 1.
  - **`renderBrief`** (sous-agent) : la consigne Dette devient la suivante. Un défaut, un critère raté ou une finition dans ton périmètre se corrige, il ne se classe jamais en Dette. La Dette n'admet qu'un point hors périmètre, d'importance haute ou critique, avec la raison du report. Pour « Non vérifié », préciser s'il faut un geste humain (mot de passe, matériel…) et pourquoi.
  - **`renderReviewBrief`** (relecteur) : la ligne « Le maître classe tes constats en Dette… » devient « Tes Problèmes confirmés sont des Défauts : le maître les fait corriger dans l'US d'arbitrages, jamais en Dette ».
- Dépend de : aucune (contrat figé ici).
- Modèle · effort : sonnet · medium.

## Décisions

- Pas de catégorie « Écarté ». Un point mineur, même hors périmètre, est corrigé dans l'US d'arbitrages (choix de l'utilisateur).
- Plafond de dette fixé à 1 par epic (choix de l'utilisateur).
- Au plus 2 tours d'arbitrages, pour éviter les boucles. Au-delà, seul le plafond devient un avertissement.

## Critères d'acceptation

1. Étant donné un `a_trancher` sans maquette, quand on lance `--settle-check`, alors la sortie est exit 1 avec « À trancher non soldé ».
2. Étant donné un `a_trancher` avec `maquette: true` et rien d'autre, alors la sortie est exit 0 avec « Solde : OK ».
3. Étant donné une dette d'importance `moyenne` ou sans raison, alors la sortie est exit 1 avec « Dette non éligible », même si `arbitrage_rounds` vaut 2.
4. Étant donné 2 dettes éligibles et `arbitrage_rounds: 0`, alors la sortie est exit 1. Avec `arbitrage_rounds: 2`, la sortie est exit 0 et un avertissement est affiché.
5. Étant donné un `non_verifie` avec `geste_humain: false`, alors la sortie est exit 1. Avec `geste_humain: true` et une `cause`, la sortie est exit 0.
6. Étant donné un JSON invalide, alors la sortie est exit 1 avec l'usage.
7. Le brief de sous-agent et le brief du relecteur contiennent les nouvelles consignes : `git grep` trouve « jamais en Dette » dans `lib/epicmaster.js`.
8. `node test/run-tests.js` est vert et inclut `run-tests-solde.js`.

## Hors périmètre

- Commandes `epicmaster.md` et `pickymaster.md`, gabarit de handoff et docs : traités par l'US#175, en parallèle.
- Bump de version et release : faits après l'epic.

## Preuve de clôture

- `node test/run-tests.js`
