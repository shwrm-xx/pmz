# US 137 — Bande epicmaster au-dessus de la saisie

- lot : #137
- epic : Bande epicmaster

## Récit

En tant que développeur qui pilote une session `/epicmaster`,
je veux voir au-dessus de la barre de saisie l'avancement des sous-agents (faits / en vol / en attente / verify rouge),
afin de savoir où en est le plan sans relire la conversation ni interrompre le maître.

## Critères d'acceptation

Variante retenue : **C — compacte dépliable** (maquettes validées en session de conception du 2026-10-09).

1. Étant donné une session epicmaster active (fichier `.vibe-agent/epicmaster-live.json` valide), quand l'invite est affichée, alors une bande d'**une ligne** au-dessus de la saisie montre : epic, vague courante `n/N`, barre segmentée (un segment par lot), compteurs `✓ ⟳ ⧗` et, s'il y en a, `✗`.
2. Étant donné un lot qui démarre ou se clôt (`start` / `done` / `note`), quand le fichier live change, alors la bande se met à jour sans action de l'utilisateur.
3. Étant donné un lot en verify rouge, alors la bande l'affiche en couleur danger avec son id (`1 ✗ verify rouge #<id>`).
4. Étant donné la bande repliée, quand l'utilisateur active « Détails », alors elle se déplie en une ligne par lot en vol (`#id titre · modèle·effort · temps écoulé · ~tokens`) plus les lots en attente avec leur dépendance ; « Masquer » la replie.
5. Étant donné une session hors epicmaster, ou un fichier live absent / illisible / invalide, alors la bande n'affiche rien et aucune erreur n'apparaît (fail-open, `next(e)`).
6. Étant donné le plan terminé, alors la bande affiche `◆ epicmaster terminé · N/N ✓ · <k> à trancher`, puis disparaît à la saisie suivante.

## Hors périmètre

- Pourcentage d'avancement réel d'un sous-agent : aucune source fiable ; la mini-barre du détail n'est qu'une estimation (temps / tokens), présentée comme telle.
- Actions depuis la bande (relancer, annuler un lot) : seul le maître orchestre, pas de second canal de commande.
- Panneau latéral dédié : autre surface, à reconsidérer plus tard si la bande ne suffit pas.
- Production du fichier live : lot #136. Déploiement / install : lot #138.

## Preuve de clôture

- `claude plugin validate promptimizer/mods/epicmaster-band`
- `claude plugin test promptimizer/mods/epicmaster-band` (tests couvrant les critères 1, 3, 4, 5, 6)

## Notes

- Surface : `ui.render` sur `{ component: 'AbovePrompt' }` (hooks module `.tsx`, terminal et desktop) ; la statusline PMZ reste le repli et s'affiche sous la saisie, pas au-dessus.
- Format du fichier live : celui livré par le lot #136, qui fait foi.
- À trancher (lot #138) : le canal plugin PMZ peut-il embarquer ce module dans son `hooks/hooks.json` à côté des hooks shell, ou faut-il un plugin séparé ?
