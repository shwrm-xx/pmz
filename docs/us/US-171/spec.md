# Spec US#171 — Rapport, arbitre et US d'arbitrages

- US : #171
- epic : Arbitrages en session

## Récit

En tant qu'utilisateur de `/epicmaster`,
je veux que les sous-agents tranchent seuls le technique et qu'un arbitre règle le reste,
afin de ne plus recevoir en fin de session une pile de « à trancher » techniques qui deviennent de nouvelles US.

## Cadrage d'exécution

- Fichiers visés : `promptimizer/lib/epicmaster.js`, `promptimizer/lib/backlog.js`, `promptimizer/scripts/backlog.js`, `promptimizer/templates/spec-template.md`, `test/**` (nouveau `test/run-tests-arbitrages.js` + ajustements des tests existants).
- Contrat :
  - **Rapport** (`renderBrief`, ~l.394) : sections `Fait / Fichiers modifiés / Verify (…) / Non vérifié / Dette / Décidé / À trancher / Bloc CHANGELOG (3 à 6 puces)`. Le brief ajoute :
    - « Décidé » : choix techniques faits seul, une ligne « choix — raison — comment revenir » (comportement par défaut) ;
    - « À trancher » : SEULEMENT un point qui touche l'expérience utilisateur ou un contrat visible (CLI, format de fichier, périmètre) et que la spec ne tranche pas, avec 2 à 3 options dont une recommandée ;
    - test instable / doute de vérif → « Non vérifié » ; section vide → omise, jamais « Aucun ».
  - **Relecteur** (`renderReviewBrief`, l.441) : « Le maître classe tes constats en Dette, Décidé ou À trancher ».
  - **`backlog.js add --kind arbitrages`** : écrit `kind: "arbitrages"` sur l'US (autre valeur → refus). `renderBrief` d'une telle US : première ligne « Arbitrages : toutes les décisions sont prises — pas d'À trancher ; un point bloquant → Dette, avec la cause. », et la section « À trancher » est retirée de la liste des sections du rapport.
  - **`backlog.js epicmaster --arbiter-brief --stdin`** → `renderArbiterBrief(items)` exporté par `lib/epicmaster.js` :
    - entrée JSON : `{"items":[{"id":"#171","point":"…","options":["…","…"],"recommended":0}]}` ;
    - sortie : brief d'un arbitre opus·medium, lecture seule, aucune escalade vers l'humain, une décision par item, rapport ≤ 250 mots aux sections « Décisions » (`<id> — <option retenue> — <raison>`) et « Actions » (action concrète, fichiers, critère de fin ; décision « ne rien changer » = pas d'action) ;
    - entrée vide ou sans item : sortie « Aucun item technique : pas d'arbitre. », exit 0. JSON invalide : message d'usage, exit 0 (fail-open).
  - **Spec** : `SPEC_REQUIRED_SECTIONS` ajoute `'Décisions'` ; `spec-template.md` porte une section `## Décisions` (choix UX et de contrat pris au découpage, « aucune question ouverte » attendu) placée après « Cadrage d'exécution ».
- Dépend de : aucune.
- Modèle · effort : sonnet · medium.

## Décisions

- Le classement technique / expérience utilisateur est fait par le maître (US#172), pas par le code : ici, aucune heuristique de tri automatique.
- `kind` n'accepte que `arbitrages` pour l'instant (champ absent = US ordinaire).

## Critères d'acceptation

1. Étant donné une US ordinaire, quand `epicmaster --brief --id N`, alors la sortie contient « Décidé » et la règle d'éligibilité « À trancher » (expérience utilisateur ou contrat visible).
2. Étant donné `add --kind arbitrages`, quand on lit le backlog, alors l'US a `kind: "arbitrages"` ; et `add --kind autre` est refusé.
3. Étant donné une US `kind: arbitrages`, quand `epicmaster --brief --id N`, alors la 1ʳᵉ ligne utile est la consigne « pas d'À trancher » et la liste des sections ne contient pas « À trancher ».
4. Étant donné 2 items sur stdin, quand `epicmaster --arbiter-brief --stdin`, alors la sortie cite les 2 ids, leurs options, et les sections « Décisions » et « Actions » ; avec `{"items":[]}`, la sortie est « Aucun item technique : pas d'arbitre. », exit 0.
5. Étant donné une spec sans `## Décisions`, quand `done --id N`, alors le refus cite « Décisions » parmi les sections manquantes ; le rendu du gabarit contient `## Décisions`.
6. `node test/run-tests.js` est vert (tests existants ajustés, dont `run-tests-relecture.js` et `run-tests-scope-sonnet.js`).

## Hors périmètre

- Procédures `commands/*.md`, templates de handoff, README, ARCHITECTURE : US#172 (doc, consomme ce contrat).
- Aucun changement du schéma live `epicmaster-live.js` : `to_decide` reste alimenté par `note --decide`.

## Preuve de clôture

- `node test/run-tests.js`

## Notes

- Fail-open absolu : `--arbiter-brief` ne sort jamais en exit ≠ 0.
- Zéro dépendance externe (stdlib Node seule).
