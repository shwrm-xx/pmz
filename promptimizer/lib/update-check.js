'use strict';
// Avis de mise à jour (US#181) — module unique partagé par tous les canaux d'avis.
// Cache 24 h (update-check.json dans le dossier d'état), fetch HORS BANDE par un process
// détaché (`node update-check.js --fetch`) : aucun hook n'attend le réseau. Stdlib seule,
// fail-open absolu : aucune fonction ne lève. Opt-out : PMZ_NO_UPDATE_CHECK=1.
const fs = require('fs');
const path = require('path');
const cdir = require('./claude-dir');
const { readVersion, compareSemver, parseSemver } = require('./version');

const DEFAULT_URL = 'https://raw.githubusercontent.com/shwrm-xx/pmz/plugin-release/promptimizer/VERSION';
const URL = process.env.PMZ_UPDATE_URL || DEFAULT_URL;
const TTL_MS = 24 * 3600 * 1000;
const CACHE_FILE = 'update-check.json';

function cachePath() {
  return path.join(process.env.PMZ_STATE_DIR || cdir.stateDir(), CACHE_FILE);
}
function disabled() { return process.env.PMZ_NO_UPDATE_CHECK === '1'; }

function readCache() {
  try {
    const c = JSON.parse(fs.readFileSync(cachePath(), 'utf8'));
    return c && typeof c === 'object' && !Array.isArray(c) ? c : null;
  } catch (_) { return null; }
}

function writeCache(obj) {
  try {
    const p = cachePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = p + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj));
    fs.renameSync(tmp, p);
    return true;
  } catch (_) { return false; }
}

function isStale(c, now) {
  return !c || typeof c.checkedAt !== 'number' || now - c.checkedAt >= TTL_MS;
}

// Sans réseau. behind:false si désactivé, cache absent/corrompu ou semver invalide.
function readCached(opts) {
  try {
    const now = (opts && opts.now) != null ? opts.now : Date.now();
    const local = readVersion();
    if (disabled()) return { local, latest: null, behind: false, stale: false };
    const c = readCache();
    const latest = c && typeof c.latest === 'string' && parseSemver(c.latest) ? c.latest : null;
    const behind = !!(local && latest && compareSemver(local, latest) < 0);
    const out = { local, latest, behind, stale: isStale(c, now) };
    if (c && typeof c.notifiedFor === 'string') out.notifiedFor = c.notifiedFor;
    if (c && typeof c.notifiedAt === 'number') out.notifiedAt = c.notifiedAt;
    return out;
  } catch (_) {
    return { local: null, latest: null, behind: false, stale: false };
  }
}

// Lance `node <ce fichier> --fetch` détaché si le cache est absent ou périmé.
function refreshIfStale(opts) {
  try {
    if (disabled()) return false;
    const now = (opts && opts.now) != null ? opts.now : Date.now();
    if (!isStale(readCache(), now)) return false;
    const spawnImpl = (opts && opts.spawn) || require('child_process').spawn;
    const child = spawnImpl(process.execPath, [__filename, '--fetch'], { detached: true, stdio: 'ignore' });
    if (child && typeof child.on === 'function') child.on('error', () => {});
    if (child && typeof child.unref === 'function') child.unref();
    return true;
  } catch (_) { return false; }
}

// get(url, cb) -> req (signature de https.get). Résout toujours (null en échec/timeout).
function fetchLatest(opts) {
  return new Promise((resolve) => {
    let done = false;
    let timer = null;
    let req = null;
    const finish = (v) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      try { if (req && typeof req.destroy === 'function') req.destroy(); } catch (_) {}
      resolve(v);
    };
    try {
      const timeoutMs = opts && Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 3000;
      const get = (opts && opts.get) || require('https').get;
      timer = setTimeout(() => finish(null), timeoutMs);
      req = get(URL, (res) => {
        try {
          if (!res || res.statusCode !== 200) { if (res && res.resume) res.resume(); return finish(null); }
          let body = '';
          if (res.setEncoding) res.setEncoding('utf8');
          res.on('data', (d) => { body += d; if (body.length > 1024) finish(null); });
          res.on('end', () => { const v = body.trim(); finish(parseSemver(v) ? v : null); });
          res.on('error', () => finish(null));
        } catch (_) { finish(null); }
      });
      if (req && typeof req.on === 'function') req.on('error', () => finish(null));
    } catch (_) { finish(null); }
  });
}

// Écrit le cache (atomique) ; en échec : checkedAt réécrit, ancien latest et notified* conservés.
async function runFetch(opts) {
  try {
    const now = (opts && opts.now) != null ? opts.now : Date.now();
    const old = readCache() || {};
    const got = await fetchLatest(opts);
    const next = { checkedAt: now, latest: got || (typeof old.latest === 'string' ? old.latest : null) };
    if (old.notifiedFor !== undefined) next.notifiedFor = old.notifiedFor;
    if (old.notifiedAt !== undefined) next.notifiedAt = old.notifiedAt;
    writeCache(next);
    return got;
  } catch (_) { return null; }
}

// Un seul avis par jour et par version. `cache` = retour de readCached (ou cache brut).
function shouldNotify(cache, now) {
  try {
    if (!cache) return false;
    const t = now != null ? now : Date.now();
    const behind = typeof cache.behind === 'boolean' ? cache.behind
      : !!(readVersion() && cache.latest && compareSemver(readVersion(), cache.latest) < 0);
    if (!behind) return false;
    return cache.notifiedFor !== cache.latest || typeof cache.notifiedAt !== 'number' || t - cache.notifiedAt >= TTL_MS;
  } catch (_) { return false; }
}

function markNotified(latest, now) {
  try {
    const c = readCache() || { checkedAt: 0, latest: latest || null };
    c.notifiedFor = latest;
    c.notifiedAt = now != null ? now : Date.now();
    return writeCache(c);
  } catch (_) { return false; }
}

function updateNotice(local, latest, opts) {
  let plugin;
  try { plugin = opts && opts.plugin !== undefined ? !!opts.plugin : cdir.isPluginContext(); } catch (_) { plugin = false; }
  const head = `PMZ v${latest} disponible (installé v${local}) — `;
  return head + (plugin
    ? 'claude plugin marketplace update pmz-marketplace && claude plugin update pmz@pmz-marketplace, puis redémarrer Claude Code'
    : "relancer l'installateur promptimizer/install/install.command (.sh / .ps1) depuis un dépôt à jour");
}

module.exports = {
  URL, TTL_MS, CACHE_FILE, cachePath, disabled, readCached, refreshIfStale,
  fetchLatest, runFetch, shouldNotify, markNotified, updateNotice,
};

if (require.main === module) {
  (async () => {
    try {
      const arg = process.argv[2];
      if (disabled()) return;
      if (arg === '--fetch') await runFetch();
      else if (arg === '--print') { const v = await runFetch(); if (v) process.stdout.write(v + '\n'); }
    } catch (_) { /* fail-open */ }
  })().then(() => process.exit(0), () => process.exit(0));
}
