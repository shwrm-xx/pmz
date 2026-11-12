#!/usr/bin/env node
// US#193 — hooks.json autonome : plus aucun fichier annexe (bin/pmz-hook) entre l'app et le hook.
// Usage : node test/run-tests-hooks-autonomes.js (exit 0 si tout passe). Bac à sable : dossier temp.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const PKG = path.join(REPO, 'promptimizer');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-autonomes-'));

let pass = 0;
const failures = [];
function ok(c, l) { if (c) pass++; else { failures.push(l); console.log('  ✗ ' + l); } }

// Commandes du hooks.json source : [{ event, command }]
const cfg = JSON.parse(fs.readFileSync(path.join(PKG, 'hooks', 'hooks.json'), 'utf8'));
const cmds = [];
for (const [event, groups] of Object.entries(cfg.hooks)) {
  for (const g of groups) for (const h of g.hooks) cmds.push({ event, command: h.command });
}
ok(cmds.length === 8, 'hooks.json : 8 commandes (' + cmds.length + ')');
ok(cmds.every((c) => !/bin\/pmz-hook/.test(c.command)), 'hooks.json : aucune commande ne référence bin/pmz-hook');
const FORM = (h) => 'sh -c \'[ -f "$1" ] || exit 0; for n in "$(command -v node 2>/dev/null)" /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node /bin/node; do [ -n "$n" ] && [ -x "$n" ] && exec "$n" "$1"; done; exit 0\' pmz "${CLAUDE_PLUGIN_ROOT}/hooks/' + h + '.js"';
ok(cmds.every((c) => {
  const m = /\/hooks\/([a-z-]+)\.js"$/.exec(c.command);
  return m && c.command === FORM(m[1]);
}), 'hooks.json : chaque commande suit exactement la forme du contrat');

// Plugin assemblé, bin/ supprimé.
const out = path.join(TMP, 'out');
const b = spawnSync(process.execPath, [path.join(PKG, 'install', 'build-plugin.js'), out], { encoding: 'utf8' });
ok(b.status === 0, 'build-plugin : exit 0');
const plugin = path.join(out, 'marketplace', 'promptimizer');
fs.rmSync(path.join(plugin, 'bin'), { recursive: true, force: true });
ok(!fs.existsSync(path.join(plugin, 'bin')), 'plugin assemblé : bin/ supprimé');
const built = JSON.parse(fs.readFileSync(path.join(plugin, 'hooks', 'hooks.json'), 'utf8'));
const builtCmds = [];
for (const [event, groups] of Object.entries(built.hooks)) {
  for (const g of groups) for (const h of g.hooks) builtCmds.push({ event, command: h.command });
}
ok(builtCmds.length === 8 && builtCmds.every((c) => !/bin\/pmz-hook/.test(c.command)), 'plugin assemblé : hooks.json sans bin/pmz-hook');

// Projet initialisé avec trigramme.
const repo = path.join(TMP, 'repo');
fs.mkdirSync(path.join(repo, '.vibe-agent'), { recursive: true });
fs.writeFileSync(path.join(repo, 'CLAUDE.md'), '# x\n');
execFileSync('git', ['init', '-q'], { cwd: repo });
require(path.join(PKG, 'lib', 'trigram.js')).writeTrigram(repo, 'AUT');

function env(extra) {
  const e = Object.assign({}, process.env, { CLAUDE_CONFIG_DIR: path.join(TMP, 'cfg'), PMZ_STATE_DIR: path.join(TMP, 'st') }, extra || {});
  delete e.PMZ_DISABLED; delete e.PMZ_NO_UPDATE_CHECK;
  e.PMZ_UPDATE_URL = 'http://127.0.0.1:9/VERSION';
  return e;
}
function run(command, payload, extra) {
  return spawnSync('/bin/sh', ['-c', command], { input: JSON.stringify(payload), encoding: 'utf8', env: env(extra), timeout: 20000 });
}
const payloadOf = (event, sid) => ({
  hook_event_name: event, cwd: repo, session_id: sid, source: 'startup', prompt: 'fais-moi une présentation',
  tool_name: 'Bash', tool_input: { command: 'echo ok' }, tool_response: { stdout: 'ok' }, trigger: 'manual', agent_id: 'a1', agent_type: 'general-purpose',
});

