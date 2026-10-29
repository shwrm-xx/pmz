# Spec US#163 — Restitution systématique du lien d'index

- US : #163
- epic : Maquettes : index et navigation

## Récit

En tant que relecteur d'un lot,
je veux qu'à la fin d'une production de maquettes le lien de l'index me soit toujours donné,
afin de ne plus chercher les fichiers moi-même.

## Cadrage d'exécution

- Fichiers visés : `promptimizer/commands/maquette.md`, `promptimizer/commands/epicmaster.md`,
  `promptimizer/commands/pickymaster.md`, `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `test/run-tests.js`.
- Contrat (figé par US#162, non rediscuté) : `maquette.js index [--epic "Nom"]` écrit
  `docs/us/maquettes-index.html` et affiche `URL : file://…`. Chaque maquette porte « ← Index » et un
  menu vers les autres.
- Consigne à écrire : toute fin de production de maquettes (étape 3 de `maquette.md`, rapport de l'US
  « Maquettes » consolidé par le maître) lance `maquette.js index`, puis **restitue le lien cliquable
  de l'index** (chemin relatif en lien markdown + URL `file://`). La formule « maquettes prêtes » seule
  est interdite. Dans « À trancher — maquettes à valider », l'index figure en tête de liste.
- Dépend de : aucune (le contrat est figé ci-dessus).
- Modèle · effort : sonnet · medium.

## Critères d'acceptation

1. Étant donné `maquette.md`, quand on le lit, alors il impose `maquette.js index` et la restitution
   du lien d'index en validation (étape 3).
2. Étant donné `epicmaster.md` et `pickymaster.md`, alors le prompt du sous-agent « Maquettes » et la
   consolidation exigent le lien d'index, pas un simple « prêtes ».
3. Étant donné README, ARCHITECTURE et CHANGELOG, alors une entrée datée décrit l'index et la nav.
4. Un test de `run-tests.js` échoue si l'une des trois commandes perd la mention `maquette.js index`.

## Hors périmètre

- Implémentation du script et du gabarit : US#162.
- Release / bump de version : lot séparé après les deux US.

## Preuve de clôture

- `node test/run-tests.js`
