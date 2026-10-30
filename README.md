[![CI](https://github.com/shwrm-xx/pmz/actions/workflows/ci.yml/badge.svg)](https://github.com/shwrm-xx/pmz/actions/workflows/ci.yml)

> English version: [README.en.md](README.en.md)

# Promptimizer (PMZ)

Système local de gouvernance pour sessions de **vibecoding**, conçu pour **Claude Code
desktop** (macOS). Il s'installe une fois, s'active automatiquement sur tous les projets, et
poursuit trois objectifs :

1. **Économie de contexte** — alerte sur l'occupation réelle du contexte (tokens) par paliers,
   sur le **coût du dernier tour** (tour à +50k tokens, invalidations de cache) et sur le
   **nombre de tours** de la session (rappel à 12, prescription de session fraîche à 20 —
   le coût croît en tours^1,66 à ^1,98), via un message visible **non bloquant** et **non
   réinjecté** dans le contexte du modèle ; seule la prescription de tours est aussi injectée
   au prompt suivant, parce qu'un message non réinjecté ne fait pas agir Claude.
2. **Clôture propre des US** — rappelle vérification ciblée + `CHANGELOG` + commit + handoff ;
   le handoff est écrit dans `.vibe-agent/handoff.md` (auto à chaque fin de tour, riche via
   `/fresh-session`) et **injecté automatiquement au démarrage de la session suivante**.
   Une grosse demande peut être **découpée en US** (`/scope`) en un plan de 2-5 US persistant
   (`.vibe-agent/backlog.json`), **chaque US portant une préconisation de modèle**
   (`haiku`/`sonnet`/`opus` selon une grille nature de l'US → modèle · effort ; Fable n'est
   jamais proposé, seulement posé à la main par l'utilisateur ; réaffichée à chaque `show`/`start`, au resume et dans le handoff — avec
   suggestion `/model` si le modèle diffère, muette pour un runtime tiers) et, si vérifiable par
   commande, une **`verify`** rejouée comme preuve à la clôture (une US sans elle est signalée
   « close sans preuve ») : chaque US est close automatiquement au commit, la suivante est annoncée,
   et le plan survit aux sessions comme à la compaction.
3. **Initialisation prudente des projets** — propose de créer `CLAUDE.md` / `AGENTS.md` /
   `.vibe-agent/` / `CHANGELOG.md`, **uniquement après ta confirmation**, jamais d'écrasement.
   Sur un **projet en cours** qui a déjà ces fichiers, `/init` ajoute la section « Règles
   Promptimizer » taguée en fin de fichier (append-only, idempotent, réversible).

Il fournit aussi un **delta Codex** (`AGENTS.md`) pour porter le même socle de règles.

## Nouveau poste en un double-clic

Prérequis : **Node.js** (et, idéalement, `claude`). Une seule étape par OS, depuis le dépôt ou
l'archive hors-ligne (`package.*`, qui embarque la marketplace : sans build, sans réseau, sans git) :

- **macOS** — double-clic `promptimizer/install/install-plugin.command`
- **Linux** — `bash promptimizer/install/install-plugin.sh`
- **Windows** — `promptimizer/install/install-plugin.ps1` (PowerShell)

L'installeur (`install-plugin.js`, cross-platform) vérifie `node`/`claude`, assemble le plugin dans
un dossier stable `<claudeDir>/pmz-plugin/build`, installe ou met à jour `pmz@pmz-local`, migre
automatiquement une install manuelle existante, puis affiche le verdict doctor. **Sans `claude`**
dans le PATH, repli déclaratif : `extraKnownMarketplaces` + `enabledPlugins` ajoutés à
`settings.json` (append-only, backup, idempotent, réversible avec `--remove`). Au 1er démarrage,
l'accueil propose `/init` et `/statusline` ; `/pmz:doctor` vérifie l'installation sans le dépôt.
Aucun `sudo`. _(macOS 1re fois : si Gatekeeper bloque, clic droit → Ouvrir.)_

## Installation manuelle (secours)

Canal de **secours** (legacy, gelé) : à utiliser si le plugin n'est pas possible.

1. Lance l'installeur selon ton OS (prérequis : **Node.js**) :
   - **macOS** — double-clic `promptimizer/install/install.command`
   - **Linux** — `bash promptimizer/install/install.sh`
   - **Windows** — `promptimizer/install/install.ps1` (PowerShell)

   _(macOS 1re fois : si Gatekeeper bloque, clic droit → Ouvrir, ou retire la quarantaine —
   `xattr -dr com.apple.quarantine promptimizer`. Ce premier lancement active aussi un hook
   git local — `.githooks/post-merge` — qui lève automatiquement la quarantaine sur les
   `.command` du dépôt après chaque `git pull` : le popup ne revient plus.)_
   Toute la logique vit dans `install.js` (stdlib Node, cross-platform) ; les lanceurs
   `.command`/`.sh`/`.ps1` ne font que trouver `node` et l'appeler. L'installeur copie le
   package dans `~/.claude/` (ou `$CLAUDE_CONFIG_DIR`), **sauvegarde** ton `settings.json`,
   fusionne les hooks **sans rien écraser**, et te **propose** de laisser PMZ reprendre le rôle
   d'un éventuel hook `Stop` existant (réversible).
2. Vérifie avec `pmz-doctor.command` / `pmz-doctor.sh` / `pmz-doctor.ps1`.

Aucun `sudo` n'est demandé.

### Installation en plugin Claude Code (alternatif)

PMZ peut aussi s'installer comme **plugin Claude Code natif** (updates/versioning gérés par
Claude Code). Le dossier plugin est **assemblé** depuis la source :

```
node promptimizer/install/build-plugin.js
claude plugin marketplace add dist/marketplace
claude plugin install pmz@pmz-local
```

Vérification : `claude plugin validate dist/marketplace/promptimizer` (voit aussi le module de la
bande epicmaster) puis `claude plugin details pmz` (doit afficher **8 hooks** et les
**15 skills/commandes** ; commandes namespacées `/pmz:*`, ex. `/pmz:about`, `/pmz:scope`). Le nom du
plugin (identifiant technique, pilote le namespace des commandes) est `pmz` ; l'identité
« Promptimizer » reste le nom du projet/produit (description, branding). **Distribution à un tiers**
(entreprise, équipe, communauté) : partager le dossier `dist/marketplace/` (ou un dépôt git
privé) et `marketplace add` en local — zéro réseau externe requis. Pour que chaque poste n'ait
pas à relancer `marketplace add` à la main, référencer la marketplace dans `settings.json`
(user ou projet) via `extraKnownMarketplaces` :

```json
{
  "extraKnownMarketplaces": {
    "pmz-interne": {
      "source": { "source": "url", "url": "https://exemple-git-interne/pmz-marketplace.git" }
    }
  }
}
```

(`source` peut aussi être `"github"` — champ `repo` en `owner/repo` — ou un chemin local, cf. doc
officielle marketplace Claude Code.)

**Canal GitHub public.** Le catalogue est committé à la racine du dépôt
(`.claude-plugin/marketplace.json`, branche `main`) ; il ne contient **aucun** artefact de build :
il déclare le plugin en source `git-subdir` pointant le dossier `promptimizer/` de la branche
`plugin-release`. Côté utilisateur final, une seule commande à retenir :

```
claude plugin marketplace add shwrm-xx/pmz
claude plugin install pmz@pmz-marketplace
```

Sur un **autre poste, pour un autre utilisateur**, c'est tout ce qu'il faut : le plugin `pmz`
embarque tout (hooks, commandes, skill **et** bande epicmaster ; aucun `CLAUDE_CODE_PLUGIN_DIRS`,
aucun second plugin). Forme équivalente depuis la commande interactive :
`/plugin install pmz --marketplace shwrm-xx/pmz`.

**Mise à jour (poste collègue).** À chaque nouvelle version publiée :

```
claude plugin marketplace update pmz-marketplace && claude plugin update pmz@pmz-marketplace
```

Puis redémarrer Claude Code. Ne **pas** relancer `marketplace add` pour mettre à jour : la commande
est refusée quand la source déclarée diffère.

Prérequis : le dépôt doit être **public** (`marketplace add owner/repo` lit le dépôt sans
authentification). Côté mainteneur, publier l'artefact de build à chaque release :

```
node promptimizer/install/publish-plugin.js --push
```

(le script assemble `dist/marketplace/` via `build-plugin.js` puis pousse son contenu seul sur la
branche orpheline `plugin-release` — aucun historique partagé avec `main`). Le catalogue de `main`
n'a pas à être retouché : il suit la branche, et Claude Code sert la nouvelle version dès que
`plugin.json` change de `version` (donc dès que `VERSION` est bumpée).

La branche `plugin-release` porte aussi son propre `.claude-plugin/marketplace.json` (fallback
historique : `marketplace add https://github.com/shwrm-xx/pmz.git#plugin-release`). Les
deux portent le **même nom** `pmz-marketplace` : ce sont deux chemins vers la même marketplace, et
Claude Code n'en enregistre qu'une par nom — ajouter l'un remplace l'autre. Canal recommandé :
`main`.

Les deux canaux (manuel / plugin) sont détaillés dans [ARCHITECTURE.md](ARCHITECTURE.md) ; le
verdict de faisabilité dans [docs/decisions/D1-plugin-go-nogo.md](docs/decisions/D1-plugin-go-nogo.md).

**Migration depuis une install manuelle existante** : `node promptimizer/install/migrate-to-plugin.js`
retire les hooks PMZ legacy de `settings.json` (réutilise `merge-settings.js --remove`, restaure
un éventuel sidecar de prise de relais) pour éviter le double-firing, puis affiche les commandes
d'install du plugin (`--purge` supprime aussi les fichiers PMZ legacy, conservés par défaut).
`doctor.js` détecte et signale une double installation (plugin + canal manuel non retiré).

**Canal manuel : legacy, gelé.** Les lanceurs `install.command`/`.sh`/`.ps1` (et
`uninstall.*`/`pmz-doctor.*`) restent fonctionnels et maintenus a minima, mais le plugin est le
canal recommandé pour toute nouvelle installation — plus d'updates/versioning natifs, plus de
fusion de `settings.json`.

## Vérification

Le doctor reconnaît le **canal** utilisé. En **plugin** (hooks fournis par le plugin, pas par
`settings.json`) :

```
Promptimizer — diagnostic

Version installée : 1.0.0
Claude settings : OK
Canal : plugin
Hooks / skill / commandes : fournis par le plugin
Scripts exécutables : OK
Projet courant : initialisé / non initialisé

Statut : vert
```

En **canal manuel**, les lignes détaillent `Hooks globaux` / `Skill globale`. Un statut
`plugin + manuel (CONFLIT)` signale une double installation à résoudre (`migrate-to-plugin.js`).
Sous le plugin, lance **`/pmz:doctor`** (le doctor est embarqué dans le plugin, aucun dépôt cloné
requis) ; la santé se lit aussi via `claude plugin details pmz`. Au **premier démarrage** après
l'install, un message unique rappelle `/pmz:init` et `/pmz:statusline`.

## Comportement dans Claude Code

- **Au démarrage** d'un projet initialisé : court rappel des priorités.
- **Projet non initialisé** (repo git) : PMZ **propose** l'initialisation ; rien n'est écrit sans
  ton accord.
- **Pendant la session** : confirmation demandée avant une commande destructive
  (`git reset --hard`, `rm -rf <dossier>`…) ; les commandes catastrophiques sont bloquées. Les
  lectures/éditions normales ne sont **pas** ralenties (respect de `acceptEdits`).
- **En fin de tour** : alerte de coût aux paliers de contexte et sur le **coût du dernier tour**
  (tour à +50k tokens ; cache invalidé après une pause vs en plein tour) ; rappel de clôture si une
  US est ouverte sans commit ; si un plan d'US existe, l'US en cours est **close automatiquement
  au commit** et le suivant annoncé. Le **gaspillage de relecture** cumulé (relectures complètes de
  fichiers inchangés) est surfacé aux paliers 25k/50k/100k avec le **top-3 des fichiers coupables**
  (une seule fois par palier, sur toute la vie du projet). À haute occupation avec beaucoup de
  lectures, un nudge invite à **déléguer l'exploration à un subagent** (les lectures restent hors du
  contexte principal). Une commande qui **échoue en rafale** (≥ 3 fois d'affilée, relancée telle
  quelle) déclenche un nudge « change d'approche plutôt que de relancer » (1×/session par commande).
  Un **diff non commité qui grossit** sur plusieurs tours sans commit déclenche un rappel « commit
  (ou clôture) maintenant » — le travail non versionné est exposé à la perte et finit en commit
  monstre (anti-spam par palier ; réarmé au commit). Un **CLAUDE.md projet absent ou hypertrophié**
  (> 10 Ko, rechargé à chaque session) déclenche un nudge « créer / dégraisser » (1×/session).
  Sur les 2 événements les plus graves (zone rouge, clôture d'US), une **notification OS**
  native (mac/linux/win) peut relayer le signal hors du terminal — **opt-in** (`PMZ_NOTIFY=1`
  dans l'environnement), désactivée par défaut.
  Ces rappels visibles portent un **glyphe de sévérité** (ℹ info / ⚠ warn /
  ⛔ alert) pour lire d'un coup d'œil ce qui est normal, ce qui mérite attention et ce qui est
  anormal. Quand un tour en déclenche trop, un **arbitre** n'en garde que les 3 plus sévères
  (ordre de lecture préservé) — pas de pavé qui noie le signal important. L'arbitre borne les
  **constats** ; la **prescription** de fin de clôture (« nouvelle session recommandée maintenant »)
  est émise hors plafond, en dernier : elle n'est jamais évincée.
- **Pendant le tour** : une relecture **complète** d'un gros fichier (≥ 16 Ko) déjà lu et
  inchangé déclenche une note discrète (~60 tokens, plafonnée à 1×/fichier et 3×/session) —
  jamais de blocage, juste un rappel. Si un **résumé** du fichier est connu (lignes
  `pmz:summary: <chemin> — <résumé>` d'un handoff, restituées de session en session dans le
  handoff auto), la note le **sert à la place de la relecture** ; un fichier modifié perd
  aussitôt son résumé (jamais de résumé périmé).
- **Borne d'occupation** (réglable par projet) : par défaut, PMZ n'alerte « zone rouge » qu'à
  l'approche de l'auto-compact (85 % de la fenêtre du modèle — soit ~850k sur une fenêtre de 1M,
  donc rarement atteint). Pour être averti **plus tôt**, décommente une ligne dans
  `.vibe-agent/rules.yaml`, bloc `budget:` :
  `red_zone_tokens: 350000` (borne absolue en tokens) ou `red_zone_ratio: 0.35` (fraction de la
  fenêtre du modèle). Au franchissement, `stop.js` prescrit la clôture **y compris en milieu 
  d'US** — commit intermédiaire + `/fresh-session`, l'US reste ouverte et le handoff la reprend —
  avec l'occupation courante et ce que coûterait une compaction en regard. Clé absente ou valeur
  aberrante → seuil historique inchangé.
- **Budget de tours par session** (actif par défaut) : l'occupation ne dit pas tout — une session
  peut rester à basse occupation et coûter cher quand même, parce que le coût croît en
  **tours^1,66 à ^1,98** (mesuré : scinder une session en deux coûte ~37 à 49 % de moins à travail
  égal). À **12 tours**, un rappel ⚠ visible invite à viser un point de commit ; à **20 tours**, PMZ
  **prescrit** la session fraîche (⛔, hors plafond de l'arbitre) et **injecte la consigne à Claude**
  au prompt suivant — amener l'US à un point de commit, puis proposer la clôture. Rappel ensuite
  tous les **+10 tours** : une session marathon ne devient jamais muette. Les deux seuils se
  déplacent dans `.vibe-agent/rules.yaml`, bloc `budget:` :
  `warn_after_session_turns: 12` et `recommend_fresh_session_after_turns: 20` (3 à 500 ; hors bornes
  → défaut). Pour l'éteindre, une clé et une seule — `turn_budget: off` : aucun nombre ne peut
  désactiver un garde-fou par accident de frappe.
- **Frein sur la sortie relue** (actif par défaut) : le budget de tours dit *combien* de tours,
  pas ce qu'ils *coûtent* à relire — une sortie longue (dumps, réponses verbeuses) est réinjectée
  dans le contexte à chaque tour suivant via le cache. Quand la sortie cumulée dépasse **30000
  tokens ET** sa moyenne par tour dépasse **1500**, un nudge ⚠ 1×/session rappelle de livrer le
  code dans les fichiers et de garder des réponses courtes. Pas de rappel flottant (contrairement
  au budget de tours) : c'est un style à corriger, pas une action à répéter. Seuils réglables dans
  `.vibe-agent/rules.yaml`, bloc `budget:` : `warn_after_output_tokens: 30000` et
  `warn_after_output_per_turn: 1500` ; extinction par `output_budget: off`.
- **Budget de la verify de clôture** (réglable par projet) : la commande `verify` de l'US est
  rejouée par `/close-batch` et par `backlog.js done` avec un délai de **300 s** par défaut. Une
  suite qui dépasse ce budget est rendue « non terminée dans le délai » et le verdict `timeout`
  est **persisté** — donc une suite verte finit archivée comme non prouvée. Si la suite du dépôt
  s'en approche, pose sa propre borne dans `.vibe-agent/rules.yaml`, bloc `budget:` :
  `verify_close_ms: 600000` (millisecondes, de 1 s à 1 h ; hors bornes → défaut). L'auto-clôture
  du hook `Stop` garde son délai court, non réglable : c'est un hook, il ne doit jamais pendre.
- **Occupation déjà haute** : au-delà de 500k tokens, un rappel court (2 lignes) est ajouté au
  prompt suivant (plafonné 1×/palier) ; à la **reprise** d'une session déjà chargée (≥ 300k),
  un message visible (zéro token ajouté au contexte) le signale sans attendre la fin du tour.
- **Plan d'US durable** : `.vibe-agent/backlog.json` est versionné par défaut (un
  `.vibe-agent/.gitignore` ignore l'état éphémère mais garde le plan), et stagé à chaque écriture —
  il ne se perd plus entre deux sessions. Un plan reste **corrigeable** : `backlog.js depends --id N
  --depends "2,3"` réécrit les dépendances d'une US après coup, et `backlog.js reopen --id N --note
  "raison"` rouvre une US close à tort (repassé « à faire », trace de clôture effacée et raison
  archivée) — plus besoin d'éditer le JSON à la main, hors de toute garde. Le nombre de
  réouvertures est exporté (colonne `reopened` du CSV/Markdown) : une US reprise deux fois cesse de
  se lire comme une US passée du premier coup.
- **Pointeur de spec** : une US peut référencer une **spec détaillée** (champ `spec`, ex-`us`,
  renommé le 2026-10-12 depuis que « US » désigne l'item du backlog) — **pointeur seul, jamais
  le contenu**. C'est un fichier du dépôt (gabarit `promptimizer/templates/spec-template.md` :
  récit persona/besoin/bénéfice, critères d'acceptation vérifiables, hors périmètre, preuve de
  clôture) posé via `backlog.js add --spec docs/us/US-42/spec.md` — chemin **vérifié à l'ajout** (un
  pointeur mort est refusé ; `--us` reste accepté comme alias déprécié). Pas de spec sous la main ?
  `backlog.js spec --id N --new` **écrit** le fichier depuis le gabarit (titre et epic de l'US déjà
  remplis) et le rattache à l'US ; il refuse d'écraser un fichier existant, et
  `spec --id N --set <chemin>` rattache une spec écrite ailleurs. Sans flag, `spec --id N` affiche
  juste le pointeur (`[Spec : …]`). Il se
  retrouve partout où on trace : `show`, export CSV/Markdown, fiche d'archive. (Un pointeur
  Jira a existé un temps, retiré faute de connectivité réelle derrière — cf. ARCHITECTURE.md,
  décision « Frontière Jira : écarté ».)
- **Après un `/clear` ou une compaction** : le handoff (ou l'US en cours) est réinjecté —
  le plan ne se perd pas.
- **Vagues parallèles fiables** : quand plusieurs sessions travaillent le même dépôt, chacune a son
  propre handoff (`handoff-lot-<id>.md`) — plus de dernier-écrivain-gagne qui remplaçait l'état
  d'une US par celui d'une autre. Le registre de vague s'écrit **par commande**
  (`backlog.js fleet join | ready | leave | show`) et non à la main : un `fleet.json` cassé désactivait
  toute la vague en silence, `fleet show` le dit maintenant, et `fleet leave --id N` permet à une
  session de se désinscrire (l'US reste au plan) sans attendre une réintégration qu'elle ne veut
  pas. Une fois la vague réintégrée, tout est
  **rangé** (registre vidé, handoffs d'US purgés) et chaque `reintegrate --execute` laisse un
  **rapport** dans `.vibe-agent/logs/` — plan, gates rouges, changelog agrégé — que le crash d'une
  session ne peut plus emporter.
- **Archive des US closes, à tiroirs** : la mémoire longue du projet, **jamais réinjectée** dans le
  contexte — l'historique ne coûte rien tant qu'on ne l'ouvre pas, et on n'ouvre qu'un tiroir à la
  fois. Chaque clôture ajoute une ligne à `.vibe-agent/archive/index.md` (id, date, sha, epic,
  verify, titre — versionné, greppable) et `/close-batch` fait rédiger une **fiche**
  `archive/lots/lot-NNNN.md` : décisions **et pourquoi**, vérifié / non vérifié, dette. Versionnée
  et immuable une fois posée — seule exception, une réouverture d'US y **ajoute** une ligne en
  pied (« rouvert le …, raison ») sans rien réécrire ; ni diff ni listing de code (le sha et le
  CHANGELOG font foi pour le volatil). Le brut intégral (`archive/raw/`, local, non versionné) garde le handoff manuel et les
  retours de sous-agents avant leur destruction.
  Consultation : `/pmz:archive` (index), `/pmz:archive 57` (la fiche de l'US#57), le brut seulement
  sur confirmation explicite. Rétro-remplir un projet existant :
  `node ~/.claude/promptimizer/scripts/archive.js backfill --dry-run` puis sans `--dry-run`.
- **Moteur de mesure de session** (manuel, aucun hook ne l'appelle) : les nudges de session
  raisonnent sur le *dernier* tour ; ce moteur mesure une session **entière**, ou une fenêtre de
  sessions, pour savoir où part réellement l'argent. Cinq indicateurs : **préfixe** (le plancher
  payé à chaque tour avant toute conversation), **occupation** (médiane / p90 / max),
  **accrétion** (tokens/tour — à quelle vitesse la session s'alourdit), **décomposition du
  cache-read** en 4 postes (préfixe rejoué · sortie de l'IA relue · résultats d'outils · prompts et
  injections), et **loi d'échelle** `coût ∝ tours^k`. Le contre-intuitif que ça sort : la sortie de
  l'IA elle-même pèse plus lourd que les fichiers lus, et `k > 1` — scinder une session en deux
  coûte moins cher que la laisser courir. La décomposition affiche son propre contrôle de validité
  et **avertit** quand ses parts ne sont plus que des plafonds (compaction, raisonnement étendu).

  ```bash
  node ~/.claude/promptimizer/scripts/metrics.js --sessions 20
  ```

  Sans argument : la session la plus récente. `--json` pour une sortie machine, `--transcript <p>`
  pour un transcript précis, `--cwd <p>` pour un autre projet, `--all` pour tout l'historique.
  Sort toujours en code 0 : sans transcript, l'échec est une valeur (`{"ok":false,…}`), jamais une
  erreur qui casse l'appelant.

## Slash commands (secours)

`/init` · `/scope` · `/maquette` · `/epicmaster` · `/pickymaster` · `/parallelize` · `/reintegrate` · `/budget` · `/check-context` ·
`/close-batch` · `/fresh-session` · `/archive` · `/dashboard` · `/rtk` · `/about` · `/help` ·
`/statusline`

`/maquette` **(v2.10.0)** propose écrans × états × tailles en **une question** avant toute écriture,
puis génère des maquettes HTML autonomes (zéro CDN, bascule mobile 375 / desktop, 4 états) dans le
**dossier de l'US** (`docs/us/US-<id>/` : `spec.md` + `maquettes/*.html`, index `maquettes/INDEX.md`) via `scripts/maquette.js` (`new`/`link`/`validate`/`open`/`list`,
refus d'écrasement) ; `link` ajoute une section « Maquettes » à la spec de l'US. `/scope` statue
« écrans : oui/non » par US et propose une US « Maquettes » en vague 1 ; `/epicmaster` remonte les
« maquettes à valider » en à-trancher et impose aux sous-agents de suivre les maquettes liées.
**Garde-fou (v2.12.1)** : une US à écrans ne part jamais en parallèle de l'US « Maquettes » de son
epic (dépendance implicite), n'est lancée qu'après validation humaine, et la relecture opus compare
maquettes ↔ UI livrée.
Toute fin de production de maquettes lance `maquette.js index` et **restitue le lien cliquable de
l'index** (`docs/us/maquettes-index.html` + URL `file://`) — « maquettes prêtes » seul est interdit ;
dans `/epicmaster` / `/pickymaster`, l'index ouvre la liste « maquettes à valider » (US#163).

`/epicmaster` **(session maître)** lance **toutes les US ouvertes** du backlog — une epic ou
plusieurs — en **sous-agents**, chacune au **modèle + effort préconisés** par l'US, après **une**
confirmation (US classées par epic, **toutes cochées par défaut**, décochables). Le plan est calculé par
`backlog.js epicmaster` : vagues (périmètres disjoints en parallèle, US sans périmètre seules en
vol), **parallélisme borné** (plafond 4, réglable) **et** budget de contexte du maître (au plus N US
par session maître, découpe en sessions successives au-delà), modèle préconisé pour le maître
lui-même. Le maître ne relit jamais la sortie brute d'un sous-agent (rapport ≤ 250 mots, sections
fixes), commite **par périmètre**, clôt chaque US avec verdict de verify persisté, et termine par
un **handoff consolidé** portant la **dette** et ce qui reste **à trancher**. `/scope` se termine
**systématiquement** par la préparation de cette session maître (handoff maître écrit, injecté à la
session fraîche suivante) et ne démarre plus d'US lui-même.

`/pickymaster` est la variante **sélective** : même moteur que `/epicmaster`, mais le plan est proposé
avant lancement (cases précochées, décochables) au lieu d'être lancé en direct. **Maître sonnet** :
le maître orchestre (il ne raisonne pas sur le code), il tourne donc en `sonnet` / effort `medium`
quel que soit le modèle des US (plus de contagion opus). **Pipeline glissant** : pas de barrière de
vague, dès qu'un rapport arrive le maître le traite et lance aussitôt la ou les US éligibles
suivantes (dépendances closes, périmètre libre, parallélisme borné). **`close-wave`** :
`backlog.js close-wave --stdin` clôt une vague en UN appel (commit borné aux chemins, `done`,
fiche d'archive, CHANGELOG ; `--dry-run` pour prévisualiser ; verify rouge = pas de commit, US
rouverte). Désinstallation : `uninstall.js` retire aussi `commands/pickymaster.md`.

**Qualité epicmaster** (US#160-#161) : en consolidation, si ≥ 2 US sont closes, le maître lance
**une seule** relecture `opus · medium` par session (`backlog.js epicmaster --review-brief --ids …` :
diff cumulé + « Non vérifié » agrégés, lecture seule, rapport ≤ 250 mots) ; ses constats vont en
Dette / À trancher, jamais corrigés d'office. Mesure : `add --regression-of <id>` marque une US
ouverte pour un bug d'une US close ; `show --quality` donne par modèle et modèle · effort les closes,
réouvertures, régressions et le taux ; `export` porte la colonne `regression_of`.

**Bande epicmaster** (US#136-#138) : pendant la session maître, une bande live affiche les
sous-agents en vol / terminés (`EM ▶n ✔n ⚙n` dans la statusline ; `backlog.js epicmaster --live`
en CLI). Le mod `promptimizer/mods/epicmaster-band/` (panneau Claude Code) est déployé par
`install.js` vers `~/.claude/promptimizer/mods/` (le dossier `.claude-plugin/types/` généré par le
moteur est exclu) et **chargé automatiquement** (US#139) : l'install manuelle ajoute son dossier à
`env.CLAUDE_CODE_PLUGIN_DIRS` de `~/.claude/settings.json` (liste séparée par `:` / `;` selon
l'OS ; append-only, valeur tierce préservée, idempotent ; valable CLI et app desktop). Canal
plugin (US#140) : la bande est **embarquée dans le plugin `pmz`** (un seul plugin, pas de second
plugin à installer) — `build-plugin.js` fusionne le module dans le `hooks/hooks.json` du plugin ;
`migrate-to-plugin` retire alors l'entrée `CLAUDE_CODE_PLUGIN_DIRS` (évite un double chargement).
L'install manuelle enregistre aussi
`SubagentStart`/`SubagentStop` (tagué, réversible) ; retrait : `uninstall` (hooks + entrée
`CLAUDE_CODE_PLUGIN_DIRS`, seule la nôtre) puis suppression de `~/.claude/promptimizer/`.
Bande absente ? **`/epicband`** l'affiche à la demande (plan le plus récent du projet, sans appel au
modèle) ; `/epicband plan` ouvre aussi le panneau du plan, `/epicband off` la retire.
Fichier live (US#141-#142) : `backlog.js epicmaster --live-seed` sème le **plan complet**
(epic, vagues, US en attente) ; `note --id N --note "…" --decide` ajoute la décision à
`to_decide` (« N à trancher » dans la bande) ; `done --id N --tokens <réels>` remplace l'estimation
du plan par les tokens réels du sous-agent (`tokens_basis: measured`) ; `done --verify-verdict
failed` passe l'US en rouge. `/epicmaster` enchaîne ces quatre gestes.

`/about` affiche la version installée de PMZ (`promptimizer/VERSION`, historisée dans
`CHANGELOG.md` à chaque évolution) ainsi que l'epic et l'US en cours du projet courant.

`/help` liste toutes les commandes disponibles avec leur description, **dérivée des fichiers
`commands/` réellement installés** (jamais une liste codée en dur) : sur le canal plugin,
`doctor` et `statusline` y figurent aussi (livrées dans le plugin depuis l'US#144).

`/statusline` **(opt-in)** pose la barre d'état PMZ dans `settings.json` :
`PMZ v<version> · <epic> · US#<id> <titre> · <faits>/<total> · ctx <occupation>` (occupation
temps réel). Posée **uniquement sur demande explicite** ; **jamais** si une `statusLine` tierce
existe (préservée) ; retrait propre via la même commande (`--statusline-remove`) et à la
désinstallation. Un redémarrage de session peut être nécessaire pour l'affichage.

`/budget` et `/check-context` chiffrent leur statut vert/orange/rouge en **tokens réels**
(occupation courante du contexte + gaspillage de relecture), avec repli annoncé sur le comptage
de relectures quand l'occupation token n'est pas encore connue. `/budget` affiche aussi le
**hitRate cache** du dernier tour quand il est connu, et un **diagnostic enrichi** (US#113) quand
un transcript exploitable existe pour la session courante : le **coût marginal réel d'un token de
sortie écrit maintenant** (émission + relecture future projetée jusqu'à la borne de zone rouge du
projet, avec alerte si la relecture pèse déjà plus lourd que l'émission), et la **ventilation du
préfixe** en CLAUDE.md / skills / reste (système + outils + MCP, non isolable séparément —
Claude Code ne journalise pas le system prompt ni les schémas d'outils dans le transcript local).

`/dashboard` génère `.vibe-agent/dashboard.html`, un tableau de bord **autonome** de l'économie de
contexte du projet. La page **s'ouvre sur une synthèse** orientée usage — **Constat / Garder /
Améliorer / Arrêter**, puis **3 bons points** et **3 points d'attention**, chacun avec le chiffre
qui l'a déclenché et son seuil. Le détail technique est au **second niveau**, derrière un pli
(`<details>` natif, aucun script) : occupation (médiane / p90 / max) et préfixe, décomposition du
coût (cache-read en 4 postes), accrétion tokens/tour, loi d'échelle `coût ∝ tours^k`, **3
recommandations chiffrées** classées par argent récupérable, sessions les plus chères, gain RTK par
US. La synthèse ne mesure rien de neuf : elle dérive des mêmes indicateurs, par seuils nommés
(`lib/dashboard-synthesis.js`), et une métrique absente ne produit **aucun** signal — la promesse
de 3 + 3 est tenue par un encadré neutre qui dit l'insuffisance de mesure. Les montants s'affichent **en euros** (taux $→€
statique de `lib/metrics.js`, réserve rappelée au footer), avec l'équivalent en tokens à côté ;
le mode `--json` conserve le coût USD brut (`cost`) et ajoute `costEur`/`tokensTotal`. La page ne
fait **aucune requête réseau** et suit le thème clair/sombre du système. Options : `--sessions N`
(défaut 20), `--all`, `--out <chemin>`, `--stdout`, `--json`. Mesure **hors bande** (balayage
complet des transcripts) : à la demande uniquement, jamais depuis un hook — d'où une commande et
non un nudge.

Chaque auto-clôture d'US émet **une seule carte** : US close, avancement du plan, coût réel 
de l'US, durée, relectures évitées, US suivante — et, à la clôture de la **dernière US d'une epic**, le
**bilan chiffré** de l'epic (nombre d'US, coût total, coût moyen/US, durée) comme ligne de plus.
Une US en cours commitée dans une **autre session** que celle qui l'a démarrée est close quand même
(arbre propre + une seule US en cours + un commit depuis son démarrage).

_Après une mise à jour du package, relance l'installeur (`install.command`/`.sh`/`.ps1`) puis
redémarre Claude Code : les matchers de hooks ne s'appliquent qu'à la réinstallation._

## Pause / désactivation

- **Mettre PMZ en pause** sans désinstaller : exporte `PMZ_DISABLE=1` dans l'environnement
  d'où tu lances Claude Code — chaque hook sort immédiatement (`exit 0`) en première ligne.
  Retire la variable pour réactiver.
- **Couper juste la note de relecture redondante** (le reste de PMZ continue de tourner) :
  `PMZ_NO_ADVISORY=1`.
- **Bridge RTK** (compression des sorties de commande via l'outil externe [RTK]) : **désactivé par
  défaut**. Opt-in en exportant `PMZ_RTK_ENABLE=1` (et en ayant `rtk` installé) — PMZ fait alors
  transiter les commandes Bash **jugées sûres** par `rtk rewrite`, la sécurité PMZ restant
  prioritaire (une commande dangereuse n'est jamais réécrite). Sans la variable, aucun surcoût.
  Activation guidée + diagnostic via `/pmz:rtk [status|enable|disable|migrate]`. À la clôture d'une
  US, le bilan affiche le **gain RTK avec son niveau de preuve** (compteur local de commandes
  réécrites, ou rien si aucune activité — jamais de valeur inventée).
- **Fallback de sortie volumineuse** (filet générique quand RTK est absent) : une sortie de commande
  Bash **très longue** (> 300 lignes) est réduite avant d'entrer dans le contexte (dédup, en-tête,
  lignes d'erreur et fin conservées), la **sortie complète étant toujours stockée** sous
  `.vibe-agent/logs/` (chemin affiché). Les sorties courtes et les erreurs sont **intactes** ; inactif
  si le bridge RTK est actif (pas de double traitement). Désactivable via `PMZ_OUTPUT_FALLBACK_DISABLE=1`
  (seuil réglable par `PMZ_OUTPUT_FALLBACK_LINES`).
- Les hooks sont chargés au **démarrage** de Claude Code : après (dés)installation, **redémarre**
  l'app pour appliquer les changements.

## Désinstallation

Lance `promptimizer/install/uninstall.command` (macOS) / `uninstall.sh` (Linux) /
`uninstall.ps1` (Windows) — retire **uniquement** les hooks PMZ, propose de restaurer l'ancien
hook, ne touche jamais à tes projets.

## Déclinaison OpenCode (epic « PMZ OpenCode » — complet)

PMZ se décline pour [OpenCode](https://opencode.ai) : plugin + **8 commandes `/pmz`**, libs cœur
partagées (backlog, handoff, ledgers), état projet `.vibe-agent/` **commun** aux deux outils.
Install : `node opencode/install/install-opencode.js` (cible `~/.config/opencode`, option
`--target` pour un bac à sable) ; diagnostic : `doctor-opencode.js` ; retrait :
`uninstall-opencode.js`. Doctrine, mapping des hooks et gaps assumés (statusline) :
[`opencode/NOTES.md`](opencode/NOTES.md). Portage complet (lots OC1–OC4) : sûreté Bash +
ledgers ; occupation **relative à la fenêtre du modèle** (paliers 50/70/85/95 %, toasts aux
franchissements) ; équivalent Stop à `session.idle` (auto-clôture + handoff) ; injection
différée au (re)démarrage + renommage de session ; les 8 commandes `/pmz`
(`about`/`help`/`init`/`check-context`/`budget`/`scope`/`close-batch`/`fresh-session`) ; nudges
init/broad/model-mismatch au `chat.message` avec résolution locale du `model_hint`. Gaps v1
assumés : statusline (aucune API OpenCode), filet `ask` sans contrôle de permission actif.

## Confidentialité et sécurité

PMZ tourne en local, sans réseau ni télémétrie. Ce que lit et écrit chaque hook (les huit
événements) est détaillé dans [docs/PRIVACY.md](docs/PRIVACY.md) ; pour signaler une faille ou un
écart, voir [SECURITY.md](SECURITY.md).

## Pour les contributeurs

Ce dépôt est la **source** du package. Voir [CLAUDE.md](CLAUDE.md) (règles) et
[ARCHITECTURE.md](ARCHITECTURE.md) (contrat technique). Spec d'origine dans [`mwn/`](mwn/).
