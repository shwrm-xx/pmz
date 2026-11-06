# Spec US#187 — Archive et CHANGELOG exacts + archive --repair

<!-- spec-v2 -->

- US : #187
- epic : Fiabilité sous-sessions

## Récit

En tant que Marwan relisant l'archive et le CHANGELOG d'un projet gouverné,
je veux des entrées exactes (verify réel, fiches lisibles, titres non doublés, un seul en-tête) et une commande de réparation,
afin que les traces écrites disent la même chose que le live.

## Cadrage d'exécution

- Fichiers visés : `promptimizer/lib/archive.js`, `promptimizer/lib/backlog.js` (`renderChangelogEntry`, `close-wave`, nouvelle sous-commande `archive --repair`), `test/run-tests-close-wave.js`, `test/run-tests-archive.js` (nouvelle suite). Ne pas toucher `test/run-tests.js`.
- Contrat :
  - `setClosedVerify(id, verdict)` appelle `updateIndexLine(id, { verify })` ; mapping `ok → OK`, `failed → ÉCHEC`, `none → aucune`, `timeout → TIMEOUT`.
  - `cell(v)` : objet → JSON compact sur une ligne (ou `clé: valeur` joints par « ; ») ; jamais `[object Object]`.
  - `renderChangelogEntry` : si le titre commence déjà par `US#<id>` (regex `^US#\d+\s*[—-]?\s*`), ce préfixe est retiré avant d'ajouter le sien.
  - `ensureIndex` : reconnaît l'en-tête ancien (« US closes ») et nouveau (« index des lots clos ») ; n'en ajoute jamais un second.
  - `close-wave` : pour chaque US close, écrit la fiche (`fiche:oui`) à partir du rapport du sous-agent (format 250 mots / sections fixes).
  - `backlog.js archive --repair [--dry-run]` : réécrit `verify` depuis `closed_verify`, dédoublonne les en-têtes d'index, liste les fiches contenant `[object Object]` et les régénère depuis `raw/` si présent ; sortie = compte par type de réparation.
- Dépend de : #185 (même fichier `lib/backlog.js` — contrainte de fichier, pas de contrat).
- Modèle · effort : sonnet · medium.

## Décisions

- `--repair` est idempotent et non destructif : les fiches sans `raw/` sont signalées, pas supprimées.

## Critères d'acceptation

1. Étant donné une US close puis `setClosedVerify(id, 'ok')`, alors la ligne d'index porte `verify:OK`.
2. Étant donné une fiche écrite avec un `note` objet, alors son contenu ne contient pas `[object Object]`.
3. Étant donné un titre « US#283 — Foo », quand `renderChangelogEntry` rend l'entrée, alors le titre apparaît une seule fois avec un seul `US#283`.
4. Étant donné un `index.md` à l'ancien en-tête, quand `ensureIndex` s'exécute, alors il n'y a qu'un en-tête.
5. Étant donné un dépôt bac à sable avec `verify:inconnu`, deux en-têtes et une fiche `[object Object]` + `raw/`, quand `archive --repair` s'exécute, alors les trois sont corrigés et un second passage ne change rien.

## Hors périmètre

- Application réelle sur cocina et ecpv3 — US#189.

## Preuve de clôture

- `node test/run-tests-archive.js && node test/run-tests-close-wave.js`.

## Notes

- Observé : cocina 268/268 `verify:inconnu`, 9 fiches `[object Object]`, 30 titres doublés ; ecpv3 titres doublés depuis ~#45.
