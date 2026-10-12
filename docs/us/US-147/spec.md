# US 147 — Commande /maquette autonome

- lot : #147
- epic : Maquettes d'écrans

## Récit

En tant que dev en vibecoding qui livre des écrans,
je veux maquetter les écrans avant de les coder, à la demande dans n'importe quelle session PMZ,
afin que le livrable visuel soit validé avant l'implémentation, plus après.

## Critères d'acceptation

1. Étant donné une demande ou une spec impliquant des écrans, quand je lance `/maquette`
   (ou `/pmz:maquette`), alors elle **propose d'abord** la liste écrans × états (nominal, vide,
   chargement, erreur) × tailles (mobile 375 / desktop) et demande l'accord en **une** question ;
   aucun fichier n'est écrit avant.
2. Étant donné l'accord, quand `maquette.js new --slug X --title "…"` s'exécute, alors
   `docs/us/US-<id>/maquettes/X.html` est créé depuis le gabarit (autonome : zéro CDN, zéro dépendance) et
   référencé dans `docs/us/US-<id>/maquettes/INDEX.md` ; un fichier existant n'est jamais écrasé (refus).
3. Quand `maquette.js link --id <US> --slug X` s'exécute, alors une section « Maquettes » est
   ajoutée/complétée dans la spec de l'US (idempotent) ; refus si la spec n'existe pas.
4. La commande ouvre la maquette en aperçu et demande la validation ; une maquette validée est
   marquée « validée » dans `INDEX.md` (`maquette.js validate --slug X`).
5. `maquette.md` figure dans `REQUIRED_COMMANDS` de `build-plugin.js`, sort dans `/help`, et le
   plugin buildé la porte ; scripts stdlib uniquement, fail-open.

## Hors périmètre

- Export Figma : dépend d'un MCP tiers, contraire au zéro-dépendance.
- Design system client (formino/molinetta couvrent déjà MH sur le poste).
- Diff visuel automatique maquette ↔ implémentation : trop fragile pour une première itération.

## Preuve de clôture

- `node test/run-tests.js` (cas : new/refus d'écrasement, link idempotent/refus sans spec,
  validate, présence dans REQUIRED_COMMANDS).

## Notes

- La proposition (quels écrans, quels états) est du jugement LLM dans `maquette.md` ; le script
  ne fait que le mécanique (gabarit, index, lien spec, statut).
