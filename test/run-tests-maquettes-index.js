#!/usr/bin/env node
// US#162 — Index HTML et navigation des maquettes : index, barres pmz:nav, idempotence, validate.
// Zéro dépendance. Usage : node test/run-tests-maquettes-index.js (exit 0 si tout passe).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const MQ = path.join(__dirname, '..', 'promptimizer', 'scripts', 'maquette.js');
let pass = 0;
const failures = [];
function ok(cond, label) { if (cond) pass++; else { failures.push(label); console.log('  ✗ ' + label); } }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-mqidx-'));
spawnSync('git', ['init', '-q'], { cwd: root });
const run = (...a) => spawnSync('node', [MQ, ...a, '--cwd', root], { encoding: 'utf8', env: Object.assign({}, process.env, { PMZ_NO_OPEN: '1' }) });
const rd = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const mqf = (id, slug) => path.join('docs', 'us', 'US-' + id, 'maquettes', slug + '.html');

const specs = [[3, 'liste', 'Liste des commandes'], [3, 'detail', 'Détail <commande>'], [5, 'accueil', 'Accueil']];
for (const [id, slug, title] of specs) {
  const r = run('new', '--id', String(id), '--slug', slug, '--title', title);
  ok(r.status === 0 && /Créé/.test(r.stdout), `new ${slug} ok`);
}
const idxRel = path.join('docs', 'us', 'maquettes-index.html');
ok(fs.existsSync(path.join(root, idxRel)), 'new génère l\'index');

const r1 = run('index', '--epic', 'Mon epic');
ok(r1.status === 0 && /^Index : /m.test(r1.stdout) && /^URL : file:\/\//m.test(r1.stdout), 'index affiche Index : et URL : file://');
const html = rd(idxRel);
ok(/Mon epic/.test(html), 'index : --epic intitule la page');
ok(html.includes('Liste des commandes') && html.includes('Détail &lt;commande&gt;') && html.includes('Accueil'), 'index cite les 3 titres (échappés)');
ok(html.includes('US #3') && html.includes('US #5') && /brouillon/.test(html), 'index : US et statut');
const hrefs = [...html.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
ok(hrefs.length === 3 && hrefs.every((h) => !/^[a-z]+:|^\//i.test(h) && fs.existsSync(path.join(root, 'docs', 'us', h))), 'index : 3 liens relatifs qui résolvent');
ok(!/https?:\/\/|<script[^>]+src=/i.test(html), 'index autonome (zéro http(s), zéro script src)');

for (const [id, slug, title] of specs) {
  const m = rd(mqf(id, slug));
  const nav = (m.match(/<!-- pmz:nav -->[\s\S]*?<!-- \/pmz:nav -->/g) || []);
  ok(nav.length === 1, `${slug} : un seul bloc pmz:nav`);
  ok(/<body[^>]*>\s*<!-- pmz:nav -->/.test(m), `${slug} : bloc juste après <body>`);
  ok(nav[0].includes('← Index') && nav[0].includes('../../maquettes-index.html'), `${slug} : lien ← Index`);
  const opts = [...nav[0].matchAll(/<option value="([^"]+)"/g)].map((x) => x[1]);
  ok(opts.length === 2 && opts.every((o) => fs.existsSync(path.join(root, 'docs', 'us', 'US-' + id, 'maquettes', o))), `${slug} : menu des 2 autres, liens résolus`);
  ok(!opts.some((o) => o.endsWith('/' + slug + '.html') || o === slug + '.html'), `${slug} : pas elle-même`);
  ok(!/https?:\/\/|<script[^>]+src=/i.test(nav[0]), `${slug} : barre autonome`);
}

// Maquette ancienne sans bloc : insertion une seule fois.
const old = path.join(root, mqf(5, 'ancienne'));
fs.writeFileSync(old, '<!doctype html><html><body class="x"><h1>Vieille</h1></body></html>');
run('index'); run('index');
const oldH = fs.readFileSync(old, 'utf8');
ok((oldH.match(/<!-- pmz:nav -->/g) || []).length === 1 && /<body class="x">\s*<!-- pmz:nav -->/.test(oldH), 'ancienne maquette : bloc inséré une seule fois');
ok(/Vieille|ancienne/.test(rd(idxRel)), 'ancienne maquette listée (titre = slug sans INDEX.md)');
fs.unlinkSync(old);

// Idempotence octet pour octet.
run('index', '--epic', 'Mon epic');
const snap = () => [idxRel, ...specs.map(([i, s]) => mqf(i, s))].map((f) => fs.readFileSync(path.join(root, f)));
const a = snap();
run('index', '--epic', 'Mon epic');
const b = snap();
ok(a.every((buf, i) => buf.equals(b[i])), 'index ×2 : fichiers identiques octet pour octet');

// validate change le statut dans l'index HTML.
ok(!/validée/.test(rd(idxRel)), 'avant validate : aucune validée');
const v = run('validate', '--id', '3', '--slug', 'liste');
ok(v.status === 0 && /Validée/.test(v.stdout), 'validate ok');
const after = rd(idxRel);
ok(/validée/.test(after) && !after.includes('Mon epic'), 'validate : statut validée dans l\'index (régénéré)');
ok(/\(validée\)/.test(rd(mqf(3, 'detail'))), 'validate : menus des autres maquettes à jour');

// Fail-open : racine sans maquette.
const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-mqidx-empty-'));
const e = spawnSync('node', [MQ, 'index', '--cwd', empty], { encoding: 'utf8' });
ok(e.status === 0, 'index sans maquette : exit 0');

console.log(`\nmaquettes-index : ${pass} ok, ${failures.length} échec(s)`);
process.exit(failures.length ? 1 : 0);
