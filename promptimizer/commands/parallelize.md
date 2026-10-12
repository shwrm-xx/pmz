---
description: Calcule un plan de vagues parallèles (périmètres disjoints + depends_on) sans rien lancer
allowed-tools: Bash(node *)
---

Propose un **plan de vagues parallèles** à partir des US « à faire » du backlog — **sans rien
lancer** (aucune branche, aucun worktree, aucune session fille).

Une **vague** = un groupe d'US dont les **périmètres sont disjoints deux à deux** (le conflit
git y est structurellement impossible) et dont toutes les dépendances `depends_on` sont
satisfaites par une vague antérieure ou une US déjà faite. Deux périmètres qui se **chevauchent**
ne partagent jamais une vague (l'un est repoussé plus loin).

Exception : les **fichiers de test** (`test/`, `tests/`, `__tests__/`, `spec/`) sont une **zone
partagée additive** — chaque US y ajoute ses cas — et ne comptent pas dans la disjonction (sans
quoi `test/**`, présent dans presque tous les périmètres, sérialiserait toute la vague). Le plan
l'annonce quand c'est le cas : un conflit de merge y est **attendu**, et c'est `/pmz:reintegrate`
qui l'annule en nommant l'US coupable. Une US dont le périmètre se réduit à cette seule zone
reste non parallélisable.

Prérequis : les US doivent porter un **périmètre** (`add --perimeter …` ou
`setPerimeter`) et, si un ordre s'impose, des **dépendances** (`add --depends …`). Une US sans
périmètre est « non parallélisable » (à traiter en série) ; une US dont une dépendance ne pourra
jamais aboutir (cycle, dépend d'un non parallélisable) est « bloqué ».

Étapes :
1. Calculer et afficher le plan :
   `node ~/.claude/promptimizer/scripts/backlog.js parallelize`
   (filtrer un epic : `parallelize --epic "Nom de l'epic"` ; sortie machine : `--json`).
2. Restituer le plan tel quel : pour chaque vague, les US avec leur **branche suggérée** et
   leur **périmètre**, puis les US non parallélisables / bloquées.
3. **NE RIEN LANCER.** La commande est une proposition : le lancement des sessions filles reste
   **manuel et validé** (cf. D3, palier 2). L'adoption peut être **partielle** : un sous-ensemble
   d'une vague est valide tant que les périmètres retenus restent disjoints et les `depends_on`
   satisfaits — les US écartées repassent simplement en série. Après validation humaine, chaque
   US retenue se démarre à la main :
   `node ~/.claude/promptimizer/scripts/backlog.js start --id <id> --owner <session>`,
   puis la session fille **s'inscrit dans la vague** (garde de périmètre + injection) :
   `node ~/.claude/promptimizer/scripts/backlog.js fleet join --id <id> --perimeter "<globs>"`
   (`--session <id>` si l'id de session persisté n'est pas le bon ; `fleet show` pour l'état de la
   vague, `fleet ready --id <id>` quand l'US est prête à merger).
   **N'édite jamais `fleet.json` à la main** : un JSON invalide désactive TOUTE la vague en
   silence (fail-open des hooks) — `fleet show` est le seul canal qui te le dira.
4. En briefant chaque **session fille**, rappelle-lui que le périmètre exclusif vaut AUSSI pour
   ses **sous-agents** (Task/Agent) : le garde-fou d'écriture ne protège que la session
   propriétaire, pas les sous-agents qu'elle délègue — elle doit leur transmettre le périmètre.

N'invente aucune vague absente de la sortie du script : le plan fait foi.
