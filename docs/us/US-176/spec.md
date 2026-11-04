# Spec US#176 — Arbitrages — Solde d'epic

<!-- spec-v2 -->

- US : #176
- epic : Solde d'epic

## Récit

En tant que mainteneur PMZ, je veux que la garde de solde se termine toujours après 2 tours, afin qu'un maître ne reste jamais bloqué sur « Solde : NON ».

## Cadrage d'exécution

- Fichiers visés : promptimizer/lib/epicmaster.js, promptimizer/commands/epicmaster.md, promptimizer/commands/pickymaster.md, test/run-tests-solde.js, README.md, ARCHITECTURE.md
- Contrat : `settleCheck` (entrée JSON inchangée : dette, a_trancher, non_verifie, arbitrage_rounds) ; sortie « Solde : OK » / « Solde : NON — N point(s) », exit 1 si NON.
- Dépend de : aucune
- Modèle · effort : sonnet · medium

## Décisions

Décisions : toutes prises — aucune question ouverte.

- Défaut 1 : quand `arbitrage_rounds` ≥ 2, `settleCheck` ne bloque plus : tout point restant (À trancher hors maquette, dette sans importance haute|critique ou sans raison, Non vérifié sans geste humain) est ramené en avertissement « sera converti en Dette non résolu après arbitrage » ; seul le plafond d'1 dette reste signalé en avertissement. Sortie « Solde : OK » avec avertissements. Revenir : retirer la branche `rounds ≥ 2`.
- Défaut 2 : définir `arbitrage_rounds` dans epicmaster.md et pickymaster.md : 0 au premier appel de la garde, incrémenté de 1 après chaque tour d'arbitrages exécuté, donc 2 au troisième appel ; bloc identique dans les deux commandes.

## Critères d'acceptation

1. Étant donné un À trancher non maquette et `arbitrage_rounds: 2`, quand `--settle-check --stdin`, alors « Solde : OK » (exit 0) avec avertissement.
2. Étant donné le même point et `arbitrage_rounds: 0`, alors « Solde : NON » (exit 1).
3. epicmaster.md et pickymaster.md définissent valeur initiale et incrément d'`arbitrage_rounds`, en texte identique.
4. Tests de run-tests-solde.js couvrent 1 et 2 ; `node test/run-tests.js` vert.

## Hors périmètre

- Création automatique d'US ou toute autre évolution de la garde.

## Preuve de clôture

- node test/run-tests.js

## Notes

- Origine : Problèmes confirmés de la relecture opus de la session maître (US#174, #175).
