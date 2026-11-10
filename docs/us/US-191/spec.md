# Spec US#191 — Réécriture locale historique + remap des SHA

<!-- spec-v2 -->

- US : #191
- epic : Purge email MH

## Récit

En tant que mainteneur de pmz (dépôt perso `shwrm-xx/pmz`),
je veux que plus aucun commit ni tag ne porte mon email professionnel MH,
afin de ne plus déclencher d'alerte CTI de la sécurité informatique.

## Cadrage d'exécution

- Fichiers visés : historique git (`--branches --tags` : `main`, `plugin-release`, 13 tags annotés `v*`),
  `.vibe-agent/backlog.json`, `.vibe-agent/archive/index.md`, `CHANGELOG.md`.
- Contrat (ordre strict) :
  1. Sauvegarde : `git clone --mirror . ~/repo-shw/pmz-backup-2026-11-10.git` (hors dépôt, hors scratchpad).
  2. `git stash` des modifs non commitées préexistantes (ne pas les commiter, ne pas les lire pour décider).
  3. `git filter-branch` (pas de `filter-repo`, aucun téléchargement), `-- --branches --tags` (jamais `refs/remotes`) :
     `--env-filter` : si `GIT_AUTHOR_EMAIL` / `GIT_COMMITTER_EMAIL` contient `malakoffhumanis` → email
     `6293556+shwrm-xx@users.noreply.github.com`, nom `Marwan EL-ACHMAR` ; `--commit-filter` :
     `NEW=$(git commit-tree "$@"); echo "$GIT_COMMIT $NEW" >> ~/repo-shw/pmz-backup-2026-11-10.map; echo $NEW` ;
     `--tag-name-filter cat`.
  4. Recréer chacun des 13 tags annotés : même nom, même message, `GIT_COMMITTER_DATE` = date tagger d'origine,
     `GIT_COMMITTER_NAME/EMAIL` = noreply, cible = commit réécrit (`git tag -a -f`).
  5. `git stash pop`, puis remap de tout SHA (complet ou préfixe ≥ 7 hex) présent dans `backlog.json` et
     `archive/index.md` via le fichier `.map` (fichiers courants seulement, pas leurs versions historiques).
  6. Entrée datée dans `CHANGELOG.md` ; un commit (email noreply = config locale déjà posée). **Aucun push.**
- Dépend de : aucune
- Modèle · effort : sonnet · medium

## Décisions

- Outil `filter-branch` intégré — pas de téléchargement de `git filter-repo`.
- Auteur/committer seulement : l'email MH n'apparaît ni dans le contenu des fichiers ni dans les messages (vérifié).
- Les SHA dans les anciennes versions de `backlog.json` restent tels quels — coût disproportionné, sans impact.
- Le push est l'US#192, séparée pour garder un point d'arrêt avant l'irréversible.

## Critères d'acceptation

1. Étant donné la réécriture faite, quand on lance `git log --branches --tags --format=%ae%ce`, alors aucune ligne ne contient `malakoff`.
2. Quand on lance `git for-each-ref refs/tags --format='%(taggeremail)'`, alors 13 lignes, aucune `malakoff`.
3. Étant donné un `closed_commit` de `backlog.json`, quand on fait `git cat-file -t <sha>`, alors `commit` (tous résolvent).
4. `git log --branches --format=%H | wc -l` et le nombre de tags sont identiques à la sauvegarde miroir.
5. `node test/run-tests.js` sort en 0.
6. `git status` propre hormis les modifs préexistantes restaurées ; rien poussé (`origin/main` inchangé).

## Hors périmètre

- Push / publication : US#192.
- Purge du cache GitHub des anciens SHA (formulaire support GitHub) : action de l'utilisateur.

## Preuve de clôture

- `! (git log --branches --tags --format=%ae%ce; git for-each-ref refs/tags --format='%(taggeremail)') | grep -qi malakoff && node test/run-tests.js`

## Notes

- `refs/original/*` (laissé par filter-branch) est conservé jusqu'à la fin de l'US#192 — jamais poussé.
- Restauration en cas d'échec : `git fetch --force ~/repo-shw/pmz-backup-2026-11-10.git '+refs/*:refs/*'`.
