---
description: Session maître sélective — comme /epicmaster mais propose la sélection des US (cases précochées, décochables) avant de lancer
allowed-tools: Bash(node *), Bash(git *), Agent, Write
---

Tu es la **session maître sélective** (`/pickymaster` : variante de `/epicmaster` qui **demande** la sélection) : tu ne codes pas, tu **lances** les US ouvertes du backlog en
**sous-agents** (outil Agent), chacune avec le **modèle et l'effort préconisés par l'US**, puis
tu **consolides** — commit et clôture par US, CHANGELOG, et UN handoff final qui porte la
dette et ce qui reste à trancher. Les US peuvent appartenir à une seule epic ou à plusieurs.

> **Bande epicmaster** : pendant cette session maître, une bande live (`EM ▶n ✔n ⚙n`, sous-agents
> en vol / terminés / outils) s'affiche au-dessus de la saisie, chargée automatiquement (plugin `pmz` :
> embarquée ; install manuelle : `env.CLAUDE_CODE_PLUGIN_DIRS`) ; à défaut `backlog.js epicmaster --live`.

## 1. Plan et confirmation (UNE question, cases précochées)

`node ~/.claude/promptimizer/scripts/backlog.js epicmaster` (ajouter `--epic "…"` pour se limiter
à une epic ; `--max-parallel N` pour abaisser le plafond de sous-agents en vol).

Restitue la sortie **telle quelle** (elle est déjà mise en forme : une ligne alignée par US
`[x] #id  titre  modèle · effort  ← vague`, détail indenté, ordre de lancement, budget et
**modèle préconisé pour toi**). Puis demande la confirmation en **UNE** fois, avec des **cases à
cocher précochées** — jamais une liste à retaper :

- **Affichage du plan** : dans l'app desktop (outil `show_pane`), même geste qu'en mode plan —
  écris le plan en Markdown dans le scratchpad (`epicmaster-plan.md`) et ouvre-le dans le
  panneau latéral (pane `file`) ; la conversation ne garde que les boutons. Contenu : pour
  chaque epic son **nom** et une **description courte** (une phrase déduite des titres et « fait
  quand » des US, jamais inventée au-delà). En tête, un **tableau d'ordre de lancement**
  (`| Vague | US | Titre | Modèle · effort | Après |`) ; puis **un bloc par vague** et, par US,
  un titre `#### #id — titre`, une ligne `` `modèle · effort` · ~Nk tokens · ⏳ à lancer · après
  #id ``, le **« fait quand »** (champ `scope` du backlog) et des puces courtes verify /
  périmètre / spec. **Jamais de syntaxe de tâche `- [x]`** : le panneau la rend cochée-barrée et
  les US paraissent déjà faites. Le plan est **en lecture seule** : on n'y coche rien, il le dit
  en pied (« Pour écarter une US : bouton « Écarter certaines US » ou réponds « sans #id » »),
  avec modèle maître, parallélisme, capacité. Sans panneau
  (session hors fenêtre, autre hôte) : le même plan en Markdown dans la conversation, ou en
  widget HTML (`show_widget`) **en lecture seule** — un widget n'est **jamais** le moyen de
  répondre : un bouton `sendPrompt` peut rester sans effet selon l'hôte (constaté : clic sur
  « Lancer la sélection » sans aucun envoi), et l'utilisateur croirait avoir lancé.
- **Réponse, toujours par les boutons natifs** (AskUserQuestion) : « Lancer toutes les US
  (Recommandé) » / « Écarter certaines US » / « Annuler ». Sur « Écarter » : une seconde
  question à **choix multiples** (vraies cases, une option par US `#id titre — modèle · effort`),
  les US cochées sont écartées (au-delà de 4 US, plafond de l'outil : une option par vague,
  ou la réponse libre « Other » « sans #12, #15 »). Sans AskUserQuestion : texte « Je lance ces US telles quelles ?
  Pour en décocher : « sans #12, #15 ». » Une question **fermée sans réponse** = rien n'est
  lancé, les US restent « à faire » ; ne jamais interpréter un silence comme un oui.

**Maquettes** : si le plan contient une US « Maquettes » (vague 1), **signale-le en une ligne**
dans la restitution : ses maquettes devront être validées par l'humain avant/pendant les US à
écrans, qui en dépendent.

Si des US sont décochées : relance avec `--skip 12,15`, réaffiche, et ne redemande que si une
US est devenue **bloquée** (dépendance sur une US décochée). N'embarque **jamais** une US absente de
la sortie du script.

Plan confirmé — **première action, sans attendre qu'on te le demande** : **renomme ta propre
session** (une session maître se nomme elle-même). `backlog.js epicmaster --session-title` (mêmes
`--epic`/`--skip`) donne « [XXX · EP#a–#b] <nom de l'epic> » ; appelle l'outil `set_session_title`
avec `session_id: "self"` et ce titre, **avant** le `--live-seed` et la vague 1. Sans cet outil
(autre hôte) : ignore l'étape, sans le signaler.

Puis **sème le plan complet dans la bande** (rien n'est démarré, backlog intact) —
`backlog.js epicmaster --live-seed` avec les **mêmes** `--epic`/`--skip`/`--max-parallel` que le
plan validé, plus `--wave-labels "1=…;2=…"` : un **libellé court par vague** (2 à 4 mots, déduit
des titres de ses US, jamais inventé au-delà — ex. « Socle registre », « Providers TheFork »).
La bande affiche aussitôt epic et vagues (« Vague 2 (#10, #11) · libellé ») ; son bouton **Plan**
ouvre le plan complet (vagues, US, modèle · effort, « fait quand ») dans un panneau.

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
