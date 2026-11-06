#!/usr/bin/env node
'use strict';
// US#186 — Stop et handoff neutres pour la maître. Autonome (bac à sable temp), exit 0 si tout passe.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PKG = path.join(__dirname, '..', 'promptimizer');
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-test-stop-'));
process.env.PMZ_STATE_DIR = path.join(SANDBOX, 'state');
fs.mkdirSync(process.env.PMZ_STATE_DIR, { recursive: true });
Object.assign(process.env, {
  GIT_AUTHOR_NAME: 'PMZ Test', GIT_AUTHOR_EMAIL: 'pmz-test@example.com',
  GIT_COMMITTER_NAME: 'PMZ Test', GIT_COMMITTER_EMAIL: 'pmz-test@example.com',
});
const EMPTY = path.join(SANDBOX, 'empty.jsonl');
fs.writeFileSync(EMPTY, '');

const backlog = require(path.join(PKG, 'lib', 'backlog'));
const lotLib = require(path.join(PKG, 'lib', 'lot'));
const handoff = require(path.join(PKG, 'lib', 'handoff'));

let fail = 0;
function ok(c, l) { if (!c) { fail++; console.log('  ✗ ' + l); } }
const git = (repo, ...a) => execFileSync('git', ['-C', repo, ...a], { stdio: 'pipe' });
function stop(repo, sid) {
  try {
    execFileSync(process.execPath, [path.join(PKG, 'hooks', 'stop.js')], {
      input: JSON.stringify({ session_id: sid, cwd: repo, transcript_path: EMPTY }), stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (_) { /* fail-open : le code de sortie n'est pas l'objet */ }
}

// Dépôt avec une US in_progress démarrée dans le passé, puis un commit POSTÉRIEUR, arbre propre.
function setup(name, owner, masterSession, sid) {
  const repo = path.join(SANDBOX, name);
  fs.mkdirSync(repo, { recursive: true });
  execFileSync('git', ['init', '-q', repo]);
  fs.writeFileSync(path.join(repo, 'a.txt'), '1');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'init');
  stop(repo, sid); // crée .vibe-agent (ledgers)
  const lot = backlog.addLot(repo, 'Lot de test', 'scope', 'sonnet');
  backlog.startLot(repo, lot.id, owner);
  const b = backlog.loadBacklog(repo);
  b.lots.find((l) => l.id === lot.id).started_at = new Date(Date.now() - 3600 * 1000).toISOString();
  backlog.saveBacklog(repo, b);
  fs.writeFileSync(path.join(repo, '.vibe-agent', 'lot-counter.json'), JSON.stringify({ last_lot: 50 }));
  const sf = path.join(repo, '.vibe-agent', 'session-state.json');
  fs.writeFileSync(sf, JSON.stringify({ session_id: sid, master_session: masterSession }));
  fs.writeFileSync(path.join(repo, 'a.txt'), '2');
  git(repo, 'add', 'a.txt');
  git(repo, 'commit', '-q', '-m', 'travail');
  return { repo, id: lot.id };
}
const statusOf = (repo, id) => backlog.loadBacklog(repo).lots.find((l) => l.id === id).status;

// 1. session maître : l'US owner master/ reste in_progress, compteur inchangé.
{
  const { repo, id } = setup('repo-master', 'master/lot-7', true, 'sess-master');
  stop(repo, 'sess-master');
  ok(statusOf(repo, id) === 'in_progress', 'master_session : US owner master/ reste in_progress');
  ok(lotLib.getLotCounter(repo) === 50, 'master_session : lot-counter inchangé');
}

// 1b. session non maître mais US owner master/ : jamais auto-close non plus.
{
  const { repo, id } = setup('repo-master-owner', 'master/lot-7', false, 'sess-x');
  stop(repo, 'sess-x');
  ok(statusOf(repo, id) === 'in_progress', 'owner master/ hors session maître : US reste in_progress');
  ok(lotLib.getLotCounter(repo) === 50, 'owner master/ : lot-counter inchangé');
}

// 2. session non maître, owner = sid : clôture effective, compteur +1 (une seule fois).
{
  const { repo, id } = setup('repo-normal', 'sess-n', false, 'sess-n');
  stop(repo, 'sess-n');
  ok(statusOf(repo, id) === 'done', 'non maître : US passe done');
  ok(lotLib.getLotCounter(repo) === 51, 'non maître : lot-counter +1 exactement');
  stop(repo, 'sess-n');
  ok(lotLib.getLotCounter(repo) === 51, 'non maître : un Stop suivant n\'incrémente plus');
}

// 3. handoff auto : aucune US in_progress -> « aucune », jamais US#101.
{
  const repo = path.join(SANDBOX, 'repo-handoff');
  fs.mkdirSync(repo, { recursive: true });
  execFileSync('git', ['init', '-q', repo]);
  fs.writeFileSync(path.join(repo, 'a.txt'), '1');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'init');
  stop(repo, 'sess-h');
  fs.writeFileSync(path.join(repo, '.vibe-agent', 'lot-counter.json'), JSON.stringify({ last_lot: 100 }));
  handoff.writeAutoHandoff(repo, null);
  let txt = fs.readFileSync(path.join(repo, '.vibe-agent', 'handoff.md'), 'utf8');
  ok(/US en cours : « [^»]*» — aucune/.test(txt), 'handoff : « aucune » sans US in_progress');
  ok(!/US#101/.test(txt), 'handoff : jamais lot-counter+1 (US#101)');
  const lot = backlog.addLot(repo, 'Ma vraie US', 'scope', 'sonnet');
  backlog.startLot(repo, lot.id, 'sess-h');
  handoff.writeAutoHandoff(repo, null);
  txt = fs.readFileSync(path.join(repo, '.vibe-agent', 'handoff.md'), 'utf8');
  ok(txt.includes(`— US#${lot.id} « Ma vraie US »`), 'handoff : première US in_progress affichée');
  ok(!/US#101/.test(txt), 'handoff : toujours pas US#101');
}

fs.rmSync(SANDBOX, { recursive: true, force: true });
if (fail) console.log(`run-tests-stop : ${fail} échec(s)`);
else console.log('run-tests-stop : tout passe');
process.exit(fail ? 1 : 0);
