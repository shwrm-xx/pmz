# Spec US#169 — Tag de release : détecter le tag local non poussé

- US : #169
- epic : Distribution publique
- régression de : #168

## Récit

En tant que mainteneur de PMZ,
je veux que `publish-plugin.js --push` pousse le tag `vX.Y.Z` même s'il existe déjà en local,
afin que la GitHub Release se déclenche toujours (aujourd'hui : tag local seul → `noop`, jamais poussé).

## Cadrage d'exécution

- Fichiers visés : `promptimizer/install/publish-plugin.js`, `test/run-tests-release-tag.js`, `test/run-tests.js` (seulement si l'enregistrement du test change).
- Contrat :
  - `tagPlan({ version, headSha, localSha, remoteSha })` (pur, exporté) renvoie `'create' | 'push' | 'noop' | 'conflict'`. `localSha` et `remoteSha` valent un SHA, `null` (absent) ou `undefined` (non interrogé, cas sans `--push`).
    - `localSha` ou `remoteSha` défini et ≠ `headSha` → `conflict` ;
    - aucun des deux → `create` ;
    - `localSha === headSha` et `remoteSha === null` → `push` (pousser le tag existant, sans le recréer) ;
    - `localSha === headSha` et `remoteSha` `undefined` ou `=== headSha` → `noop` ;
    - `localSha` absent et `remoteSha === headSha` → `noop`.
  - `existingTagSha` est remplacée par deux lectures séparées : tag local (`rev-parse`), tag remote (`ls-remote`, uniquement si `--push`, sinon `undefined`). Le tag annoté est déréférencé (`^{}`).
  - Dans `main()` : `create` → `git tag -a` puis push ; `push` → push seul, message « tag présent en local, poussé » ; `noop` → message inchangé ; `conflict` → `fail(...)` inchangé. Le message sans `--push` reste informatif.
  - Le test qui fait un `git commit` en bac à sable pose `user.name` / `user.email` via `git -c` ou `git config` local au bac à sable (jamais global), pour tourner sur un runner sans identité.
- Dépend de : aucune.
- Modèle · effort : sonnet · medium

## Critères d'acceptation

1. Étant donné `localSha = headSha` et `remoteSha = null`, quand on appelle `tagPlan`, alors `push`.
2. Étant donné les cas `create`, `noop` (local = remote = HEAD ; local = HEAD et remote `undefined`), `conflict` (local ≠ HEAD ; remote ≠ HEAD), alors chaque résultat est testé dans `run-tests-release-tag.js`.
3. Étant donné un bac à sable sans identité git globale, quand le test s'exécute, alors il n'échoue pas sur le commit.
4. `node test/run-tests.js` est vert.

## Hors périmètre

- Le chemin `--push` réel contre GitHub : non testable en bac à sable, à observer lors de la prochaine release.
- `release.yml` : inchangé, il réagit déjà au push du tag.

## Preuve de clôture

- `node test/run-tests.js`
