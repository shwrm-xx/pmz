# Qualité epicmaster — sonnet en exécution, opus en jugement

Constat (2026-10-29) : depuis v2.10, le découpage pousse `sonnet · medium` par défaut et le maître
tourne en sonnet (`masterModel`). Pas de perte visible (réouvertures : sonnet 2/84, opus 2/58 ;
verify ok partout) mais le signal est aveugle : verify = tests verts, et rien ne rattache un bug
découvert après coup à l'US qui l'a introduit. Le jugement (« Non vérifié », dette, à trancher)
est fait par un maître sonnet, alors que la grille de `/scope` réserve la revue à opus.

## US A — Relecture opus en consolidation

1. `backlog.js epicmaster --review-brief --ids <a,b,…>` imprime le brief d'**un** sous-agent
   relecteur `opus · medium` :
   - entrée : diff cumulé des US closes de la session (`git diff <base>..HEAD`, base = commit
     précédant la 1re US de la session) + liste agrégée des « Non vérifié » des rapports ;
   - mission : confirmer / infirmer chaque « Non vérifié », chercher les régressions ; lecture
     ciblée ; aucune écriture, aucun commit ;
   - rapport ≤ 250 mots, sections fixes : Problèmes confirmés / Non vérifié levé /
     Non vérifié confirmé / RAS.
2. `epicmaster.md` §4 (et `pickymaster.md`) : lancer ce relecteur **une fois par session
   maître**, avant le handoff, seulement si ≥ 2 US closes. Pas par vague : le pipeline glissant
   n'a pas de barrière de vague. Ses « Problèmes confirmés » vont en Dette ou À trancher,
   jamais corrigés d'office.
3. Le maître reste sonnet (`masterModel` inchangé).
4. Test `test/run-tests-relecture.js` (brief porte `model=opus`, les sections, la garde ≥ 2 US),
   suite autonome (comme les autres `run-tests-*.js`), jouée par la verify de l'US.

## US B — Mesure des régressions post-clôture

1. `backlog.js add --regression-of <id>` persiste `regression_of` (id d'une US close ; sinon
   refus lisible).
2. `backlog.js show --quality` affiche, par `model_hint` (et par effort) : US closes,
   réouvertures (champ `reopened`), régressions rattachées, taux. Lecture seule.
3. `export` ajoute la colonne `regression_of`.
4. `scope.md` et `close-batch.md` disent quand poser `--regression-of` (bug trouvé dans un
   livrable déjà clos).
5. Fail-open : backlog legacy sans le champ → 0.
6. Test `test/run-tests-regressions.js` suite autonome (comme les autres `run-tests-*.js`), jouée par la verify de l'US.

Les deux US partagent la CLI `scripts/backlog.js` : B dépend de A (série).
