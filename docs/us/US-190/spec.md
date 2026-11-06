# Spec US#190 — Arbitrages — Fiabilité sous-sessions

<!-- spec-v2 -->

- US : #190
- epic : Fiabilité sous-sessions

## Récit

En tant que Marwan,
je veux que les défauts relevés par la relecture de l'epic soient corrigés avant la release v2.18.0,
afin que les correctifs d'identité de session (#184) et de surface (#188) fonctionnent réellement.

## Cadrage d'exécution

- Fichiers visés : `promptimizer/hooks/hooks.json`, `promptimizer/install/merge-settings.js`, `promptimizer/lib/reintegrate.js`, `promptimizer/lib/epicmaster-live.js`, `promptimizer/scripts/backlog.js`, `promptimizer/hooks/pre-tool-use.js`, `promptimizer/lib/roles.js`, `test/run-tests-relais.js`, `test/run-tests-live.js`, `test/run-tests.js`.
- Contrat (une action par décision) :
  1. **Matchers PostToolUse** : ajouter `Skill` et `mcp__ccd_session_mgmt__set_session_title` au matcher PostToolUse dans `hooks/hooks.json` ET `install/merge-settings.js` (~l.128) ; un test vérifie la présence dans les deux.
  2. **reintegrate** : `lib/reintegrate.js` (~l.408) écrit son rapport via `logName(logContext(...), 'md')` + `logHeader` (helpers de `output-fallback.js`).
  3. **sid maître** : `currentSid` (`epicmaster-live.js`) et `--live-seed` (`scripts/backlog.js` ~l.618) préfèrent la session de rôle `master` la plus récente de `session-roles.json` ; le mtime du fichier d'état ne sert qu'en repli. Test avec deux fichiers d'état.
  4. **markPlanSession** : `hooks/pre-tool-use.js` (~l.71) passe `input.session_id`.
  5. **startedForReal** (`roles.js`) : ne reconnaît `local_…` que dans le champ d'id de session de la réponse `start_session`, pas dans tout le texte ; test avec une réponse de proposition contenant un chemin `local_…`.
- Modèle · effort : sonnet · medium.

## Décisions

- Décisions : toutes prises — aucune question ouverte.
- Les 5 points sont des défauts confirmés par la relecture opus, tous techniques.

## Critères d'acceptation

1. Étant donné `hooks.json` et `merge-settings.js`, alors le matcher PostToolUse contient `Skill` et `mcp__ccd_session_mgmt__set_session_title`.
2. Étant donné un rapport reintegrate, alors son nom suit `date-US-sid6` et il porte l'en-tête `# Session`.
3. Étant donné deux sessions dans un dépôt, alors `master_session_id` est celui de la session de rôle master.
4. Étant donné `pre-tool-use.js`, alors `markPlanSession` reçoit le sid de l'entrée.
5. Étant donné une réponse `start_session` de proposition contenant `local_` hors champ d'id, alors `startedForReal` est faux.
6. `node test/run-tests.js` est vert.

## Hors périmètre

- Release, tag et publication (faits par le maître après cette US).
- Toute autre évolution de code PMZ : nouvelle US.
