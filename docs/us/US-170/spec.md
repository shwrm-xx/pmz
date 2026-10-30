# Spec US#170 — Docs publiques : PRIVACY (8 événements, lancement) + liens README FR

- US : #170
- epic : Distribution publique
- régression de : #166

## Récit

En tant que lecteur francophone qui évalue PMZ,
je veux une page PRIVACY exacte et des liens PRIVACY/SECURITY depuis le README français,
afin de vérifier ce que font les hooks sans deviner.

## Cadrage d'exécution

- Fichiers visés : `docs/PRIVACY.md`, `README.md`.
- Contrat :
  - `docs/PRIVACY.md` : « All seven events » devient « All eight events » ; les huit sont ceux de `promptimizer/hooks/hooks.json` (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, PreCompact, SubagentStart, SubagentStop). Vérifier que chacun a sa section ; ajouter celle des événements manquants d'après leur script.
  - Même page : la phrase de lancement distingue les deux canaux. Plugin : `sh "${CLAUDE_PLUGIN_ROOT}/bin/pmz-hook" …`. Installation manuelle : la commande réelle que `promptimizer/install/merge-settings.js` écrit dans `settings.json`, **lue dans ce fichier, jamais devinée**.
  - `README.md` (FR) : une courte section (ou deux lignes près de la fin, avant « Pour les contributeurs ») qui renvoie à `docs/PRIVACY.md` et `SECURITY.md`, en français, sur le modèle de `README.en.md` § Privacy.
- Dépend de : aucune.
- Modèle · effort : sonnet · medium

## Critères d'acceptation

1. Étant donné `docs/PRIVACY.md`, quand on cherche `eight events`, alors présent, et plus de `seven events`.
2. Étant donné `hooks.json`, quand on compare, alors chacun de ses huit événements apparaît dans PRIVACY.md.
3. Étant donné la section de lancement, alors elle cite la commande exacte de chaque canal, conforme à `hooks.json` et à `merge-settings.js`.
4. Étant donné `README.md`, alors il contient des liens vers `docs/PRIVACY.md` et `SECURITY.md`.

## Hors périmètre

- Délai de réponse de 7 jours de `SECURITY.md` : décision du mainteneur, non modifiée ici.
- Mots-clés des manifestes encore en français : dette notée, hors docs.

## Preuve de clôture

- `git grep -q 'eight events' docs/PRIVACY.md && git grep -q 'docs/PRIVACY.md' README.md && git grep -q 'SECURITY.md' README.md`
