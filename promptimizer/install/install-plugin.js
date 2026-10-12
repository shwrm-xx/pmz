#!/usr/bin/env node
'use strict';
// Installeur PLUGIN en un clic (lot #143) — SOURCE DE VÉRITÉ UNIQUE (macOS / Linux / Windows).
// Les lanceurs install-plugin.command/.sh/.ps1 ne font que trouver node et appeler ce fichier.
//
// Enchaîne, sans rien demander :
//   1. assemble le plugin (build-plugin.js) dans un dossier STABLE <claudeDir>/pmz-plugin/build
//      (le plugin d'une marketplace « directory » se charge sur place : il ne doit pas dépendre
//      de l'emplacement du dossier téléchargé) ;
//   2. si `claude` est trouvé : ajoute (ou rafraîchit) la marketplace pmz-local, installe pmz
//      — ou le met à jour s'il l'est déjà ;
//      sinon (ou si la CLI échoue) : repli DÉCLARATIF dans settings.json
//      (extraKnownMarketplaces + enabledPlugins), append-only, backup horodaté, idempotent,
//      réversible (--remove, via le sidecar <claudeDir>/pmz-plugin/declared.json) ;
//   3. migre une install manuelle éventuelle (migrate-to-plugin.js : plus de hooks en double) ;
//   4. lance le doctor et affiche son verdict vert / orange / rouge.
//
// Usage : node install-plugin.js [--no-pause] [--no-claude] [--purge] [--remove]
//   --no-pause  : pas d'attente « Entrée » en fin (tests, appel automatisé)
//   --no-claude : force le repli déclaratif (n'appelle pas la CLI claude)
//   --purge     : transmis à la migration (supprime aussi les fichiers du canal manuel)
//   --remove    : désinstalle le plugin et retire NOS entrées déclaratives (backup)
// Env : PMZ_CLAUDE_BIN = chemin explicite de la CLI claude (aucun sondage si posé ; tests).
// stdlib seule. Ne touche qu'à <claudeDir> (CLAUDE_CONFIG_DIR respecté).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const cdir = require('../lib/claude-dir');
const { readLineSync } = require('./lib-io');

const DEST = cdir.claudeDir();
const SETTINGS = cdir.settingsPath();
const HOME_DIR = path.join(DEST, 'pmz-plugin');            // dossier dédié (ne contient que du nôtre)
const OUT_ROOT = path.join(HOME_DIR, 'build');              // build-plugin.js y fait table rase
const MARKET = path.join(OUT_ROOT, 'marketplace');
const SIDECAR = path.join(HOME_DIR, 'declared.json');
const MARKETPLACE_NAME = 'pmz-local';                       // = build-plugin.js
const PLUGIN_ID = 'pmz@' + MARKETPLACE_NAME;

const argv = process.argv.slice(2);
const NO_PAUSE = argv.includes('--no-pause');
const NO_CLAUDE = argv.includes('--no-claude');
const PURGE = argv.includes('--purge');
const REMOVE = argv.includes('--remove');
const IS_WIN = process.platform === 'win32';
const IS_TTY = !!process.stdin.isTTY;

function log(s) { process.stdout.write(s + '\n'); }
function err(s) { process.stderr.write(s + '\n'); }
function pause() {
  if (NO_PAUSE || !IS_TTY) return;
  log('\nAppuie sur Entrée pour fermer.');
  readLineSync();
}
function fatal(msg) { err('ERREUR : ' + msg); pause(); process.exit(1); }
function indent(text) {
  return String(text || '').split(/\r?\n/).filter((l) => l.trim()).map((l) => '  ' + l).join('\n');
}

// Env des enfants : sans le contexte plugin d'une éventuelle session parente (sinon pmzDir()
// pointerait sur le plugin au lieu du canal manuel pendant la migration / le doctor).
function childEnv() {
  const env = Object.assign({}, process.env);
  delete env.CLAUDE_PLUGIN_ROOT;
  delete env.CLAUDE_PLUGIN_DATA;
  return env;
}
function runNodeScript(file, args) {
  return spawnSync(process.execPath, [file].concat(args || []), {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: childEnv(),
  });
}

