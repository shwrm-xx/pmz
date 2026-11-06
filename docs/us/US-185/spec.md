# Spec US#185 — Fichier live juste : rattachement FIFO, filtre session, phases, verrou

<!-- spec-v2 -->

- US : #185
- epic : Fiabilité sous-sessions

## Récit

En tant que Marwan regardant la bande epicmaster pendant une vague,
je veux que chaque agent soit rattaché à son US, que les agents d'autres sessions n'y entrent pas, que la consolidation soit visible et qu'un second maître ne puisse pas écraser le live,
afin que l'état affiché soit vrai dans les cas courants.

## Cadrage d'exécution

- Fichiers visés : `promptimizer/lib/epicmaster-live.js`, `promptimizer/hooks/subagent-live.js`, `promptimizer/lib/epicmaster.js`, `promptimizer/lib/backlog.js` (commande `start`, sous-commandes `epicmaster --phase`, `--live-add-lot`, `--force` ; corriger aussi le commentaire faux `backlog.js:1006` : `doneLot` ne vide pas `session_owner`), `promptimizer/commands/epicmaster.md`, `promptimizer/commands/pickymaster.md`, `test/run-tests-live.js` (nouvelle suite ; y déplacer le bloc LV de `test/run-tests.js` seulement si nécessaire — sinon ne pas toucher `test/run-tests.js`).
- Contrat :
  - **Rattachement FIFO** : `backlog.js start --id N` pousse `N` dans `st.launch_queue` du live (si live actif). Au `SubagentStart`, `recordSubagent` consomme la tête de `launch_queue` → `lot = N`. File vide → repli actuel (`free.length === 1`). `epicmaster.md` et `pickymaster.md` prescrivent l'ordre : `start --id N` **puis** l'Agent de N, pour chaque US de la vague.
  - **Filtre session** : `--live-seed` écrit `st.master_session_id` (sid courant). `subagent-live.js` ignore tout événement dont `input.session_id` diffère de `st.master_session_id` (si les deux sont connus).
  - **Phases** : `st.phase` ∈ `waves` | `review` | `arbitrage` | `settle` | `done`, défaut `waves` au semis ; `backlog.js epicmaster --phase <p>` la change ; `recordSubagent` écrit aussi quand `phase !== 'waves'` (agents de consolidation tracés, `lot: null` admis avec `kind: phase`) ; `refreshProgress` ne pose `finished = true` que si `phase === 'done'`. `--live-add-lot --id N --wave "arbitrages"` sème l'US d'arbitrages dans `wave_plan`.
  - **Timeout** : verdict `timeout` → statut du lot `reopened` (jamais `done`).
  - **Verrou** : `--live-seed` refuse (message clair, exit 1) si un live de moins de 6 h a `master_session_id` ≠ sid courant et au moins un lot `running` ; `--force` passe outre. `selectLots` (`lib/epicmaster.js`) exclut les `in_progress` dont `session_owner` commence par `master/` d'une autre session.
  - **Purge globale** : à chaque `save`, suppression des fichiers `~/.claude/promptimizer/epicmaster-live/*.json` de plus de 7 jours.
  - **Alerte de concurrence** (`subagent-live.js:47-52`) : clé `<seeded_at>:w<N>` / `<seeded_at>:x` ; au semis, purge des clés dont le `seeded_at` ≠ live courant.
- Dépend de : aucune.
- Modèle · effort : sonnet · high — justification : six corrections couplées dans un module d'état concurrent (415 lignes) plus un hook et une CLI ; les formats sont figés ci-dessus mais l'ordre des écritures (queue, phase, verrou) demande du raisonnement.

## Décisions

- Rattachement par file FIFO côté CLI (et non par lecture du prompt de l'agent, que le hook ne reçoit pas).
- `finished` ne dépend plus du backlog mais de la phase explicite — la maître doit appeler `--phase done` (prescrit dans `epicmaster.md`).

## Critères d'acceptation

1. Étant donné un live semé et `start` × 3 puis 3 `SubagentStart`, alors chaque agent porte `lot` = l'id de son US dans l'ordre des `start`.
2. Étant donné un `SubagentStart` avec un `session_id` ≠ `master_session_id`, alors le live est inchangé.
3. Étant donné toutes les US closes et `phase = review`, alors `finished` est faux et un `SubagentStart` est tracé ; après `--phase done`, `finished` est vrai.
4. Étant donné un verdict `timeout`, alors le lot est `reopened`.
5. Étant donné un live < 6 h d'un autre sid avec un lot `running`, quand `--live-seed` est relancé, alors il est refusé (exit 1) sauf `--force`.
6. Étant donné une alerte déjà émise pour `w1` sur un ancien `seeded_at`, quand un nouveau semis a lieu, alors l'alerte est rejouée pour la nouvelle epic.

## Hors périmètre

- Vue `sessions`, statusline, bande — US#188 (consomme `phase` et `master_session_id` figés ici).
- Hook Stop — US#186.

## Preuve de clôture

- `node test/run-tests-live.js`.

## Notes

- Observé : ecpv3 `"lot": null` sur tous les agents ; cocina `finished: true` avec 4 `to_decide`.
