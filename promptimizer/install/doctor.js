#!/usr/bin/env node
'use strict';
// Diagnostic Promptimizer — cross-platform (macOS / Linux / Windows), stdlib seule.
// Appelé par install.js (--no-pause) et par les lanceurs pmz-doctor.command/.sh/.ps1.
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const cdir = require('../lib/claude-dir');
const { readVersion, compareSemver } = require('../lib/version');
const { readLineSync } = require('./lib-io');

// ── `doctor --state` (US#189) : fichiers d'état figés d'un PROJET gouverné ────────────────────
// Appelé par `backlog.js doctor --state [--fix]` (et `/doctor`). Fail-open : ne lève jamais,
// exit 0 sauf rouge (état illisible / correction échouée). Sans --fix, ne modifie RIEN.
function stateCheck(root, opts) {
  const o = opts || {};
  const now = o.now != null ? o.now : Date.now();
  const vd = path.join(root, '.vibe-agent');
  const items = []; // { level:'orange'|'rouge', msg, fix: () => void|string }
  const rj = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return undefined; } };
  const gitq = (args) => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (_) { return null; } };
  const days = (ms) => Math.floor(ms / 86400000);

  // 1. fleet.json vide ou plus vieux que 7 j.
  const fleetF = path.join(vd, 'fleet.json');
  if (fs.existsSync(fleetF)) {
    const f = rj(fleetF);
    if (f === undefined) items.push({ level: 'rouge', msg: 'fleet.json illisible (JSON invalide)', fix: () => fs.rmSync(fleetF, { force: true }) });
    else {
      const t = Date.parse((f && f.updated_at) || '') || fs.statSync(fleetF).mtimeMs;
      const empty = !f || !Array.isArray(f.lots) || f.lots.length === 0;
      const age = days(now - t);
      if (empty || age > 7) items.push({ level: 'orange', msg: `fleet.json figé (${empty ? 'vide' : 'lots'}, ${age} j)`, fix: () => fs.rmSync(fleetF, { force: true }) });
    }
  }
  // 2. alerte de concurrence dont la clé n'appartient pas au semis live courant.
  const alertF = path.join(vd, 'epicmaster-concurrency-alert.json');
  if (fs.existsSync(alertF)) {
    const a = rj(alertF);
    const live = rj(path.join(vd, 'epicmaster-live.json'));
    const seeded = live && typeof live.seeded_at === 'string' ? live.seeded_at : null;
    const keys = a && typeof a === 'object' && !Array.isArray(a) ? Object.keys(a) : [];
    const stale = keys.filter((k) => !seeded || !k.startsWith(seeded + ':'));
    if (a === undefined || stale.length) {
      items.push({ level: 'orange', msg: `alerte de concurrence périmée (seeded_at ≠ live, ${stale.length || 'JSON invalide'})`, fix: () => {
        const keep = {}; for (const k of keys) if (!stale.includes(k)) keep[k] = a[k];
        if (Object.keys(keep).length) fs.writeFileSync(alertF, JSON.stringify(keep, null, 2) + '\n'); else fs.rmSync(alertF, { force: true });
      } });
    }
  }
  // 3. consignes-sous-agent.md pointant hors dépôt.
  const consF = path.join(vd, 'consignes-sous-agent.md');
  if (fs.existsSync(consF)) {
    let txt = ''; try { txt = fs.readFileSync(consF, 'utf8'); } catch (_) { /* ignoré */ }
    const m = txt.match(/D[ée]p[ôo]t\s*:\s*`?(\/[^\s`,;)]+?)[.`]?(?:[\s,;)]|$)/);
    const rp = (x) => { try { return fs.realpathSync(x); } catch (_) { return path.resolve(x); } };
    if (m && rp(m[1]) !== rp(root)) items.push({ level: 'orange', msg: `consignes-sous-agent.md pointe hors dépôt (${m[1]})`, fix: () => fs.rmSync(consF, { force: true }) });
  }
  // 4. .claude/agents/*-lot-* d'une epic close (aucune US ouverte au backlog).
  const agDir = path.join(root, '.claude', 'agents');
  let agents = []; try { agents = fs.readdirSync(agDir).filter((n) => /-lot-[^/]*\.md$/.test(n)); } catch (_) { /* aucun */ }
  if (agents.length) {
    const bl = rj(path.join(vd, 'backlog.json'));
    const lots = bl && Array.isArray(bl.lots) ? bl.lots : null;
    const open = lots ? lots.filter((l) => l && l.status !== 'done' && l.status !== 'dropped').length : 0;
    if (lots && open === 0) items.push({ level: 'orange', msg: `.claude/agents d'une epic close (${agents.join(', ')})`, fix: () => agents.forEach((n) => fs.rmSync(path.join(agDir, n), { force: true })) });
  }
  // 5. lot-counter.json / handoff.md versionnés alors que .gitignore les exclut.
  for (const n of ['lot-counter.json', 'handoff.md']) {
    const rel = path.join('.vibe-agent', n);
    const tracked = (gitq(['ls-files', '--', rel]) || '').trim();
    if (tracked && gitq(['check-ignore', '-q', '--no-index', '--', rel]) !== null) {
      items.push({ level: 'orange', msg: `${rel} versionné contre .gitignore`, fix: () => { if (gitq(['rm', '--cached', '-q', '--', rel]) === null) throw new Error('git rm --cached a échoué'); } });
    }
  }

  const lines = [];
  let level = items.some((i) => i.level === 'rouge') ? 'rouge' : items.length ? 'orange' : 'vert';
  for (const i of items) lines.push(`  [${i.level}] ${i.msg}`);
  if (o.fix && items.length) {
    let failed = 0;
    for (const i of items) { try { i.fix(); lines.push(`  corrigé : ${i.msg}`); } catch (e) { failed += 1; lines.push(`  ÉCHEC correction : ${i.msg} (${e.message})`); } }
    level = failed ? 'rouge' : 'vert';
  }
  return { level, items: items.map((i) => ({ level: i.level, msg: i.msg })), lines };
}
if (require.main === module && process.argv.slice(2).includes('--state')) {
  try {
    const a = process.argv.slice(2);
    const ri = a.indexOf('--root');
    const r = stateCheck(path.resolve(ri !== -1 && a[ri + 1] ? a[ri + 1] : process.cwd()), { fix: a.includes('--fix') });
    process.stdout.write(`doctor --state : ${r.level.toUpperCase()}\n` + (r.lines.length ? r.lines.join('\n') + '\n' : ''));
    if (r.level === 'orange' && !a.includes('--fix')) process.stdout.write('  → relancer avec --fix pour purger (git rm --cached / suppression, après ce rapport).\n');
  } catch (_) { /* fail-open */ }
  process.exit(0);
}
module.exports = { stateCheck };

