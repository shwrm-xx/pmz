---
description: Maquette les écrans avant de les coder (propose écrans × états × tailles, puis HTML autonome validé et lié à la spec)
allowed-tools: Bash(node *), Read, Edit
---

Maquette les écrans d'une demande **avant** de les coder : le livrable visuel est validé avant
l'implémentation, pas après. Le jugement (quels écrans, quels états, quel contenu) est à toi ;
le mécanique (gabarit, index, lien spec, statut) passe **uniquement** par le script.

Argument éventuel : `$ARGUMENTS` (description libre, ou n° d'US dont la spec décrit les écrans).
Les maquettes vivent dans le **dossier de l'US** (`docs/us/US-<N>/`) : il te faut un n° d'US ;
sans lui, demande-le dans la question de la proposition (la spec peut être posée par
`backlog.js spec --id <N> --new`).

## 1. Proposer — sans rien écrire

Source, en lecture minimale : la demande, ou la spec de l'US visée (`docs/us/US-N/spec.md`)
— une lecture, pas un scan du dépôt.

Présente un tableau **écrans × états × tailles** :

| Écran (slug proposé) | États | Tailles |
|---|---|---|
| `liste-commandes` — Liste des commandes | nominal · vide · chargement · erreur | mobile 375 · desktop |

- États par défaut : **nominal, vide, chargement, erreur** ; retire ceux qui n'ont pas de sens
  pour un écran donné et dis pourquoi en trois mots.
- Une maquette = un écran (un slug, minuscules-tirets). Pas d'écran bonus hors demande.

Puis demande l'accord en **UNE seule** question à choix (OK / Ajuster / Annuler), jamais en
texte libre. **Aucun fichier n'est écrit avant le OK.** Sur « Ajuster », reprends le tableau ;
sur « Annuler », arrête-toi.

## 2. Produire — après accord

Pour chaque écran validé :

1. `node ~/.claude/promptimizer/scripts/maquette.js new --id <N> --slug <slug> --title "<titre>"`
   pose `docs/us/US-<N>/maquettes/<slug>.html` (dossier de l'US : spec + maquettes) depuis le
   gabarit et le référence dans `docs/us/US-<N>/maquettes/INDEX.md`. **Refus si le fichier existe** : n'écrase jamais, choisis un autre
   slug ou édite l'existant.
2. Remplis le fichier avec Edit : un `<div class="etat" data-etat="…">` par état, contenu
   réaliste (pas de lorem ipsum). La barre du gabarit bascule mobile 375 / desktop et les états.
   **Autonome strict** : zéro CDN, zéro `<script src>`, zéro `<link>` distant, zéro police ou
   image externe — CSS, SVG et JS inline uniquement.
3. `node ~/.claude/promptimizer/scripts/maquette.js link --id <N> --slug <slug>`
   ajoute la maquette à la section « Maquettes » de sa spec (idempotent). Refus si la spec
   n'existe pas : signale-le, ne la crée pas d'office.

## 3. Valider

1. `node ~/.claude/promptimizer/scripts/maquette.js open --id <N> --slug <slug>` ouvre l'aperçu
   (et affiche le chemin + l'URL `file://`). Si un panneau d'aperçu/navigateur est disponible,
   tu peux l'y afficher plutôt.
2. Demande la validation en **une** question à choix (Validée / À retoucher).
3. Sur « Validée » : `node ~/.claude/promptimizer/scripts/maquette.js validate --id <N> --slug <slug>`
   (statut « validée » dans l'`INDEX.md` de l'US). Sur « À retoucher » : corrige, puis repose la question.

Index des maquettes : `node ~/.claude/promptimizer/scripts/maquette.js list [--id <N>]`.

Hors périmètre : export Figma, design system client (formino/molinetta s'en chargent),
diff visuel maquette ↔ implémentation.
