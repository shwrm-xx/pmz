#!/usr/bin/env node
// US#160 — Relecture opus en consolidation : brief `backlog.js epicmaster --review-brief`
// et consignes de commands/epicmaster.md + pickymaster.md.
// Zéro dépendance. Usage : node test/run-tests-relecture.js (exit 0 si tout passe).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const PKG = path.join(REPO, 'promptimizer');
const BACKLOG = path.join(PKG, 'scripts', 'backlog.js');
let pass = 0;
const failures = [];
function ok(cond, label) { if (cond) pass++; else { failures.push(label); console.log('  ✗ ' + label); } }

// Bac à sable : backlog avec 3 US closes (commits fictifs), 1 ouverte.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-relecture-'));
spawnSync('git', ['init', '-q'], { cwd: root });
fs.mkdirSync(path.join(root, '.vibe-agent', 'archive', 'lots'), { recursive: true });
const mk = (id, status, extra) => Object.assign({ id, title: `US ${id}`, status, scope: `fait ${id}`, epic: 'E', model_hint: 'sonnet', effort_hint: 'medium' }, extra || {});
const b = { version: 1, lots: [
  mk(1, 'done', { closed_commit: 'aaa1111', closed_at: '2026-10-29T10:00:00Z' }),
  mk(2, 'done', { closed_commit: 'bbb2222', closed_at: '2026-10-29T11:00:00Z' }),
  mk(3, 'done', { closed_commit: 'ccc3333', closed_at: '2026-10-29T12:00:00Z' }),
  mk(4, 'todo'),
] };
fs.writeFileSync(path.join(root, '.vibe-agent', 'backlog.json'), JSON.stringify(b));
fs.writeFileSync(path.join(root, '.vibe-agent', 'archive', 'lots', 'lot-0002.md'),
  '<!-- pmz:archive:lot 2 -->\n# US#2\n\n## Non vérifié\n- le rendu mobile\n\n## Dette restante\n- x\n');

function run(args) {
  const r = spawnSync(process.execPath, [BACKLOG, 'epicmaster', ...args, '--cwd', root], { encoding: 'utf8' });
  return (r.stdout || '') + (r.stderr || '');
}

// 1. Brief : modèle opus, effort medium, base du diff, sections fixes, lecture seule.
const t = run(['--review-brief', '--ids', '1,2,3', '--unverified', 'la migration Windows']);
ok(/model=opus/.test(t) && /effort=medium/.test(t), 'brief : model=opus, effort=medium');
ok(/git diff aaa1111\^\.\.HEAD/.test(t), 'brief : diff cumulé base = commit précédant la 1re US');
for (const s of ['Problèmes confirmés', 'Non vérifié levé', 'Non vérifié confirmé', 'RAS']) ok(t.includes(s), `brief : section « ${s} »`);
ok(/≤ 250 mots/.test(t), 'brief : rapport ≤ 250 mots');
ok(/LECTURE SEULE/.test(t) && /ne commite jamais/.test(t), 'brief : lecture seule, aucun commit');
ok(/la migration Windows/.test(t), 'brief : Non vérifié passé en option agrégé');
ok(/le rendu mobile \(US#2\)/.test(t), 'brief : Non vérifié lu dans la fiche d\'archive');
ok(/#1/.test(t) && /#3/.test(t) && !/#4/.test(t), 'brief : liste les US closes demandées seulement');

// 2. Garde ≥ 2 US closes.
const g1 = run(['--review-brief', '--ids', '1']);
ok(/Pas de relecture opus/.test(g1) && !/model=opus/.test(g1), 'garde : 1 US close -> pas de brief');
const g2 = run(['--review-brief', '--ids', '1,4']);
ok(/Pas de relecture opus/.test(g2), 'garde : US ouverte non comptée (1 close sur 2)');
const g3 = run(['--review-brief']);
ok(/Pas de relecture opus/.test(g3), 'garde : sans --ids -> pas de brief');

// 3. JSON.
let j = null; try { j = JSON.parse(run(['--review-brief', '--ids', '1,2', '--json'])); } catch (_) { /* */ }
ok(j && j.ok === true && j.model === 'opus' && j.effort === 'medium' && j.base === 'aaa1111^', 'json : ok, model=opus, base');

// 4. Rien d'écrit : le backlog est inchangé.
ok(fs.readFileSync(path.join(root, '.vibe-agent', 'backlog.json'), 'utf8') === JSON.stringify(b), 'lecture seule : backlog inchangé');

// 5. Consignes des commandes : 1× par session maître, ≥ 2 US closes, maître reste sonnet.
for (const f of ['epicmaster.md', 'pickymaster.md']) {
  const md = fs.readFileSync(path.join(PKG, 'commands', f), 'utf8');
  ok(/--review-brief/.test(md) && /model=opus/.test(md), `${f} : lance le brief relecteur opus`);
  ok(/1× par session maître/.test(md) && /≥ 2 US closes/.test(md), `${f} : 1× par session, garde ≥ 2 US closes`);
  ok(/Dette/.test(md) && /À trancher/.test(md) && /jamais corrigés d'office/.test(md), `${f} : constats -> Dette / À trancher`);
  ok(/Le maître\s+reste sonnet/.test(md), `${f} : le maître reste sonnet`);
}

// 6. masterModel inchangé (sonnet par défaut).
const em = require(path.join(PKG, 'lib', 'epicmaster.js'));
ok(em.DEFAULT_MASTER_MODEL === 'sonnet', 'masterModel : défaut sonnet inchangé');

fs.rmSync(root, { recursive: true, force: true });
if (failures.length) { console.log(`\n${failures.length} échec(s), ${pass} ok`); process.exit(1); }
console.log(`${pass} vérifications OK`);
