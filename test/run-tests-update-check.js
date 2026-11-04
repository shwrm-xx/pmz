#!/usr/bin/env node
// US#181 — module update-check : cache, spawn détaché, fetch stubé, avis. Zéro réseau réel.
// Usage : node test/run-tests-update-check.js (exit 0 si tout passe).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

const REPO = path.join(__dirname, '..');
const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-upd-'));
process.env.PMZ_STATE_DIR = STATE;
delete process.env.PMZ_NO_UPDATE_CHECK;
const uc = require(path.join(REPO, 'promptimizer', 'lib', 'update-check.js'));
const { readVersion } = require(path.join(REPO, 'promptimizer', 'lib', 'version.js'));

let pass = 0;
const failures = [];
function ok(c, l) { if (c) pass++; else { failures.push(l); console.log('  ✗ ' + l); } }
const cfile = () => uc.cachePath();
const rm = () => { try { fs.unlinkSync(cfile()); } catch (_) {} };
const write = (o) => fs.writeFileSync(cfile(), typeof o === 'string' ? o : JSON.stringify(o));
const read = () => JSON.parse(fs.readFileSync(cfile(), 'utf8'));
const NOW = 1_800_000_000_000;
const local = readVersion();
const [maj, min, pat] = local.split('.').map(Number);
const newer = `${maj}.${min}.${pat + 1}`;
const older = `${maj}.${min}.${Math.max(0, pat - 1)}`;

function stubSpawn() {
  const calls = [];
  const fn = (cmd, args, o) => { calls.push({ cmd, args, o }); const c = new EventEmitter(); c.unref = () => { c.unrefd = true; }; return c; };
  fn.calls = calls;
  return fn;
}
// get stub : res(status, body) | 'error' | 'timeout' | 'throw'
function stubGet(kind, body) {
  return (url, cb) => {
    const req = new EventEmitter();
    req.destroy = () => {};
    if (kind === 'throw') throw new Error('boom');
    setImmediate(() => {
      if (kind === 'error') return req.emit('error', new Error('net'));
      if (kind === 'timeout') return; // ne répond jamais
      const res = new EventEmitter();
      res.statusCode = 200; res.setEncoding = () => {}; res.resume = () => {};
      cb(res);
      res.emit('data', body); res.emit('end');
    });
    return req;
  };
}

