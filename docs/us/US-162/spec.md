# Spec US#162 — Index HTML et navigation des maquettes

- US : #162
- epic : Maquettes : index et navigation

## Récit

En tant que relecteur d'un lot de maquettes,
je veux un index unique des maquettes et une navigation entre elles,
afin d'y accéder en un clic au lieu d'un « maquettes prêtes » sans lien.

## Cadrage d'exécution

- Fichiers visés : `promptimizer/scripts/maquette.js`, `promptimizer/templates/maquette.html`,
  `promptimizer/templates/maquette-index.html` (nouveau), `test/run-tests-maquettes-index.js` (nouveau).
- Contrat (figé) :
  - `maquette.js index [--epic "Nom"] [--cwd dir]` écrit `docs/us/maquettes-index.html`, autonome
    (CSS/JS inline, zéro CDN), et affiche `Index : <chemin>` puis `URL : file://…`.
  - Une entrée par maquette de chaque `docs/us/US-N/maquettes/*.html` : titre (lu dans l'`INDEX.md`
    de l'US), `US #N`, statut (brouillon | validée), lien **relatif** (`US-N/maquettes/<slug>.html`).
  - Chaque maquette contient un bloc `<!-- pmz:nav -->…<!-- /pmz:nav -->` juste après `<body>` : lien
    « ← Index » (`../../maquettes-index.html`) + `<select>` des autres maquettes (navigation JS inline,
    liens relatifs). Le gabarit `maquette.html` pose le bloc vide ; `index` le (re)remplit, y compris
    dans les maquettes déjà existantes sans bloc (insertion après `<body …>`).
  - `new` et `validate` appellent la même génération (index + barres). Idempotent : deux `index`
    de suite donnent des fichiers identiques. Fail-open, exit 0, refus en message.
- Dépend de : aucune.
- Modèle · effort : sonnet · medium.

## Critères d'acceptation

1. Étant donné 3 maquettes dans 2 US, quand `maquette.js index`, alors `docs/us/maquettes-index.html`
   existe, cite les 3 titres, leur US et statut, avec des liens relatifs qui résolvent.
2. Étant donné ces maquettes, alors chacune contient « ← Index » vers l'index et un menu listant les
   2 autres (pas elle-même).
3. Étant donné une maquette ancienne sans bloc `pmz:nav`, quand `index`, alors le bloc est inséré une
   seule fois.
4. Quand `index` est lancé deux fois, alors les fichiers sont octet pour octet identiques.
5. Quand `validate` est exécuté, alors le statut change dans l'index HTML.
6. Aucune URL `http(s)://` ni `<script src>` dans l'index ni dans les barres.

## Hors périmètre

- Consignes `/maquette`, `/epicmaster`, `/pickymaster` et doc : US#163.
- Filtrage par epic de l'index : l'option `--epic` ne fait qu'intituler la page.

## Preuve de clôture

- `node test/run-tests.js && node test/run-tests-maquettes-index.js`
