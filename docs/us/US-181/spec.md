# Spec US#181 — Module update-check

<!-- spec-v2 -->

- US : #181
- epic : Avis de mise à jour

## Récit

En tant que mainteneur PMZ,
je veux un module unique qui sait si une version plus récente est publiée, sans jamais bloquer ni casser un hook,
afin que tous les canaux d'avis partagent la même vérité.

## Cadrage d'exécution

- Fichiers visés : `promptimizer/lib/update-check.js` (nouveau), `test/run-tests-update-check.js` (nouveau), `test/run-tests.js` (enregistrement de la sous-suite dans le tableau `[libellé, fichier]`, vers la ligne 10659).
- Contrat (figé, stdlib seule, aucune fonction ne lève) :
  - `URL` = `process.env.PMZ_UPDATE_URL || 'https://raw.githubusercontent.com/shwrm-xx/pmz/plugin-release/promptimizer/VERSION'` · `TTL_MS = 24*3600*1000` · `CACHE_FILE = 'update-check.json'`
  - `cachePath()` → `path.join(process.env.PMZ_STATE_DIR || cdir.stateDir(), CACHE_FILE)` ; `disabled()` → `process.env.PMZ_NO_UPDATE_CHECK === '1'`
  - Cache JSON `{ checkedAt:number, latest:string|null, notifiedFor?:string, notifiedAt?:number }`
  - `readCached({now}?)` → `{ local, latest, behind, stale }` sans réseau ; `behind = !!(local && latest && compareSemver(local, latest) < 0)` ; `disabled()`, cache absent/corrompu ou semver invalide → `behind:false`.
  - `refreshIfStale({now, spawn}?)` → `true` si un `node <ce fichier> --fetch` détaché a été lancé (`{detached:true, stdio:'ignore'}`, `unref`, `on('error')`), sinon `false` ; spawn seulement si cache absent ou `now - checkedAt >= TTL_MS` ; jamais si `disabled()`.
  - `fetchLatest({get, timeoutMs=3000}?)` → `Promise<string|null>` (`https.get`, corps trimé, valide seulement si `parseSemver` le valide).
  - `runFetch({now, get}?)` → écrit le cache de façon atomique (tmp + rename) ; en échec, `checkedAt` réécrit, ancien `latest` conservé, `notifiedFor`/`notifiedAt` préservés.
  - `shouldNotify(cache, now)` → `true` si `behind` et (`notifiedFor !== latest` ou `now - notifiedAt >= TTL_MS`) ; `markNotified(latest, now)` persiste `notifiedFor`/`notifiedAt`.
  - `updateNotice(local, latest, {plugin})` → une ligne `PMZ v<latest> disponible (installé v<local>) — ` puis, canal plugin (`cdir.isPluginContext()` par défaut) : `claude plugin marketplace update pmz-marketplace && claude plugin update pmz@pmz-marketplace, puis redémarrer Claude Code` ; canal manuel : `relancer l'installateur promptimizer/install/install.command (.sh / .ps1) depuis un dépôt à jour`.
  - CLI : `--fetch` → `runFetch` puis exit 0 ; `--print` → fetch puis affiche la version distante ou rien, exit 0.
- Réutiliser : `lib/version.js` (`readVersion, compareSemver, parseSemver`), `lib/claude-dir.js` (`stateDir()`, `isPluginContext()`), pattern de spawn détaché injectable de `lib/notify.js:59`.
- Dépend de : aucune.
- Modèle · effort : sonnet · medium.

## Décisions

- Source = `promptimizer/VERSION` sur la branche `plugin-release` (pas de `VERSION` à la racine de cette branche ; URL vérifiée HTTP 200).
- Fail-open absolu, opt-out `PMZ_NO_UPDATE_CHECK=1`, fetch hors bande (process détaché) — aucun hook n'attend le réseau.
- Aucune question ouverte.

## Critères d'acceptation

1. Le module expose le contrat ci-dessus (exports, CLI `--fetch` / `--print`).
2. Étant donné un cache absent, quand `refreshIfStale` est appelé avec un `spawn` stub, alors un seul spawn est enregistré.
3. Étant donné un cache frais (< 24 h), alors aucun spawn.
4. Étant donné `PMZ_NO_UPDATE_CHECK=1`, alors aucun spawn et `behind:false`.
5. `latest` > version locale → `behind:true` ; égale ou inférieure → `false`.
6. Cache corrompu ou semver invalide → `behind:false`, sans exception.
7. `runFetch` avec un `get` stub (succès, erreur, timeout, corps invalide) écrit `checkedAt` dans tous les cas et ne prend `latest` que si le semver est valide.
8. `shouldNotify` / `markNotified` → un seul avis par jour et par version.
9. `updateNotice` couvre les deux canaux (plugin, manuel).
10. La suite `test/run-tests-update-check.js` est enregistrée dans `run-tests.js`, qui est vert.

## Hors périmètre

- Branchements hook / statusline / doctor (US#182) — un module testable seul limite le diff.
- Réseau réel dans les tests (bac à sable et reproductibilité).

## Preuve de clôture

- `node test/run-tests.js`

## Notes

- Ne jamais toucher au `~/.claude` réel : tests sous `PMZ_STATE_DIR` temporaire.
