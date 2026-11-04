# Spec US#172 — Procédure maître : tri, arbitrage, exécution immédiate

- US : #172
- epic : Arbitrages en session

## Récit

En tant qu'utilisateur de `/epicmaster`,
je veux que les points ouverts soient tranchés et exécutés avant la fin de la session maître,
afin de finir chaque session sans « à trancher » reporté, donc sans cascade de nouvelles epics.

## Cadrage d'exécution

- Fichiers visés : `promptimizer/commands/epicmaster.md`, `promptimizer/commands/pickymaster.md`, `promptimizer/commands/scope.md`, `promptimizer/commands/close-batch.md`, `promptimizer/templates/epicmaster-handoff.md`, `promptimizer/templates/handoff-template.md`, `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `test/**`.
- Contrat (consomme US#171 : section « Décidé », `--arbiter-brief --stdin`, `add --kind arbitrages`, section spec « Décisions ») :
  - **epicmaster.md / pickymaster.md** : nouvelle étape §4 « Arbitrages », entre la relecture opus et le handoff :
    1. **Tri** : le maître agrège les « À trancher » (rapports + relecture), reclasse en Décidé / Dette / Non vérifié ce qui n'est pas éligible, puis classe le reste en « expérience utilisateur » (ce que l'utilisateur voit, fait ou ressent) ou « technique ». Cible : moins de 6 points au total, sans plafond dur. Au-delà de 5 points, une ligne au résumé signale que le découpage était trop flou.
    2. **Technique** : UN sous-agent arbitre (`model=opus`, `effort=medium`, brief `epicmaster --arbiter-brief --stdin`). Il n'y a pas d'escalade vers l'humain.
    3. **Expérience utilisateur** : `AskUserQuestion` (≤ 4 questions par appel, option recommandée en premier), et un second appel seulement si nécessaire.
    4. **US d'arbitrages** : `backlog.js add --kind arbitrages --title "Arbitrages — <epic>" …`, puis `spec --new`. La spec liste par décision l'action, les fichiers et le critère de fin, avec « Décisions : toutes prises — aucune question ouverte ». Sans action à faire, aucune US n'est créée.
    5. **Exécution** : le maître lance aussitôt UN sous-agent sur cette US (brief `epicmaster --brief`), l'**attend**, puis la clôt avec `close-wave`. Chaque item tranché → `note --id N --note "décidé : …"` sans `--decide`.
    6. **Handoff** : « Décidé cette session ». « À trancher » ne contient que les maquettes à valider. Un point resté bloquant passe en Dette avec la mention « non résolu après arbitrage ».
    - §2.4 et §4.1 : remplacer « se reportent telles quelles » par le renvoi à cette étape. Sections du rapport mises à jour (ajout de « Décidé »).
  - **scope.md** : les décisions d'expérience utilisateur et de contrat sont posées à l'humain au découpage, dans la même question unique de l'étape 2, puis écrites dans la section spec « Décisions ». Une US qui laisse plus de 2 questions ouvertes est redécoupée ou précisée. L'étape 6 dit « consolide et tranche en fin de session » (et non plus « consolide dette / à trancher »).
  - **epicmaster-handoff.md** : sections « Décidé cette session » (≤ 5 lignes), « Dette », et « À trancher » limitée aux maquettes à valider. Le marqueur manuel est conservé en 1ʳᵉ ligne.
  - **close-batch.md / handoff-template.md** : même règle. Un point technique est décidé par l'agent et noté en « Décidé ». Un point d'expérience utilisateur fait l'objet d'une question à choix en fin d'US. Une section vide est omise.
  - **Descriptions** (frontmatter) d'epicmaster.md / pickymaster.md : « … consolide, tranche et exécute les arbitrages ».
- Dépend de : #171.
- Modèle · effort : sonnet · medium.

## Décisions

- Arbitrage technique par un agent opus, jamais par l'humain. L'arbitrage d'expérience utilisateur est fait par l'humain, en fin de session maître.
- L'US d'arbitrages est exécutée dans la même session maître, sans arbitrage possible. Un point bloquant passe en Dette.
- Maquettes à valider : seule exception reportée dans le handoff (geste humain hors session).

## Critères d'acceptation

1. `epicmaster.md` et `pickymaster.md` contiennent l'étape « Arbitrages » avec `--arbiter-brief`, `AskUserQuestion`, `--kind arbitrages` et « attend » avant `close-wave`.
2. `templates/epicmaster-handoff.md` contient « Décidé cette session » et « Dette ». Sa section « À trancher » ne mentionne que les maquettes.
3. `scope.md` mentionne la section « Décisions » et la règle « plus de 2 questions ouvertes → redécouper ».
4. README et ARCHITECTURE décrivent le flux « tri → arbitre / question → US d'arbitrages → exécution → clôture ». CHANGELOG a une entrée datée.
5. Les tests de doc existants (`run-tests.js` ~l.9750 template, `run-tests-relecture.js`) sont ajustés, un test vérifie les critères 1 à 3, et `node test/run-tests.js` est vert.

## Hors périmètre

- Code lib/scripts (US#171).
- Release / bump de version : se fait sur accord de l'utilisateur, après la clôture de l'epic.

## Preuve de clôture

- `node test/run-tests.js`

## Notes

- La règle anti-cascade est explicite dans epicmaster.md : ni la dette ni une décision ne crée d'US d'office, hors US d'arbitrages de la session.
