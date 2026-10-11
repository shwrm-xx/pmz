#!/usr/bin/env node
'use strict';
// Assemble le PLUGIN Claude Code Promptimizer depuis la source en miroir plat.
//
// Le format plugin impose commands/, skills/, hooks/hooks.json AU ROOT du plugin, sans
// chemin personnalisable (cf. docs/decisions/D1-plugin-go-nogo.md). La source du dépôt
// garde son miroir plat (canal d'install manuelle) ; ce script en DÉRIVE un dossier plugin
// self-contained — zéro duplication committée, source manuelle intacte.
//
// Sortie (gitignorée) :
//   dist/marketplace/
//     .claude-plugin/marketplace.json        (marketplace locale : source = "./promptimizer")
//     promptimizer/                           (RACINE du plugin — UN SEUL plugin, bande epicmaster incluse)
//       .claude-plugin/plugin.json            (+ "types" : contrat d'état de la bande)
//       hooks/hooks.json                      (hooks commande « hooks » + « modules » de la bande)
//       hooks/*.js                            (hooks commande) + hooks/register.tsx, live.ts (module bande)
//       types/index.d.ts                      (types du module bande, sans .claude-plugin/types/ généré)
//       commands/*.md      (chemins ~/.claude/promptimizer → ${CLAUDE_PLUGIN_ROOT})
//       skills/promptimizer/SKILL.md  (idem)
//       lib/ scripts/ templates/ bin/ VERSION
//
// Test bac à sable (jamais le vrai ~/.claude) :
//   node build-plugin.js && CLAUDE_CONFIG_DIR=/tmp/x claude plugin marketplace add dist/marketplace \
//     && CLAUDE_CONFIG_DIR=/tmp/x claude plugin install pmz@pmz-local
//
// Usage : node build-plugin.js [dossierSortie]   (défaut : <repo>/dist)
// stdlib seule, fail-safe : exit 1 avec message si un composant attendu manque.
const fs = require('fs');
const path = require('path');
const { readVersion } = require('../lib/version');

const PMZ_SRC = path.resolve(__dirname, '..');            // .../promptimizer (source)
const REPO = path.resolve(PMZ_SRC, '..');                 // racine du dépôt
const SKILL_SRC = path.join(REPO, 'skills', 'promptimizer');
const OUT_ROOT = path.resolve(process.argv[2] || path.join(REPO, 'dist'));
const MARKET = path.join(OUT_ROOT, 'marketplace');
const PLUGIN = path.join(MARKET, 'promptimizer');         // racine du plugin

const MARKETPLACE_NAME = 'pmz-local';
// Bande epicmaster (lot #140) : le mod est FUSIONNÉ dans le plugin pmz (un seul plugin à installer
// sur un autre poste). Source = mods/epicmaster-band : ses fichiers de hooks/ (register.tsx, live.ts…)
// rejoignent <plugin>/hooks/, ses types/ rejoignent <plugin>/types/, sa clé `modules` est ajoutée au
// hooks.json du plugin (qui garde ses hooks commande). Le dossier mods/ du miroir plat n'est PAS copié
// tel quel dans le plugin (doublon inutile). Le canal manuel garde son miroir + CLAUDE_CODE_PLUGIN_DIRS.
const BAND_NAME = 'epicmaster-band';
const BAND_SRC = path.join(PMZ_SRC, 'mods', BAND_NAME);
// Propriété de l'état : dans un plugin, un module ne peut écrire que les valeurs d'état dont son plugin
// est propriétaire (`atom({ plugin: '<nom du plugin>' })`, `declare module … PluginState`). La source du
// mod (canal manuel, chargé comme plugin « epicmaster-band ») garde son nom ; au build, la propriété est
// réécrite vers le plugin hôte (« pmz ») dans les .ts/.tsx copiés — `claude plugin validate` le vérifie.
function rewriteBandOwner(dir, owner) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { rewriteBandOwner(p, owner); continue; }
    if (!/\.tsx?$/.test(e.name)) continue;
    const before = fs.readFileSync(p, 'utf8');
    const after = before.replace(/(['"])epicmaster-band\1/g, '$1' + owner + '$1');
    if (after !== before) fs.writeFileSync(p, after);
  }
}

// Même filtre que install.js : `<mod>/.claude-plugin/types/` est généré par le moteur de mods au
// chargement (artefact local), jamais livré ; bruit OS exclu.
function modCopyFilter(src) {
  const base = path.basename(src);
  if (base === '.DS_Store') return false;
  if (base === 'types' && path.basename(path.dirname(src)) === '.claude-plugin') return false;
  return true;
}
// Composants EXCLUS du plugin : l'installeur manuel (obsolète en plugin) et le bruit OS.
// `statusline.md` : commande opt-in du CANAL MANUEL uniquement (lot #45). Elle invoque
// install/merge-settings.js, absent du plugin (install/ exclu) → la livrer dans le plugin
// donnerait une commande cassée. La statusline reste une feature settings.json = canal manuel.
const EXCLUDE = new Set(['install', '.DS_Store', 'statusline.md']);

// Garde-fou anti-suppression accidentelle (post-mortem v1.1.3 : le cleanup 7533d72 avait
// supprimé pmz-scope/pmz-init/pmz-about de la source, croyant à tort les commandes namespacées
// `/pmz:*` séparées — invisible tant que le cache plugin restait figé). Liste EXPLICITE des
// commandes que le plugin DOIT porter : à éditer consciemment quand on ajoute/retire une
// commande. Une disparition non voulue la fait diverger → build refusé, jamais propagé au cache.
const REQUIRED_COMMANDS = [
  'budget.md', 'check-context.md', 'close-batch.md', 'fresh-session.md',
  'about.md', 'init.md', 'scope.md', 'help.md', 'parallelize.md', 'reintegrate.md',
  'rtk.md', 'archive.md', 'epicmaster.md',
];

function log(s) { process.stdout.write(s + '\n'); }
function fail(s) { process.stderr.write('ERREUR build-plugin : ' + s + '\n'); process.exit(1); }

// Réécrit les chemins d'install manuelle → placeholder plugin substitué inline par Claude
// Code dans le contenu des commands/skills. Idempotent (ne touche pas ce qui est déjà migré).
function rewritePaths(content) {
  return content.replace(/~\/\.claude\/promptimizer/g, '${CLAUDE_PLUGIN_ROOT}');
}
function rewriteMdInDir(dir) {
  let n = 0;
  if (!fs.existsSync(dir)) return n;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { n += rewriteMdInDir(p); continue; }
    if (!entry.name.endsWith('.md')) continue;
    const before = fs.readFileSync(p, 'utf8');
    const after = rewritePaths(before);
    if (after !== before) { fs.writeFileSync(p, after); n++; }
  }
  return n;
}

