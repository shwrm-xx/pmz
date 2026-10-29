#!/usr/bin/env node
// US#168 — Releases traçables : tagPlan (pur) + publish-plugin.js sans --push en bac à sable git.
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

// 1. Les 3 cas de décision.
ok(tagPlan({ version: '1.2.3', headSha: 'aaa', existingSha: null }) === 'create', 'tagPlan : create sans tag existant');
ok(tagPlan({ version: '1.2.3', headSha: 'aaa', existingSha: 'aaa' }) === 'noop', 'tagPlan : noop si même SHA');
ok(tagPlan({ version: '1.2.3', headSha: 'aaa', existingSha: 'bbb' }) === 'conflict', 'tagPlan : conflict si SHA différent');

// 2. Sans --push : bac à sable git, rien poussé, tag prévu affiché.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-reltag-'));
try {
  const sh = (args, o) => spawnSync('git', args, Object.assign({ cwd: root, encoding: 'utf8' }, o));
  fs.cpSync(path.join(REPO, 'promptimizer'), path.join(root, 'promptimizer'), { recursive: true });
  if (fs.existsSync(path.join(REPO, 'skills'))) fs.cpSync(path.join(REPO, 'skills'), path.join(root, 'skills'), { recursive: true });
  if (fs.existsSync(path.join(REPO, '.claude-plugin'))) fs.cpSync(path.join(REPO, '.claude-plugin'), path.join(root, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'promptimizer', 'VERSION'), '9.9.9\n');
  sh(['init', '-q']);
  sh(['-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A']);
  sh(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init']);
  const script = path.join(root, 'promptimizer', 'install', 'publish-plugin.js');
  const r = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  ok(r.status === 0, 'publish-plugin sans --push : exit 0 — ' + out.trim().split('\n').slice(-2).join(' | '));
  ok(/Tag prévu.*v9\.9\.9/.test(out), 'publish-plugin sans --push : affiche le tag prévu v9.9.9');
  ok(sh(['tag', '-l']).stdout.trim() === '', 'publish-plugin sans --push : aucun tag créé');

  // Conflit : tag v9.9.9 sur un autre commit → exit 1, sans écraser.
  sh(['tag', 'v9.9.9']);
  fs.writeFileSync(path.join(root, 'x.txt'), 'x');
  sh(['-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A']);
  sh(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'second']);
  const r2 = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  ok(r2.status === 1 && /autre commit/.test(r2.stderr || ''), 'publish-plugin : tag sur un autre commit → exit 1');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(`release-tag : ${pass} OK · ${failures.length} échec(s)`);
process.exit(failures.length ? 1 : 0);