(async () => {
  ok(uc.TTL_MS === 86400000 && uc.CACHE_FILE === 'update-check.json', 'constantes TTL_MS / CACHE_FILE');
  ok(cfile() === path.join(STATE, 'update-check.json'), 'cachePath sous PMZ_STATE_DIR');

  // refreshIfStale
  rm();
  let sp = stubSpawn();
  ok(uc.refreshIfStale({ now: NOW, spawn: sp }) === true && sp.calls.length === 1, 'cache absent : un seul spawn');
  ok(sp.calls[0].args.includes('--fetch') && sp.calls[0].o.detached === true && sp.calls[0].o.stdio === 'ignore', 'spawn détaché --fetch stdio ignore');
  write({ checkedAt: NOW - 1000, latest: newer });
  sp = stubSpawn();
  ok(uc.refreshIfStale({ now: NOW, spawn: sp }) === false && sp.calls.length === 0, 'cache frais : aucun spawn');
  write({ checkedAt: NOW - uc.TTL_MS, latest: newer });
  sp = stubSpawn();
  ok(uc.refreshIfStale({ now: NOW, spawn: sp }) === true, 'cache à 24 h pile : spawn');
  ok(uc.refreshIfStale({ now: NOW, spawn: () => { throw new Error('x'); } }) === false, 'spawn qui lève : false sans exception');

  // readCached
  write({ checkedAt: NOW, latest: newer });
  let r = uc.readCached({ now: NOW });
  ok(r.behind === true && r.latest === newer && r.local === local && r.stale === false, 'latest > local : behind true');
  write({ checkedAt: NOW, latest: local });
  ok(uc.readCached({ now: NOW }).behind === false, 'latest = local : behind false');
  write({ checkedAt: NOW, latest: older });
  ok(uc.readCached({ now: NOW }).behind === false, 'latest < local : behind false');
  write({ checkedAt: NOW - uc.TTL_MS - 1, latest: newer });
  ok(uc.readCached({ now: NOW }).stale === true, 'stale si > 24 h');
  write('{pas du json');
  r = uc.readCached({ now: NOW });
  ok(r.behind === false && r.stale === true, 'cache corrompu : behind false, sans exception');
  write({ checkedAt: NOW, latest: 'pas-semver' });
  ok(uc.readCached({ now: NOW }).behind === false, 'semver invalide : behind false');
  rm();
  ok(uc.readCached({ now: NOW }).behind === false, 'cache absent : behind false');

  // opt-out
  process.env.PMZ_NO_UPDATE_CHECK = '1';
  write({ checkedAt: NOW, latest: newer });
  ok(uc.readCached({ now: NOW }).behind === false, 'opt-out : behind false');
  rm();
  sp = stubSpawn();
  ok(uc.refreshIfStale({ now: NOW, spawn: sp }) === false && sp.calls.length === 0, 'opt-out : aucun spawn');
  delete process.env.PMZ_NO_UPDATE_CHECK;

  // fetchLatest / runFetch
  ok(await uc.fetchLatest({ get: stubGet('ok', newer + '\n') }) === newer, 'fetchLatest : corps trimé valide');
  ok(await uc.fetchLatest({ get: stubGet('ok', '<html>404</html>') }) === null, 'fetchLatest : corps invalide -> null');
  ok(await uc.fetchLatest({ get: stubGet('error') }) === null, 'fetchLatest : erreur -> null');
  ok(await uc.fetchLatest({ get: stubGet('throw') }) === null, 'fetchLatest : get qui lève -> null');
  ok(await uc.fetchLatest({ get: stubGet('timeout'), timeoutMs: 30 }) === null, 'fetchLatest : timeout -> null');

  rm();
  await uc.runFetch({ now: NOW, get: stubGet('ok', newer) });
  ok(read().checkedAt === NOW && read().latest === newer, 'runFetch succès : checkedAt + latest');
  ok(!fs.readdirSync(STATE).some((f) => f.endsWith('.tmp')), 'runFetch : pas de .tmp résiduel');
  write({ checkedAt: 1, latest: newer, notifiedFor: newer, notifiedAt: 5 });
  for (const [k, b] of [['error'], ['timeout'], ['ok', 'garbage']]) {
    write({ checkedAt: 1, latest: newer, notifiedFor: newer, notifiedAt: 5 });
    await uc.runFetch({ now: NOW, get: stubGet(k, b), timeoutMs: 30 });
    const c = read();
    ok(c.checkedAt === NOW && c.latest === newer && c.notifiedFor === newer && c.notifiedAt === 5, `runFetch échec (${k}) : checkedAt réécrit, latest et notified* conservés`);
  }
  rm();
  await uc.runFetch({ now: NOW, get: stubGet('error') });
  ok(read().checkedAt === NOW && read().latest === null, 'runFetch échec sans cache : latest null');

  // shouldNotify / markNotified
  write({ checkedAt: NOW, latest: newer });
  ok(uc.shouldNotify(uc.readCached({ now: NOW }), NOW) === true, 'shouldNotify : jamais notifié');
  uc.markNotified(newer, NOW);
  ok(read().notifiedFor === newer && read().notifiedAt === NOW && read().latest === newer, 'markNotified persiste');
  ok(uc.shouldNotify(uc.readCached({ now: NOW }), NOW + 1000) === false, 'shouldNotify : une fois par jour');
  ok(uc.shouldNotify(uc.readCached({ now: NOW }), NOW + uc.TTL_MS) === true, 'shouldNotify : de nouveau après 24 h');
  write({ checkedAt: NOW, latest: `${maj}.${min}.${pat + 2}`, notifiedFor: newer, notifiedAt: NOW });
  ok(uc.shouldNotify(uc.readCached({ now: NOW }), NOW + 1000) === true, 'shouldNotify : nouvelle version -> avis');
  write({ checkedAt: NOW, latest: local });
  ok(uc.shouldNotify(uc.readCached({ now: NOW }), NOW) === false, 'shouldNotify : pas en retard -> false');

  // updateNotice
  const np = uc.updateNotice('1.0.0', '1.1.0', { plugin: true });
  const nm = uc.updateNotice('1.0.0', '1.1.0', { plugin: false });
  ok(np.startsWith('PMZ v1.1.0 disponible (installé v1.0.0) — ') && np.includes('claude plugin marketplace update pmz-marketplace && claude plugin update pmz@pmz-marketplace') && np.includes('redémarrer Claude Code'), 'updateNotice canal plugin');
  ok(nm.includes('install.command (.sh / .ps1)') && !nm.includes('claude plugin'), 'updateNotice canal manuel');
  ok(!/\n/.test(np) && !/\n/.test(nm), 'updateNotice : une seule ligne');

  // CLI : opt-out -> exit 0 sans réseau
  const { spawnSync } = require('child_process');
  const cli = spawnSync(process.execPath, [path.join(REPO, 'promptimizer', 'lib', 'update-check.js'), '--print'], { encoding: 'utf8', env: Object.assign({}, process.env, { PMZ_NO_UPDATE_CHECK: '1' }) });
  ok(cli.status === 0 && cli.stdout === '', 'CLI --print opt-out : exit 0, rien');
  const cli2 = spawnSync(process.execPath, [path.join(REPO, 'promptimizer', 'lib', 'update-check.js'), '--print'], { encoding: 'utf8', timeout: 8000, env: Object.assign({}, process.env, { PMZ_UPDATE_URL: 'http://127.0.0.1:9/VERSION' }) });
  ok(cli2.status === 0, 'CLI --print réseau en échec : exit 0');

  try { fs.rmSync(STATE, { recursive: true, force: true }); } catch (_) {}
  console.log(`update-check : ${pass} OK · ${failures.length} échec(s)`);
  process.exit(failures.length ? 1 : 0);
})();
