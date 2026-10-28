# Audit `/epicmaster` : tokens, parallélisation, modèles

Le 2026-10-28. Périmètre : cocina, craftmcp et ecpv3, du 2026-10-09 (arrivée de `/epicmaster`, commit 25bd658) au 2026-10-28.
Données : les transcripts Claude Code (sessions et sous-agents) et les `backlog.json`. Tous les chiffres sont rejouables avec [`audit-epicmaster-tokens.js`](audit-epicmaster-tokens.js).

## 1. Synthèse

**Constats**

1. **Le parallélisme est en grande partie théorique.**
   - Aucun message n'a lancé plus d'un sous-agent : 183 lancements sur 183 sont isolés.
   - 57 % des lancements se font au premier plan, donc bloquants.
   - Dans **26 sessions maîtres sur 44**, il n'y a jamais eu plus d'un sous-agent en vol. La plupart des vagues tournent en série.
2. **Opus est le modèle par défaut partout.**
   - 76 % des US prescrites en opus (163 sur 208), dont 120 en `opus·high`.
   - Les sous-agents en opus représentent 94 % du cache read des sous-agents.
   - Haiku n'est jamais utilisé.
   - La session maître passe en opus dès qu'une seule US l'est.
3. **Chaque agent paie un socle de 73 à 75k tokens avant de commencer à travailler.** Ce socle est relu à chaque tour : contexte médian de 125k par tour, sur une médiane de 28 à 36 tours par US.
4. **Quelques gros dérapages pèsent lourd.**
   - Deux sous-agents craftmcp (boucles Blender/vectorcraft, plus de 300 tours, jusqu'à 720k de contexte) consomment 250 M, soit **34 %** de tous les sous-agents craftmcp.
   - Côté cocina, 4 US de 116 à 147 tours (#156 à #159) consomment 134 M.
5. **Le plus gros poste de cocina n'est pas epicmaster.**
   - Ce sont des sessions interactives marathon en opus (musique, sons, deck) : 160 à 366 tours, contexte jusqu'à 460k.
   - Les 5 plus lourdes cumulent 337 M de cache read, soit plus que **toutes** les sessions maîtres epicmaster de cocina (235 M).

**Leviers, par gain**

| Levier | Gain estimé | Famille | US |
|---|---|---|---|
| Sonnet par défaut, grâce à un découpage mieux cadré (opus réservé à une conception courte) | 25 à 35 % de la facture des sous-agents | A | #154, #153 |
| MCP activés par projet (socle ramené de 75k à environ 40k) | Environ 25 % du cache read, sur **tous** les agents | B | config |
| Lancement groupé et pipeline glissant | Durée d'un epic divisée par 2 à 3, à coût égal | A | #155 |
| Plafond de tours/contexte et séparation des boucles visuelles | Évite des dérapages à plus de 100 M | A + B | #153 |
| Sessions interactives découpées, compactées, en sonnet | Plusieurs dizaines de M par session marathon | B | usage |

## 2. Données

### Volumes (2026-10-09 → 2026-10-28)

| | cocina | craftmcp | ecpv3 |
|---|---|---|---|
| Sessions principales (dont epicmaster) | 98 (27) | 32 (13) | 0 |
| Sous-agents (dont US) | 213 (127) | 65 (61) | 0 |
| US créées depuis le 09/10 | 144 | 64 | 0 |
| Cache read : sessions / sous-agents | 1 010 M / 1 127 M | 255 M / 734 M | – |
| Cache write : sessions / sous-agents | 20 M / 101 M | 6 M / 18 M | – |
| Sortie : sessions / sous-agents | 4,1 M / 7,2 M | 1,1 M / 3,6 M | – |
| Cache read des maîtres epicmaster | 235 M | 122 M | – |

ecpv3 n'a ouvert aucune session depuis le 09/10 (la dernière date du 30/09) et n'a jamais utilisé `/epicmaster`. Il sert de témoin « avant », pas de cas d'audit.

**Ordre de grandeur en dollars.** Hypothèse, à remplacer par la grille réelle : tarif opus de 5 $ / 25 $ par million, cache read ×0,1, cache write ×1,25.

| Poste | Volume | Coût estimé | Part |
|---|---|---|---|
| Cache read | 3,1 Md | ≈ 1 560 $ | 54 % |
| Cache write | 145 M | ≈ 900 $ | 32 % |
| Sortie | 16 M | ≈ 400 $ | 14 % |

Le levier principal est donc **la taille du contexte multipliée par le nombre de tours**, pas la sortie. Le cache write pèse lourd parce que chaque nouveau sous-agent réécrit son socle.

### Modèles

| | cocina | craftmcp |
|---|---|---|
| US prescrites | opus·high 83, opus·medium 25, sonnet·* 36 | opus·high 37, opus·medium 16, opus·autres 2, sonnet·* 9 |
| Sous-agents en opus / sonnet | 139 / 73 | 56 / 9 |
| Part opus du cache read des sous-agents | 90 % | 99 % |
| Paramètre `model` des lancements du maître | opus 106, sonnet 32 | opus 38, sonnet 7 |

Le modèle prescrit est respecté à 100 %. **Le problème est donc la prescription elle-même**, pas son exécution.

### Parallélisme réel

Concurrence maximale observée par session maître (nombre de sessions) :

| Projet | 1 en vol | 2 en vol | 3 en vol | 6 en vol |
|---|---|---|---|---|
| cocina | 18 | 6 | 3 | 1 |
| craftmcp | 8 | 6 | 2 | 0 |

Facteurs aggravants :
- 64 % des US cocina et 58 % des US craftmcp portent un `depends_on`.
- La règle « Maquettes en vague 1, les US à écrans en dépendent » fabrique des chaînes.

### Socle et contexte des sous-agents d'US

| | cocina | craftmcp |
|---|---|---|
| Contexte au 1er tour (médiane) | 75 k | 73 k |
| Contexte par tour (médiane) | 125 k | 128 k |
| Contexte maximum (médiane) | 146 k | 160 k |
| Tours par US (médiane) | 28 | 36 |

Le CLAUDE.md projet ne fait que 1,5 à 4,3k caractères. L'essentiel du socle vient du harness : system prompt, liste des outils MCP différés (craft*, ms365, figma, blender…) et liste des skills.

### Dérapages

**Sous-agents**

| Session | Contexte | Tours | Contexte max | Cache read |
|---|---|---|---|---|
| craftmcp 87ece754 | opus | 329 | 720 k | 140 M |
| craftmcp 87ece754 | opus | 309 | 606 k | 110 M |
| cocina df49a246 (US #175) | opus | 154 | 504 k | 43 M |
| cocina 76d5c6ef (US #156 à #159) | opus·high | 116 à 147 | 367 à 467 k | 30 à 42 M chacune |

**Sessions interactives cocina** (hors epicmaster)

| Session | Sujet | Tours | Cache read | Contexte max |
|---|---|---|---|---|
| 3a8960d9 | musique | 366 | 100 M | 461 k |
| 4e8be01e | sons | 287 | 82 M | 441 k |
| 7c42757c | cochin | 264 | 55 M | 332 k |
| b9b8bf52 | musique | 193 | 51 M | 429 k |
| f80acc2b | – | 205 | 49 M | 343 k |

## 3. (A) Soucis liés à l'outil pmz

| # | Souci | Où | Correction | US |
|---|---|---|---|---|
| A1 | **Le modèle se choisit au jugé.** La seule consigne est « sonnet pour du mécanique, opus pour l'archi ». Sans grille ni justification, le LLM choisit opus·high par prudence. | `commands/scope.md:15-17` | Grille haiku/sonnet/opus, sonnet par défaut, opus et `high` seulement sur justification écrite. | #154 |
| A2 | **Le découpage ne prépare pas sonnet.** Une US sans fichiers visés, contrat ni critères testables oblige à raisonner, d'où opus. | `commands/scope.md` | Cadrage obligatoire (fichiers, contrat, critères). Séparer une US de conception courte (opus) des US d'exécution (sonnet). | #154 |
| A3 | **Contagion opus du maître** : une seule US opus fait passer tout le maître en opus, alors qu'il ne fait qu'orchestrer. | `lib/epicmaster.js:149-158` | Maître en sonnet par défaut, quel que soit le modèle des US. | #153 |
| A4 | **Lancement parallèle non garanti.** Le texte dit « en parallèle (arrière-plan) », mais le maître lance un sous-agent par message, souvent au premier plan. | `commands/epicmaster.md:79-81` | Tous les `Agent` d'une vague dans **un seul message**, avec `run_in_background`. Alerte de `subagent-live` si la concurrence reste à 1. | #155 |
| A5 | **Barrière de vague stricte** : on attend tous les rapports avant la vague suivante, donc la plus lente bloque tout. | `commands/epicmaster.md:89` | Pipeline glissant : une place libérée part à l'US éligible suivante. | #155 |
| A6 | **Dépendances trop larges** : l'US Maquettes est imposée en tête et toutes les US à écrans en dépendent. | `commands/scope.md:31-37` | Dépendre du **contrat** (écrans listés, interface figée) plutôt que du livrable. | #154 |
| A7 | **Rien ne borne une US** : pas de plafond de tours ni de contexte, pas de règle sur les boucles visuelles (render → look → retouche). | `lib/epicmaster.js` (renderBrief) | Plafond avec rapport partiel. « Itérer en sonnet, juger en opus » pour les boucles visuelles. | #153 |
| A8 | **Socle de 60k payé N fois** : pas de taille minimale d'US, donc des micro-US. | `lib/epicmaster.js:43-47`, `scope.md` | Fusionner les micro-US (taille minimale). | #154 |
| A9 | **Clôture rituelle côté maître** : environ 6 appels Bash par US (start, commit, done, archive, CHANGELOG), chacun relisant environ 100k de contexte. | `commands/epicmaster.md:93-117` | `backlog.js close-wave` : une vague close en un seul appel. | #156 |
| A10 | **Confirmation systématique** des US embarquées : un aller-retour à chaque `/epicmaster`. | `commands/epicmaster.md` | `/epicmaster` embarque tout sans question. `/pickymaster` garde la sélection. | #152 |
| A11 | **Périmètre non contraint pour les sous-agents.** Le garde-fou ne joue qu'en mode fleet, sans worktree, ce qui freine les vagues larges. | `hooks/pre-tool-use.js:45-50` | Étendre le garde-fou de périmètre au mode epicmaster. | hors lot |
| A12 | **Pas de mesure du parallélisme ni du mix de modèles.** | `/pmz:dashboard` | Afficher la concurrence réelle et le ratio opus/sonnet. | hors lot |

## 4. (B) Soucis liés à l'usage en session

| # | Constat | Pratique recommandée |
|---|---|---|
| B1 | **Sessions interactives marathon en opus**, hors pmz : musique, sons, deck, de 160 à 366 tours, contexte jusqu'à 460k, peu de compactions. Premier poste de cocina. | Une session par sujet. `/compact` ou session fraîche à environ 150k. Itérations de retouche en sonnet. |
| B2 | **Une retouche par tour sur des artefacts lourds** (`bounce_mix`, renders, exports) : chaque tour relit tout le contexte. | Grouper les retours en un seul message (« lot de retours »), ou les confier à un sous-agent sonnet qui rend un résumé. |
| B3 | **Tous les serveurs MCP actifs partout** (craft*, ms365, figma, blender, lightcraft…), d'où un socle de 70k+ pour chaque agent à chaque tour. | Activer les MCP par projet (`.mcp.json` / `enabledMcpjsonServers`) : craftmcp n'a pas besoin de ms365, cocina n'a pas besoin de lightcraft. C'est le levier le moins cher. |
| B4 | **Prescriptions opus·high validées sans les relire** au moment de `/scope`. | À la validation, contester chaque opus : « qu'est-ce qui empêche sonnet ? ». |
| B5 | **`/epicmaster` relancé en mini-sessions** de 1 à 4 US (craftmcp le 19/10 : 8 sessions epicmaster ou scope dans la journée). Chaque relance repaie le socle du maître et du handoff. | Scoper un epic complet, puis un seul maître. |
| B6 | **Sous-agents ponctuels lancés un par un** (juges visuels, essais #147 ×12, recettes). | Les lancer dans un même message. Juges et essais en sonnet. |
| B7 | **Boucles visuelles longues en sous-agent opus** (Blender `look`, vectorcraft `render_preview`, Figma), avec des images qui s'accumulent dans le contexte. | Découper en étapes courtes, avec un juge séparé. Sonnet pour itérer. |
| B8 | **ecpv3 n'est pas passé sous epicmaster.** | L'y amener après les correctifs #152 à #156. |

## 5. Feuille de route

L'epic « Epicmaster sobre » est enregistré dans le backlog pmz (US #152 à #156), avec un maître en sonnet :
- **Vague 1**, en parallèle : #152 (`/epicmaster` direct et `/pickymaster`), #153 (maître et briefs sobres), #154 (découpage orienté sonnet).
- **Vague 2** : #155 (parallélisme réel).
- **Vague 3** : #156 (`close-wave`).

Hors lot, à ouvrir ensuite : mesure dans le dashboard (A12), garde-fou de périmètre (A11), puis release.

Côté usage, sans code : B3 (MCP par projet) dès maintenant, puis B1 et B2 (hygiène des sessions interactives).

## Annexe : reproduire

```bash
node docs/audits/audit-epicmaster-tokens.js 2026-10-09 cocina craftmcp ecpv3
```

Méthode :
- L'usage est dédoublonné par `message.id`.
- Un sous-agent d'US est reconnu à la mention « brief de sous-agent » dans son brief.
- La concurrence d'une session maître est le nombre maximum de sous-agents d'US dont les intervalles horaires se chevauchent.
- Les prescriptions viennent de `model_hint`/`effort_hint` dans `.vibe-agent/backlog.json`.
