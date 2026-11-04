# Spec US#180 — Arbitrages — Plan vers Scope

<!-- spec-v2 -->

- US : #180
- epic : Plan vers Scope

## Récit

En tant que mainteneur PMZ, je veux corriger les défauts relevés par la relecture de l'epic « Plan vers Scope », afin que le bouton Scope soit testé et que le repli `plan.md` soit honnête.

## Cadrage d'exécution

- Fichiers visés : `promptimizer/mods/epicmaster-band/tests/plan-scope.test.ts`, `promptimizer/mods/epicmaster-band/hooks/plan-scope.ts` (si besoin), `promptimizer/commands/scope.md`, `promptimizer/lib/plancapture.js` (commentaire), `docs/us/**`.
- Contrat : celui de la spec US#179 (deux temps : « Scope (recommandé) » / « Approuver le plan », puis carte native) — figé.
- Dépend de : #177, #178, #179 (closes).
- Modèle · effort : sonnet · medium.

## Décisions

Décisions : toutes prises — aucune question ouverte.

- Bouton en deux temps conservé (choix utilisateur) — pas de variante 4 options.
- Capture #178 conservée comme repli sans le mod (inoffensive, fail-open) ; pas d'extension.

## Critères d'acceptation

1. `plan-scope.test.ts` se charge sous `claude plugin test` : `test()` appelé selon la forme du kit (nom, options, corps), comme `band.test.ts`.
2. Le test utilise `$.prompt.attachment` (et non `$.prompt.attach`) pour renseigner `planFile` ; le cas « Scope → deny » passe pour la bonne raison.
3. Le mock `on('ui.ask')` est remplacé par un mécanisme valide (le `$.ui.ask` lève un appel d'outil AskUserQuestion : intercepter via `tool.call`/mock du kit) ; vérifier dans `hooks/plan-scope.ts` que le code correspond.
4. `claude plugin test` du mod est exécuté (si `timeout` manque, contourner par PATH/alias ; sinon le noter « Non vérifié » avec cause).
5. `scope.md` et un commentaire de `plancapture.js` précisent que `.vibe-agent/plan.md` n'est qu'un repli hors mod : en réel, `tool_input.plan` peut être vide (voir docs/us/US-177/preuve.md) et la source principale est le fichier plan natif.

## Hors périmètre

- Extension de la capture pour lire le fichier plan natif depuis le hook PreToolUse.
- Test manuel desktop (geste humain).

## Preuve de clôture

- `node test/run-tests.js` vert ; `claude plugin test` du mod epicmaster-band vert si exécutable.

## Notes

- Issue de la relecture opus de la session maître (3 problèmes confirmés sur les tests du mod).
