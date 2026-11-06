# Spec US#184 — Identité de session : rôle maître, relais, state par session

<!-- spec-v2 -->

- US : #184
- epic : Fiabilité sous-sessions

## Récit

En tant que Marwan pilotant une chaîne Plan → Scope → session maître,
je veux que chaque session connaisse son rôle, son titre et son epic, et que son état ne soit pas écrasé par une session voisine,
afin de savoir « quelle session fait quoi » et que la maître ne soit plus titrée « HS ».

## Cadrage d'exécution

- Fichiers visés : `promptimizer/hooks/user-prompt-submit.js`, `promptimizer/hooks/post-tool-use.js`, `promptimizer/lib/roles.js`, `promptimizer/lib/state.js`, `promptimizer/lib/lot.js`, `test/run-tests-relais.js`. **Ne pas toucher `test/run-tests.js`** (US#189 enregistre les suites).
- Contrat :
  - `isMasterPrompt` (`user-prompt-submit.js:106`) matche aussi le prompt de carte : `/skill\s+`pmz:(epicmaster|pickymaster)`/` et « Invoque le skill pmz:epicmaster » (regex insensible à la casse, backticks optionnels). Repli : `post-tool-use.js` voit un appel `Skill` avec `skill` ∈ {`pmz:epicmaster`, `pmz:pickymaster`, `epicmaster`, `pickymaster`} → `roles.setRole(root, sid, {role:'master'})` + `st.master_session = true`. Dans les deux cas : aucun titre « [XXX · HS] » injecté.
  - `relay` (`post-tool-use.js:54-63`) : posé **uniquement** quand `tool_response` de `start_session` indique un démarrage réel (présence d'un id `local_…` dans la réponse) ; jamais sur `initiation: "own_initiative"` seul. `lib/roles.js` expose `clearRelay(root, sid)` et `isRelay` retourne `false` si `relay_at` > 7 jours. `launchesChainSession` matche seulement `title` commençant par « Session maître » **ou** `prompt` invoquant `pmz:epicmaster`/`pickymaster` ; plus de match sur une chaîne libre.
  - `lib/state.js` : `session-state.json` devient `.vibe-agent/session-state/<sid>.json` (`sid` du hook courant ; sans sid : `_default.json`) ; `loadState(root, sid)` / `saveState(root, sid, st)` ; élagage des fichiers au-delà de 50 (plus anciens par mtime) à chaque save ; lecture de l'ancien fichier unique en repli si le fichier par sid n'existe pas (migration silencieuse, l'ancien n'est pas supprimé).
  - `lib/lot.js` : `closed_session_id` et `fleet join` sans `--session` prennent le sid passé par l'appelant (hook courant ou `--session`), jamais « le dernier qui a écrit » ; sans sid connu → champ vide.
  - `session-roles.json` : chaque entrée porte `title` et `epic` ; alimentés par `--session-title` (user-prompt-submit) et par l'appel `set_session_title` vu dans PostToolUse ; `epic` lu depuis `.vibe-agent/epic`.
- Dépend de : aucune.
- Modèle · effort : sonnet · medium.

## Décisions

- State par session dans un dossier (un fichier par sid) plutôt qu'une clé par sid dans un fichier unique — évite les écritures concurrentes entre sessions vivantes.
- Relais levé après 7 jours même sans signal de clôture — fail-open : une session relais oubliée ne doit pas bloquer à vie.

## Critères d'acceptation

1. Étant donné un prompt « Invoque le skill `pmz:epicmaster` », quand UserPromptSubmit s'exécute, alors `session-roles.json` porte `role: master` pour ce sid et aucun titre « HS » n'est injecté.
2. Étant donné une carte `start_session` `own_initiative` seulement proposée (réponse sans id de session), quand PostToolUse s'exécute, alors `relay` n'est pas posé ; avec une réponse de démarrage réel, il l'est ; avec `relay_at` vieux de 8 jours, `isRelay` est faux.
3. Étant donné deux sids A et B écrivant leur state, quand A sauve puis B sauve, alors le state de A est intact dans `session-state/A.json`.
4. Étant donné 51 fichiers de state, quand un save a lieu, alors il en reste 50.
5. Étant donné `set_session_title` appelé dans une session, alors `session-roles.json` porte `title` et `epic` pour ce sid.

## Hors périmètre

- Affichage de `session-roles.json` (vue `sessions`) — US#188.
- Rattachement agent ↔ US dans le live — US#185.

## Preuve de clôture

- `node test/run-tests-relais.js` (suite existante étendue des critères 1 à 5).

## Notes

- Observé sur ecpv3 : 12 sessions « HS » sur 25, maître absente de `session-roles.json`. Sur cocina : 4 sids différents le même matin dans 4 fichiers.
