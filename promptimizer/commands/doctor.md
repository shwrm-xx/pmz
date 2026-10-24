---
description: Diagnostic de l'installation Promptimizer (canal, version, hooks, scripts) — vert / orange / rouge
allowed-tools: Bash(node *)
---

Diagnostique l'installation Promptimizer (lecture seule, ne modifie rien).

Exécute : `node ${CLAUDE_PLUGIN_ROOT}/install/doctor.js --no-pause`

Restitue tel quel : version, canal (plugin / manuel), état des hooks et des scripts, statut
**vert / orange / rouge** et chaque avertissement. N'invente rien ; si le statut n'est pas vert,
reprends la remédiation indiquée par le script (migration, mise à jour du plugin, redémarrage).
