# Spec US#167 — CI GitHub Actions

- US : #167
- epic : Distribution publique

## Récit

En tant que mainteneur ou contributeur externe,
je veux que chaque push ou PR soit testé sur les 3 OS et que l'artefact plugin soit validé,
afin de ne jamais publier une version cassée et de donner confiance aux utilisateurs.

## Cadrage d'exécution

- Fichiers visés : `.github/workflows/ci.yml` (créé). Rien d'autre (le badge est posé par US#165).
- Contrat :
  - Nom du workflow : `CI` ; fichier `ci.yml` (l'URL du badge en dépend).
  - Déclencheurs : `push` sur `main`, `pull_request`. **Pas** sur `plugin-release` (branche orpheline sans tests).
  - Job `test` : matrice `os: [ubuntu-latest, macos-latest, windows-latest]`, `node-version: 20`, `actions/checkout@v4` + `actions/setup-node@v4` ; étape `node test/run-tests.js`.
  - Job `validate` (ubuntu, `needs: test`) : `node promptimizer/install/build-plugin.js`, `npm install -g @anthropic-ai/claude-code`, `claude plugin validate dist/marketplace/promptimizer`. La CLI ne sert qu'en CI : la règle « zéro dépendance runtime » est préservée, et aucun `package.json` n'est ajouté.
  - Aucun secret requis.
- Dépend de : aucune.
- Modèle · effort : sonnet · medium

## Critères d'acceptation

1. Étant donné le YAML, quand on le parse, alors il est valide et contient les 2 jobs et la matrice de 3 OS.
2. En local, `node test/run-tests.js` et `node promptimizer/install/build-plugin.js` passent.
3. Après push sur `main`, le run `CI` est vert sur les 3 OS (constaté dans l'onglet Actions, à faire au push).

## Hors périmètre

- Publication automatique du plugin depuis la CI : le force-push de `plugin-release` reste manuel, c'est le mainteneur qui décide d'une release.

## Preuve de clôture

- `node test/run-tests.js`

## Notes

- Si `run-tests.js` échoue sur Windows (chemins, `/bin/bash`), le noter en dette dans le handoff plutôt que d'élargir le périmètre.
