# AGENTS.md — instructions agents de code

## Objectif
Travailler par petites US avec consommation minimale de contexte.

## Avant de modifier
- Utiliser `git status`, `git diff`, `git grep` avant de lire de gros fichiers.
- Lire uniquement les fichiers nécessaires.
- Ne pas élargir le périmètre sans demande explicite.

## Pendant le travail
- Modifier le moins de fichiers possible.
- Respecter les conventions existantes.
- Ne pas ajouter de dépendance sans justification.

## Vérification
- Vérifier uniquement ce qui a changé.
- Pour une UI : rendu réel ou test ciblé.
- Pour une API : test endpoint ou test unitaire ciblé.
- Pour du contenu : contrôle cohérence et rendu si applicable.

## Fin d'US
- Mettre à jour `CHANGELOG.md`.
- Faire un commit.
- Produire un handoff court.
