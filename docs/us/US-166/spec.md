# Spec US#166 — Transparence : SECURITY et PRIVACY

- US : #166
- epic : Distribution publique

## Récit

En tant qu'utilisateur prudent ou responsable sécurité,
je veux savoir exactement ce que les hooks PMZ lisent, écrivent et envoient,
afin d'autoriser l'installation d'un plugin qui s'exécute à chaque appel d'outil.

## Cadrage d'exécution

- Fichiers visés : `SECURITY.md` (créé, racine), `docs/PRIVACY.md` (créé). Rédaction en anglais.
- Contrat :
  - `SECURITY.md` : versions supportées (dernière mineure), signalement via GitHub Security Advisories (`https://github.com/shwrm-xx/pmz/security/advisories/new`), délai de réponse indicatif, pas de bug bounty.
  - `docs/PRIVACY.md` : un tableau **par hook déclaré** dans `promptimizer/hooks/hooks.json` (colonnes : événement · script · lit · écrit · bloque ?) ; la liste des fichiers/dossiers écrits (`.vibe-agent/**` du projet, `~/.claude/…`) ; la section « Network » ; la politique fail-open ; comment désactiver (`claude plugin disable pmz@pmz-marketplace`).
  - **Tout vient du code** : chaque ligne est vérifiée dans le script cité. Si un appel réseau (`http`, `https`, `fetch`, `net`) est trouvé, il est documenté tel quel, jamais nié.
- Dépend de : aucune.
- Modèle · effort : sonnet · medium

## Critères d'acceptation

1. Étant donné `hooks.json`, quand on compare ses entrées au tableau, alors chaque hook y figure, sans aucun ajout.
2. Étant donné `git grep -nE "require\('(https?|net)'\)|fetch\(" -- promptimizer`, quand on lit la section Network, alors elle est cohérente avec ce résultat.
3. `SECURITY.md` existe à la racine, avec le lien Security Advisories.

## Hors périmètre

- Audit de sécurité ou modification du code : cette US documente l'existant.

## Preuve de clôture

- Doc, pas de commande : relecture contre `hooks.json` (close sans preuve par commande).

## Notes

- `docs/PRIVACY.md` est référencé par `README.en.md` (US#165) : le chemin est figé.