const DEST = cdir.claudeDir();
const SETTINGS = cdir.settingsPath();

// ── Détection du canal plugin (lots D-E) ────────────────────────────────────────────────
// Le doctor est historiquement l'outil du canal MANUEL : il conclut « rouge » si les hooks PMZ
// ne sont pas câblés dans settings.json. En canal PLUGIN, hooks/skill/commandes sont fournis PAR
// le plugin (jamais dans settings.json ni ~/.claude/skills) : exiger le câblage manuel faisait
// donc conclure « rouge » sur une install pourtant saine (retour utilisateur 2026-07-12). On
// détecte le plugin par signaux INDÉPENDANTS de la commande `claude` (souvent introuvable dans
// le PATH épuré des apps GUI macOS), tous en lecture de fichier.
const IS_PLUGIN = !!(process.env.CLAUDE_PLUGIN_ROOT && process.env.CLAUDE_PLUGIN_ROOT.trim());
function pluginEnabledInSettings() {
  try {
    const data = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const ep = data && data.enabledPlugins;
    return !!ep && Object.keys(ep).some((k) => k.split('@')[0] === 'pmz' && ep[k] === true);
  } catch (_) { return false; }
}
// installed_plugins.json → chemin d'install du plugin pmz (pour exercer SES hooks quand le
// canal manuel a été nettoyé). Null si absent.
function pluginInstallPath() {
  if (IS_PLUGIN) return process.env.CLAUDE_PLUGIN_ROOT.trim();
  try {
    const data = JSON.parse(fs.readFileSync(path.join(DEST, 'plugins', 'installed_plugins.json'), 'utf8'));
    for (const key of Object.keys(data.plugins || {})) {
      const arr = data.plugins[key];
      if (key.split('@')[0] === 'pmz' && Array.isArray(arr) && arr[0] && arr[0].installPath) return arr[0].installPath;
    }
  } catch (_) { /* fichier absent -> pas de plugin */ }
  return null;
}
const PLUGIN_ROOT = pluginInstallPath();
const pluginActive = IS_PLUGIN || pluginEnabledInSettings() || !!PLUGIN_ROOT;