// ── CLI claude ─────────────────────────────────────────────────────────────────────────────
// Windows : `claude` est souvent un .cmd -> shell requis, arguments quotés à la main.
function runClaude(bin, args) {
  const opts = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: childEnv(), timeout: 180000 };
  try {
    if (IS_WIN && !/\.exe$/i.test(bin)) {
      const q = (s) => '"' + String(s).replace(/"/g, '\\"') + '"';
      return spawnSync([bin].concat(args).map(q).join(' '), Object.assign(opts, { shell: true }));
    }
    return spawnSync(bin, args, opts);
  } catch (e) { return { error: e, status: null, stdout: '', stderr: String(e && e.message) }; }
}
function claudeWorks(bin) {
  const r = runClaude(bin, ['--version']);
  return !r.error && r.status === 0;
}
// PATH d'abord, puis emplacements usuels (le PATH d'un double-clic est parfois épuré).
function findClaude() {
  if (NO_CLAUDE) return null;
  const forced = process.env.PMZ_CLAUDE_BIN;
  if (forced && forced.trim()) return claudeWorks(forced.trim()) ? forced.trim() : null;
  const home = os.homedir();
  const cands = ['claude'].concat(IS_WIN
    ? [path.join(home, '.local', 'bin', 'claude.exe'), path.join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd')]
    : [path.join(home, '.local', 'bin', 'claude'), path.join(home, '.claude', 'local', 'claude'),
      '/opt/homebrew/bin/claude', '/usr/local/bin/claude']);
  for (const c of cands) {
    if (c !== 'claude' && !fs.existsSync(c)) continue;
    if (claudeWorks(c)) return c;
  }
  return null;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}
function knownMarketplacePath() {
  const km = readJson(path.join(DEST, 'plugins', 'known_marketplaces.json'));
  const e = km && km[MARKETPLACE_NAME];
  if (!e) return null;
  return (e.source && e.source.path) || e.installLocation || '';
}
function pluginInstalled() {
  const ip = readJson(path.join(DEST, 'plugins', 'installed_plugins.json'));
  return !!(ip && ip.plugins && Array.isArray(ip.plugins[PLUGIN_ID]) && ip.plugins[PLUGIN_ID].length);
}
function samePath(a, b) {
  const n = (p) => { try { return fs.realpathSync(p); } catch (_) { return path.resolve(p); } };
  return !!a && !!b && n(a) === n(b);
}

// Retourne true si marketplace + plugin sont en place via la CLI, false sinon (-> repli).
function installViaCli(bin) {
  const step = (label, args) => {
    const r = runClaude(bin, args);
    const out = ((r.stdout || '') + (r.stderr || '')).trim();
    if (out) log(indent(out));
    if (r.error || r.status !== 0) { log('  ✗ ' + label + ' a échoué (code ' + r.status + ').'); return false; }
    return true;
  };
  const known = knownMarketplacePath();
  if (known !== null && !samePath(known, MARKET)) {
    // Même nom, autre dossier (ex. ancien dist/ d'un clone) : on repointe vers le dossier stable.
    log('Marketplace ' + MARKETPLACE_NAME + ' déclarée ailleurs (' + known + ') : repointage.');
    step('marketplace remove', ['plugin', 'marketplace', 'remove', MARKETPLACE_NAME]);
  }
  const fresh = knownMarketplacePath() === null;
  log(fresh ? 'Ajout de la marketplace ' + MARKETPLACE_NAME + '…' : 'Rafraîchissement de la marketplace ' + MARKETPLACE_NAME + '…');
  if (!step('marketplace', fresh ? ['plugin', 'marketplace', 'add', MARKET] : ['plugin', 'marketplace', 'update', MARKETPLACE_NAME])) return false;
  if (pluginInstalled()) {
    log('Plugin ' + PLUGIN_ID + ' déjà installé : mise à jour…');
    return step('plugin update', ['plugin', 'update', PLUGIN_ID]);
  }
  log('Installation du plugin ' + PLUGIN_ID + '…');
  if (step('plugin install', ['plugin', 'install', PLUGIN_ID])) return true;
  log('Nouvelle tentative en mise à jour…');
  return step('plugin update', ['plugin', 'update', PLUGIN_ID]);
}

// ── Fusion déclarative settings.json (repli sans CLI) ───────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
function backup() {
  if (!fs.existsSync(SETTINGS)) return null;
  const d = new Date();
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const base = SETTINGS.replace(/\.json$/, '') + '.pmz-backup-' + ts;
  let dst = base + '.json';
  for (let i = 1; fs.existsSync(dst); i++) dst = base + '-' + i + '.json';
  fs.copyFileSync(SETTINGS, dst);
  if (fs.readFileSync(dst, 'utf8') !== fs.readFileSync(SETTINGS, 'utf8')) throw new Error('backup non vérifié');
  return dst;
}
// Lecture STRICTE : JSON invalide -> abort sans écriture (jamais d'écrasement d'un fichier cassé).
function readSettingsStrict() {
  if (!fs.existsSync(SETTINGS)) return {};
  const raw = fs.readFileSync(SETTINGS, 'utf8');
  if (!raw.trim()) return {};
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('racine non-objet');
  return data;
}
function writeSettings(obj) {
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  const tmp = SETTINGS + '.pmz-tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, SETTINGS);
}
const desiredMarket = () => ({ source: { source: 'directory', path: MARKET } });

function declare() {
  let s;
  try { s = readSettingsStrict(); } catch (e) { fatal(SETTINGS + ' illisible (' + e.message + ') — rien modifié.'); }
  const want = desiredMarket();
  const ekm = (s.extraKnownMarketplaces && typeof s.extraKnownMarketplaces === 'object') ? s.extraKnownMarketplaces : null;
  const ep = (s.enabledPlugins && typeof s.enabledPlugins === 'object') ? s.enabledPlugins : null;
  const marketOk = !!ekm && JSON.stringify(ekm[MARKETPLACE_NAME]) === JSON.stringify(want);
  const pluginOk = !!ep && ep[PLUGIN_ID] === true;
  if (marketOk && pluginOk) { log('settings.json déclare déjà ' + PLUGIN_ID + ' — rien à changer.'); return; }

  // Sidecar : mémorise la valeur ANTÉRIEURE de chaque clé que l'on pose (absent = undefined),
  // pour que --remove restaure à l'identique. Une clé déjà notée n'est pas réécrite (idempotence).
  const side = readJson(SIDECAR) || {};
  if (!marketOk && !('market' in side)) side.market = { had: !!(ekm && MARKETPLACE_NAME in ekm), prev: ekm ? ekm[MARKETPLACE_NAME] : undefined };
  if (!pluginOk && !('plugin' in side)) side.plugin = { had: !!(ep && PLUGIN_ID in ep), prev: ep ? ep[PLUGIN_ID] : undefined };
  side.tag = 'pmz-install-plugin';
  side.market_path = MARKET;

  let bkp;
  try { bkp = backup(); } catch (e) { fatal('backup de settings.json impossible (' + e.message + ') — rien modifié.'); }
  const next = Object.assign({}, s);
  if (!marketOk) next.extraKnownMarketplaces = Object.assign({}, ekm || {}, { [MARKETPLACE_NAME]: want });
  if (!pluginOk) next.enabledPlugins = Object.assign({}, ep || {}, { [PLUGIN_ID]: true });
  try {
    fs.mkdirSync(HOME_DIR, { recursive: true });
    fs.writeFileSync(SIDECAR, JSON.stringify(side, null, 2) + '\n');
    writeSettings(next);
  } catch (e) { fatal('écriture de settings.json impossible (' + e.message + ').' + (bkp ? ' Backup : ' + bkp : '')); }
  log('Déclaré dans ' + SETTINGS + ' : extraKnownMarketplaces.' + MARKETPLACE_NAME + ' + enabledPlugins["' + PLUGIN_ID + '"].');
  if (bkp) log('Sauvegarde : ' + bkp);
}

function undeclare() {
  const side = readJson(SIDECAR);
  if (!side) { log('Aucune entrée déclarative PMZ à retirer.'); return; }
  let s;
  try { s = readSettingsStrict(); } catch (e) { fatal(SETTINGS + ' illisible (' + e.message + ') — rien modifié.'); }
  const next = Object.assign({}, s);
  const restoreKey = (field, key, rec, ours) => {
    const obj = next[field] && typeof next[field] === 'object' ? Object.assign({}, next[field]) : null;
    if (!rec || !obj || !(key in obj)) return false;
    if (JSON.stringify(obj[key]) !== JSON.stringify(ours)) return false;   // modifiée depuis : on n'y touche pas
    if (rec.had) obj[key] = rec.prev; else delete obj[key];
    if (Object.keys(obj).length) next[field] = obj; else delete next[field];
    return true;
  };
  const c1 = restoreKey('extraKnownMarketplaces', MARKETPLACE_NAME, side.market, { source: { source: 'directory', path: side.market_path || MARKET } });
  const c2 = restoreKey('enabledPlugins', PLUGIN_ID, side.plugin, true);
  if (c1 || c2) {
    let bkp;
    try { bkp = backup(); } catch (e) { fatal('backup de settings.json impossible (' + e.message + ') — rien modifié.'); }
    writeSettings(next);
    log('Entrées déclaratives PMZ retirées de ' + SETTINGS + (bkp ? ' (sauvegarde : ' + bkp + ')' : '') + '.');
  } else {
    log('Entrées déclaratives PMZ déjà absentes ou modifiées depuis (laissées telles quelles).');
  }
  try { fs.rmSync(SIDECAR, { force: true }); } catch (_) { /* ignore */ }
}

// ── Désinstallation ─────────────────────────────────────────────────────────────────────────
if (REMOVE) {
  log('── Promptimizer — désinstallation du plugin ──');
  const bin = findClaude();
  if (bin) {
    runClaude(bin, ['plugin', 'uninstall', PLUGIN_ID]);
    runClaude(bin, ['plugin', 'marketplace', 'remove', MARKETPLACE_NAME]);
    log('Plugin ' + PLUGIN_ID + ' et marketplace ' + MARKETPLACE_NAME + ' retirés via la CLI.');
  }
  undeclare();
  try { fs.rmSync(OUT_ROOT, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  log('Relance Claude Code pour finaliser.');
  pause();
  process.exit(0);
}

// ── Installation ────────────────────────────────────────────────────────────────────────────
log('── Promptimizer — installation du plugin (un clic) ──');
log('Cible : ' + DEST);
log('node  : ' + process.version);
if (typeof fs.cpSync !== 'function') fatal('Node trop ancien (' + process.version + ') : installe Node ≥ 18 (nodejs.org).');
log('');

// 1. Plugin dans le dossier stable : marketplace PRÉ-ASSEMBLÉE embarquée dans l'archive hors-ligne
//    (lot #145 : <racine archive>/marketplace/, aucun build requis) sinon build-plugin.js (dépôt source).
const PREBUILT = path.resolve(__dirname, '..', '..', 'marketplace');
const hasPrebuilt = fs.existsSync(path.join(PREBUILT, '.claude-plugin', 'marketplace.json'));
if (hasPrebuilt) {
  log('1/4 Copie de la marketplace embarquée (hors-ligne, sans build)…');
  try {
    fs.rmSync(OUT_ROOT, { recursive: true, force: true });
    fs.mkdirSync(OUT_ROOT, { recursive: true });
    fs.cpSync(PREBUILT, MARKET, { recursive: true });
  } catch (e) { fatal('copie de la marketplace embarquée échouée (' + e.message + ').'); }
  if (!fs.existsSync(path.join(MARKET, '.claude-plugin', 'marketplace.json'))) fatal('marketplace embarquée incomplète.');
  log('  Plugin en place : ' + path.join(MARKET, 'promptimizer'));
} else {
  log('1/4 Assemblage du plugin…');
  const rb = runNodeScript(path.join(__dirname, 'build-plugin.js'), [OUT_ROOT]);
  if (rb.error || rb.status !== 0 || !fs.existsSync(path.join(MARKET, '.claude-plugin', 'marketplace.json'))) {
    fatal('assemblage du plugin échoué.\n' + indent((rb.stderr || '') + (rb.stdout || '')));
  }
  log('  Plugin assemblé : ' + path.join(MARKET, 'promptimizer'));
}
log('');

// 2. Marketplace + plugin (CLI, sinon repli déclaratif).
log('2/4 Installation…');
const bin = findClaude();
let viaCli = false;
if (bin) {
  log('  claude trouvé : ' + bin);
  viaCli = installViaCli(bin);
  if (!viaCli) log('La CLI a échoué : repli déclaratif dans settings.json.');
} else {
  log('  claude introuvable' + (NO_CLAUDE ? ' (--no-claude)' : '') + ' : repli déclaratif dans settings.json.');
}
if (!viaCli) declare();
log('');

// 3. Migration d'une install manuelle (no-op propre si absente).
log('3/4 Migration du canal manuel…');
const rm = runNodeScript(path.join(__dirname, 'migrate-to-plugin.js'), ['--no-pause'].concat(PURGE ? ['--purge'] : []));
const migOut = String(rm.stdout || '').split('── Étape suivante')[0].replace(/^── .*──\s*$/m, '');
log(indent(migOut));
if (rm.status !== 0) log('  Avertissement : migration en échec (code ' + rm.status + ') — ' + indent(rm.stderr).trim());
log('');

// 4. Doctor.
log('4/4 Diagnostic…');
const rd = runNodeScript(path.join(__dirname, 'doctor.js'), ['--no-pause']);
log(indent(rd.stdout));
const m = /Statut : (vert|orange|rouge)/.exec(String(rd.stdout || ''));
const verdict = m ? m[1] : 'inconnu';
log('');
log('── Terminé — verdict : ' + verdict.toUpperCase() + ' ──');
log(viaCli
  ? 'Plugin ' + PLUGIN_ID + ' installé. Relance Claude Code (ou /reload-plugins) pour l\'activer.'
  : 'Plugin déclaré dans settings.json : relance Claude Code pour qu\'il l\'installe.');
pause();
process.exit(0);
