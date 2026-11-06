# Spec US#188 — Surface « où se passe quoi » : sessions, statusline, bande, logs, notifs

<!-- spec-v2 -->

- US : #188
- epic : Fiabilité sous-sessions

## Récit

En tant que Marwan avec plusieurs sessions ouvertes sur un dépôt,
je veux une vue des sessions vivantes avec leur rôle, epic, US et état, une statusline propre à chaque session, une bande qui montre la consolidation, des logs nommés et des notifications,
afin de ne plus me demander « où se passe quoi ».

## Cadrage d'exécution

- Fichiers visés : `promptimizer/lib/epicmaster-live.js` (`--live --sessions`), `promptimizer/lib/fleet.js`, `promptimizer/scripts/statusline.js`, `promptimizer/lib/output-fallback.js`, `promptimizer/mods/epicmaster-band/**`, `promptimizer/lib/notify.js`, `promptimizer/lib/backlog.js` (commande `sessions`), `promptimizer/commands/about.md`, `test/run-tests-sessions.js`. Ne pas toucher `test/run-tests.js`.
- Contrat :
  - `backlog.js sessions [--json]` : tableau texte, une ligne par session connue de `session-roles.json` (+ `fleet.json` actif) : `titre | rôle | sid6 | vivante (oui/non/?) | epic | US#N | état | dernier événement (date)`. Fusion : rôles (title, epic, role) + live (`master_session_id`, agents, phase) + `fleet.json` (filles D3) + `backlog.session_owner`. « vivante » = événement < 6 h.
  - Bande : bouton **Sessions** qui affiche cette sortie ; phase de consolidation affichée (`relecture` / `arbitrage` / `solde`) depuis `st.phase` ; vagues D3 affichées si `fleet.json` actif ; chaque ligne d'agent porte `#N` et le type d'agent (`subagent_type`).
  - Statusline : « US en cours » = l'US dont `session_owner` est `master/…` si la session est maître, sinon celle dont `session_owner` = sid ; segment `EM` seulement si rôle maître ; segment `D3 #N` dans une session fille (`fleet.json`).
  - Logs `.vibe-agent/logs/` : nom `<YYYYMMDD-HHMM>-<US<id>|sans>-<sid6>-<rnd4>.log`, première ligne `# Session <sid6> · <titre> · US#N` ; `reintegrate-*.md` même règle.
  - Notifications (`lib/notify.js`, opt-in inchangé) : fin de sous-agent, verify rouge, nouveau point à trancher, fin de maître (`phase done`).
- Dépend de : #184 (`title`/`epic` dans `session-roles.json`), #185 (`phase`, `master_session_id`, rattachement `lot`).
- Modèle · effort : sonnet · medium.

## Décisions

- Pas de maquette : la bande et la statusline sont des lignes de statut texte, le tableau `sessions` une sortie CLI.
- Tableau texte (pas HTML) : lisible dans le terminal et dans la bande.

## Critères d'acceptation

1. Étant donné un bac à sable avec `session-roles.json` (2 sessions dont une maître), un live avec 2 agents rattachés et `fleet.json` actif, quand `backlog.js sessions` s'exécute, alors une ligne par session affiche rôle, epic, US et état corrects.
2. Étant donné `phase = review`, quand la bande se rafraîchit, alors elle affiche « relecture » et pas « terminé ».
3. Étant donné une session non maître avec une US owner = son sid, quand la statusline s'exécute avec ce sid, alors elle affiche cette US et pas `EM`.
4. Étant donné un log créé pour l'US 12 par le sid `abcdef…`, alors son nom matche `^\d{8}-\d{4}-US12-abcdef-[a-z0-9]{4}\.log$` et sa première ligne commence par `# Session abcdef`.
5. Étant donné les notifications activées et un verdict `failed`, alors `notify` est appelé une fois.

## Hors périmètre

- Documentation README/ARCHITECTURE de la commande — US#189.

## Preuve de clôture

- `node test/run-tests-sessions.js` (bande : test par rendu texte des segments, pas de test visuel).

## Notes

- `register.tsx` déjà résumé : STATUS_COLOR/tone() colorent segments, vagues et puces (lotRow) ; ne pas relire en entier.