// Version du plugin INSTALLÉ (cache ~/.claude/plugins/cache/...). Priorité au fichier VERSION
// embarqué dans le cache — c'est le code qui tourne réellement — puis repli sur le champ
// `version` d'installed_plugins.json (métadonnée CLI). Null si indéterminable.
function pluginInstalledVersion() {
  if (!PLUGIN_ROOT) return null;
  try {
    const raw = fs.readFileSync(path.join(PLUGIN_ROOT, 'VERSION'), 'utf8').trim();
    if (raw) return raw;
  } catch (_) { /* VERSION absente du cache -> repli métadonnée */ }
  try {
    const data = JSON.parse(fs.readFileSync(path.join(DEST, 'plugins', 'installed_plugins.json'), 'utf8'));
    for (const key of Object.keys(data.plugins || {})) {
      const arr = data.plugins[key];
      if (key.split('@')[0] === 'pmz' && Array.isArray(arr) && arr[0] && arr[0].version) {
        return String(arr[0].version);
      }
    }
  } catch (_) { /* fichier absent */ }
  return null;
}

// Racine du CODE PMZ à exercer (dry-run hook + détection projet). Priorité : canal manuel
// présent sur disque > plugin (env/installé). Le doctor étant l'outil du canal manuel, on
// diagnostique le code manuel s'il existe encore, sinon celui du plugin.
const MANUAL_PMZ = path.join(DEST, 'promptimizer');
const PMZ = fs.existsSync(path.join(MANUAL_PMZ, 'hooks', 'session-start.js'))
  ? MANUAL_PMZ
  : (PLUGIN_ROOT && fs.existsSync(path.join(PLUGIN_ROOT, 'hooks', 'session-start.js')) ? PLUGIN_ROOT
    // Doctor lancé depuis le plugin lui-même (/pmz:doctor, lot #144) : sa racine = dossier parent
    // d'install/, même si ni l'env ni installed_plugins.json ne la désignent.
    : (fs.existsSync(path.join(__dirname, '..', 'hooks', 'session-start.js')) ? path.resolve(__dirname, '..') : MANUAL_PMZ));

// Sibling direct de ce fichier (pas via pmzDir()) : doctor.js et merge-settings.js sont livrés
// ensemble (miroir manuel ET <plugin>/install/, INSTALL_SHIPPED de build-plugin.js, lot #144) —
// même si CLAUDE_PLUGIN_ROOT est posée par ailleurs (double install, D3).
const MS = path.join(__dirname, 'merge-settings.js');
const NO_PAUSE = process.argv.slice(2).includes('--no-pause');

function log(s) { process.stdout.write(s + '\n'); }
// « command -v » cross-platform : tente `<cmd> --version`, vrai si ça n'échoue pas au lancement.
function hasCmd(cmd) {
  try {
    const r = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
    return !r.error && r.status !== null;
  } catch (_) { return false; }
}

// Claude settings
const setOk = fs.existsSync(SETTINGS) ? 'OK' : '—';

// Hooks PMZ + double Stop (via merge-settings --check)
let hooksOk = '—';
let double = false;
let legacyHooksPresent = false;
if (fs.existsSync(MS)) {
  try {
    const chk = execFileSync(process.execPath, [MS, SETTINGS, '--check'], { encoding: 'utf8' });
    legacyHooksPresent = /"pmz_hooks_present":\s*true/.test(chk);
    if (legacyHooksPresent) hooksOk = 'OK';
    if (/"double_stop":\s*true/.test(chk)) double = true;
  } catch (_) { /* ignore */ }
}

// Double install (lot D3) : l'installeur manuel n'a jamais été retiré après un passage au
// plugin — les deux canaux tirent alors les mêmes hooks en même temps. Détecté dès que des
// hooks PMZ légataires traînent dans settings.json ET que le plugin est actif par ailleurs
// (env CLAUDE_PLUGIN_ROOT, ou installed_plugins.json). Lecture de fichier seule : plus de
// dépendance à la commande `claude`, souvent absente du PATH GUI macOS.
const doubleInstall = legacyHooksPresent && pluginActive;

// Skill
const skillOk = fs.existsSync(path.join(DEST, 'skills', 'promptimizer', 'SKILL.md')) ? 'OK' : '—';

// Scripts + dry-run réel d'un hook
let scriptsOk = '—';
const sessionStart = path.join(PMZ, 'hooks', 'session-start.js');
if (fs.existsSync(sessionStart)) {
  try {
    execFileSync(process.execPath, [sessionStart], { input: '{}', stdio: ['pipe', 'ignore', 'ignore'] });
    scriptsOk = 'OK';
  } catch (_) { /* ignore */ }
}

// Projet courant
let proj = 'non initialisé';
const detect = path.join(PMZ, 'scripts', 'detect-project.js');
if (fs.existsSync(detect)) {
  try {
    const det = execFileSync(process.execPath, [detect], { encoding: 'utf8' });
    if (/"is_git_repo":\s*false/.test(det)) proj = 'hors dépôt git';
    if (/"initialized":\s*true/.test(det)) proj = 'initialisé';
  } catch (_) { /* ignore */ }
}

// Capacités
const nodeV = process.version;
const gitOk = hasCmd('git') ? 'OK' : 'absent';
const rgOk = hasCmd('rg') ? 'présent' : 'absent (git grep/grep utilisés)';

