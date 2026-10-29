---
description: Session maître — lance toutes les US ouvertes du backlog en sous-agents (modèle préconisé) et consolide un handoff dette / à trancher
allowed-tools: Bash(node *), Bash(git *), Agent, Write
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
ses maquettes devront être validées par l'humain avant/pendant les US à écrans, qui en dépendent.

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
   à valider** (slug + chemin). » Dans le prompt de chaque US à écrans (spec avec section
   « Maquettes »), ajoute : « lis les maquettes liées à ta spec et suis-les ; signale tout écart
   (maquette ↔ implémentation) dans « À trancher », sans trancher toi-même. »
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
   - Toute décision qui attend l'humain (« À trancher » du rapport d'un sous-agent) :
     `backlog.js note --id <id> --note "<décision en une ligne>" --decide` — la bande compte
     « N à trancher » en direct.
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
   --stdin` — les sections du rapport (Fait, Non vérifié, Dette, À trancher) se reportent telles
   quelles ; aucun diff ni contenu de fichier.
2. **Relecture opus (1× par session maître, jamais par vague)** — seulement si **≥ 2 US closes**
   dans la session (sinon passe) : `node ~/.claude/promptimizer/scripts/backlog.js epicmaster
   --review-brief --ids <ids des US closes> [--unverified "<Non vérifié>" …]` imprime le brief ;
   colle-le dans UN sous-agent (outil Agent, `model=opus`, `effort=medium`, lecture seule, rapport
   ≤ 250 mots : Problèmes confirmés / Non vérifié levé / Non vérifié confirmé / RAS). Le maître
   reste sonnet. Ses « Problèmes confirmés » et « Non vérifié confirmé » vont en **Dette** ou
   **À trancher** du handoff — jamais corrigés d'office.
3. Handoff consolidé, modèle `~/.claude/promptimizer/templates/epicmaster-handoff.md`, écrit dans
   `.vibe-agent/handoff.md` (écrase ; garde la première ligne `<!-- pmz:handoff:manual -->`) :
   US livrées (id + commit), US restées ouvertes et pourquoi, **Non vérifié** agrégé, **Dette
   consolidée** (une puce par item, US d'origine entre parenthèses), **À trancher** (décisions
   qui attendent l'humain — jamais tranchées à sa place), prochaine action (US restantes →
   `/epicmaster` ; sinon « plan terminé »). Moins de 800 tokens.
4. Résume en 5 lignes à l'utilisateur : livrés / ouverts / à trancher / session fraîche
   recommandée (oui si des US restent ou si le hook l'a prescrit).

Ne déclare jamais une US « faite » sans verify verte rapportée **et** persistée.
