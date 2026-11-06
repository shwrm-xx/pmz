# Spec US#186 — Stop et handoff neutres pour la maître

<!-- spec-v2 -->

- US : #186
- epic : Fiabilité sous-sessions

## Récit

En tant que session maître pilotant des sous-agents,
je veux que le hook Stop ne clôture pas mes US à ma place et que le handoff auto n'invente pas de numéro d'US,
afin que la clôture reste celle de `close-wave` et que le handoff soit exact.

## Cadrage d'exécution

- Fichiers visés : `promptimizer/hooks/stop.js`, `promptimizer/lib/handoff.js`, `test/run-tests-stop.js` (nouvelle suite). Ne pas toucher `test/run-tests.js` ni `lib/lot.js`.
- Contrat :
  - `stop.js:279-282` : l'auto-clôture n'est jamais armée si `st.master_session` est vrai, ni si l'unique US `in_progress` a un `session_owner` commençant par `master/`.
  - `incrementLot` n'est appelé qu'après une clôture effective (`doneLot` réussi), jamais au simple armement.
  - `lib/handoff.js:253` : « US en cours » = première US `in_progress` du backlog (`US#<id> « titre »`) ou « aucune » ; `lot-counter + 1` n'est plus utilisé (le compteur reste écrit, purement informatif).
- Dépend de : aucune.
- Modèle · effort : sonnet · medium.

## Décisions

- `lot-counter.json` conservé (informatif) plutôt que supprimé — évite de casser des lectures tierces en v2.18 ; sa suppression pourra se décider plus tard.

## Critères d'acceptation

1. Étant donné `master_session` vrai, une US `in_progress` owner `master/lot-7`, arbre propre et commit depuis le start, quand Stop s'exécute, alors l'US reste `in_progress` et `lot-counter` est inchangé.
2. Étant donné une session non maître, une US `in_progress` owner = sid, arbre propre et commit depuis le start, quand Stop s'exécute, alors l'US passe `done` et `lot-counter` augmente de 1.
3. Étant donné un backlog sans `in_progress` et `lot-counter = 100`, quand le handoff auto est généré, alors il affiche « US en cours : aucune » et jamais « US#101 ».

## Hors périmètre

- Live file / phases — US#185. Correction du commentaire `backlog.js:1006` — US#185 (même fichier).

## Preuve de clôture

- `node test/run-tests-stop.js`.

## Notes

- Observé : ecpv3 `last_lot: 100` vs `next_id: 66` ; cocina `292` vs `287` ; handoff « US#101 » sur une epic finie.
