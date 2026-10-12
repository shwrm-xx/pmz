# US 143 — Installeur plugin en un clic

- lot : #143
- epic : Install sans couture

## Récit

En tant que développeur qui équipe un nouveau poste,
je veux installer Promptimizer en un seul geste,
afin de l'avoir opérationnel dans Claude Code sans connaître les commandes plugin ni le canal manuel.

## Critères d'acceptation

1. Étant donné un OS (macOS / Linux / Windows), quand j'ouvre `promptimizer/install/`, alors un
   lanceur fin `install-plugin.command` / `.sh` / `.ps1` existe : il vérifie `node` puis délègue à
   `install-plugin.js` (aucune logique métier dans le lanceur).
2. Étant donné `claude` disponible, quand je lance l'installeur, alors la marketplace est ajoutée
   et `pmz` installé ; si `pmz` est déjà installé, il est mis à jour au lieu d'échouer.
3. Étant donné `claude` introuvable, quand je lance l'installeur, alors `extraKnownMarketplaces` et
   `enabledPlugins` sont ajoutés à settings.json (append-only, tagué, backup, réversible) et
   l'installeur affiche « relance Claude Code ».
4. Étant donné une install manuelle présente, quand je lance l'installeur, alors elle est migrée via
   `migrate-to-plugin.js` (pas de hooks en double).
5. Quand l'installeur se termine, alors le doctor s'exécute et affiche un verdict vert / orange / rouge.
6. Étant donné une install déjà faite, quand je relance l'installeur, alors rien ne change et aucun
   doublon n'apparaît dans settings.json.
7. Les tests tournent en bac à sable (`CLAUDE_CONFIG_DIR` temporaire) et ne touchent jamais au vrai
   `~/.claude`.

## Hors périmètre

- Installer Node ou Claude Code eux-mêmes : prérequis système, droits admin variables selon le poste.
- Installeur signé `.pkg` / `.msi` : signature et notarisation coûteuses pour un gain marginal face
  à un double-clic.
- Archive hors-ligne : lot #145.
- Doctor embarqué dans le plugin et accueil au 1er démarrage : lot #144.

## Preuve de clôture

- `node test/run-tests.js`

## Notes

- Fail-open et zéro dépendance (stdlib Node seule), comme le reste de `install/`.
