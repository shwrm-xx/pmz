#!/usr/bin/env node
// US#182 — avis de mise à jour : session-start (startup seul), statusline, doctor. Zéro réseau réel
// (PMZ_UPDATE_URL invalide ; https.get remplacé par un stub via --require pour doctor).
// Usage : node test/run-tests-update-notice.js (exit 0 si tout passe).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const PKG = path.join(REPO, 'promptimizer');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-notice-'));
const { readVersion } = require(path.join(PKG, 'lib', 'version.js'));
const local = readVersion();
const [maj, min, pat] = local.split('.').map(Number);
const newer = `${maj}.${min}.${pat + 1}`;

let pass = 0;
const failures = [];
function ok(c, l) { if (c) pass++; else { failures.push(l); console.log('  ✗ ' + l); } }

let n = 0;
function freshState() { const d = path.join(TMP, 's' + (n++)); fs.mkdirSync(d, { recursive: true }); return d; }
function baseEnv(state, extra) {
  const e = Object.assign({}, process.env);
  delete e.PMZ_NO_UPDATE_CHECK; delete e.CLAUDE_PLUGIN_ROOT; delete e.CLAUDE_PLUGIN_DATA; delete e.PMZ_DISABLED;
  return Object.assign(e, {
    PMZ_STATE_DIR: state, PMZ_UPDATE_URL: 'http://127.0.0.1:9/VERSION',
    CLAUDE_CONFIG_DIR: path.join(TMP, 'cfg'),
  }, extra || {});
}
const cacheOf = (state) => path.join(state, 'update-check.json');
function seed(state, o) { fs.writeFileSync(cacheOf(state), typeof o === 'string' ? o : JSON.stringify(o)); }
function fresh(latest) { return { checkedAt: Date.now(), latest }; }
const CWD = path.join(TMP, 'cwd'); fs.mkdirSync(CWD, { recursive: true });

function session(state, source, extra, preload) {
  const args = preload ? ['-r', preload] : [];
  args.push(path.join(PKG, 'hooks', 'session-start.js'));
  const r = spawnSync(process.execPath, args, {
    input: JSON.stringify(source ? { source, cwd: CWD } : { cwd: CWD }), encoding: 'utf8', cwd: CWD, timeout: 15000, env: baseEnv(state, extra),
  });
  let ctx = '';
  try { ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext || ''; } catch (_) { ctx = ''; }
  return { status: r.status, ctx };
}

// 1. startup : avis une fois, pas au 2e lancement du jour
{
  const st = freshState(); seed(st, fresh(newer));
  const a = session(st, 'startup');
  ok(a.status === 0 && a.ctx.includes(`PMZ v${newer} disponible`) && a.ctx.includes("Dis UNE fois à l'utilisateur"), 'startup : avis injecté');
  const b = session(st, 'startup');
  ok(b.status === 0 && !b.ctx.includes('disponible'), 'startup : 2e lancement du jour sans avis');
}
// 2. resume / compact / clear : pas d'avis
for (const src of ['resume', 'compact', 'clear']) {
  const st = freshState(); seed(st, fresh(newer));
  const r = session(st, src);
  ok(r.status === 0 && !r.ctx.includes('disponible'), `${src} : pas d'avis`);
}
// 3. sans cache
{
  const st = freshState();
  const r = session(st, 'startup');
  ok(r.status === 0 && !r.ctx.includes('disponible'), 'sans cache : exit 0, pas d\'avis');
}
// 4. cache corrompu
{
  const st = freshState(); seed(st, '{pas du json');
  const r = session(st, 'startup');
  ok(r.status === 0 && !r.ctx.includes('disponible'), 'cache corrompu : exit 0, pas d\'avis');
}
// à jour / opt-out : pas d'avis
{
  const st = freshState(); seed(st, fresh(local));
  ok(!session(st, 'startup').ctx.includes('disponible'), 'à jour : pas d\'avis');
  const st2 = freshState(); seed(st2, fresh(newer));
  ok(!session(st2, 'startup', { PMZ_NO_UPDATE_CHECK: '1' }).ctx.includes('disponible'), 'opt-out : pas d\'avis');
}
// 7. coexistence welcome + avis (welcome stubé : son marqueur dépend d'un dossier d'état vide)
{
  const st = freshState(); seed(st, fresh(newer));
  const pre = path.join(TMP, 'stub-welcome.js');
  fs.writeFileSync(pre, "const M=require('module');const o=M._load;M._load=function(r,...a){const m=o.call(this,r,...a);" +
    "if(/lib[\\/\\\\]welcome(\\.js)?$/.test(r)) return Object.assign({}, m, {firstRunWelcome:()=>'WELCOME_TEST'});return m;};");
  const r = session(st, 'startup', null, pre);
  ok(r.ctx.includes('WELCOME_TEST') && r.ctx.includes(`PMZ v${newer} disponible`), 'welcome et avis coexistent');
}