function chmodInDir(dir, exts) {
  if (process.platform === 'win32' || !fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (exts.some((e) => f.endsWith(e))) {
      try { fs.chmodSync(path.join(dir, f), 0o755); } catch (_) { /* ignore */ }
    }
  }
}

// ── 1. Table rase de la sortie ──
try { fs.rmSync(OUT_ROOT, { recursive: true, force: true }); } catch (_) { /* ignore */ }
fs.mkdirSync(PLUGIN, { recursive: true });

// ── 2. Copie de la source (moins install/ + bruit OS) → racine du plugin ──
fs.cpSync(PMZ_SRC, PLUGIN, {
  recursive: true,
  // + `<mod>/.claude-plugin/types/` : généré par le moteur de mods au chargement, jamais livré.
  // + `mods/` de premier niveau : la bande est fusionnée à part (2b), pas copiée en doublon.
  filter: (src) => !EXCLUDE.has(path.basename(src)) &&
    path.relative(PMZ_SRC, src) !== 'mods' &&
    !(path.basename(src) === 'types' && path.basename(path.dirname(src)) === '.claude-plugin'),
});

// ── 2b. Bande epicmaster → fusionnée DANS le plugin pmz (un seul plugin, un seul hooks.json) ──
// Retourne le chemin relatif (« ./types/index.d.ts ») à déclarer dans plugin.json, ou null.
function embedBand() {
  if (!fs.existsSync(path.join(BAND_SRC, '.claude-plugin', 'plugin.json'))) fail('mod introuvable : ' + BAND_SRC);
  const bandHooksDir = path.join(BAND_SRC, 'hooks');
  const bandHooksJson = path.join(bandHooksDir, 'hooks.json');
  if (!fs.existsSync(bandHooksJson)) fail('hooks.json du mod introuvable : ' + bandHooksJson);
  let bandCfg;
  try { bandCfg = JSON.parse(fs.readFileSync(bandHooksJson, 'utf8')); } catch (e) { fail('hooks.json du mod invalide : ' + e.message); }
  const modules = bandCfg && Array.isArray(bandCfg.modules) ? bandCfg.modules : [];
  if (!modules.length) fail('hooks.json du mod sans « modules » : ' + bandHooksJson);

  // Fichiers du module → <plugin>/hooks/ (mêmes chemins relatifs que dans le mod : ./register.tsx,
  // ./live). Un nom déjà pris par un hook commande du plugin = collision : build refusé.
  const pluginHooksDir = path.join(PLUGIN, 'hooks');
  for (const f of fs.readdirSync(bandHooksDir)) {
    if (f === 'hooks.json' || f === '.DS_Store') continue;
    const dst = path.join(pluginHooksDir, f);
    if (fs.existsSync(dst)) fail('collision hooks/' + f + ' entre le plugin et le mod ' + BAND_NAME);
    fs.cpSync(path.join(bandHooksDir, f), dst, { recursive: true, filter: modCopyFilter });
  }

  // Types du module (contrat d'état) → <plugin>/types/ (le module les importe via ../types).
  let typesRel = null;
  if (fs.existsSync(path.join(BAND_SRC, 'types'))) {
    const dst = path.join(PLUGIN, 'types');
    if (fs.existsSync(dst)) fail('collision types/ entre le plugin et le mod ' + BAND_NAME);
    fs.cpSync(path.join(BAND_SRC, 'types'), dst, { recursive: true, filter: modCopyFilter });
    typesRel = './types/index.d.ts';
  }

  // Propriété de l'état → nom du plugin hôte (relu du manifeste source, jamais en dur).
  const hostManifest = path.join(PLUGIN, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(hostManifest)) fail('plugin.json manquant : ' + hostManifest);
  const owner = JSON.parse(fs.readFileSync(hostManifest, 'utf8')).name;
  if (!owner) fail('plugin.json sans « name »');
  rewriteBandOwner(pluginHooksDir, owner);   // seuls .ts/.tsx : ceux du module (les hooks commande sont des .js)
  if (typesRel) rewriteBandOwner(path.join(PLUGIN, 'types'), owner);

  // hooks.json : hooks commande du plugin + clé « modules » du mod (union sans doublon).
  const pluginHooksJson = path.join(pluginHooksDir, 'hooks.json');
  if (!fs.existsSync(pluginHooksJson)) fail('hooks/hooks.json manquant dans le plugin assemblé');
  const cfg = JSON.parse(fs.readFileSync(pluginHooksJson, 'utf8'));
  cfg.modules = Array.from(new Set([].concat(Array.isArray(cfg.modules) ? cfg.modules : [], modules)));
  fs.writeFileSync(pluginHooksJson, JSON.stringify(cfg, null, 2) + '\n');
  return typesRel;
}
const bandTypes = embedBand();

