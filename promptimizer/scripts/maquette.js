#!/usr/bin/env node
'use strict';
// CLI des maquettes d'écrans (/maquette, US #147) — le MÉCANIQUE seulement.
//
// Le jugement (quels écrans, quels états, quel contenu) vit dans commands/maquette.md : ce script
// ne fait que poser le gabarit, tenir l'index, lier la spec d'US et marquer le statut.
//
// Un dossier par US : docs/us/US-<id>/spec.md (la spec) + docs/us/US-<id>/maquettes/*.html (n maquettes).
//
//   new      --id N --slug X --title "…"   docs/us/US-N/maquettes/X.html depuis templates/maquette.html
//                                    + ligne de docs/us/US-N/maquettes/INDEX.md
//                                    (refus si le fichier existe : on n'écrase JAMAIS une maquette)
//   link     --id N --slug X        section « ## Maquettes » de la spec de l'US (idempotent ; refus sans spec)
//   validate --id N --slug X        statut « validée » dans l'INDEX.md de l'US
//   open     --id N --slug X        chemin + URL file:// ; ouvre l'aperçu (sauf PMZ_NO_OPEN=1)
//   list     [--id N]               INDEX.md de l'US (sans --id : celui de chaque US)
//   brief    --id N                 maquettes validées (chemin, états, lien d'index) + brouillons à part ;
//                                    consommé par `epicmaster --brief` (US #164)
//   index    [--epic "Nom"]         docs/us/maquettes-index.html (autonome) + barre « ← Index » / menu dans
//                                    chaque maquette ; appelé aussi par new et validate (US #162)
//   validate marque aussi « (validée) » sur la ligne de la maquette dans la section « Maquettes » des specs
//
// Toujours exit 0 (fail-open) : un refus est un message « Refusé : … », jamais un crash.
// stdlib seule. Commun : --cwd <dossier> (défaut : répertoire courant ; racine git si dispo).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const US_ROOT = 'docs/us';
const INDEX_NAME = 'INDEX.md';
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const INDEX_HEAD = [
  '# Maquettes d\'écrans',
  '',
  '<!-- Tenu par `maquette.js` (/maquette). Une ligne par maquette ; statut : brouillon | validée. -->',
  '',
];

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] != null ? process.argv[i + 1] : null;
}
function out(s) { process.stdout.write(s + '\n'); }
function today() { return new Date().toISOString().slice(0, 10); }
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Titre sur une ligne, sans caractère qui casserait la ligne markdown d'index.
function cleanTitle(s) { return String(s || '').replace(/[\r\n|\[\]]+/g, ' ').trim().slice(0, 120); }

function projectRoot() {
  const i = process.argv.indexOf('--cwd');
  const cwd = i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : process.cwd();
  try {
    const { gitRoot } = require('../lib/project');
    const r = gitRoot(cwd);
    if (r) return r;
  } catch (_) { /* repli sur cwd */ }
  return path.resolve(cwd);
}
function dirRel(id) { return `${US_ROOT}/US-${id}/maquettes`; }
function dirOf(root, id) { return path.join(root, dirRel(id)); }
function indexPath(root, id) { return path.join(dirOf(root, id), INDEX_NAME); }
function maquettePath(root, id, slug) { return path.join(dirOf(root, id), slug + '.html'); }

