# Spec US#183 — Doc + release v2.17.0

<!-- spec-v2 -->

- US : #183
- epic : Avis de mise à jour

## Récit

En tant que mainteneur et collègue,
je veux que la doc explique l'avis automatique, l'opt-out et les canaux natifs, et que la version 2.17.0 soit publiée,
afin que les postes reçoivent la fonctionnalité.

## Cadrage d'exécution

- Fichiers visés : `README.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `CHANGELOG.md`, `promptimizer/VERSION`, `promptimizer/.claude-plugin/plugin.json`.
- Contrat : process Release de `CLAUDE.md` (bump VERSION + plugin.json, entrée CHANGELOG datée, tests verts, commit `chore(release): vX.Y.Z`, `git push origin main`, `node promptimizer/install/publish-plugin.js --push`).
- Dépend de : US#181 et US#182 (la release embarque le code).
- Modèle · effort : sonnet · medium.

## Décisions

- Version : 2.17.0 (fonctionnalité nouvelle → mineure).
- Push et publication prescrits par le process Release de `CLAUDE.md`.
- Aucune question ouverte.

## Critères d'acceptation

1. README, section « Mise à jour (poste collègue) » : avis automatique, opt-out `PMZ_NO_UPDATE_CHECK=1`, auto-update natif (`/plugin` → Marketplaces → pmz-marketplace → Enable auto-update) et `Watch → Custom → Releases` sur GitHub.
2. ARCHITECTURE.md, section update-check : source (URL), cache et TTL, fetch détaché, fail-open, opt-out, consommateurs.
3. CLAUDE.md, étape 5 de la Release : les postes sont avertis au démarrage qui suit la release.
4. `VERSION` et `plugin.json` à `2.17.0` ; CHANGELOG avec une entrée « Release v2.17.0 » datée.
5. Tests verts, commit `chore(release): v2.17.0` (fichiers du périmètre seulement), puis `git push origin main` et `node promptimizer/install/publish-plugin.js --push`.
6. La commande côté poste collègue est rappelée à l'utilisateur : `claude plugin marketplace update pmz-marketplace && claude plugin update pmz@pmz-marketplace`, puis redémarrage.

## Hors périmètre

- Le code (US#181, US#182).

## Preuve de clôture

- `node test/run-tests.js && grep -q '^2.17.0' promptimizer/VERSION && git grep -q PMZ_NO_UPDATE_CHECK -- README.md ARCHITECTURE.md`

## Notes

- Ne jamais committer de modification étrangère au périmètre (ex. `promptimizer/mods/epicmaster-band/**`).
