# Spec US#164 — Liaison maquettes validées vers US suivantes

- US : #164
- epic : Maquettes : index et navigation

## Récit

En tant que maître qui lance des US à écrans,
je veux que chaque agent reçoive d'office les maquettes validées de sa spec (ou l'alerte qu'il n'y en a pas),
afin qu'il suive la maquette au lieu de deviner ou de lire un fichier absent.

## Cadrage d'exécution

- Fichiers visés : `promptimizer/scripts/maquette.js`, `promptimizer/lib/epicmaster.js`,
  `promptimizer/commands/{epicmaster,pickymaster,scope}.md`, `test/run-tests-maquettes-liaison.js` (nouveau).
- Contrat (figé) :
  - `maquette.js brief --id N [--cwd dir]` : lit `docs/us/US-N/maquettes/INDEX.md`; affiche une section
    « Maquettes validées » (une ligne par maquette : slug · chemin relatif · états `data-etat` trouvés ·
    lien `../../maquettes-index.html`) puis « Non validées (ne pas suivre) » pour les brouillons. Aucune
    maquette : `Aucune maquette pour l'US N.` Toujours exit 0.
  - `epicmaster --brief --id <id>` : si la spec de l'US contient une section « Maquettes », ajoute la
    sortie de `brief` pour chaque US citée dans cette section ; si aucune maquette validée, première ligne
    du brief : « ⚠ Maquettes non validées : ne pas coder l'UI, signale-le dans « À trancher ». »
  - `maquette.js validate` ajoute « (validée) » à la ligne de la maquette dans la section « Maquettes » de
    la spec (idempotent ; sans spec, message sans échec).
  - `scope.md` : une US à écrans dont le contrat ne peut être figé sans le rendu reçoit
    `--depends <id Maquettes>` ; son « fait quand » cite les maquettes validées. `epicmaster.md` et
    `pickymaster.md` : le consigne manuelle « lis les maquettes liées » est remplacée par « le brief
    contient les maquettes validées ».
- Dépend de : #162 (index et nav), #163 (consignes) — mêmes fichiers.
- Modèle · effort : sonnet · medium.

## Critères d'acceptation

1. Étant donné 2 maquettes dont une validée, quand `maquette.js brief --id N`, alors la validée est
   listée avec chemin et états, l'autre sous « Non validées ».
2. Étant donné une spec avec section « Maquettes », quand `epicmaster --brief --id`, alors le brief
   contient la section « Maquettes validées ».
3. Étant donné aucune maquette validée, alors le brief commence par l'avertissement.
4. Quand `validate` est exécuté, alors la spec porte « (validée) » sur la ligne, une seule fois.
5. `scope.md` et les deux commandes maître portent les consignes décrites (test de présence).

## Hors périmètre

- Validation automatique à la place de l'humain : interdite, la validation reste humaine.
- Diff visuel maquette ↔ implémentation (hors périmètre de /maquette).

## Preuve de clôture

- `node test/run-tests.js && node test/run-tests-maquettes-liaison.js`
