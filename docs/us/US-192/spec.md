# Spec US#192 — Publication de l'historique réécrit (force-push)

<!-- spec-v2 -->

- US : #192
- epic : Purge email MH

## Récit

En tant que mainteneur de pmz,
je veux que le dépôt GitHub `shwrm-xx/pmz` ne serve plus que l'historique réécrit,
afin que l'email MH ne soit plus exposé publiquement.

## Cadrage d'exécution

- Fichiers visés : refs distantes `origin` (`main`, `plugin-release`, tags `v*`), `CHANGELOG.md` (une ligne).
- Contrat (ordre strict) :
  1. Rejouer le `--verify` de l'US#191 et l'afficher ; **attendre le go explicite de l'utilisateur en chat**
     avant tout push (irréversible). Sans go : s'arrêter, ne rien pousser.
  2. `git push --force-with-lease origin main`
  3. `git push --force origin --tags`
  4. `node promptimizer/install/publish-plugin.js --push` (régénère et force-push `plugin-release`).
  5. Contrôle : `git clone https://github.com/shwrm-xx/pmz.git` dans un dossier temporaire, puis
     `git log --all --format=%ae%ce` et taggers sans `malakoff` ; SHA de `main` et des tags = locaux.
  6. Ligne CHANGELOG « historique publié », commit, `git push origin main` (non forcé).
  7. Supprimer `refs/original/*` local une fois le contrôle vert.
- Dépend de : #191
- Modèle · effort : sonnet · medium

## Décisions

- Go explicite redemandé avant le push : l'accord donné au découpage ne vaut pas pour l'exécution en sous-agent.
- `--force-with-lease` pour `main` (refuse si GitHub a bougé entretemps).

## Critères d'acceptation

1. Étant donné le go reçu, quand on lance le `--verify`, alors aucun `malakoff` sur `origin/main`, `origin/plugin-release` et les tags distants.
2. `git ls-remote origin refs/heads/main` = `git rev-parse main`.
3. Les tags distants `v*` pointent sur les mêmes objets que les tags locaux.
4. Le clone frais ne contient aucun `malakoff` (auteur, committer, tagger).

## Hors périmètre

- Prévenir les collègues : leur prochain `claude plugin marketplace update pmz-marketplace` récupère la branche réécrite.
- Demande de purge du cache GitHub : action de l'utilisateur (formulaire support « remove sensitive data »).
- Suppression de la sauvegarde miroir `~/repo-shw/pmz-backup-2026-11-10.git` : laissée à l'utilisateur.

## Preuve de clôture

- `git fetch -f origin 'refs/tags/*:refs/tags/*' && ! git log origin/main origin/plugin-release --tags --format=%ae%ce | grep -qi malakoff`