// Critère 1 : chaque commande sort en 0 sans bin/.
builtCmds.forEach((c, i) => {
  const r = run(c.command, payloadOf(c.event, 'sess-a' + i), { CLAUDE_PLUGIN_ROOT: plugin });
  ok(r.status === 0, 'plugin sans bin/ : ' + c.event + ' (#' + i + ') sort en 0 (code ' + r.status + ')');
});

// Critère 2 : UserPromptSubmit injecte le titre de session.
const ups = builtCmds.find((c) => c.event === 'UserPromptSubmit');
const r2 = run(ups.command, payloadOf('UserPromptSubmit', 'sess-titre'), { CLAUDE_PLUGIN_ROOT: plugin });
let ctx = '';
try { ctx = JSON.parse(r2.stdout).hookSpecificOutput.additionalContext || ''; } catch (_) { /* vide */ }
ok(r2.status === 0 && /Titre de CETTE session/.test(ctx), 'UserPromptSubmit : stdout contient « Titre de CETTE session »');

// Critère 3 : fichier hook absent -> exit 0, sorties vides.
const r3a = run(ups.command, payloadOf('UserPromptSubmit', 'sess-x'), { CLAUDE_PLUGIN_ROOT: path.join(TMP, 'inexistant') });
ok(r3a.status === 0 && r3a.stdout === '' && r3a.stderr === '', 'fichier hook absent : exit 0, stdout/stderr vides');
// node introuvable : PATH réduit à un dossier ne contenant que `sh`, candidats absolus neutralisés.
const shOnly = path.join(TMP, 'sh-only');
fs.mkdirSync(shOnly, { recursive: true });
fs.symlinkSync('/bin/sh', path.join(shOnly, 'sh'));
const noNode = ups.command.replace(/\/(opt\/homebrew|usr\/local|usr|)\/?bin\/node/g, '/nonexistent/node');
ok(noNode !== ups.command && !/\/usr\/bin\/node/.test(noNode), 'node introuvable : candidats neutralisés pour le test');
const r3b = run(noNode, payloadOf('UserPromptSubmit', 'sess-y'), { CLAUDE_PLUGIN_ROOT: plugin, PATH: shOnly });
ok(r3b.status === 0 && r3b.stdout === '' && r3b.stderr === '', 'node introuvable : exit 0, stdout/stderr vides');

// Critère 5 : CLAUDE_PLUGIN_ROOT avec espace.
const spaced = path.join(TMP, 'dossier avec espace', 'plugin');
fs.mkdirSync(path.dirname(spaced), { recursive: true });
fs.cpSync(plugin, spaced, { recursive: true });
let allSpaced = true;
const codes = [];
builtCmds.forEach((c, i) => {
  const r = run(c.command, payloadOf(c.event, 'sess-s' + i), { CLAUDE_PLUGIN_ROOT: spaced });
  codes.push(r.status);
  if (r.status !== 0) allSpaced = false;
});
ok(allSpaced, 'CLAUDE_PLUGIN_ROOT avec espace : toutes les commandes sortent en 0 (' + codes.join(',') + ')');
const r5 = run(ups.command, payloadOf('UserPromptSubmit', 'sess-sp'), { CLAUDE_PLUGIN_ROOT: spaced });
ok(/Titre de CETTE session/.test(r5.stdout), 'CLAUDE_PLUGIN_ROOT avec espace : le hook tourne vraiment');

fs.rmSync(TMP, { recursive: true, force: true });
if (failures.length) { console.log(`\n${failures.length} échec(s) / ${pass + failures.length}`); process.exit(1); }
console.log(`hooks autonomes : ${pass} vérifications OK`);
