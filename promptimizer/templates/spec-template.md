# Spec US#{{ID}} — {{TITRE}}

<!-- Gabarit Promptimizer. Posé par `backlog.js spec --id {{ID}} --new`, à remplir à la main :
     tout ce qui reste entre <…> est à ta charge.
     Ce fichier est le CONTRAT de l'US : ce qui n'y est pas écrit n'est pas dû. Garde-le sous
     ~60 lignes — au-delà, ce n'est pas une spec mal rédigée, c'est une US à redécouper. -->

- US : #{{ID}}
- epic : {{EPIC}}

## Récit

En tant que <persona>,
je veux <besoin>,
afin de <bénéfice>.

## Critères d'acceptation

Un critère est **vérifiable** (état observable, sortie de commande) ou ce n'est pas un critère.
Forme : étant donné <état>, quand <action>, alors <résultat observable>.

1. ...
2. ...
3. ...

## Hors périmètre

Ce qui a été écarté **et pourquoi** — évite de re-litiger la même frontière en session fraîche.

- ...

## Preuve de clôture

Commande(s) qui prouvent les critères ci-dessus ; alimente le `--verify` de l'US.

- ...

## Notes

Décisions et contraintes **non déductibles du code** (le code fait foi pour le reste).

- ...

## Maquettes

<!-- Optionnelle : à garder seulement si l'US produit des écrans, sinon supprimer cette section.
     `maquette.js link --id {{ID}} --slug <slug>` y ajoute les liens. L'implémentation suit les
     maquettes liées ; tout écart se signale, il ne se décide pas en silence. -->