const version = readVersion();

// Dérive de version source ↔ plugin installé (post-mortem v1.1.1) : les sessions exécutent le
// CACHE plugin, jamais cette source — si la source (arbre du doctor) est EN AVANCE sur le cache,
// les fixes committés ne tournent nulle part. Seule cette direction alerte (cache en avance =
// simple checkout en retard, pas un défaut d'install). compareSemver null (version illisible)
// -> pas d'alerte (fail-open).
const pluginVersion = pluginActive ? pluginInstalledVersion() : null;
const versionDrift = !!(version && pluginVersion && compareSemver(version, pluginVersion) === 1);

// Canal effectif : conflit (deux canaux) > plugin > manuel. En plugin sain, hooks/skill sont
// portés par le plugin — on l'affiche explicitement au lieu du « — » trompeur du canal manuel.
const channel = doubleInstall ? 'plugin + manuel (CONFLIT)' : pluginActive ? 'plugin' : 'manuel';
const pluginProvides = pluginActive && !legacyHooksPresent;

// Ligne « Mise à jour » (US#182) : informative, JAMAIS rouge et sans effet sur le statut global
// (une version en retard n'est pas une install cassée). Version distante via update-check --print
// (spawnSync, timeout 5 s). Fail-open : toute erreur -> « vérification impossible ».
function updateLine() {
  try {
    if (process.env.PMZ_NO_UPDATE_CHECK === '1') return 'vérification désactivée (PMZ_NO_UPDATE_CHECK)';
    const uc = path.join(__dirname, '..', 'lib', 'update-check.js');
    const r = spawnSync(process.execPath, [uc, '--print'], { encoding: 'utf8', timeout: 5000 });
    const latest = ((r && r.stdout) || '').trim();
    if (!latest || !version) return 'orange — vérification impossible';
    const cmp = compareSemver(version, latest);
    if (cmp === null || cmp === undefined) return 'orange — vérification impossible';
    if (cmp < 0) {
      return 'orange — v' + latest + ' disponible (installé v' + version + ') : ' + (pluginActive
        ? 'claude plugin marketplace update pmz-marketplace && claude plugin update pmz@pmz-marketplace, puis redémarrer'
        : "relancer l'installateur promptimizer/install/install.command (.sh / .ps1) depuis un dépôt à jour");
    }
    return 'vert — à jour (v' + version + ')';
  } catch (_) { return 'orange — vérification impossible'; }
}

log('Promptimizer — diagnostic');
log('');
log('Version installée : ' + (version || 'inconnue'));
log('Claude settings : ' + setOk);
log('Canal : ' + channel);
if (pluginActive) log('Plugin installé : ' + (pluginVersion || 'version inconnue'));
if (pluginProvides) {
  log('Hooks / skill / commandes : fournis par le plugin');
} else {
  log('Hooks globaux : ' + hooksOk);
  log('Skill globale : ' + skillOk);
}
log('Scripts exécutables : ' + scriptsOk);
log('Mise à jour : ' + updateLine());
log('Projet courant : ' + proj);
log('');
log('node : ' + nodeV + ' | git : ' + gitOk + ' | rg : ' + rgOk);
if (double) log('Avertissement : deux hooks Stop actifs (PMZ + context-guard.py).');
if (doubleInstall) {
  log('Avertissement : double installation détectée (plugin + canal manuel legacy) — ' +
    'les hooks PMZ tirent deux fois. Migration : node install/migrate-to-plugin.js.');
}
if (versionDrift) {
  log('Avertissement : dérive de version — cette source est en ' + version + ', le plugin ' +
    'installé en ' + pluginVersion + '. Les sessions exécutent le cache plugin, pas la source : ' +
    'node install/build-plugin.js puis « claude plugin update pmz » + redémarrage.');
}

// Statut. setOk illisible = rouge quel que soit le canal. Deux canaux actifs = orange (à
// résoudre). En plugin sain, hooks/skill sont fournis par le plugin : on n'exige PAS le
// câblage manuel (c'était la cause du faux « rouge »). En manuel, comportement historique.
let status = 'vert';
if (setOk !== 'OK') status = 'rouge';
else if (doubleInstall) status = 'orange';
else if (pluginActive) { if (scriptsOk !== 'OK' || double || versionDrift) status = 'orange'; }
else if (hooksOk !== 'OK') status = 'rouge';
else if (skillOk !== 'OK' || scriptsOk !== 'OK' || double) status = 'orange';
log('');
log('Statut : ' + status);

if (!NO_PAUSE && process.stdin.isTTY) {
  log('');
  log('Appuie sur Entrée pour fermer.');
  readLineSync();
}
