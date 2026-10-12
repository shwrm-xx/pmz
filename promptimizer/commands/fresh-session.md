---
description: Prépare une nouvelle session en minimisant le contexte (handoff court)
allowed-tools: Bash(node *), Bash(git *), Write
---

Prépare une nouvelle session en minimisant le contexte.

1. Produis un handoff court (modèle : `~/.claude/promptimizer/templates/handoff-template.md`).
2. **Écris-le dans `.vibe-agent/handoff.md`** (écrase le contenu existant ; garde la
   première ligne `<!-- pmz:handoff:manual -->` du modèle — elle le protège de
   l'écrasement par le handoff auto de fin de tour). **Session fille d'une vague parallèle** :
   écris plutôt dans `.vibe-agent/handoff-lot-<id>.md` (le fichier que le hook Stop écrit déjà
   pour cette US ; `backlog.js fleet show` donne ton id d'US) — sinon deux filles s'écrasent, et
   ton propre handoff auto masquerait le manuel. Si un plan d'US existe, le champ
   « Prochaine action recommandée » doit nommer l'US suivante **et son tag modèle/effort**
   (`node ~/.claude/promptimizer/scripts/backlog.js show` les affiche) — jamais l'un sans
   l'autre.
3. Confirme à l'utilisateur qu'il peut démarrer une session fraîche directement :
   le handoff sera injecté automatiquement au démarrage (hook SessionStart).

Modèle du handoff :

<!-- pmz:handoff:manual -->
## Handoff session fraîche

Objectif de l'US terminée :
- ...

Fichiers modifiés :
- ...

Décisions prises :
- ...

Vérifications faites :
- ...

Non vérifié :
- ...

Dette restante :
- ...

Prochaine action recommandée :
- ... (US suivante + son tag modèle/effort, ex. « #N « titre » [modèle : sonnet · effort medium] »)

Contrainte budget :
- ne pas relire les fichiers suivants sauf changement (format machine, semé au démarrage) :
  pmz:skip: <chemin/depuis/la/racine>
- résumés servables à la place d'une relecture complète (format machine, 1 ligne par
  fichier volumineux et stable ; « — » = tiret cadratin obligatoire) :
  pmz:summary: <chemin/depuis/la/racine> — <résumé en une phrase>
