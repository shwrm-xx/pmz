#!/usr/bin/env node
'use strict';
// CLI des maquettes d'écrans (/maquette, US #147) — le MÉCANIQUE seulement.
//
// Le jugement (quels écrans, quels états, quel contenu) vit dans commands/maquette.md : ce script
// ne fait que poser le gabarit, tenir l'index, lier la spec d'US et marquer le statut.
//
//   new      --slug X --title "…"   docs/maquettes/X.html depuis templates/maquette.html + ligne d'INDEX.md
//                                    (refus si le fichier existe : on n'écrase JAMAIS une maquette)
//   link     --id N --slug X        section « ## Maquettes » de la spec de l'US (idempotent ; refus sans spec)
//   validate --slug X               statut « validée » dans INDEX.md
//   open     --slug X               chemin + URL file:// ; ouvre l'aperçu (sauf PMZ_NO_OPEN=1)
//   list                            INDEX.md tel quel
//
// Toujours exit 0 (fail-open) : un refus est un message « Refusé : … », jamais un crash.
// stdlib seule. Commun : --cwd <dossier> (défaut : répertoire courant ; racine git si dispo).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DIR_REL = 'docs/maquettes';
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
function dirOf(root) { return path.join(root, DIR_REL); }
function indexPath(root) { return path.join(dirOf(root), INDEX_NAME); }
function maquettePath(root, slug) { return path.join(dirOf(root), slug + '.html'); }

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

function readIndex(root) {
  try { return fs.readFileSync(indexPath(root), 'utf8'); } catch (_) { return null; }
}
const lineRe = (slug) => new RegExp('^- `' + slug + '` ·.*$', 'm');

function indexLine(slug, title, statut, date) {
  return `- \`${slug}\` · [${title}](${slug}.html) · statut : ${statut} · ${date}`;
}

// --- new ------------------------------------------------------------------------------------
function cmdNew(root) {
  const slug = wantedSlug();
  if (!slug) return;
  const title = cleanTitle(arg('title'));
  if (!title) { out('Refusé : --title "…" requis (titre lisible de la maquette).'); return; }
  const abs = maquettePath(root, slug);
  const rel = path.posix.join(DIR_REL, slug + '.html');
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
    fs.mkdirSync(dirOf(root), { recursive: true });
    fs.writeFileSync(abs, html, { flag: 'wx' }); // wx : refus atomique si apparu entre-temps
  } catch (e) {
    out(`Refusé : écriture de ${rel} impossible (${e.code || 'erreur'}).`);
    return;
  }
  let idx = readIndex(root);
  if (idx == null) idx = INDEX_HEAD.join('\n');
  if (!lineRe(slug).test(idx)) {
    idx = idx.replace(/\s*$/, '\n') + indexLine(slug, title, 'brouillon', date) + '\n';
    try { fs.writeFileSync(indexPath(root), idx); } catch (_) {
      out(`Attention : ${rel} créé mais ${DIR_REL}/${INDEX_NAME} non mis à jour.`);
      return;
    }
  }
  out(`Créé : ${rel} (gabarit autonome, statut brouillon) · référencé dans ${DIR_REL}/${INDEX_NAME}.`);
}

// --- link -----------------------------------------------------------------------------------
// Spec de l'US : pointeur `spec` du backlog s'il existe, sinon conventions docs/us/US-N.md puis
// docs/specs/SPEC-N.md. null si aucune n'existe sur disque.
function specFor(root, id) {
  const cands = [];
  try {
    const bl = require('../lib/backlog');
    const b = bl.loadBacklog(root);
    const lots = (b && (b.lots || b.items)) || [];
    const lot = lots.find((l) => Number(l && l.id) === id);
    if (lot && typeof lot.spec === 'string' && lot.spec && !/^https?:/i.test(lot.spec)) cands.push(lot.spec);
  } catch (_) { /* backlog absent/illisible : conventions seules */ }
  cands.push(`docs/us/US-${id}.md`, `docs/specs/SPEC-${id}.md`);
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
  const mq = maquettePath(root, slug);
  if (!fs.existsSync(mq)) { out(`Refusé : maquette ${DIR_REL}/${slug}.html introuvable (crée-la d'abord : maquette.js new).`); return; }
  const spec = specFor(root, id);
  if (!spec) {
    out(`Refusé : aucune spec pour l'US#${id} (docs/us/US-${id}.md, docs/specs/SPEC-${id}.md ni pointeur backlog). Rien n'est créé.`);
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
  const slug = wantedSlug();
  if (!slug) return;
  const idx = readIndex(root);
  const m = idx && lineRe(slug).exec(idx);
  if (!m) { out(`Refusé : ${slug} absent de ${DIR_REL}/${INDEX_NAME} (crée-la avec maquette.js new).`); return; }
  if (/statut : validée/.test(m[0])) { out(`Déjà validée : ${slug} (aucun changement).`); return; }
  const line = m[0].replace(/statut : [^·]+?( ·|$)/, 'statut : validée$1').replace(/ · \d{4}-\d{2}-\d{2}\s*$/, ' · ' + today());
  try { fs.writeFileSync(indexPath(root), idx.replace(m[0], line)); } catch (_) {
    out(`Refusé : écriture de ${DIR_REL}/${INDEX_NAME} impossible.`);
    return;
  }
  out(`Validée : ${slug} (${DIR_REL}/${INDEX_NAME}).`);
}

// --- open -----------------------------------------------------------------------------------
function cmdOpen(root) {
  const slug = wantedSlug();
  if (!slug) return;
  const abs = maquettePath(root, slug);
  if (!fs.existsSync(abs)) { out(`Refusé : ${DIR_REL}/${slug}.html introuvable.`); return; }
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

function cmdList(root) {
  const idx = readIndex(root);
  out(idx ? idx.replace(/\s*$/, '') : `Aucune maquette (${DIR_REL}/${INDEX_NAME} absent).`);
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
    default:
      out('Usage : maquette.js new --slug X --title "…" | link --id N --slug X | validate --slug X | open --slug X | list  [--cwd dir]');
  }
}

try { main(); } catch (e) { out('maquette.js : erreur ignorée (fail-open) — ' + (e && e.message ? e.message : e)); }
process.exitCode = 0;