// 5. statusline
function statusline(state, extra) {
  const r = spawnSync(process.execPath, [path.join(PKG, 'scripts', 'statusline.js')], {
    input: JSON.stringify({ cwd: CWD }), encoding: 'utf8', cwd: CWD, timeout: 15000, env: baseEnv(state, extra),
  });
  return { status: r.status, out: (r.stdout || '').split('\n')[0] };
}
{
  const st = freshState(); seed(st, fresh(newer));
  const s = statusline(st);
  ok(s.status === 0 && s.out.startsWith(`PMZ v${local} · ↑ v${newer}`), 'statusline : ↑ v<latest> si en retard');
  const st2 = freshState(); seed(st2, fresh(local));
  ok(!statusline(st2).out.includes('↑'), 'statusline : badge omis à jour');
  ok(!statusline(freshState()).out.includes('↑'), 'statusline : badge omis sans cache');
  ok(!statusline(st, { PMZ_NO_UPDATE_CHECK: '1' }).out.includes('↑'), 'statusline : badge omis en opt-out');
}

// 6. doctor (https.get stubé par --require, hérité par le process --print)
const stubGet = path.join(TMP, 'stub-https.js');
fs.writeFileSync(stubGet, [
  "const https=require('https');const {EventEmitter}=require('events');",
  "https.get=function(url,cb){const req=new EventEmitter();req.destroy=()=>{};",
  "setImmediate(()=>{const v=process.env.PMZ_TEST_LATEST;if(!v){req.emit('error',new Error('x'));return;}",
  "const res=new EventEmitter();res.statusCode=200;res.setEncoding=()=>{};res.resume=()=>{};cb(res);",
  "res.emit('data',v+'\\n');res.emit('end');});return req;};",
].join(''));
fs.mkdirSync(path.join(TMP, 'cfg'), { recursive: true });
fs.writeFileSync(path.join(TMP, 'cfg', 'settings.json'), '{}');
function doctor(extra) {
  const st = freshState();
  const r = spawnSync(process.execPath, [path.join(PKG, 'install', 'doctor.js'), '--no-pause'], {
    encoding: 'utf8', cwd: CWD, timeout: 30000,
    env: baseEnv(st, Object.assign({ NODE_OPTIONS: '--require ' + JSON.stringify(stubGet) }, extra)),
  });
  const out = r.stdout || '';
  const line = (out.split('\n').find((l) => l.startsWith('Mise à jour')) || '');
  const status = ((out.match(/^Statut : (\S+)/m)) || [])[1];
  return { code: r.status, line, status };
}
{
  const uptodate = doctor({ PMZ_TEST_LATEST: local });
  const behind = doctor({ PMZ_TEST_LATEST: newer });
  const down = doctor({});
  const off = doctor({ PMZ_NO_UPDATE_CHECK: '1' });
  ok(uptodate.code === 0 && /vert — à jour/.test(uptodate.line), 'doctor : à jour (vert)');
  ok(/orange — .*disponible/.test(behind.line) && behind.line.includes('claude plugin update pmz@pmz-marketplace'), 'doctor : en retard (orange + commande)');
  ok(/orange — vérification impossible/.test(down.line), 'doctor : injoignable (orange)');
  ok(off.line.includes('vérification désactivée (PMZ_NO_UPDATE_CHECK)') && !/orange|rouge/.test(off.line), 'doctor : opt-out');
  const all = [uptodate, behind, down, off];
  ok(all.every((d) => d.status === uptodate.status), 'doctor : le statut global ne dépend pas de la ligne Mise à jour');
  ok(!all.some((d) => /rouge/.test(d.line)), 'doctor : ligne jamais rouge');
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
console.log(`update-notice : ${pass} OK · ${failures.length} échec(s)`);
process.exit(failures.length ? 1 : 0);