// ── 3. Skill : source hors miroir (skills/promptimizer/) → <plugin>/skills/promptimizer/ ──
if (!fs.existsSync(path.join(SKILL_SRC, 'SKILL.md'))) fail('skill introuvable : ' + SKILL_SRC);
fs.cpSync(SKILL_SRC, path.join(PLUGIN, 'skills', 'promptimizer'), { recursive: true });

// ── 3b. Garde-fou : toutes les commandes attendues doivent être présentes ──
const cmdDir = path.join(PLUGIN, 'commands');
const missing = REQUIRED_COMMANDS.filter((c) => !fs.existsSync(path.join(cmdDir, c)));
if (missing.length) {
  fail('commande(s) attendue(s) absente(s) du plugin : ' + missing.join(', ') +
    '\n  Si c\'est une suppression VOULUE, retire-la de REQUIRED_COMMANDS dans build-plugin.js.' +
    '\n  Sinon restaure le fichier source dans promptimizer/commands/ (git checkout).');
}

// ── 4. Réécriture des chemins dans commands + skills (contenu substitué inline) ──
const nCmd = rewriteMdInDir(cmdDir);
const nSkill = rewriteMdInDir(path.join(PLUGIN, 'skills'));

// ── 5. Synchronise la version du manifeste sur VERSION (semver direct depuis lot D3) ──
const manifestPath = path.join(PLUGIN, '.claude-plugin', 'plugin.json');
if (!fs.existsSync(manifestPath)) fail('plugin.json manquant : ' + manifestPath);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const v = readVersion();
if (v) manifest.version = v;
if (bandTypes) manifest.types = bandTypes;   // contrat d'état de la bande (déclaré par le mod)
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// ── 6. Vérifie que hooks.json est bien à l'emplacement conventionnel ──
if (!fs.existsSync(path.join(PLUGIN, 'hooks', 'hooks.json'))) fail('hooks/hooks.json manquant dans le plugin assemblé');

// ── 7. marketplace.json locale (source = string relative, cf. D1) ──
fs.mkdirSync(path.join(MARKET, '.claude-plugin'), { recursive: true });
fs.writeFileSync(path.join(MARKET, '.claude-plugin', 'marketplace.json'),
  JSON.stringify({
    name: MARKETPLACE_NAME,
    owner: { name: 'Marwan' },
    metadata: { description: 'Marketplace locale Promptimizer (gouvernance de session vibecoding).' },
    plugins: [{ name: 'pmz', source: './promptimizer' }],
  }, null, 2) + '\n');

// ── 8. Bits +x (posix) : wrapper + scripts + hooks ──
chmodInDir(path.join(PLUGIN, 'bin'), ['pmz-hook']);
chmodInDir(path.join(PLUGIN, 'hooks'), ['.js']);
chmodInDir(path.join(PLUGIN, 'scripts'), ['.js']);

log('Plugin assemblé : ' + PLUGIN);
log(`  version manifeste : ${manifest.version}`);
log(`  chemins réécrits  : ${nCmd} command(s) + ${nSkill} fichier(s) skill`);
log('  bande epicmaster  : fusionnée dans le plugin pmz (hooks.json « modules », hooks/register.tsx, types/)');
log('  marketplace       : ' + path.join(MARKET, '.claude-plugin', 'marketplace.json'));
log('');
log('Test (bac à sable) :');
log('  claude plugin validate "' + PLUGIN + '"');
log(`  CLAUDE_CONFIG_DIR=/tmp/pmz-sbx claude plugin marketplace add "${MARKET}"`);
log('  CLAUDE_CONFIG_DIR=/tmp/pmz-sbx claude plugin install pmz@' + MARKETPLACE_NAME);
