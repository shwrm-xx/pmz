# Spec US#165 — Accueil public EN

- US : #165
- epic : Distribution publique

## Récit

En tant que développeur hors équipe (non francophone) qui découvre PMZ,
je veux une page d'accueil en anglais qui dit ce que fait le plugin et comment l'installer/l'enlever,
afin de l'adopter sans lire le code ni la doc française.

## Cadrage d'exécution

- Fichiers visés : `README.en.md` (créé), `README.md` (lien EN + badge CI en tête), `docs/distribution/submission.md` (créé), `promptimizer/.claude-plugin/plugin.json` et `.claude-plugin/marketplace.json` (champ `description` seulement).
- Contrat :
  - `README.en.md` ≤ ~120 lignes, sections dans cet ordre : What it does · Requirements (Claude Code, **Node ≥ 18 dans le PATH**) · Install (`claude plugin marketplace add shwrm-xx/pmz` puis `claude plugin install pmz@pmz-marketplace`) · Update (`claude plugin marketplace update pmz-marketplace && claude plugin update pmz@pmz-marketplace`) · Uninstall (`claude plugin uninstall pmz@pmz-marketplace` + `claude plugin marketplace remove pmz-marketplace`) · Commands (liste issue de `promptimizer/commands/`) · Privacy (renvoi vers `docs/PRIVACY.md`, livré par US#166) · License (MIT).
  - Badge CI : `[![CI](https://github.com/shwrm-xx/pmz/actions/workflows/ci.yml/badge.svg)](https://github.com/shwrm-xx/pmz/actions/workflows/ci.yml)` dans les deux README.
  - `description` en anglais, identique dans `plugin.json` et `marketplace.json` (≤ 200 caractères). Le reste des manifestes est inchangé (**pas** de bump de `version`).
  - `submission.md` : nom, description courte/longue EN, catégorie `workflow`, mots-clés, URL du dépôt, commande d'install, checklist avant soumission. La soumission elle-même est faite par le mainteneur.
- Dépend de : aucune (le lien PRIVACY pointe un chemin figé ici).
- Modèle · effort : sonnet · medium

## Critères d'acceptation

1. Étant donné le dépôt, quand on ouvre `README.en.md`, alors les 8 sections du contrat y sont dans l'ordre, et les commandes y apparaissent mot pour mot.
2. Étant donné `README.md`, quand on lit son en-tête, alors il contient le lien vers `README.en.md` et le badge CI.
3. Étant donné les deux manifestes, quand `node -e` les parse, alors le JSON est valide et les `description` sont identiques et en anglais.
4. `node test/run-tests.js` reste vert.

## Hors périmètre

- Traduire toute la doc (ARCHITECTURE, CHANGELOG) : le coût est élevé et les mainteneurs sont francophones.
- Soumettre au répertoire officiel : c'est une publication externe, faite par le mainteneur à la main.

## Preuve de clôture

- `node test/run-tests.js`

## Notes

- La commande `marketplace add` ne se relance pas pour une mise à jour (elle est refusée si la source déclarée diffère, cf. CLAUDE.md).
