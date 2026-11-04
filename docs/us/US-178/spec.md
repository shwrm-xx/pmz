# Spec US#178 — /scope consomme le plan

<!-- spec-v2 -->

- US : #178
- epic : Plan vers Scope

## Récit

En tant qu'utilisateur PMZ qui sort du mode plan,
je veux que `/scope` découpe **ce plan-là** et me le montre,
afin de comprendre ce qui est découpé au lieu d'un plan invisible.

## Cadrage d'exécution

- Fichiers visés : `promptimizer/lib/plancapture.js` (nouveau), `promptimizer/hooks/pre-tool-use.js`, `promptimizer/commands/scope.md`, `test/run-tests.js`.
- Contrat :
  - `lib/plancapture.js` exporte `capturePlan(cwd, sessionId, planText) -> string|null`. Il écrit `<gitRoot>/.vibe-agent/plan.md` (crée `.vibe-agent/` s'il le faut, écrase l'existant) avec pour 1ʳᵉ ligne `<!-- pmz:plan session=<id> at=<ISO-8601> -->` suivie du texte du plan, et renvoie le chemin. Si le texte est vide, absent du dépôt git ou en erreur, il renvoie `null` sans rien lever.
  - `pre-tool-use.js` : sur `tool_name === 'ExitPlanMode'`, appelle `capturePlan(input.cwd, input.session_id, input.tool_input.plan)` **en plus** de la marque `plan_session`. Le verdict ne change pas (allow silencieux, sortie inchangée).
  - `commands/scope.md` :
    - `/pmz:scope --plan <fichier>` : la source est ce fichier. Sans argument, `.vibe-agent/plan.md` sert de source s'il existe et si la demande est vide.
    - Avant l'étape 1, afficher « Découpe du plan : <1er titre H1 ou 1re ligne> ([fichier](chemin)) » puis un résumé du plan en 3 lignes.
    - **Mode plan** : si la session est en mode plan (rappel système du mode plan présent), ne pas découper sur place. Charger `mcp__ccd_session__start_session`, puis un appel `initiation: "user_asked"`, `context: "fresh"`, `use_worktree: false`, `permission_mode: "default"`, `title: "Scope — <titre du plan>"`, `prompt: "/pmz:scope --plan <chemin absolu du fichier plan>"`, avec en `background` la demande, le chemin du plan et la consigne de finir par la carte Session maître. Annoncer en une ligne, puis rien d'autre. Hors desktop : dire en une ligne de sortir du mode plan puis de relancer `/pmz:scope --plan <chemin>`.
- Dépend de : aucune.
- Modèle · effort : sonnet · medium.

## Décisions

- Le fichier `.vibe-agent/plan.md` est unique et écrasé, sans historique : c'est le dernier plan qui compte.
- La sous-session de scope finit par la carte « Session maître » existante (étape 6), ce qui donne déjà une nouvelle sous-session au clic sur epicmaster. Rien à changer de ce côté.

## Critères d'acceptation

1. Étant donné un dépôt bac à sable, quand `pre-tool-use.js` reçoit `ExitPlanMode` avec `tool_input.plan = "# Titre\nfaire ceci"`, alors `.vibe-agent/plan.md` contient l'en-tête `pmz:plan` puis le plan, et la sortie du hook est identique à aujourd'hui (allow silencieux).
2. Étant donné un `cwd` hors git, un plan vide ou un `.vibe-agent` non inscriptible, quand le hook tourne, alors il sort en `exit 0` sans fichier et sans erreur.
3. Étant donné `commands/scope.md`, alors il documente `--plan`, l'affichage de la source et la branche mode plan → sous-session (test de présence des consignes dans `run-tests.js`).
4. `node test/run-tests.js` est vert, B130-7/8 (marque `plan_session`) compris.

## Hors périmètre

- Bouton Scope sur la carte de fin de plan : relève de l'US#179, dont le mécanisme dépend de l'US#177.
- Historique des plans : non demandé.

## Preuve de clôture

- `node test/run-tests.js`

## Notes

- Hook fail-open : tout `try/catch` renvoie `null`, jamais d'`exit 2`.
