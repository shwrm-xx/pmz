#!/usr/bin/env node
'use strict';
// US#173 — sessions maîtres en sous-sessions liées. Lancé par test/run-tests.js (exit 0 si tout passe).
const fs = require('fs');
const path = require('path');

const CMD = path.join(__dirname, '..', 'promptimizer', 'commands');
const rd = (f) => fs.readFileSync(path.join(CMD, f), 'utf8');
let fail = 0;
function ok(c, l) { if (!c) { fail++; console.log('  ✗ ' + l); } }

const sc = rd('scope.md');
const s6 = sc.slice(sc.indexOf('6. **Ne démarrer aucune US'), sc.indexOf('Le suivi est ensuite automatique'));
ok(/mcp__ccd_session__start_session/.test(s6) && /own_initiative/.test(s6) && /context: "fresh"/.test(s6)
  && /use_worktree: false/.test(s6) && /pmz:epicmaster/.test(s6), 'scope.md étape 6 : carte start_session liée (own_initiative, fresh, même checkout, pmz:epicmaster)');
ok(/`model`[\s\S]*`effort`/.test(s6) && /sortie `epicmaster`/.test(s6), 'scope.md : modèle et effort maîtres de la sortie epicmaster');
ok(/ToolSearch/.test(s6) && /select:mcp__ccd_session__start_session/.test(s6), 'scope.md : outil différé chargé par ToolSearch');
ok(/un seul/.test(s6) && /plusieurs sessions\s+maîtres/.test(s6), 'scope.md : une seule carte même si plusieurs sessions maîtres');
ok(/Repli/.test(s6) && /trois lignes/.test(s6) && /ouvre une session fraîche avec `\/model/.test(s6), 'scope.md : repli en trois lignes conservé');
ok(/backlog\.js start --id/.test(s6) && /sans carte/.test(s6), 'scope.md : exception start --id sans carte');
ok(/side-sessions-event/.test(s6), 'scope.md : <side-sessions-event> -> rapport en une ligne');
ok(/ToolSearch/.test(sc.split('\n')[2]) && /start_session/.test(sc.split('\n')[2]), 'scope.md : allowed-tools');

for (const f of ['epicmaster.md', 'pickymaster.md']) {
  const md = rd(f);
  const s5 = md.slice(md.indexOf('Session maître suivante'));
  ok(/mcp__ccd_session__start_session/.test(s5) && /own_initiative/.test(s5) && /use_worktree: false/.test(s5) && /pmz:epicmaster/.test(s5),
    `${f} : carte « session maître suivante »`);
  ok(/repli texte/.test(s5), `${f} : repli texte`);
}

process.exit(fail ? 1 : 0);
