#!/usr/bin/env node
'use strict';
// US#156 — close-wave : clôture groupée d'une vague (commit borné, done, fiche, CHANGELOG),
// toujours en bac à sable (dossier temp + git init), jamais sur le dépôt réel. Lancé par test/run-tests.js.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const PKG = path.join(__dirname, '..', 'promptimizer');
const BL = path.join(PKG, 'scripts', 'backlog.js');
const lib = require(path.join(PKG, 'lib', 'backlog.js'));
const rd = (p) => fs.readFileSync(p, 'utf8');
let fail = 0;
function ok(c, l) { if (!c) { fail++; console.log('  ✗ ' + l); } }

// 1. Logique pure : chemins partagés, verdict, CHANGELOG.
const plan = lib.planCloseWave([
  { id: 1, paths: ['a.txt', 'shared.txt'], message: 'm1', verdict: 'ok' },
  { id: 2, paths: ['b.txt', 'shared.txt', 'b.txt'], message: 'm2', verdict: 'bizarre' },
  { id: 'x' },
]);
ok(plan.items.length === 2 && plan.items[1].paths.join() === 'b.txt', 'planCloseWave : chemin partagé gardé par le 1er seulement, doublons retirés');
ok(plan.shared.length === 1 && plan.shared[0].kept_by === 1 && plan.shared[0].dropped_for === 2, 'planCloseWave : chemin partagé signalé');
ok(plan.items[1].verdict === 'none', 'planCloseWave : verdict inconnu -> none');
const e = lib.renderChangelogEntry('2026-01-02', 7, 'Titre', ['un', '- deux']);
ok(e.startsWith('## 2026-01-02 — US#7 Titre') && /- un\n- deux/.test(e), 'renderChangelogEntry : en-tête + puces');
const ins = lib.insertChangelog('# Changelog\n\nintro\n\n## 2026-01-01 — ancien\n\n- x\n', [e]);
ok(ins.indexOf('US#7') < ins.indexOf('ancien') && ins.indexOf('intro') < ins.indexOf('US#7'), 'insertChangelog : entrée récente avant les anciennes, après l\'intro');
ok(lib.insertChangelog(ins, [e]) === ins, 'insertChangelog : idempotent');

// 2. Bac à sable.
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-cw-'));
const git = (...a) => execFileSync('git', a, { cwd: d, encoding: 'utf8' });
const bl = (...a) => (spawnSync(process.execPath, [BL, ...a, '--cwd', d], { encoding: 'utf8' }).stdout || '').trim();
git('init', '-q');
git('config', 'user.email', 't@t.t'); git('config', 'user.name', 't');
fs.writeFileSync(path.join(d, 'CHANGELOG.md'), '# Changelog\n\n## 2026-01-01 — ancien\n\n- x\n');
fs.writeFileSync(path.join(d, 'seed.txt'), 's');
git('add', '-A'); git('commit', '-q', '-m', 'init');
for (const t of ['Un', 'Deux', 'Trois']) bl('add', '--title', t, '--scope', 'x', '--verify', 'node -e 0', '--model', 'sonnet', '--effort', 'medium', '--epic', 'T');
bl('start', '--id', '1'); bl('start', '--id', '2'); bl('start', '--id', '3');
git('add', '-A'); // backlog.json indexé « par start » : ne doit PAS partir dans les commits de US
fs.writeFileSync(path.join(d, 'a.txt'), 'a'); fs.writeFileSync(path.join(d, 'b.txt'), 'b');
fs.writeFileSync(path.join(d, 'shared.txt'), 'sh'); fs.writeFileSync(path.join(d, 'c.txt'), 'c');
const wave = {
  date: '2026-10-28',
  items: [
    { id: 1, paths: ['a.txt', 'shared.txt'], message: 'feat: US1', verdict: 'ok', tokens: 1234,
      fiche: '# US#1\n\nFait : a.', changelog: { title: 'Un', bullets: ['a', 'b', 'c'] } },
    { id: 2, paths: ['b.txt', 'shared.txt'], message: 'feat: US2', verdict: 'ok', changelog: { title: 'Deux', bullets: ['d', 'e', 'f'] } },
    { id: 3, paths: ['c.txt'], message: 'feat: US3', verdict: 'failed', reason: 'tests rouges' },
  ],
};
const wf = path.join(d, 'wave.json');
fs.writeFileSync(wf, JSON.stringify(wave));

