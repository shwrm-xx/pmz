#!/usr/bin/env node
// Audit /epicmaster — agrégats tokens / modèles / parallélisme réel, en lecture seule.
// Usage : node docs/audits/audit-epicmaster-tokens.js [depuis=2026-10-09] [projet…]
// Source : ~/.claude/projects/-Users-marwan-elachmar-repos-mh-<projet>/ (sessions + subagents/).
// Usage dédoublonné par message.id ; « ctx » = input + cache_creation + cache_read d'un tour.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const since = Date.parse(process.argv[2] || '2026-10-09');
const projects = process.argv.slice(3).length ? process.argv.slice(3) : ['cocina', 'craftmcp', 'ecpv3'];
const root = path.join(os.homedir(), '.claude/projects');
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const M = (n) => (n / 1e6).toFixed(1) + 'M';

function parse(file) {
  const seen = new Set();
  const r = { turns: 0, cr: 0, cc: 0, out: 0, ctx: [], models: {}, t0: 0, t1: 0, brief: '', agents: [], epic: false };
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.timestamp) { const t = Date.parse(o.timestamp); r.t0 = r.t0 || t; r.t1 = t; }
    if (o.type === 'user') {
      const c = o.message && o.message.content;
      const txt = typeof c === 'string' ? c : (Array.isArray(c) ? c.map((x) => x.text || '').join('') : '');
      if (!r.brief) r.brief = txt;
      if (/epicmaster<\/command-name>/.test(txt)) r.epic = true;
    }
    if (o.type !== 'assistant' || !o.message) continue;
    const m = o.message;
    const calls = (m.content || []).filter((c) => c.type === 'tool_use' && c.name === 'Agent');
    if (calls.length) r.agents.push(calls.map((c) => ({ model: (c.input || {}).model || 'hérité', bg: !!(c.input || {}).run_in_background })));
    if (seen.has(m.id) || !m.usage) continue;
    seen.add(m.id);
    const u = m.usage;
    const cr = u.cache_read_input_tokens || 0, cc = u.cache_creation_input_tokens || 0;
    r.turns++; r.cr += cr; r.cc += cc; r.out += u.output_tokens || 0;
    r.ctx.push((u.input_tokens || 0) + cc + cr);
    r.models[m.model] = (r.models[m.model] || 0) + 1;
  }
  r.model = Object.keys(r.models).filter((k) => k !== '<synthetic>').sort((a, b) => r.models[b] - r.models[a])[0] || '?';
  return r;
}

for (const proj of projects) {
  const dir = path.join(root, '-Users-marwan-elachmar-repos-mh-' + proj);
  if (!fs.existsSync(dir)) { console.log(`\n## ${proj} : aucun transcript`); continue; }
  const mains = [], subs = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (f.endsWith('.jsonl')) {
      const r = parse(p);
      if (r.t0 >= since) mains.push(Object.assign(r, { id: f.slice(0, 8) }));
    }
    const sd = path.join(dir, f, 'subagents');
    if (fs.existsSync(sd)) for (const s of fs.readdirSync(sd).filter((x) => x.endsWith('.jsonl'))) {
      const r = parse(path.join(sd, s));
      if (r.t0 >= since) subs.push(Object.assign(r, { session: f.slice(0, 8), isUS: /brief de sous-agent/.test(r.brief) }));
    }
  }
  const sum = (a, k) => a.reduce((x, r) => x + r[k], 0);
  const epics = mains.filter((r) => r.epic);
  console.log(`\n## ${proj} — sessions principales ${mains.length} (dont epicmaster ${epics.length}), sous-agents ${subs.length} (dont US ${subs.filter((s) => s.isUS).length})`);
  console.log(`main : cache read ${M(sum(mains, 'cr'))} · cache write ${M(sum(mains, 'cc'))} · sortie ${M(sum(mains, 'out'))} · dont maîtres epicmaster ${M(sum(epics, 'cr'))}`);
  console.log(`sous-agents : cache read ${M(sum(subs, 'cr'))} · cache write ${M(sum(subs, 'cc'))} · sortie ${M(sum(subs, 'out'))}`);
  const byModel = {};
  for (const s of subs) { const b = (byModel[s.model] = byModel[s.model] || { n: 0, cr: 0 }); b.n++; b.cr += s.cr; }
  console.log('sous-agents par modèle : ' + Object.entries(byModel).map(([k, v]) => `${k} ${v.n} (${M(v.cr)})`).join(' · '));
  const us = subs.filter((s) => s.isUS);
  if (us.length) console.log(`US sous-agents : tours méd. ${med(us.map((s) => s.turns))} · ctx 1er tour méd. ${med(us.map((s) => s.ctx[0] || 0))} · ctx méd. ${med(us.map((s) => med(s.ctx)))} · ctx max méd. ${med(us.map((s) => Math.max(0, ...s.ctx)))}`);
  const launches = epics.flatMap((e) => e.agents);
  const flat = launches.flat();
  if (flat.length) console.log(`lancements Agent (maîtres) : ${flat.length} · max par message ${Math.max(...launches.map((l) => l.length))} · arrière-plan ${flat.filter((a) => a.bg).length} · modèles ${JSON.stringify(flat.reduce((a, x) => (a[x.model] = (a[x.model] || 0) + 1, a), {}))}`);
  const bySession = {};
  for (const s of us) (bySession[s.session] = bySession[s.session] || []).push(s);
  const conc = Object.entries(bySession).map(([k, a]) => {
    let max = 0;
    for (const s of a) max = Math.max(max, a.filter((o) => o.t0 <= s.t0 && o.t1 > s.t0).length);
    return { k, n: a.length, max, cr: sum(a, 'cr') };
  });
  if (conc.length) {
    const hist = conc.reduce((a, c) => (a[c.max] = (a[c.max] || 0) + 1, a), {});
    console.log(`concurrence max par session maître (sessions) : ${JSON.stringify(hist)} · sur ${conc.length} sessions avec ≥ 1 US`);
  }
  const top = [...subs].sort((a, b) => b.cr - a.cr).slice(0, 5);
  console.log('top sous-agents : ' + top.map((s) => `${s.session} ${s.model} ${s.turns} tours ${M(s.cr)} (ctx max ${Math.max(0, ...s.ctx)})`).join(' | '));
  const topMain = [...mains].sort((a, b) => b.cr - a.cr).slice(0, 5);
  console.log('top sessions : ' + topMain.map((s) => `${s.id}${s.epic ? '[epic]' : ''} ${s.model} ${s.turns} tours ${M(s.cr)} (ctx max ${Math.max(0, ...s.ctx)})`).join(' | '));
}
