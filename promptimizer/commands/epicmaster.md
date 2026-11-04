---
description: Session maître — lance toutes les US ouvertes du backlog en sous-agents (modèle préconisé), consolide, tranche et exécute les arbitrages
allowed-tools: Bash(node *), Bash(git *), Agent, Write, ToolSearch, mcp__ccd_session__start_session
---

Tu es la **session maître** (`/epicmaster` = **direct**, sans question ; `/pickymaster` pour choisir les US) : tu ne codes pas, tu **lances** les US ouvertes du backlog en
**sous-agents** (outil Agent), chacune avec le **modèle et l'effort préconisés par l'US**, puis
tu **consolides** — commit et clôture par US, CHANGELOG, et UN handoff final qui porte la
dette et ce qui reste à trancher. Les US peuvent appartenir à une seule epic ou à plusieurs.

> **Bande epicmaster** : pendant cette session maître, une bande live (`EM ▶n ✔n ⚙n`, sous-agents
> en vol / terminés / outils) s'affiche au-dessus de la saisie, chargée automatiquement (plugin `pmz` :
> embarquée ; install manuelle : `env.CLAUDE_CODE_PLUGIN_DIRS`) ; à défaut `backlog.js epicmaster --live`.

## 1. Plan et lancement (AUCUNE question)

`/epicmaster` embarque **toutes les US ouvertes** : **n'ouvre aucune question** (ni AskUserQuestion,
ni « Je lance ? »). Pour choisir les US à embarquer, l'utilisateur utilise `/pickymaster`.

`node ~/.claude/promptimizer/scripts/backlog.js epicmaster` (ajouter `--epic "…"` pour se limiter
à une epic ; `--skip 12,15` si l'utilisateur l'a demandé dans son message ; `--max-parallel N`
pour abaisser le plafond de sous-agents en vol).

Restitue la sortie **telle quelle** (une ligne par US, ordre de lancement, budget, **modèle
préconisé pour toi**), puis enchaîne **immédiatement**. N'embarque **jamais** une US absente de
la sortie du script. Une US **bloquée** (dépendance hors plan) reste ouverte : signale-la en une ligne.

**Maquettes** : si le plan contient une US « Maquettes » (vague 1), **signale-le en une ligne** :
ses maquettes devront être validées par l'humain avant les US à écrans, qui en dépendent.

**Première action, sans attendre qu'on te le demande** : **renomme ta propre session**.
`backlog.js epicmaster --session-title` (mêmes `--epic`/`--skip`) donne « [XXX · EP#a–#b] <nom de
l'epic> » ; appelle l'outil `set_session_title` avec `session_id: "self"` et ce titre, **avant**
le `--live-seed` et la vague 1. Sans cet outil (autre hôte) : ignore l'étape, sans le signaler.

Puis **sème le plan complet dans la bande** (rien n'est démarré, backlog intact) —
`backlog.js epicmaster --live-seed` avec les **mêmes** `--epic`/`--skip`/`--max-parallel`, plus
`--wave-labels "1=…;2=…"` : un **libellé court par vague** (2 à 4 mots, déduit des titres de ses
US, jamais inventé au-delà). Son bouton **Plan** ouvre le plan complet dans un panneau.

Si le script préconise un autre modèle que le tien pour la session maître, dis-le en une
ligne (`/model …`) avant de lancer — tu orchestres, tu n'as pas besoin de raisonner lourd.

## 2. Lancement, vague par vague

Pour **chaque vague** du plan, et **jamais plus d'US en vol que le parallélisme affiché** :
1. Pour chaque US de la vague : `backlog.js epicmaster --brief --id <id>` → colle le brief
   **tel quel** dans le prompt de l'outil Agent, avec `model` = modèle préconisé de l'US et
   `effort` = effort préconisé (les deux sont dans le brief ; ne les remplace jamais par les
   tiens). Démarre l'US : `backlog.js start --id <id> --owner "master/lot-<id>"` (un owner
   **distinct par US**, sinon le second démarrage rétrograde le premier en « à faire »).
   **Lancement groupé (non négociable)** : prépare d'abord, pour **toutes** les US de la vague
   (dans la limite du parallélisme affiché), le brief et le `start` ; puis lance **tous** les
   `Agent` dans **UN SEUL message** (plusieurs appels d'outil côte à côte), chacun avec
   `run_in_background: true`. Jamais un `Agent` par message, jamais au premier plan : c'est ce qui
   rend le parallélisme réel. Le hook `subagent-live` alerte si la concurrence reste à 1 sur une
   vague ≥ 2 US. Une vague « série » = un seul sous-agent.
   **Maquettes** : dans le prompt du sous-agent de l'US « Maquettes », ajoute : « produis les
   maquettes (`/maquette`) et lie-les aux specs (`maquette.js link`), mais **ne les valide pas**
   (`maquette.js validate` interdit) : liste-les dans « À trancher » sous l'intitulé **maquettes
   à valider** (slug + chemin). Termine en lançant `maquette.js index` et restitue le lien cliquable
   de l'index (chemin relatif + URL `file://`) : « maquettes prêtes » seul est interdit. » À la
   consolidation, l'index (lien cliquable) figure **en tête** de la liste « maquettes à valider ». Dans le prompt de chaque US à écrans (spec avec section
   « Maquettes »), ajoute : « le brief contient les maquettes validées : suis-les ; signale tout écart
   (maquette ↔ implémentation) dans « À trancher », sans trancher toi-même. Sans maquette validée
   (avertissement en tête de brief), ne code pas l'UI et signale-le dans « À trancher ». »
   **Garde-fou maquettes (non négociable)** : dans une epic qui a une US « Maquettes », toutes les
   autres US de l'epic en dépendent (le script l'impose : jamais en parallèle des maquettes). Un
   brief qui commence par « ⚠ Maquettes non validées » : **ne lance pas** l'US — demande à
   l'humain de valider les maquettes (lien de l'index, `maquette.js validate`), donne la place à
   une autre US éligible, et ne la lance qu'après validation (brief régénéré sans ⚠) ou sur
   « lance sans maquettes » explicite de l'humain.
