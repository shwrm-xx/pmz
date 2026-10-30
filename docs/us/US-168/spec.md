# Spec US#168 — Releases traçables (tags + GitHub Release)

- US : #168
- epic : Distribution publique

## Récit

En tant qu'utilisateur du plugin,
je veux voir chaque version comme un tag et une GitHub Release avec ses notes,
afin de savoir ce qui a changé et de pouvoir revenir à une version précise.

## Cadrage d'exécution

- Fichiers visés : `promptimizer/install/publish-plugin.js`, `.github/workflows/release.yml` (créé), `test/**`, `CLAUDE.md` (section Release), `ARCHITECTURE.md` (section Canal plugin).
- Contrat :
  - `publish-plugin.js --push` : après le push de `plugin-release`, il lit `promptimizer/VERSION` et vise le tag annoté `v<VERSION>` sur `HEAD` de `main` (`git tag -a vX.Y.Z -m "Release vX.Y.Z"`, puis `git push <remote> vX.Y.Z`).
    - si le tag existe déjà sur le même commit : no-op et message ;
    - si le tag existe sur un autre commit : erreur `exit 1`, sans écraser ni forcer ;
    - sans `--push` : il affiche seulement le tag qui serait créé.
  - La logique de décision est une fonction pure exportée `tagPlan({version, headSha, existingSha})` qui renvoie `'create' | 'noop' | 'conflict'`, et c'est elle qui est testée.
  - `release.yml` : `on: push: tags: ['v*']`, `permissions: contents: write`. Il extrait de `CHANGELOG.md` la section dont le titre contient `Release vX.Y.Z` (jusqu'au titre de même niveau suivant) et crée la Release via `gh release create "$TAG" --notes-file …` (le `GITHUB_TOKEN` est fourni). Aucun autre secret.
  - Le `ref` du catalogue `.claude-plugin/marketplace.json` reste `plugin-release` (décision de l'epic : les tags servent à la traçabilité, pas à la distribution).
- Dépend de : aucune.
- Modèle · effort : sonnet · medium

## Critères d'acceptation

1. `tagPlan` renvoie `create` sans tag existant, `noop` si le SHA est identique, `conflict` s'il diffère. Les 3 cas sont testés dans `run-tests`.
2. Étant donné un bac à sable git, quand on lance `publish-plugin.js` sans `--push`, alors rien n'est poussé et le tag prévu est affiché.
3. L'étape 4 de la release dans `CLAUDE.md` mentionne le tag poussé et la GitHub Release automatique.
4. `node test/run-tests.js` est vert.

## Hors périmètre

- Épingler `ref` sur le tag : cela obligerait à réécrire le catalogue de `main` à chaque release, sans gain pour la mise à jour automatique.
- Rattraper les tags des versions passées : ce sera un geste manuel, si on le souhaite.

## Preuve de clôture

- `node test/run-tests.js`

## Notes

- Le tag pointe sur le commit source `chore(release): vX.Y.Z` de `main`, pas sur `plugin-release`, qui est dérivée.
