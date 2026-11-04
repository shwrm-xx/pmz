# Spec US#179 — Bouton Scope en fin de plan

<!-- spec-v2 -->

- US : #179
- epic : Plan vers Scope

## Récit

En tant qu'utilisateur PMZ en mode plan,
je veux qu'à la fin du plan la session me propose Scope en bouton principal au lieu d'enchaîner,
afin de découper le plan en sous-session avant toute implémentation.

## Cadrage d'exécution

- Fichiers visés : `promptimizer/mods/epicmaster-band/hooks/plan-scope.ts` (nouveau), `promptimizer/mods/epicmaster-band/hooks/register.tsx` (un appel), `promptimizer/mods/epicmaster-band/types/index.d.ts`, `promptimizer/mods/epicmaster-band/tests/plan-scope.test.ts` (nouveau), README/ARCHITECTURE. Aucun changement dans `promptimizer/hooks/**` ni dans l'install.
- Contrat : voir la section « Contrat » (fixé par l'US#177, preuve dans `docs/us/US-177/preuve.md`).
- Dépend de : #177 (contrat), #178 (`.vibe-agent/plan.md`, `/pmz:scope --plan`).
- Modèle · effort : sonnet · medium.

## Décisions

- Choix proposés en fin de plan : **Scope** (principal) · Accepter · Accepter et continuer · Réviser · Refuser — libellés de l'app conservés. Révisé par l'US#177 : la carte native ne peut être ni modifiée ni sautée (preuve P1, P3). Les choix viennent donc en **deux temps** : d'abord une question du mod (« Scope (recommandé) » / « Approuver le plan »), puis, sur « Approuver le plan », la carte native avec ses quatre options intactes.
- Clic Scope : la sous-session reçoit `/pmz:scope --plan <chemin du plan>` (contrat de l'US#178). La session de plan ne démarre aucune implémentation.
- Hors session PMZ ou hors mode plan : comportement vanilla de Claude Code, sans changement.
- Écrans : oui (carte ou bouton de fin de plan). Maquettes écartées au découpage : c'est une carte de l'app, et le contrat d'écran est fixé ici.

## Contrat

Fixé par l'US#177. Preuve : `docs/us/US-177/preuve.md` (API des mods, Claude Code 2.1.317).

**Piste retenue : piste 3 portée par le mod.** Un hook `tool.call` sur `ExitPlanMode` pose la
question lui-même par `$.ui.ask`, **avant** `next(e)`. Il ne passe ni par un hook classique ni par
une question posée par le modèle. Le code vit dans le mod existant `epicmaster-band` : nouveau
module `hooks/plan-scope.ts`, qui exporte `registerPlanScope(on)`, appelé depuis `register`. Ainsi,
ni l'install ni `build-plugin.js` ni `CLAUDE_CODE_PLUGIN_DIRS` ne changent.

1. **État** : un atom `{ plugin: 'epicmaster-band', key: 'planFile' }`, `string | null`, initial
   `null`, déclaré dans `types/index.d.ts` (`EpicmasterBandPlanFile`).
2. **Hook `prompt.attachment`** : pour une pièce de type `plan_mode` ou `plan_mode_reentry`
   dont `e.detail.planFilePath` est une chaîne non vide, écrire ce chemin dans `planFile`. Toujours
   `return next(e)`, sans rien modifier.
3. **Hook `tool.call`, matcher `{ tool: 'ExitPlanMode' }`** : `try { … } catch { return next(e) }`.
   - Garde (sinon `return next(e)`) : boucle principale (`e.agentId === undefined`), `planFile`
     non nul, et projet PMZ (`.vibe-agent/backlog.json` lisible par `$.fs`, même résolution de
     chemin que `LIVE_PATH`).
   - Question : `const answer = await $.ui.ask(QUESTION, { header: HEADER, options: [SCOPE, APPROVE] })`
     (si `$.ui.ask` rejette, parce que la question est fermée ou qu'on est en `-p` : `return next(e)`).
   - `answer === SCOPE` : `return { deny: denyScope(planFile) }`, sans appeler `next`. La session
     reste en mode plan et rien n'est implémenté.
   - `answer === APPROVE` : `return next(e)`. La carte native s'ouvre alors (Accepter, Accepter et
     continuer, Réviser, Refuser), avec son comportement inchangé.
   - Autre texte (champ « Other ») : `return { deny: denyRevise(answer) }`.
4. **Libellés exacts** (constantes exportées, testées mot pour mot) :
   - `HEADER = 'Fin du plan'`
   - `QUESTION = 'Plan prêt : le découper en US avec Scope, ou l\'approuver ?'`
   - `SCOPE = 'Scope (recommandé)'`
   - `APPROVE = 'Approuver le plan'`
5. **Prompt envoyé au clic Scope** (le texte du refus, que le modèle lit comme résultat d'outil) :
   `denyScope(p)` =
   `Scope choisi par l'utilisateur en fin de plan. N'implémente rien et ne rappelle pas ExitPlanMode. Invoque maintenant le skill pmz:scope avec l'argument « --plan ${p} », puis termine ton tour.`
   La branche « mode plan » de `commands/scope.md` (US#178) ouvre alors la sous-session
   `start_session` avec le prompt `/pmz:scope --plan <chemin absolu>`.
6. **Texte du refus en révision** : `denyRevise(t)` =
   `L'utilisateur demande une révision du plan : ${t}. Reste en mode plan, révise le plan, puis rappelle ExitPlanMode.`
7. **Fail-open** : toute exception, garde non remplie ou rejet de `$.ui.ask` donne `next(e)`, soit
   le comportement vanilla. Si le mod n'est pas chargé, rien ne change.
8. **Tests** (`claude plugin test`, sur les surfaces `terminal` et `desktop`) :
   - hors PMZ, sans `planFile` ou en sous-agent : `next` est appelé et aucune question n'est posée ;
   - avec `SCOPE` : `{ deny }` contient `--plan <planFile>`, et `next` n'est pas appelé ;
   - avec `APPROVE` : `next` est appelé ;
   - si `$.ui.ask` rejette : `next` est appelé.
   Puis `node test/run-tests.js` doit être vert.

Notes de mise en œuvre :

- Le hook du mod passe **avant** le `PreToolUse` classique (preuve P5). Sur Scope, la capture
  `.vibe-agent/plan.md` de l'US#178 ne tourne donc pas. C'est voulu : `--plan` désigne directement
  le fichier plan natif (`planFilePath`).
- Ne pas utiliser `$.command.run` ni `$.prompt.submit` pour lancer Scope : tous deux attendent que
  la session soit inactive, et `$.command.run` rejette dans un hook que le tour attend (preuve P7).

## Critères d'acceptation

1. Étant donné une session PMZ en mode plan, quand le plan est soumis (`ExitPlanMode`), alors l'utilisateur voit les choix ci-dessus, avec Scope en principal.
2. Quand il clique Scope, alors une sous-session liée démarre avec `/pmz:scope --plan <chemin>` et la session de plan n'implémente rien.
3. Quand il choisit Accepter, Accepter et continuer, Réviser ou Refuser, alors le comportement natif correspondant s'applique.
4. Toute erreur du mécanisme laisse le comportement vanilla (fail-open) ; `node test/run-tests.js` est vert.

## Hors périmètre

- Pistes écartées par l'US#177 (preuve : `docs/us/US-177/preuve.md`) :
  - **Mod, carte `ExitPlanMode` via `ui.render`** : impossible. La carte d'approbation est un
    dialogue de permission que le moteur dessine seul ; elle ne figure pas dans `RenderComponent`,
    et `$.ui.notice` n'y ajoute qu'une ligne de texte (P1, P2).
  - **Mod, bande `AbovePrompt`** : un bouton de bande ne peut pas trancher la carte native déjà
    ouverte, et `$.prompt.submit` / `$.command.run` attendent que la session soit inactive (P7).
    Il faudrait deux gestes (Scope, puis Refuser), et Scope ne serait pas le choix principal.
  - **Hook classique `PreToolUse` + `AskUserQuestion` par le modèle** : faisable, mais pas
    déterministe. Il dépend du modèle pour poser la question puis rappeler `ExitPlanMode`, demande
    une marque d'état et coûte un tour de modèle. Il n'évite pas non plus la carte native sur
    « Accepter » (P3). La variante mod donne le même parcours sans ces coûts.

## Preuve de clôture

- `node test/run-tests.js` + un essai manuel en desktop (mode plan → Scope).