2. **Pipeline glissant** : ne fais pas de barrière de vague. Chaque sous-agent en arrière-plan
   te notifie à sa fin ; dès qu'un rapport arrive, traite-le (étapes 3 et 4) puis, **sans attendre les
   autres**, lance dans le même message (groupé s'il y en a plusieurs) la ou les US **éligibles**
   suivantes (dépendances closes, périmètre libre, jamais plus d'US en vol que le parallélisme
   affiché) : une place libérée part aussitôt. Ne sonde pas, n'attends que les notifications.
   Un rapport est ≤ 250 mots aux sections fixes (Fait / Fichiers modifiés / Verify / Non vérifié / Dette / À trancher / Bloc
   CHANGELOG). **Ne relis jamais** le transcript ni la sortie brute d'un sous-agent, ni les
   fichiers qu'il a modifiés : le rapport est ta seule source.
3. **Clôture groupée (`close-wave`)** : dès que les rapports d'une vague sont arrivés, clos-la en
   UN appel (commit, `done`, fiche d'archive, CHANGELOG) au lieu des commandes ci-dessous :
   `node ~/.claude/promptimizer/scripts/backlog.js close-wave --stdin` avec un JSON
   `{"items":[{"id","paths":[…],"message","verdict","tokens","fiche","changelog":{"title","bullets":[…]}}]}`
   (`--dry-run` pour prévisualiser). Le commit est borné aux chemins (`git commit -- <chemins>`) ;
   un fichier partagé par plusieurs US n'ira que dans le premier commit ; si `done` refuse une spec
   incomplète, relaie `--allow-incomplete-spec`. Verify rouge : pas de commit, l'US est rouverte.
   Le détail ci-dessous reste la règle de fond (et le repli manuel) :
4. Pour chaque US livrée, **dans l'ordre du plan** (les commandes exactes sont données à la
   fin du brief) :
   - **Verify verte** → commit **borné au périmètre** (`git add -- ':(glob)…'`, ou `git add -A`
     pour une US sans périmètre, seule en vol) + message français court, puis
     `backlog.js done --id <id> --commit "$(git rev-parse --short HEAD)" --verify-verdict ok --tokens <N>`.
     `<N>` = tokens **réels** du sous-agent (ligne d'usage rendue avec son rapport, jamais estimés
     par toi ; absent -> omets `--tokens`, la bande garde l'estimation du plan).
   - **US sans verify** (non vérifiable par commande : doc, choix visuel) → commit + `done
     --verify-verdict none --tokens <N>` : clos **sans preuve**, et dit comme tel dans le handoff.
   - **Verify rouge** → **pas de commit** ; `backlog.js note --id <id> --note "verify rouge :
     <cause en une ligne>" --decide` (l'US entre dans « à trancher » de la bande), puis
     `backlog.js done --id <id> --verify-verdict failed --tokens <N>` (la bande passe l'US en
     rouge) et `backlog.js reopen --id <id> --note "verify rouge : <cause>"` : l'US reste
     **ouvert** dans le backlog et passe dans « À trancher » du handoff. Si la cause est
     triviale (< 5 min), relance **un** sous-agent de correction au même modèle, une seule fois.
   - Un sous-agent qui a écrit **hors de son périmètre** : ne commite pas ses écritures hors zone
     (`git checkout -- <chemin>` après confirmation), note-le, poursuis.
   - Rapport de l'US « Maquettes » : chaque maquette listée dans « maquettes à valider » →
     `backlog.js note --id <id> --note "maquettes à valider : <slug, …>" --decide`, et reprise
     dans « À trancher » du handoff final (jamais validées à la place de l'humain). Un écart
     maquette ↔ implémentation signalé par une US à écrans se traite comme un « À trancher ».
   - Tout « À trancher » du rapport d'un sous-agent : `backlog.js note --id <id> --note
     "<point en une ligne>" --decide` (la bande compte « N à trancher »), puis il va au tri de
     l'étape 4.3 Arbitrages — plus de report tel quel (hors maquettes à valider).
5. Ajoute au `CHANGELOG.md` une entrée datée par US, reprise du « Bloc CHANGELOG » du rapport
   (fait par `close-wave` quand il est utilisé).

## 3. Vigilance contexte (non négociable)

- Le plan dit « au plus N US par session maître ». **Arrête-toi** après la dernière vague de
  ta session : les US restantes restent ouvertes, la session suivante les reprend avec
  `/epicmaster`.
- Si le hook Stop prescrit une session fraîche (zone rouge, budget de tours) **avant** la fin :
  termine la vague en cours (commits + `done`), consolide (section 4) et **arrête-toi** — ne lance
  pas la vague suivante. Rien n'est perdu : le backlog porte l'état.
- Jamais de `git diff` complet, jamais de lecture des fichiers livrés « pour vérifier » : la
  preuve est la verify rejouée par le sous-agent et persistée par `done --verify-verdict`.

## 4. Consolidation finale

1. Fiche d'archive par US close (déjà écrite par `close-wave` si `fiche` y figurait) : `node ~/.claude/promptimizer/scripts/archive.js write --id N
   --stdin` — les sections du rapport (Fait, Non vérifié, Dette, Décidé ; « À trancher » : voir l'étape
   Arbitrages) se reportent ; aucun diff ni contenu de fichier.
2. **Relecture opus (1× par session maître, jamais par vague)** — seulement si **≥ 2 US closes**
   dans la session (sinon passe) : `node ~/.claude/promptimizer/scripts/backlog.js epicmaster
   --review-brief --ids <ids des US closes> [--unverified "<Non vérifié>" …]` imprime le brief ;
   colle-le dans UN sous-agent (outil Agent, `model=opus`, `effort=medium`, lecture seule, rapport
   ≤ 250 mots : Problèmes confirmés / Non vérifié levé / Non vérifié confirmé / RAS). Le maître
   reste sonnet. Ses « Problèmes confirmés » sont des **Défauts**
   : toujours corrigés dans l'US d'arbitrages, jamais en Dette. Son « Non vérifié confirmé » est
   vérifié dans l'US d'arbitrages, sauf s'il exige un geste humain.
3. **Arbitrages (tri → arbitre / question → US d'arbitrages → exécution → clôture)** — aucun
   « À trancher » ne se reporte tel quel, sauf les maquettes à valider. Anti-cascade : ni la dette
   ni une décision ne crée d'US d'office, hors l'US d'arbitrages de la session.
   1. **Tri en 3 catégories** (pas de catégorie « Écarté ») :
      - **Défaut** : critère raté, problème confirmé, ou item dans le périmètre d'une US → corrigé.
      - **Finition** : tout point mineur, dans le périmètre ou non → corrigé.
      - **Dette** : point hors périmètre, d'importance `haute` ou `critique`, avec la raison du
        report (il exige une conception ou plus d'un commit) ; **au plus 1 par epic**.
      Les « À trancher » des rapports et de la relecture : classe-les en « expérience utilisateur »
      (ce que l'utilisateur voit, fait ou ressent) ou « technique » (étapes 2 et 3 ci-dessous).
      Cible : moins de 6 points au total, sans plafond dur ; au-delà de 5, une ligne au résumé
      signale que le découpage était trop flou. Les maquettes à valider restent à part (geste
      humain).
   2. **Technique** : UN sous-agent arbitre (`model=opus`, `effort=medium`), brief =
      `backlog.js epicmaster --arbiter-brief --stdin` (points en entrée). Pas d'escalade vers
      l'humain.
   3. **Expérience utilisateur** : `AskUserQuestion` (≤ 4 questions par appel, option
      recommandée en premier) ; un second appel seulement si nécessaire.
   4. **US d'arbitrages** : `backlog.js add --kind arbitrages --title "Arbitrages — <epic>" …`
      puis `spec --new` ; la spec liste par décision l'action, les fichiers et le critère de fin,
      avec « Décisions : toutes prises — aucune question ouverte ». Elle porte **tous** les Défauts,
      Finitions, décisions et vérifications « Non vérifié » réalisables sans geste humain. Sans
      action à faire : aucune US créée.
   5. **Exécution** : lance aussitôt UN sous-agent sur cette US (brief `backlog.js epicmaster
      --brief --id <id>`), **attends**-le, puis clos-la avec `close-wave`. Chaque item tranché :
      `backlog.js note --id N --note "décidé : …"` (sans `--decide`).
   6. **Garde de solde** : après la clôture de l'US d'arbitrages et **avant** le handoff, lance
      `node ~/.claude/promptimizer/scripts/backlog.js epicmaster --settle-check --stdin` avec le
      JSON `{dette:[{item,us,importance,raison}], a_trancher:[{item,maquette}],
      non_verifie:[{item,geste_humain,cause}], arbitrage_rounds}`.
      - « Solde : NON » → second tour : nouvelle US d'arbitrages sur les points listés, exécutée
        puis close (étapes 4 et 5), et relance la garde.
      - Au plus **2 tours** d'arbitrages. Au-delà, chaque point restant passe en **Dette** avec la
        mention « non résolu après arbitrage », en gardant son importance et sa raison.
      - `arbitrage_rounds` vaut **0** au premier appel de la garde, puis est incrémenté de **1**
        après chaque tour d'arbitrages exécuté (donc 2 au troisième appel). À `arbitrage_rounds` ≥ 2,
        la garde ne bloque plus : « Solde : OK » avec avertissements « sera converti en Dette non
        résolu après arbitrage ».
      - Cite la sortie de la garde dans le résumé final.
4. Handoff consolidé, modèle `~/.claude/promptimizer/templates/epicmaster-handoff.md`, écrit dans
   `.vibe-agent/handoff.md` (écrase ; garde la première ligne `<!-- pmz:handoff:manual -->`) :
   US livrées (id + commit), US restées ouvertes et pourquoi, **Non vérifié** agrégé (seulement les points qui exigent un geste humain, avec leur cause), **Décidé
   cette session** (≤ 5 lignes), **Dette consolidée** (une puce par item : `item (US#N) — importance —
   raison du report`), **À trancher** = les seules **maquettes à valider** (jamais validées à la place
   de l'humain), prochaine action (US restantes → `/epicmaster` ; sinon « plan terminé »).
   Section vide omise. Moins de 800 tokens.
5. Résume en 5 lignes à l'utilisateur : livrés / ouverts / décidé / solde (sortie de la garde) /
   maquettes à valider (aucune autre ligne « À trancher ») / session fraîche recommandée (oui si des US restent ou si le hook l'a prescrit).
   **Session maître suivante** : s'il reste des US (plan > 1 session, ou session fraîche prescrite
   par le hook Stop), lance-la par **la carte « Session maître »** de `/scope` (étape 6) : charge
   l'outil par `ToolSearch` (`select:mcp__ccd_session__start_session`), puis un seul appel
   `mcp__ccd_session__start_session` avec `initiation: "own_initiative"`, `context: "fresh"`,
   `use_worktree: false`, `title: "Session maître — <epic>"`, `model`/`effort` maîtres de la sortie
   `epicmaster`, `prompt` = invoquer le skill `pmz:epicmaster`, `background` (≥ 80 car.) = epic, US
   restantes, sessions prévues. Liée à cette session maître (la chaîne s'imbrique). Outil absent
   ou refusé : repli texte (« ouvre une session fraîche, `/model <maître>`, `/epicmaster` »). Plus
   d'US : aucune carte.

Ne déclare jamais une US « faite » sans verify verte rapportée **et** persistée.
