#!/usr/bin/env node
'use strict';
// US#152 — /epicmaster direct et /pickymaster. Lancé par test/run-tests.js (exit 0 si tout passe).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PKG = path.join(__dirname, '..', 'promptimizer');
const rd = (p) => fs.readFileSync(p, 'utf8');
let fail = 0;
function ok(c, l) { if (!c) { fail++; console.log('  ✗ ' + l); } }

const em = rd(path.join(PKG, 'commands', 'epicmaster.md'));
const pm = rd(path.join(PKG, 'commands', 'pickymaster.md'));
const tail = (s) => s.slice(s.indexOf('## 2. Lancement'));

ok(/^---\s*\ndescription:/.test(pm), 'pickymaster.md : frontmatter description');
ok(/AUCUNE question/.test(em) && /n'ouvre aucune question/.test(em) && !/AskUserQuestion\)/.test(em.split('## 2.')[0].replace(/ni AskUserQuestion/, '')),
  'epicmaster.md : embarque tout, sans question');
ok(/\/pickymaster/.test(em), 'epicmaster.md : renvoie vers /pickymaster pour choisir');
ok(/cases à\s+cocher précochées/.test(pm) && /Écarter certaines US/.test(pm) && /AskUserQuestion/.test(pm),
  'pickymaster.md : sélection actuelle (cases précochées, décochables)');
ok(tail(em) === tail(pm), 'epicmaster.md et pickymaster.md : étapes 2 à 4 identiques (pas de dérive)');
ok(/set_session_title/.test(pm) && /set_session_title/.test(em), 'les deux commandes renomment la session maître');

const bp = rd(path.join(PKG, 'install', 'build-plugin.js'));
ok(/'pickymaster\.md'/.test((/REQUIRED_COMMANDS = \[([\s\S]*?)\]/.exec(bp) || [, ''])[1]), 'build-plugin : pickymaster.md dans REQUIRED_COMMANDS');
ok(/\/pickymaster/.test(rd(path.join(PKG, 'install', 'install.js'))), 'install.js : /pickymaster annoncée');
ok(/\*\*pickymaster\*\*/.test(spawnSync(process.execPath, [path.join(PKG, 'scripts', 'help.js')], { encoding: 'utf8' }).stdout), '/help : pickymaster listée');

// Reconnaissance maître : le hook ne titre pas une session /pickymaster (comme /epicmaster).
const ups = rd(path.join(PKG, 'hooks', 'user-prompt-submit.js'));
ok(/\(epicmaster\|pickymaster\)/.test(ups), 'user-prompt-submit : /pickymaster reconnue comme session maître');

// Build plugin : commande portée, chemins réécrits.
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-picky-build-'));
const rb = spawnSync(process.execPath, [path.join(PKG, 'install', 'build-plugin.js'), out], { encoding: 'utf8' });
const built = path.join(out, 'marketplace', 'promptimizer', 'commands', 'pickymaster.md');
ok(rb.status === 0 && fs.existsSync(built) && !rd(built).includes('~/.claude/promptimizer'), 'plugin buildé : commands/pickymaster.md porté, chemins réécrits');
fs.rmSync(out, { recursive: true, force: true });

console.log(fail ? `pickymaster : ${fail} échec(s)` : 'pickymaster : OK');
process.exit(fail ? 1 : 0);
