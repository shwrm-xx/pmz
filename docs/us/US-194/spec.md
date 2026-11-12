# Spec US#194 — Panne de hooks visible, titre Scope autonome, release v2.18.1

<!-- spec-v2 -->

- US : #194
- epic : Hooks increvables

## Récit

En tant qu'utilisateur de PMZ,
je veux qu'une panne de hooks se voie tout de suite et que `/pmz:scope` se titre sans dépendre d'un hook,
afin de ne plus découvrir la panne trois jours après, par des sessions mal nommées.

## Cadrage d'exécution

- Fichiers visés : `promptimizer/install/doctor.js`, `promptimizer/scripts/backlog.js`,
  `promptimizer/commands/scope.md`, `test/run-tests-doctor-state.js`, `test/run-tests.js`,
  `CHANGELOG.md`, `README.md`, `ARCHITECTURE.md`, `promptimizer/VERSION`,
  `promptimizer/.claude-plugin/plugin.json`.
- Contrat :
  - `doctor` : nouveau contrôle **rouge** « hooks inexécutables ». Il passe si chaque fichier
    `hooks/<hook>.js` référencé par le `hooks.json` installé existe **et** si la commande
    `SessionStart`, rejouée avec le payload `{}`, sort en 0. En échec, le message nomme le chemin
    manquant et donne la commande de réinstallation du plugin.
  - `backlog.js session-title --scope "<objet>"` : imprime sur stdout la ligne
    `[XXX · Scope] <objet>` (XXX = trigramme du projet). Si le contrôle ci-dessus échoue, une 2ᵉ
    ligne : `hooks PMZ hors service — lance /pmz:doctor`. Exit 0 dans tous les cas.
  - `scope.md` : la première action de la commande est d'appeler `session-title --scope` avec
    l'objet de la demande (6 mots max), puis de renommer la session courante (`session_id: "self"`) ;
    la 2ᵉ ligne éventuelle est relayée telle quelle à l'utilisateur.
  - Release v2.18.1 : procédure « Release » du `CLAUDE.md`, étapes 1 à 5.
- Dépend de : #193 (contrat de `hooks.json`)
- Modèle · effort : sonnet · medium

## Décisions

- Le contrôle vit dans `doctor.js` et il est réutilisé par `session-title` — une seule implémentation.
- Le titre Scope ne dépend plus du hook `UserPromptSubmit` ; le hook reste en place et produit le
  même titre quand il tourne.
- Aucune question ouverte.

## Critères d'acceptation

1. Étant donné un plugin de test auquel il manque un fichier de hook, quand `doctor` tourne, alors
   le verdict est rouge et le message nomme ce fichier.
2. Étant donné un plugin de test complet, quand `doctor` tourne, alors le contrôle « hooks
   inexécutables » est vert.
3. Étant donné un projet de trigramme `COC`, quand on lance
   `backlog.js session-title --scope "Réparer nommage"`, alors stdout vaut `[COC · Scope] Réparer nommage`.
4. Étant donné le plugin amputé du critère 1, quand on lance la même commande, alors une 2ᵉ ligne
   `hooks PMZ hors service — lance /pmz:doctor` est imprimée et l'exit vaut 0.
5. Étant donné le dépôt en fin d'US, quand on lit `promptimizer/VERSION` et `plugin.json`, alors
   les deux valent `2.18.1` et `CHANGELOG.md` porte l'entrée « Release v2.18.1 ».

## Hors périmètre

- Retitrer les sessions déjà mal nommées : état de l'app, pas du dépôt.
- Titre autonome pour `/epicmaster` et `/pickymaster` : ils se titrent déjà eux-mêmes
  (`epicmaster --session-title`).
- Alerte au démarrage de session : impossible par construction quand les hooks sont morts.

## Preuve de clôture

- `node test/run-tests-doctor-state.js && node test/run-tests.js && grep -q '^2.18.1' promptimizer/VERSION`

## Notes

- La publication (étape 4 de la release : `git push origin main` puis `publish-plugin.js --push`)
  est sortante : elle se fait en fin de session maître, pas dans le sous-agent.
- Tests en bac à sable (dossier temp), jamais contre le `~/.claude` réel.