function wantedSlug() {
  const s = arg('slug');
  if (!s) { out('Refusé : --slug requis (minuscules, chiffres, tirets — ex. « liste-commandes »).'); return null; }
  if (!SLUG_RE.test(s)) { out(`Refusé : slug invalide « ${s} » (attendu : minuscules, chiffres, tirets ; 63 car. max).`); return null; }
  return s;
}
function wantedId() {
  const raw = arg('id');
  const n = Number(String(raw == null ? '' : raw).replace(/^(US-?|#)/i, ''));
  return raw != null && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function readIndex(root, id) {
  try { return fs.readFileSync(indexPath(root, id), 'utf8'); } catch (_) { return null; }
}
const lineRe = (slug) => new RegExp('^- `' + slug + '` ·.*$', 'm');

function indexLine(slug, title, statut, date) {
  return `- \`${slug}\` · [${title}](${slug}.html) · statut : ${statut} · ${date}`;
}

// --- new ------------------------------------------------------------------------------------
function cmdNew(root) {
  const id = wantedId();
  if (!id) { out('Refusé : --id <n° d\'US> requis (les maquettes vivent dans le dossier de l\'US).'); return; }
  const slug = wantedSlug();
  if (!slug) return;
  const title = cleanTitle(arg('title'));
  if (!title) { out('Refusé : --title "…" requis (titre lisible de la maquette).'); return; }
  const abs = maquettePath(root, id, slug);
  const rel = path.posix.join(dirRel(id), slug + '.html');
  if (fs.existsSync(abs)) {
    out(`Refusé : ${rel} existe déjà — une maquette n'est jamais écrasée. Édite-la, ou choisis un autre slug.`);
    return;
  }
  let tpl;
  try { tpl = fs.readFileSync(path.join(__dirname, '..', 'templates', 'maquette.html'), 'utf8'); } catch (_) {
    out('Refusé : gabarit templates/maquette.html illisible (installation incomplète ? /pmz:doctor).');
    return;
  }
  const date = today();
  const html = tpl
    .replace(/\{\{TITRE\}\}/g, escHtml(title))
    .replace(/\{\{SLUG\}\}/g, slug)
    .replace(/\{\{DATE\}\}/g, date);
  try {
    fs.mkdirSync(dirOf(root, id), { recursive: true });
    fs.writeFileSync(abs, html, { flag: 'wx' }); // wx : refus atomique si apparu entre-temps
  } catch (e) {
    out(`Refusé : écriture de ${rel} impossible (${e.code || 'erreur'}).`);
    return;
  }
  let idx = readIndex(root, id);
  if (idx == null) idx = INDEX_HEAD.join('\n');
  if (!lineRe(slug).test(idx)) {
    idx = idx.replace(/\s*$/, '\n') + indexLine(slug, title, 'brouillon', date) + '\n';
    try { fs.writeFileSync(indexPath(root, id), idx); } catch (_) {
      out(`Attention : ${rel} créé mais ${dirRel(id)}/${INDEX_NAME} non mis à jour.`);
      return;
    }
  }
  out(`Créé : ${rel} (gabarit autonome, statut brouillon) · référencé dans ${dirRel(id)}/${INDEX_NAME}.`);
  regenerate(root, arg('epic'));
}

// --- link -----------------------------------------------------------------------------------
// Spec de l'US : pointeur `spec` du backlog s'il existe, sinon la convention du dossier de l'US
// (docs/us/US-N/spec.md). null si aucune n'existe sur disque.
function specFor(root, id) {
  const cands = [];
  try {
    const bl = require('../lib/backlog');
    const b = bl.loadBacklog(root);
    const lots = (b && (b.lots || b.items)) || [];
    const lot = lots.find((l) => Number(l && l.id) === id);
    if (lot && typeof lot.spec === 'string' && lot.spec && !/^https?:/i.test(lot.spec)) cands.push(lot.spec);
  } catch (_) { /* backlog absent/illisible : conventions seules */ }
  cands.push(`${US_ROOT}/US-${id}/spec.md`);
  for (const rel of cands) {
    const abs = path.resolve(root, rel);
    try { if (fs.statSync(abs).isFile()) return abs; } catch (_) { /* suivant */ }
  }
  return null;
}

function cmdLink(root) {
  const id = wantedId();
  if (!id) { out('Refusé : --id <n° d\'US> requis.'); return; }
  const slug = wantedSlug();
  if (!slug) return;
  const mq = maquettePath(root, id, slug);
  if (!fs.existsSync(mq)) { out(`Refusé : maquette ${dirRel(id)}/${slug}.html introuvable (crée-la d'abord : maquette.js new).`); return; }
  const spec = specFor(root, id);
  if (!spec) {
    out(`Refusé : aucune spec pour l'US#${id} (${US_ROOT}/US-${id}/spec.md ni pointeur backlog). Rien n'est créé.`);
    return;
  }
  const specRel = path.relative(root, spec).split(path.sep).join('/');
  const href = path.relative(path.dirname(spec), mq).split(path.sep).join('/');
  let text;
  try { text = fs.readFileSync(spec, 'utf8'); } catch (_) { out(`Refusé : ${specRel} illisible.`); return; }
  const entry = `- [${slug}](${href})`;
  const lines = text.split(/\r?\n/);
  const h = lines.findIndex((l) => /^##\s+Maquettes\s*$/.test(l));
  if (h === -1) {
    const body = text.replace(/\s*$/, '');
    text = body + '\n\n## Maquettes\n\n' + entry + '\n';
  } else {
    let end = lines.length;
    for (let i = h + 1; i < lines.length; i++) { if (/^#{1,2}\s/.test(lines[i])) { end = i; break; } }
    const section = lines.slice(h + 1, end);
    if (section.some((l) => l.includes('](' + href + ')'))) {
      out(`Déjà lié : ${specRel} référence ${slug} (aucun changement).`);
      return;
    }
    let last = end - 1;
    while (last > h && !lines[last].trim()) last--;
    const insertAt = last + 1;
    const add = last === h ? ['', entry] : [entry];
    lines.splice(insertAt, 0, ...add);
    // Ligne vide avant le titre suivant, si la section n'était pas en fin de fichier.
    const next = insertAt + add.length;
    if (next < lines.length && lines[next].trim()) lines.splice(next, 0, '');
    text = lines.join('\n');
    if (!text.endsWith('\n')) text += '\n';
  }
  try { fs.writeFileSync(spec, text); } catch (_) { out(`Refusé : écriture de ${specRel} impossible.`); return; }
  out(`Lié : ${specRel} § Maquettes → ${slug}.`);
}

// --- validate -------------------------------------------------------------------------------
function cmdValidate(root) {
  const id = wantedId();
  if (!id) { out('Refusé : --id <n° d\'US> requis.'); return; }
  const slug = wantedSlug();
  if (!slug) return;
  const idx = readIndex(root, id);
  const m = idx && lineRe(slug).exec(idx);
  if (!m) { out(`Refusé : ${slug} absent de ${dirRel(id)}/${INDEX_NAME} (crée-la avec maquette.js new).`); return; }
  if (/statut : validée/.test(m[0])) { out(`Déjà validée : ${slug} (aucun changement).`); markSpecs(root, id, slug); return; }
  const line = m[0].replace(/statut : [^·]+?( ·|$)/, 'statut : validée$1').replace(/ · \d{4}-\d{2}-\d{2}\s*$/, ' · ' + today());
  try { fs.writeFileSync(indexPath(root, id), idx.replace(m[0], line)); } catch (_) {
    out(`Refusé : écriture de ${dirRel(id)}/${INDEX_NAME} impossible.`);
    return;
  }
  out(`Validée : ${slug} (${dirRel(id)}/${INDEX_NAME}).`);
  markSpecs(root, id, slug);
  regenerate(root, arg('epic'));
}

// Marque « (validée) » sur la ligne de la maquette dans la section « ## Maquettes » de la spec de
// l'US et de toute autre spec qui la lie (US à écrans). Idempotent ; sans spec : message, pas d'échec.
function markSpecs(root, id, slug) {
  const target = maquettePath(root, id, slug);
  const specs = new Set();
  const own = specFor(root, id);
  if (own) specs.add(own);
  try {
    for (const d of fs.readdirSync(path.join(root, US_ROOT))) {
      const f = path.join(root, US_ROOT, d, 'spec.md');
      if (/^US-\d+$/.test(d) && fs.existsSync(f)) specs.add(f);
    }
  } catch (_) { /* pas de docs/us */ }
  if (!specs.size) { out(`Aucune spec à marquer pour l'US#${id} (rien à faire).`); return; }
  for (const spec of specs) {
    try {
      const lines = fs.readFileSync(spec, 'utf8').split('\n');
      const h = lines.findIndex((l) => /^##\s+Maquettes\s*$/.test(l));
      if (h === -1) continue;
      let changed = false;
      for (let i = h + 1; i < lines.length && !/^#{1,2}\s/.test(lines[i]); i++) {
        const mm = /\]\(([^)\s]+\.html)\)/.exec(lines[i]);
        if (!mm || path.resolve(path.dirname(spec), mm[1]) !== target) continue;
        if (/\(validée\)/.test(lines[i])) continue;
        lines[i] = lines[i].replace(/\s*$/, ' (validée)');
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(spec, lines.join('\n'));
        out(`Spec marquée : ${path.relative(root, spec).split(path.sep).join('/')} § Maquettes → ${slug} (validée).`);
      }
    } catch (_) { /* fail-open */ }
  }
}

// --- brief (US #164) -------------------------------------------------------------------------
function etatsOf(abs) {
  try {
    const html = fs.readFileSync(abs, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const set = [];
    for (const m of html.matchAll(/<(?!body\b)[a-z][^>]*?\sdata-etat="([^"]+)"/gi)) if (!set.includes(m[1])) set.push(m[1]);
    return set;
  } catch (_) { return []; }
}
function cmdBrief(root) {
  const id = wantedId();
  if (!id) { out('Refusé : --id <n° d\'US> requis.'); return; }
  const idx = readIndex(root, id);
  const valid = [];
  const drafts = [];
  for (const m of (idx || '').matchAll(/^- `([^`]+)` ·.*$/gm)) {
    const slug = m[1];
    const t = /\[([^\]]*)\]\(/.exec(m[0]);
    (/statut : validée/.test(m[0]) ? valid : drafts).push({ slug, title: t ? t[1].trim() : slug });
  }
  if (!valid.length && !drafts.length) { out(`Aucune maquette pour l'US ${id}.`); return; }
  if (valid.length) {
    out(`Maquettes validées (US #${id}) — à suivre, tout écart se signale dans « À trancher » :`);
    for (const m of valid) {
      const et = etatsOf(maquettePath(root, id, m.slug));
      out(`- ${m.slug} · ${dirRel(id)}/${m.slug}.html · états : ${et.length ? et.join(', ') : '(aucun data-etat)'} · index : ../../${INDEX_HTML}`);
    }
  } else {
    out(`Aucune maquette validée pour l'US ${id}.`);
  }
  if (drafts.length) {
    out('Non validées (ne pas suivre) :');
    for (const m of drafts) out(`- ${m.slug} · ${dirRel(id)}/${m.slug}.html`);
  }
}

// --- open -----------------------------------------------------------------------------------
function cmdOpen(root) {
  const id = wantedId();
  if (!id) { out('Refusé : --id <n° d\'US> requis.'); return; }
  const slug = wantedSlug();
  if (!slug) return;
  const abs = maquettePath(root, id, slug);
  if (!fs.existsSync(abs)) { out(`Refusé : ${dirRel(id)}/${slug}.html introuvable.`); return; }
  const url = 'file://' + (process.platform === 'win32' ? '/' : '') + abs.split(path.sep).join('/');
  out(`Maquette : ${abs}`);
  out(`URL : ${url}`);
  if (process.env.PMZ_NO_OPEN === '1') return;
  try {
    const cmd = process.platform === 'darwin' ? ['open', [abs]]
      : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', abs]]
        : ['xdg-open', [abs]];
    const p = spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' });
    p.on('error', () => { /* pas d'ouvreur : l'URL affichée suffit */ });
    p.unref();
  } catch (_) { /* fail-open */ }
}

// --- index HTML + navigation (US #162) -------------------------------------------------------
const INDEX_HTML = 'maquettes-index.html';
const NAV_RE = /<!-- pmz:nav -->[\s\S]*?<!-- \/pmz:nav -->/;

// Toutes les maquettes : [{ id, slug, title, statut }] triées par US puis slug (déterministe).
function collectMaquettes(root) {
  const res = [];
  let dirs = [];
  try { dirs = fs.readdirSync(path.join(root, US_ROOT)); } catch (_) { return res; }
  const ids = dirs.map((d) => /^US-(\d+)$/.exec(d)).filter(Boolean).map((m) => Number(m[1])).sort((a, b) => a - b);
  for (const id of ids) {
    let files = [];
    try { files = fs.readdirSync(dirOf(root, id)).filter((f) => /\.html$/.test(f)).sort(); } catch (_) { continue; }
    const idx = readIndex(root, id) || '';
    for (const f of files) {
      const slug = f.replace(/\.html$/, '');
      const m = lineRe(slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).exec(idx);
      const t = m && /\[([^\]]*)\]\(/.exec(m[0]);
      res.push({
        id, slug,
        title: (t && t[1].trim()) || slug,
        statut: m && /statut : validée/.test(m[0]) ? 'validée' : 'brouillon',
      });
    }
  }
  return res;
}

const hrefFrom = (from, to) => (from.id === to.id
  ? `${to.slug}.html` : `../../US-${to.id}/maquettes/${to.slug}.html`);

function navBlock(cur, all) {
  const others = all.filter((m) => !(m.id === cur.id && m.slug === cur.slug));
  const opts = others.map((m) => `<option value="${escHtml(hrefFrom(cur, m))}">${escHtml(`US #${m.id} · ${m.title} (${m.statut})`)}</option>`).join('');
  return '<!-- pmz:nav -->\n'
    + '<nav style="font:14px system-ui,sans-serif;display:flex;gap:12px;align-items:center;padding:6px 12px;background:#f3f3f3;border-bottom:1px solid #ccc">'
    + `<a href="../../${INDEX_HTML}">← Index</a>`
    + (others.length ? `<select aria-label="Autres maquettes" onchange="if(this.value)location.href=this.value"><option value="">Autres maquettes…</option>${opts}</select>` : '')
    + '</nav>\n<!-- /pmz:nav -->';
}

function indexHtml(all, epic) {
  const title = epic ? `Maquettes — ${epic}` : 'Maquettes';
  const rows = all.map((m) => `<tr><td>US #${m.id}</td><td><a href="US-${m.id}/maquettes/${escHtml(m.slug)}.html">${escHtml(m.title)}</a></td><td class="${m.statut === 'validée' ? 'ok' : 'br'}">${m.statut}</td></tr>`).join('\n');
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)}</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:24px;color:#222}
table{border-collapse:collapse;width:100%;max-width:900px}
th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #ddd}
.ok{color:#0a7a2f;font-weight:600}.br{color:#8a6100}
</style>
</head>
<body>
<h1>${escHtml(title)}</h1>
<p>${all.length} maquette${all.length > 1 ? 's' : ''}.</p>
${all.length ? `<table>
<thead><tr><th>US</th><th>Maquette</th><th>Statut</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>` : '<p>Aucune maquette.</p>'}
</body>
</html>
`;
}

// (Re)génère l'index et les barres de navigation. Retourne le chemin de l'index, ou null.
function regenerate(root, epic) {
  const all = collectMaquettes(root);
  for (const m of all) {
    const f = maquettePath(root, m.id, m.slug);
    try {
      const html = fs.readFileSync(f, 'utf8');
      const nav = navBlock(m, all);
      let next;
      if (NAV_RE.test(html)) next = html.replace(NAV_RE, () => nav);
      else if (/<body[^>]*>/i.test(html)) next = html.replace(/<body[^>]*>/i, (b) => b + '\n' + nav);
      else continue;
      if (next !== html) fs.writeFileSync(f, next);
    } catch (_) { /* fail-open : une maquette illisible n'arrête pas les autres */ }
  }
  const abs = path.join(root, US_ROOT, INDEX_HTML);
  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const html = indexHtml(all, epic);
    let cur = null;
    try { cur = fs.readFileSync(abs, 'utf8'); } catch (_) { /* absent */ }
    if (cur !== html) fs.writeFileSync(abs, html);
  } catch (_) { return null; }
  return abs;
}

function cmdIndex(root) {
  const abs = regenerate(root, arg('epic'));
  if (!abs) { out(`Refusé : écriture de ${US_ROOT}/${INDEX_HTML} impossible.`); return; }
  out(`Index : ${abs}`);
  out(`URL : file://${process.platform === 'win32' ? '/' : ''}${abs.split(path.sep).join('/')}`);
}

function cmdList(root) {
  let ids = [];
  if (arg('id') != null) {
    const id = wantedId();
    if (!id) { out('Refusé : --id invalide (attendu : n° d\'US).'); return; }
    ids = [id];
  } else {
    try {
      ids = fs.readdirSync(path.join(root, US_ROOT))
        .map((d) => /^US-(\d+)$/.exec(d)).filter(Boolean).map((m) => Number(m[1])).sort((a, b) => a - b);
    } catch (_) { /* pas de docs/us */ }
  }
  const blocks = [];
  for (const id of ids) {
    const idx = readIndex(root, id);
    if (idx) blocks.push(`## US #${id}\n\n` + idx.replace(/^#.*\n/, '').replace(/<!--[\s\S]*?-->\s*/g, '').trim());
  }
  if (arg('id') != null && blocks.length) { out(readIndex(root, ids[0]).replace(/\s*$/, '')); return; }
  out(blocks.length ? blocks.join('\n\n') : `Aucune maquette (${US_ROOT}/US-<id>/maquettes/${INDEX_NAME} absent).`);
}

function main() {
  const sub = process.argv[2];
  const root = projectRoot();
  switch (sub) {
    case 'new': return cmdNew(root);
    case 'link': return cmdLink(root);
    case 'validate': return cmdValidate(root);
    case 'open': return cmdOpen(root);
    case 'list': return cmdList(root);
    case 'index': return cmdIndex(root);
    case 'brief': return cmdBrief(root);
    default:
      out('Usage : maquette.js new --id N --slug X --title "…" | link --id N --slug X | validate --id N --slug X | open --id N --slug X | list [--id N] | brief --id N | index [--epic "Nom"]  [--cwd dir]');
  }
}

try { main(); } catch (e) { out('maquette.js : erreur ignorée (fail-open) — ' + (e && e.message ? e.message : e)); }
process.exitCode = 0;
