# Spec US#173 — Sessions maîtres en sous-sessions liées

- US : #173
- epic : Bouton session maître

## Récit

En tant que pilote PMZ dans l'app desktop,
je veux qu'une session ouverte depuis la session de plan (/scope) parte toujours en sous-session
liée (rangée indentée sous la session parente), lancée d'un clic sur un bouton,
afin de ne plus ouvrir de session à la main ni retaper `/model` puis `/epicmaster`.

## Cadrage d'exécution

- Fichiers visés : `promptimizer/commands/scope.md` (étape 6), `promptimizer/commands/epicmaster.md`
  et `promptimizer/commands/pickymaster.md` (fin de session), `test/run-tests-sous-session.js`
  (nouveau, branché dans `test/run-tests.js`), `CHANGELOG.md`, `README.md`, `ARCHITECTURE.md`.
- Contrat — **carte « Session maître »** (consigne pure, aucun script) :
  `mcp__ccd_session__start_session` avec `initiation: "own_initiative"`, `context: "fresh"`,
  `use_worktree: false` (même checkout : le handoff maître de `.vibe-agent/handoff.md` y est
  injecté), `title: "Session maître — <epic>"` (< 60 car., sans epic : « Session maître »),
  `model` = id courant de la famille maître de la sortie `epicmaster`, `effort` = effort maître,
  `prompt` = invoquer le skill `pmz:epicmaster` (le handoff maître est injecté au démarrage),
  `background` (≥ 80 car.) = epic, nombre d'US, nombre de sessions maîtres prévues.
  Outil différé : le charger d'abord par `ToolSearch` (`select:mcp__ccd_session__start_session`).
- Règle « sous-session systématique » : depuis la session de plan, toute session associée
  (session maître, session maître suivante) part par cette carte, jamais par « ouvre une session
  fraîche » à la main. En fin de `/epicmaster` / `/pickymaster`, s'il reste des US pour une session
  maître suivante (plan > 1 session ou session fraîche prescrite par le hook Stop), même carte
  (liée à la session maître courante).
- Dépend de : aucune.
- Modèle · effort : sonnet · medium.

## Critères d'acceptation

1. Étant donné `scope.md`, quand on lit l'étape 6, alors elle prescrit `start_session` avec
   `own_initiative`, `fresh`, `use_worktree: false` et `pmz:epicmaster` dans le prompt, avec le
   modèle et l'effort maîtres de la sortie `epicmaster`.
2. Une seule carte par fin de /scope, même si le plan compte plusieurs sessions maîtres.
3. Étant donné l'outil absent (hors desktop) ou l'appel refusé, alors la conclusion actuelle en
   trois lignes s'applique (repli conservé dans `scope.md`).
4. Exception `backlog.js start --id` (l'utilisateur traite l'US ici) : pas de carte.
5. `epicmaster.md` et `pickymaster.md` prescrivent la même carte pour la session maître suivante.
6. Réception d'un `<side-sessions-event>` dans la session de plan : rapport en une ligne, rien relancé.
7. `node test/run-tests.js` est vert (assertions regex sur les trois commandes).

## Hors périmètre

- Aucun changement de `backlog.js` / `lib/epicmaster.js` : l'outil de session n'est pas joignable
  depuis Node, le contrat est une consigne au modèle.
- Rattacher une session maître suivante à la session de plan d'origine : l'app lie à la session
  qui appelle, donc la chaîne s'imbrique (plan → maître 1 → maître 2).
- Canal OpenCode / CLI : pas de sous-sessions, repli texte.

## Preuve de clôture

- `node test/run-tests.js`

## Notes

- `model` de `start_session` : même famille ou moins chère que la session appelante, sinon
  ignoré (hérite). Le dire en une ligne si le modèle maître est plus cher que la session de plan.
