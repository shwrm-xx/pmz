# Spec US#193 — Hooks sans lanceur : commande autonome

<!-- spec-v2 -->

- US : #193
- epic : Hooks increvables

## Récit

En tant qu'utilisateur de PMZ en canal plugin,
je veux que les hooks tournent même si un fichier annexe du plugin installé disparaît,
afin de ne plus perdre d'un coup titres de session, rôles, relais et clôtures.

Contexte : le 2026-11-09, `bin/pmz-hook` a disparu du cache du plugin installé ; tous les hooks
sont sortis en `exit 127` pendant trois jours, sans aucun signal.

## Cadrage d'exécution

- Fichiers visés : `promptimizer/hooks/hooks.json`, `test/run-tests-hooks-autonomes.js` (nouveau),
  `test/run-tests.js`, `ARCHITECTURE.md` (section « Canal plugin »).
- Contrat : chaque commande de `hooks.json` prend exactement cette forme (seul `<hook>` varie) :
  `sh -c '[ -f "$1" ] || exit 0; for n in "$(command -v node 2>/dev/null)" /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node /bin/node; do [ -n "$n" ] && [ -x "$n" ] && exec "$n" "$1"; done; exit 0' pmz "${CLAUDE_PLUGIN_ROOT}/hooks/<hook>.js"`
  Événements, matchers et timeouts inchangés. `bin/pmz-hook` reste livré et inchangé, mais n'est
  plus référencé par `hooks.json`.
- Dépend de : aucune
- Modèle · effort : sonnet · medium

## Décisions

- La résolution de `node` est inline dans la commande — plus aucun fichier entre l'app et le hook.
- `bin/pmz-hook` est conservé — un poste qui garde un ancien `hooks.json` en mémoire continue de marcher.
- Aucune question ouverte.

## Critères d'acceptation

1. Étant donné un plugin assemblé (`build-plugin.js`) dont `bin/` est supprimé, quand chaque
   commande de `hooks.json` est rejouée avec un payload JSON valide, alors chacune sort en 0.
2. Étant donné ce même plugin et un projet initialisé (trigramme posé), quand la commande
   `UserPromptSubmit` reçoit un premier prompt, alors stdout contient « Titre de CETTE session ».
3. Étant donné un fichier hook absent, ou `node` introuvable (PATH vide, aucun candidat), quand la
   commande est rejouée, alors exit 0, stdout et stderr vides.
4. Étant donné `promptimizer/hooks/hooks.json`, quand on le lit, alors aucune commande ne contient
   `bin/pmz-hook`.
5. Étant donné un `CLAUDE_PLUGIN_ROOT` contenant un espace, quand la commande est rejouée, alors exit 0.

## Hors périmètre

- Install manuelle (`merge-settings.js`) : elle fige déjà un chemin `node` absolu, non touchée par la panne.
- Détection de la panne et release : US#194.
- Identifier ce qui a supprimé le fichier : aucune piste fiable.

## Preuve de clôture

- `node test/run-tests-hooks-autonomes.js && node test/run-tests.js`

## Notes

- Les tests existants qui exigent `bin/pmz-hook` dans le plugin assemblé (`test/run-tests.js`,
  « build-plugin : bin/pmz-hook présent ») restent vrais : le fichier est toujours livré.
- Tests en bac à sable (dossier temp), jamais contre le `~/.claude` réel.
