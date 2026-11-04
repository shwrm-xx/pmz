# Spec US#182 — Avis : session, statusline, doctor

<!-- spec-v2 -->

- US : #182
- epic : Avis de mise à jour

## Récit

En tant que collègue utilisateur de PMZ,
je veux être averti au démarrage, voir un badge dans la statusline et une ligne dans doctor quand mon PMZ est en retard,
afin de lancer la mise à jour sans y penser.

## Cadrage d'exécution

- Fichiers visés : `promptimizer/hooks/session-start.js`, `promptimizer/scripts/statusline.js`, `promptimizer/install/doctor.js`, `test/run-tests-update-notice.js` (nouveau), `test/run-tests.js` (enregistrement de la sous-suite).
- Contrat consommé : `promptimizer/lib/update-check.js` (US#181, voir `docs/us/US-181/spec.md`).
- Branchements :
  - **session-start.js** : seulement si `src === 'startup'`. `refreshIfStale()`, puis `readCached()` ; si `shouldNotify`, ajouter devant le contexte injecté `Dis UNE fois à l'utilisateur : <updateNotice>`, en composant avec `welcome` via la même mécanique `ctx`/`pass` (vers la ligne 117), puis `markNotified`. `resume`, `clear`, `compact` → rien.
  - **statusline.js** : `readCached()` seulement (ni spawn ni réseau) ; si `behind`, segment `↑ v<latest>` juste après `PMZ v<version>`.
  - **doctor.js** : une ligne `Mise à jour : …` — à jour : vert ; en retard : orange avec la commande ; réseau KO : orange `vérification impossible` ; opt-out : `vérification désactivée (PMZ_NO_UPDATE_CHECK)` sans effet sur le statut. Jamais rouge ; le statut global ne passe jamais au rouge à cause de cette ligne. Version distante via `spawnSync(node update-check.js --print)`, timeout 5 s.
- Dépend de : US#181.
- Modèle · effort : sonnet · medium.

## Décisions

- Avis uniquement au `startup` (pas à `resume`/`clear`/`compact`) : une fois par jour et par version.
- Statusline sans réseau : elle ne lit que le cache.
- Doctor : orange au pire, jamais rouge (une version en retard n'est pas une install cassée).
- Aucune question ouverte.

## Critères d'acceptation

Sous `PMZ_STATE_DIR` temporaire et `PMZ_UPDATE_URL` invalide (donc sans réseau) :

1. Étant donné un cache `latest` > version locale, quand `session-start.js` reçoit `{"source":"startup"}`, alors le contexte contient l'avis une fois ; un 2ᵉ lancement le même jour ne le contient plus.
2. Même scénario avec `source` à `resume` ou `compact` → pas d'avis.
3. Sans cache → pas d'avis, `exit 0`.
4. Cache corrompu → `exit 0`, sans avis.
5. La statusline affiche `↑ v<latest>` si `behind`, l'omet sinon.
6. Doctor : la ligne `Mise à jour` couvre à jour / en retard / injoignable / opt-out, et ne rend jamais le statut rouge.
7. L'avis `welcome` du 1er démarrage et l'avis de mise à jour coexistent.
8. `node test/run-tests.js` est vert.

## Hors périmètre

- Doc et release (US#183).
- Notification OS (non demandée ; `notify.js` couvre d'autres événements).

## Preuve de clôture

- `node test/run-tests.js`
- Manuel : `PMZ_STATE_DIR=$(mktemp -d) node promptimizer/lib/update-check.js --fetch` remplit le cache (`2.16.3`) ; puis `latest` fictif plus haut + `session-start.js` avec `{"source":"startup"}` → l'avis apparaît.

## Notes

- Fail-open : toute erreur du module → hook `exit 0` silencieux. Ne jamais toucher au `~/.claude` réel.
