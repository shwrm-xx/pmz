# US 148 — Intégration maquettes dans scope et epicmaster

- lot : #148
- epic : Maquettes d'écrans

## Récit

En tant que dev qui découpe une feature avec `/scope`,
je veux que PMZ repère les US qui produisent des écrans et me propose de les maquetter,
afin de ne pas lancer l'implémentation d'écrans sans cible visuelle validée.

## Critères d'acceptation

1. `scope.md`, étape 1 : pour chaque US, statuer « écrans : oui/non » ; si au moins une US
   produit des écrans, la question unique de l'étape 2 **propose la liste des écrans à
   maquetter** (proposition d'abord, comme `/maquette`) et demande si on maquette.
2. Sur oui : `/scope` ajoute une US dédiée « Maquettes — <epic> » (déroulant `/maquette`), en
   vague 1, et pose `--depends` de chaque US à écrans vers elle. Sur non : rien n'est ajouté,
   le choix est noté dans le handoff.
3. `epicmaster.md` : le sous-agent de l'US « Maquettes » produit et lie les maquettes mais ne
   les valide pas — il les remonte en **« à trancher : maquettes à valider »** ; les sous-agents
   des US à écrans doivent lire les maquettes liées à leur spec et signaler tout écart.
4. `spec-template.md` porte une section « Maquettes » optionnelle.
5. Un test vérifie la présence de ces consignes dans `scope.md`, `epicmaster.md` et le gabarit.

## Hors périmètre

- Bloquer une US faute de maquette : le choix reste à l'utilisateur.
- Détection automatique par script des US à écrans : jugement LLM suffisant à ce stade.

## Preuve de clôture

- `node test/run-tests.js`

## Notes

- Choix validé en conception : maquettes en **US dédiée** (pas produites dans la session de
  conception) ; validation humaine au retour de la session maître.
