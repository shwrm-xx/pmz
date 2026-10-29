#!/usr/bin/env node
// US#154 — Découpage orienté sonnet : consignes de commands/scope.md et du gabarit de spec.
// Zéro dépendance. Usage : node test/run-tests-scope-sonnet.js (exit 0 si tout passe).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = path.join(__dirname, '..');
const PKG = path.join(REPO, 'promptimizer');
let pass = 0;
const failures = [];
function ok(cond, label) { if (cond) pass++; else { failures.push(label); console.log('  ✗ ' + label); } }

const sc = fs.readFileSync(path.join(PKG, 'commands', 'scope.md'), 'utf8');
const tp = fs.readFileSync(path.join(PKG, 'templates', 'spec-template.md'), 'utf8');

// 1. Cadrage pour sonnet : fichiers, contrat, critères testables — obligatoires par US d'exécution.
ok(/Découper pour sonnet/.test(sc), 'scope.md : principe « découper pour sonnet »');
ok(/\*\*fichiers visés\*\*/.test(sc) && /\*\*contrat\*\*/.test(sc) && /\*\*critères testables\*\*/.test(sc),
  'scope.md : cadrage obligatoire fichiers visés / contrat / critères testables');
ok(/Cadrage\s+d'exécution/.test(sc), 'scope.md : renvoie à la section « Cadrage d\'exécution » du gabarit');

// 2. Conception (opus) séparée de l'exécution (sonnet).
ok(/Conception séparée de l'exécution/.test(sc) && /US de conception/.test(sc) && /pas de code de production/.test(sc),
  'scope.md : US de conception courte (opus) distincte des US d\'exécution');

// 3. Grille haiku / sonnet / opus, sonnet par défaut, opus et high justifiés.
for (const m of ['haiku', 'sonnet', 'opus']) {
  ok(new RegExp('^\\| `' + m + '` \\|', 'm').test(sc), `scope.md : grille — ligne \`${m}\``);
}
ok(/\*\*défaut\*\*/.test(sc) && /retomber\s+sur `sonnet · medium`/.test(sc), 'scope.md : sonnet · medium par défaut');
ok(/\*\*justification écrite\*\*/.test(sc) && /qu'est-ce qui empêche sonnet/.test(sc) && /`opus · high` est l'exception/.test(sc),
  'scope.md : opus et high/xhigh seulement sur justification écrite');
ok(!/`sonnet` pour du mécanique\/CRUD/.test(sc), 'scope.md : l\'ancienne consigne au jugé a disparu');

// 4. Fusion des micro-US (taille minimale).
ok(/fusion des micro-US/i.test(sc) && /socle de contexte/.test(sc) && /\*\*fusionne\*\*/.test(sc),
  'scope.md : taille minimale — micro-US fusionnées');

// 5. Dépendre du contrat, pas du livrable (y compris maquettes).
ok(/Dépendre du contrat, pas du livrable/.test(sc), 'scope.md : dépendance au contrat');
// v2.12.1 : exception maquettes — les US à écrans dépendent (implicitement) de l'US Maquettes.
ok(/contrat d'écran/.test(sc) && /en dépendent\s+\*\*implicitement\*\*/.test(sc) && !/ne poser `--depends <id Maquettes>` que sur/.test(sc),
  'scope.md : les US à écrans dépendent de l\'US Maquettes (jamais en parallèle)');

// 6. Gabarit : section Cadrage d'exécution, sections historiques tenues, sobre, jetons inchangés.
ok(/^## Cadrage d'exécution\s*$/m.test(tp), 'spec-template.md : section « Cadrage d\'exécution »');
ok(/Fichiers visés :/.test(tp) && /Contrat :/.test(tp) && /Dépend de :/.test(tp) && /Modèle · effort : sonnet · medium/.test(tp),
  'spec-template.md : fichiers / contrat / dépendance / modèle (sonnet par défaut)');
ok(tp.indexOf('## Cadrage d\'exécution') < tp.indexOf('## Critères d\'acceptation'), 'spec-template.md : cadrage avant les critères');
for (const s of ['## Récit', '## Critères d\'acceptation', '## Hors périmètre', '## Preuve de clôture', '## Notes', '## Maquettes']) {
  ok(tp.includes(s), `spec-template.md : section « ${s} » conservée`);
}

// 7. Rendu réel du gabarit par lib/backlog (aucun jeton résiduel, < 60 lignes).
try {
  const sbx = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-us154-'));
  process.env.PMZ_STATE_DIR = sbx;
  const backlogLib = require(path.join(PKG, 'lib', 'backlog'));
  const body = backlogLib.renderSpecTemplate({ id: 9, title: 'Essai', epic: 'Epic' });
  ok(/^## Cadrage d'exécution$/m.test(body) && !/\{\{/.test(body), 'rendu gabarit : cadrage présent, aucun jeton résiduel');
  ok(body.split('\n').length < 60, 'rendu gabarit : sous 60 lignes');
  fs.rmSync(sbx, { recursive: true, force: true });
} catch (e) { ok(false, 'rendu gabarit : ' + e.message); }

console.log(`scope-sonnet : ${pass} OK · ${failures.length} échec(s)`);
process.exit(failures.length ? 1 : 0);
