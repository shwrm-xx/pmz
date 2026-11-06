---
description: Affiche la version de Promptimizer et l'epic/US en cours du projet
allowed-tools: Bash(node *)
---

Affiche l'état Promptimizer courant.

Exécute : `node ${CLAUDE_PLUGIN_ROOT}/scripts/about.js`

Restitue tel quel : version installée, état du bridge RTK (si affiché), epic du projet,
progression et US en cours (ou prochaine US). N'invente aucun chiffre si le script les
annonce absents/inconnus.

Pour savoir « où se passe quoi » entre plusieurs sessions ouvertes sur le dépôt, propose aussi :
`node ${CLAUDE_PLUGIN_ROOT}/scripts/backlog.js sessions` (une ligne par session : rôle, epic, US,
état, dernier événement ; `--json` pour la sortie machine).