const dry = bl('close-wave', '--file', wf, '--dry-run');
ok(/dry-run/.test(dry) && git('log', '--oneline').trim().split('\n').length === 1, 'dry-run : aucun commit créé');
ok(!/US#1/.test(rd(path.join(d, 'CHANGELOG.md'))), 'dry-run : CHANGELOG intact');

const o = bl('close-wave', '--file', wf);
ok(/2 close\(s\), 1 ouverte\(s\)/.test(o), 'close-wave : 2 closes, 1 ouverte (' + o.split('\n')[0] + ')');
ok(/chemin partagé « shared\.txt »/.test(o), 'close-wave : chemin partagé signalé');
const show1 = git('show', '--stat', '--format=%s', 'HEAD~1');
const files = (c) => git('show', '--name-only', '--format=', c).trim().split('\n').sort().join();
const log = git('log', '--format=%s').trim().split('\n');
ok(log[0].startsWith('docs(changelog)') && log[1] === 'feat: US2' && log[2] === 'feat: US1', 'commits : 1 par US dans l\'ordre + commit de suivi (' + log.join(' | ') + ')');
ok(files('HEAD~2') === 'a.txt,shared.txt' && files('HEAD~1') === 'b.txt', 'commits bornés aux chemins (backlog.json hors commits US, shared.txt une seule fois)');
ok(/CHANGELOG\.md/.test(files('HEAD')) && /\.vibe-agent\/backlog\.json/.test(files('HEAD')), 'commit de suivi : CHANGELOG + backlog.json');
const cl = rd(path.join(d, 'CHANGELOG.md'));
ok(cl.indexOf('US#1') !== -1 && cl.indexOf('US#2') !== -1 && cl.indexOf('US#1') < cl.indexOf('ancien'), 'CHANGELOG : entrées ajoutées avant l\'ancien');
const b = JSON.parse(rd(path.join(d, '.vibe-agent', 'backlog.json')));
const st = (id) => b.lots.find((x) => x.id === id);
ok(st(1).status === 'done' && st(2).status === 'done' && st(1).closed_verify === 'ok', 'backlog : US1/US2 done + verify ok persisté');
ok(st(3).status !== 'done', 'backlog : US3 (verify rouge) reste ouverte');
ok(/US#1 commit \w+ · verify ok · fiche écrite/.test(o), 'archive : fiche US1 écrite (' + o + ')');
ok(git('status', '--porcelain', '--', 'c.txt').includes('c.txt'), 'US3 : fichier non commité');
ok(show1.length > 0, 'git show ok');

// Rejeu : idempotent (US déjà closes -> pas de CHANGELOG dupliqué).
bl('close-wave', '--file', wf);
ok((rd(path.join(d, 'CHANGELOG.md')).match(/US#1 Un/g) || []).length === 1, 'rejeu : CHANGELOG non dupliqué');

// Entrée invalide : refus doux, exit 0.
const bad = spawnSync(process.execPath, [BL, 'close-wave', '--stdin', '--cwd', d], { input: '{bad', encoding: 'utf8' });
ok(bad.status === 0 && /JSON de vague invalide/.test(bad.stdout), 'fail-open : JSON invalide -> refus doux, exit 0');

// Consignes des deux commandes (étapes 2 à 4 identiques).
for (const f of ['epicmaster.md', 'pickymaster.md']) {
  const s = rd(path.join(PKG, 'commands', f));
  ok(/close-wave/.test(s) && /--allow-incomplete-spec/.test(s) && /git commit -- <chemins>/.test(s), f + ' : consigne close-wave (commit borné, spec incomplète)');
}

fs.rmSync(d, { recursive: true, force: true });
console.log(fail ? `close-wave : ${fail} échec(s)` : 'close-wave : OK');
process.exit(fail ? 1 : 0);
