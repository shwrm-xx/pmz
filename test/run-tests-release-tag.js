#!/usr/bin/env node
// US#168/#169 — Releases traçables : tagPlan (pur) + publish-plugin.js sans --push en bac à sable git.
// Zéro dépendance. Usage : node test/run-tests-release-tag.js (exit 0 si tout passe).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const { tagPlan } = require(path.join(REPO, 'promptimizer', 'install', 'publish-plugin.js'));
let pass = 0;
const failures = [];
function ok(cond, label) { if (cond) pass++; else { failures.push(label); console.log('  ✗ ' + label); } }

// 1. Décisions de tagPlan (US#169 : tag local non poussé).
const tp = (localSha, remoteSha) => tagPlan({ version: '1.2.3', headSha: 'aaa', localSha, remoteSha });
ok(tp(null, null) === 'create', 'tagPlan : create sans tag');
ok(tp(undefined, undefined) === 'create', 'tagPlan : create sans tag (remote non interrogé)');
ok(tp('aaa', null) === 'push', 'tagPlan : push si tag local = HEAD et absent du remote');
ok(tp('aaa', 'aaa') === 'noop', 'tagPlan : noop si local = remote = HEAD');
ok(tp('aaa', undefined) === 'noop', 'tagPlan : noop si local = HEAD et remote non interrogé');
ok(tp(null, 'aaa') === 'noop', 'tagPlan : noop si seul le remote = HEAD');
ok(tp('bbb', null) === 'conflict', 'tagPlan : conflict si local ≠ HEAD');
ok(tp('aaa', 'bbb') === 'conflict', 'tagPlan : conflict si remote ≠ HEAD');
ok(tp(null, 'bbb') === 'conflict', 'tagPlan : conflict si remote seul ≠ HEAD');

// 2. Sans --push : bac à sable git, rien poussé, tag prévu affiché.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-reltag-'));
try {
  const sh = (args, o) => spawnSync('git', args, Object.assign({ cwd: root, encoding: 'utf8' }, o));
  fs.cpSync(path.join(REPO, 'promptimizer'), path.join(root, 'promptimizer'), { recursive: true });
  if (fs.existsSync(path.join(REPO, 'skills'))) fs.cpSync(path.join(REPO, 'skills'), path.join(root, 'skills'), { recursive: true });
  if (fs.existsSync(path.join(REPO, '.claude-plugin'))) fs.cpSync(path.join(REPO, '.claude-plugin'), path.join(root, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'promptimizer', 'VERSION'), '9.9.9\n');
  sh(['init', '-q']);
  // Identité locale au bac à sable (jamais globale) : le commit du script tourne aussi sans identité git.
  sh(['config', 'user.name', 't']);
  sh(['config', 'user.email', 't@t']);
  sh(['add', '-A']);
  sh(['commit', '-q', '-m', 'init']);
  const script = path.join(root, 'promptimizer', 'install', 'publish-plugin.js');
  const r = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  ok(r.status === 0, 'publish-plugin sans --push : exit 0 — ' + out.trim().split('\n').slice(-2).join(' | '));
  ok(/Tag prévu.*v9\.9\.9/.test(out), 'publish-plugin sans --push : affiche le tag prévu v9.9.9');
  ok(sh(['tag', '-l']).stdout.trim() === '', 'publish-plugin sans --push : aucun tag créé');

  // Conflit : tag v9.9.9 sur un autre commit → exit 1, sans écraser.
  sh(['tag', 'v9.9.9']);
  fs.writeFileSync(path.join(root, 'x.txt'), 'x');
  sh(['add', '-A']);
  sh(['commit', '-q', '-m', 'second']);
  const r2 = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  ok(r2.status === 1 && /autre commit/.test(r2.stderr || ''), 'publish-plugin : tag sur un autre commit → exit 1');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(`release-tag : ${pass} OK · ${failures.length} échec(s)`);
process.exit(failures.length ? 1 : 0);
