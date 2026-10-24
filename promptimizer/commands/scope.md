---
description: Découpe une grosse demande en 2-5 US persistées (.vibe-agent/backlog.json)
allowed-tools: Bash(node *), Bash(git *)
---

Découpe la demande courante en un plan d'US persistant.

Rappel de découpe : **1 US = 1 session sous ~300k tokens, 1 commit, un critère « fait
quand : … » vérifiable** — au-delà, redécouper plutôt que grossir une US.

Étapes :
1. Reformuler la demande en **2 à 5 US** : un titre court + un critère « fait quand : … »
   par US. Une US = une **unité livrable** (1 commit cohérent), pas une étape d'exécution
   (les étapes fines restent dans la todo-list, capturée automatiquement).
   Pour **chaque** US, préconiser un **modèle** **et un effort de raisonnement**
   (`low` | `medium` | `high` | `xhigh`) — les deux sont obligatoires, jamais omis — en
   prenant la **première ligne qui s'applique** de cette grille (au doute entre deux lignes,
   la plus haute) :

   | Nature de l'US | Modèle · effort |
   |---|---|
   | Machine à états multi-couches, état async, sécurité, migration de données, UI existante fragile — fort risque de régression | `opus` · `high` |
   | Jugement, design, rédaction : prompts, copywriting, choix visuels, passe de parité UI, architecture de portée limitée | `opus` · `medium` |
   | Logique métier non triviale ou plomberie multi-fichiers, spec nette | `sonnet` · `high` |
   | Plomberie bien spécifiée : CRUD, mapping, tables, config, câblage simple, tests d'une logique existante | `sonnet` · `medium` |
   | Retouche triviale entièrement spécifiée : texte, constante, renommage, doc factuelle — aucun risque de régression | `haiku` · `low` |

   `xhigh` ne se propose que pour une décision d'architecture structurante ou un débogage sans
   piste, raison donnée en quelques mots. Le hint est le **nom de famille** (`opus`, `sonnet`,
   `haiku`), joignable par `/model` ; gamme courante : Opus 5.5, Sonnet 5.5, Haiku 5.5.
   **Fable n'est jamais proposé** — ni par cette grille ni au titre d'une autre instruction
   (CLAUDE.md global compris) : c'est un choix **réservé à l'utilisateur**. Ne poser
   `--model fable` que s'il le demande explicitement pour une US donnée.
   Si ce découpage porte une **feature/epic** identifiable, proposer aussi un **nom de plan
   court (≤ 3 mots, cap 60 caractères)** — c'est lui qui nomme le plan dans le titre de
   session (`[XXX · US#Y] NomDePlan · résumé` — `#Y` = id backlog global, seul numéro
   affiché) ; sinon l'omettre (epic = label optionnel, la session s'affichera
   `[XXX · US#Y] résumé`).
   **Penser la parallélisation d'office** : pour **chaque** US, statuer explicitement —
   soit un **périmètre** proposé (globs de chemins que cette US a le droit de modifier),
   soit « série » avec la raison en quelques mots (périmètre incertain, chevauchement
   inévitable avec une autre US, ordre imposé…). Jamais de silence sur ce point ; le
   garde-fou anti-invention demeure : ne **jamais** deviner un périmètre incertain — au
   doute, « série » assumé et annoncé (l'US reste périmètre-vide, séquentiel classique).
   Si un ordre s'impose entre US, poser un `depends_on` (id des US qui doivent être
   clos avant).
   **Statuer enfin « écrans : oui/non »** pour **chaque** US (une US produit des écrans si elle
   crée ou modifie une page, un formulaire, une modale, un composant visible…). Si au moins une
   US produit des écrans : préparer la **liste des écrans à maquetter** (un slug + un titre par
   écran, proposition d'abord comme `/maquette`) et l'US dédiée « Maquettes — <epic> » (modèle
   et effort préconisés, « fait quand : maquettes produites et liées aux specs des US à écrans »,
   déroulant `/maquette`), qui compte alors dans les 2 à 5 US. Aucune US à écrans : rien à
   proposer, ne pas en parler.
   **Statuer aussi sur la spec** pour **chaque** US : soit un chemin de fichier de spec existant,
   soit « pas de spec » assumé, soit une spec **à créer** — dans ce dernier cas, **rédiger tout de
   suite** son contenu (gabarit `templates/spec-template.md` : récit persona/besoin/bénéfice,
   critères d'acceptation numérotés et vérifiables, hors-périmètre **et pourquoi**) à partir de
   la demande, pour validation à l'étape 2 en même temps que le découpage. Jamais de silence sur
   ce point, même règle que le périmètre. Ne **jamais** deviner ou halluciner un chemin de
   fichier existant, ni inventer un critère hors de ce que la demande couvre.
2. Faire valider le découpage, les modèles préconisés, l'epic éventuel, le périmètre/les
   dépendances proposés, **le statut spec de chaque US et le contenu rédigé des specs à créer**
   par l'utilisateur en **UNE** question (pas dix). Si des US produisent des écrans, **cette même
   question** présente la liste des écrans à maquetter et demande « on maquette ? » (oui / non).
3. Si un epic a été validé, l'enregistrer — **toujours**, même s'il était déjà posé par un
   découpage précédent : `node ~/.claude/promptimizer/scripts/backlog.js epic --set "Nom de l'epic"`
   (écrit `.vibe-agent/epic`, cap 60 caractères). C'est aussi ce qui marque la session courante
   comme **session de conception** : la session suivante la titrera `[XXX · Plan] Nom de l'epic`.
4. Persister chaque US validée (un appel par US), avec sa préconisation de modèle, son
   effort, si présent l'epic, et si validé son périmètre/ses dépendances :
   `node ~/.claude/promptimizer/scripts/backlog.js add --title "…" --scope "fait quand : …" --model sonnet --effort medium --verify "npm test" --epic "Nom de l'epic" --perimeter "src/a/**" --depends 12 --spec "docs/us/US-42/spec.md"`
   (`--model` est **obligatoire** — l'ajout est refusé sans lui ; `--effort` doit valoir
   `low`/`medium`/`high`/`xhigh` sinon l'ajout est refusé ; `--epic` reste optionnel ;
   `--perimeter`/`--depends` répétables, optionnels, omis si aucun périmètre net).
   **`--verify` dès que l'US est vérifiable par une commande** (test, typecheck, build,
   lint…) : c'est la preuve rejouée à l'auto-clôture. Une US posée sans elle sera « close sans
   preuve » — à réserver aux US réellement non vérifiables par commande (doc, choix visuel).
   Elle est éditable après coup : `backlog.js verify --set "…" --id <id>`.
   **Maquettes** : sur **oui**, persister d'abord l'US « Maquettes — <epic> » **en vague 1**
   (sans `--depends`, périmètre `docs/us/**`), puis poser `--depends <id Maquettes>` sur
   **chaque** US à écrans (en plus de leurs autres dépendances) ; les écrans validés à l'étape 2
   figurent dans le « fait quand » ou la spec de l'US Maquettes. Sur **non** : n'ajouter aucune
   US ni dépendance, et **noter le choix** (« maquettes écartées ») dans le handoff écrit à
   l'étape 5.
   **`--spec` uniquement si le fichier existe déjà** (`--us` : alias déprécié) : l'ajout est
   **refusé** si le chemin est introuvable (garde d'existence, aucun pointeur mort accepté) ;
   omis si la spec n'a pas été statuée à l'étape 1. Pour une US dont la spec a été rédigée et
   validée à l'étape 2 mais **pas encore écrite** : `backlog.js spec --id <id> --new` (pose le
   fichier de spec depuis le gabarit et rattache le pointeur ; refuse d'écraser un fichier existant), puis **écrire
   aussitôt** (outil Edit) le contenu rédigé et validé dans ce fichier, à la place des
   placeholders du gabarit.
   Un fichier de spec déjà écrit ailleurs se rattache après coup : `backlog.js spec --id <id> --set
   "docs/us/US-42/spec.md"`.
5. **Préparer la session maître — systématique, dès qu'une US est persistée** :
   `node ~/.claude/promptimizer/scripts/backlog.js epicmaster --epic "Nom de l'epic" --write-handoff`
   (sans `--epic` si aucun n'a été posé). Le script calcule et le handoff maître est **écrit**
   dans `.vibe-agent/handoff.md` (marqueur manuel) — il sera **injecté automatiquement** au
   démarrage de la prochaine session fraîche. Restituer la sortie **telle quelle**, sans la
   paraphraser : US embarquées par epic (toutes cochées), **vagues** (périmètres disjoints en
   parallèle, US sans périmètre seules en vol — le calcul de parallélisation est fait là,
   `/parallelize` n'a plus à être appelé ici), **parallélisme max**, **budget de contexte** du
   maître (au plus N US par session maître, nombre de sessions maîtres si le plan dépasse) et
   **modèle · effort préconisés pour la session maître**. Le verdict de parallélisation est
   **toujours visible** — jamais de silence ; n'invente aucune vague absente de la sortie.
6. **Ne démarrer aucune US dans cette session** : elle est une session de conception (titrée
   `[XXX · Plan] Nom de l'epic`). Conclure en **trois lignes** : (1) « ouvre une session fraîche
   avec `/model <modèle maître>` » ; (2) « le handoff maître y sera injecté ; lance `/epicmaster`
   (ou `/pmz:epicmaster`) : il confirme la liste des US — toutes cochées, décochables — puis lance
   chaque US en sous-agent au modèle préconisé et consolide dette / à trancher en handoff » ;
   (3) le nombre de sessions maîtres prévu si > 1.
   **Exception, sur demande explicite seulement** : si l'utilisateur veut traiter la 1ʳᵉ US
   lui-même ici, ou ouvrir de vraies sessions filles (vague D3, `/parallelize` + `fleet join`),
   `backlog.js start --id <id>` comme avant et ne traiter **que** cette US. Le handoff maître
   écrit à l'étape 5 reste valable pour les US restantes.

Le suivi est ensuite automatique : la session maître clôt chaque US au commit
(`done --verify-verdict`), le handoff porte l'avancement (x/y faites), le plan est réinjecté au
démarrage suivant et après compaction. Hors session maître, le hook Stop clôt l'US au commit
et `/close-batch` la marque faite s'il ne l'a pas déjà fait.

La préconisation de modèle et l'effort sont **réaffichés** à chaque `show`/`start`/`next`
et dans le handoff auto (`[modèle : … · effort …]`) — pense à basculer de modèle/effort
avant d'attaquer une US.
