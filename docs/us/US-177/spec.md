# Spec US#177 — Conception : bouton Scope en fin de plan

<!-- spec-v2 -->

- US : #177
- epic : Plan vers Scope

## Récit

En tant qu'utilisateur PMZ qui pense un sujet en mode plan,
je veux un bouton principal « Scope » au moment où le plan est prêt,
afin de passer du plan (penser) au découpage (scope) sans que la session enchaîne sur l'implémentation.

## Cadrage d'exécution

- Fichiers visés : `docs/us/US-177/**` (notes, preuve), `docs/us/US-179/spec.md` (section « Contrat » à compléter). Aucun code de production.
- Contrat : livrable = un contrat écrit dans la spec de l'US#179 qui retient **une** piste et fixe ses interfaces (événements de mod ou sortie du hook, libellés, prompt envoyé au clic).
- Dépend de : aucune.
- Modèle · effort : opus · medium. Il faut explorer l'API des mods (`ui.render`, `tool.call`, composants exposés) et arbitrer entre les pistes, sans contrat préalable à suivre : c'est le travail de conception que sonnet ne doit pas porter.

## Décisions

- Pistes à départager, dans l'ordre de préférence :
  1. **Mod, carte `ExitPlanMode`** : `ui.render` surcharge ou complète la carte d'approbation de l'app pour garder ses options (Refuser, Réviser, Accepter, Accepter et continuer) et ajouter « Scope » en principal.
  2. **Mod, bande `AbovePrompt`** : « Plan prêt — Scope » s'affiche dès `tool.call` `ExitPlanMode`, à côté de la carte native.
  3. **Repli hook** : le PreToolUse `ExitPlanMode` refuse **une fois**, avec la consigne de présenter `AskUserQuestion`. Scope est recommandé, puis viennent Accepter, Accepter et continuer, Réviser ; Refuser passe par « Other ». Au second appel, le hook laisse passer (marque d'état). Le refus vient du JSON `permissionDecision`, jamais d'un `exit 2`, et toute erreur donne `allow`.
- Clic Scope (toutes pistes) : une sous-session `/pmz:scope --plan <fichier>`, contrat de l'US#178.

## Critères d'acceptation

1. Étant donné la spec de l'US#179, quand on la lit, alors sa section « Contrat » nomme la piste retenue, l'événement ou la sortie de hook utilisés, les libellés exacts et le prompt envoyé au clic.
2. Étant donné la piste retenue, alors une preuve est citée : un extrait de doc ou de type de l'API des mods, ou le résultat d'un prototype jetable non commité.
3. Les pistes écartées sont listées avec la raison de leur rejet, dans la spec de l'US#179, section « Hors périmètre ».

## Hors périmètre

- Code de production : relève de l'US#179, en sonnet.
- Capture du plan et comportement de `/scope` : relèvent de l'US#178, dont le contrat est déjà figé.

## Preuve de clôture

- Relecture de `docs/us/US-179/spec.md` (US non vérifiable par commande).

## Notes

- Le hook PreToolUse voit déjà `ExitPlanMode` (matcher `Bash|Edit|Write|MultiEdit|ExitPlanMode|EnterPlanMode`, lot #130), mais en trace seule.
