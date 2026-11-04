# US#177 — Preuve : bouton Scope en fin de plan

Source : l'API des mods de Claude Code **2.1.317**, fichier de types généré par le skill
`plugin-authoring` (`types/claude-code.d.ts`, ~23 000 lignes, et `reference.md`). Les extraits
ci-dessous sont repérés par le **nom de type** : les numéros de ligne changent à chaque build.
Aucun prototype : la doc des types suffit à départager. Le comportement réel reste à confirmer
par l'essai manuel de l'US#179.

## Extraits décisifs

| # | Où (type / doc) | Ce qu'il dit | Conséquence |
|---|---|---|---|
| P1 | `RenderComponent` (doc du type) | « The permission dialog is drawn by the engine alone, since its answer authorises an action; a plugin adds context with `$.ui.notice`. » La liste des composants (`AskUserQuestion`, `ToolUse`, `AbovePrompt`, `Pane`…) ne contient **aucune** carte d'approbation de plan. | Piste 1 impossible : `ui.render` ne peut ni surcharger ni compléter la carte `ExitPlanMode`. |
| P2 | `$.ui.notice(tool_use_id, text)` | Ajoute **une ligne de texte** sous le dialogue ouvert pour cet appel. | Pas de bouton possible sur la carte : du texte seulement. |
| P3 | `ToolCheckResult.decision` | « For a tool that requires the person (a question put to them, a plan to approve) a hook only tightens: its `allow` does not dismiss the dialog. » | Aucun hook (mod ou classique) ne peut passer outre la carte native : il peut seulement **refuser** (`deny`). |
| P4 | `ToolCallResult` (`{ deny }`) | Un hook `tool.call` qui renvoie `{ deny }` sans appeler `next` refuse l'appel ; le modèle lit le texte comme résultat en erreur. | Refuser `ExitPlanMode` laisse la session en mode plan, sans rien implémenter. |
| P5 | `reference.md` (tests, `PreToolUse`) | Le `PreToolUse` classique est levé « beneath every plugin's `tool.call` hook ». | Le hook du mod passe **avant** `pre-tool-use.js` ; s'il refuse, la capture `plan.md` de l'US#178 ne tourne pas. |
| P6 | `$.ui.ask(question, options)` | Pose la question dans le dialogue natif `AskUserQuestion` et rend le libellé choisi (ou le texte « Other ») ; rejette si fermé, et en `-p`. | Un choix déterministe, posé par le mod lui-même, sans tour de modèle. |
| P7 | `AbovePrompt` (props) / `$.prompt.submit` / `$.command.run` | Bande levée sur terminal et desktop seulement ; `$.prompt.submit` démarre un tour « once the session is idle » ; `$.command.run` est mis en file jusqu'à l'inactivité et « rejects … inside a hook the turn waits on ». | Piste 2 : un bouton de bande ne peut ni fermer la carte native ni agir avant qu'elle soit tranchée. |
| P8 | `PromptAttachmentDetailOf.plan_mode` (`PlanModeDetail`) | Le rappel du mode plan porte `planFilePath` (« the file the model writes its plan to ») et `hasPlan`, lisibles par un hook `prompt.attachment` via `e.detail`. | Le mod connaît le chemin du plan sans attendre la capture de l'US#178. |
| P9 | `BuiltinToolInputs.ExitPlanMode` | Entrée du build : `{ allowedPrompts? }` seulement (déprécié). Le plan (`plan`, `filePath`) n'apparaît que dans la **sortie**. | Voir le risque sur l'US#178 (Dette du rapport). |

## Arbitrage

- **Piste 1 (mod, carte `ExitPlanMode`)** : écartée par P1 + P2.
- **Piste 2 (mod, bande `AbovePrompt`)** : écartée par P7. Le clic Scope ne peut agir qu'après la
  carte native : il faut **deux gestes** (Scope, puis Refuser). Scope n'est pas le choix principal,
  et la carte native reste au premier plan.
- **Piste 3 (repli hook classique + `AskUserQuestion` par le modèle)** : faisable (P3, P4), mais le
  modèle doit présenter la question puis rappeler `ExitPlanMode` (une marque d'état, un tour de
  modèle de plus, et un comportement non déterministe). « Accepter » redemande de toute façon
  l'approbation native (P3).
- **Retenue : piste 3 portée par le mod**. Le hook `tool.call` sur `ExitPlanMode` pose lui-même la
  question par `$.ui.ask` (P6), **avant** `next(e)`. Sur Scope, il refuse (P4) et dicte l'appel
  `pmz:scope --plan <planFilePath>` (P8). Sinon, il appelle `next(e)` et la carte native s'ouvre,
  avec ses quatre options intactes. Le choix est déterministe, il n'y a pas de marque d'état, et
  les options natives restent celles de l'app (P3 interdit de les court-circuiter).

Contrat complet : `docs/us/US-179/spec.md`, section « Contrat ».
