'use strict';
// Fallback natif de réduction de sortie volumineuse (lot #84, epic Bridge RTK).
//
// PostToolUse SUR LA SORTIE (distinct du bridge RTK qui, lui, réécrit l'ENTRÉE en PreToolUse) :
// quand une commande Bash renvoie une sortie très longue, on la réduit AVANT qu'elle n'entre dans
// le contexte du modèle, tout en STOCKANT la sortie complète sur disque (jamais de perte). Ce
// n'est PAS un remplacement fonctionnel de RTK — juste un filet générique quand RTK est absent.
//
// Contrat plateforme (doc « PostToolUse decision control ») : le champ `updatedToolOutput` doit
// matcher la shape de sortie du tool. Pour Bash c'est un objet {stdout,stderr,interrupted,isImage,
// noOutputExpected}. Un objet non conforme est IGNORÉ (la sortie originale est conservée) → on
// construit toujours l'objet de remplacement À PARTIR de la réponse reçue en ne substituant que
// `stdout`. On ne touche JAMAIS stderr/interrupted (§10 : ne jamais supprimer les détails d'erreur,
// ne jamais marquer un succès sur la seule base du texte).
//
// Fail-open absolu : au moindre doute (RTK actif, sortie courte, pas de repo git où stocker le log,
// gain négligeable, exception) → renvoie null = aucune réduction, la sortie brute passe intacte.
const fs = require('fs');
const path = require('path');

// Seuils (overridables par env pour tests / réglage). La réduction ne se DÉCLENCHE qu'au-dessus du
// seuil de lignes : une sortie courte n'est JAMAIS filtrée silencieusement (§10, limite 1).
function trigLines(env) {
  const n = parseInt((env || process.env).PMZ_OUTPUT_FALLBACK_LINES || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 300;
}
const HEAD_LINES = 40; // en-tête conservé (§10, stratégie 2)
const TAIL_LINES = 40; // fin conservée (§10, stratégie 4)
const MAX_ERROR_LINES = 80; // borne les lignes d'erreur gardées (évite qu'une sortie 100 % « error » explose)
const MAX_LOG_FILES = 200; // plafond de .vibe-agent/logs/ (même famille que clearWave/purgeLotHandoffs)
// Marqueurs d'erreur conservés en priorité (§10, stratégie 3). Insensible à la casse.
const ERROR_RE = /\b(error|errors|fail|failed|failure|exception|traceback|panic|fatal|assert|✗|✘|✖)\b|^\s*at\s+.+\(.+:\d+/i;

function disabled(env) {
  return (env || process.env).PMZ_OUTPUT_FALLBACK_DISABLE === '1';
}

// Espacement des milliers par une espace (format §10 : « 18 452 »).
function group(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// Déduplication des lignes CONSÉCUTIVES identiques (§10, stratégie 1). Une série de N copies
// devient une ligne unique annotée « (× N) ». Renvoie { lines, collapsed } où collapsed = nombre
// total de lignes retirées par la dédup (pour le décompte honnête « lignes brutes »).
function dedupeConsecutive(lines) {
  const out = [];
  let collapsed = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let run = 1;
    while (i + 1 < lines.length && lines[i + 1] === line) { run++; i++; }
    out.push(run > 1 ? `${line}    [PMZ × ${group(run)}]` : line);
    if (run > 1) collapsed += run - 1;
  }
  return { lines: out, collapsed };
}

// Construit l'ensemble ORDONNÉ des lignes conservées : en-tête + lignes d'erreur + fin, avec des
// marqueurs d'élision « [PMZ … N lignes omises …] » aux ruptures. Ne réordonne jamais les lignes.
function keepSalient(lines) {
  const keep = new Set();
  const n = lines.length;
  for (let i = 0; i < Math.min(HEAD_LINES, n); i++) keep.add(i);
  for (let i = Math.max(0, n - TAIL_LINES); i < n; i++) keep.add(i);
  let errCount = 0;
  for (let i = 0; i < n; i++) {
    if (errCount >= MAX_ERROR_LINES) break;
    if (ERROR_RE.test(lines[i])) { keep.add(i); errCount++; }
  }
  const idx = Array.from(keep).sort((a, b) => a - b);
  const out = [];
  let prev = -1;
  for (const i of idx) {
    const gap = i - prev - 1;
    if (gap > 0) out.push(`[PMZ … ${group(gap)} ligne${gap > 1 ? 's' : ''} omise${gap > 1 ? 's' : ''} …]`);
    out.push(lines[i]);
    prev = i;
  }
  return out;
}

// Compte les lignes contenant un marqueur d'erreur (pour le résumé technique).
function countErrors(lines) {
  let c = 0;
  for (const l of lines) if (ERROR_RE.test(l)) c++;
  return c;
}

// Plafonne .vibe-agent/logs/ à `max` fichiers (tous confondus : *.log de sortie réduite,
// reintegrate-*.md) : sans purge, le dossier croît indéfiniment (dette #100). Même patron que
// clearWave (une seule passe, pas de boucle par-fichier réécrivant l'état) — ici bornée par le
// nombre de unlink, incompressible pour un tri par ancienneté. Garde les plus RÉCENTS (mtime),
// retire l'excédent le plus ancien. No-op si le dossier n'existe pas ou est déjà sous le plafond.
// Renvoie le nombre de fichiers retirés. Best-effort intégral (jamais bloquant).
function purgeLogs(root, max) {
  const cap = Number.isFinite(max) && max > 0 ? max : MAX_LOG_FILES;
  try {
    const dir = path.join(root, '.vibe-agent', 'logs');
    const names = fs.readdirSync(dir);
    if (names.length <= cap) return 0;
    const files = names
      .map((name) => {
        const p = path.join(dir, name);
        let mtimeMs = 0;
        try { mtimeMs = fs.statSync(p).mtimeMs; } catch (_) { /* fichier disparu entre-temps */ }
        return { p, mtimeMs };
      })
      .sort((a, b) => a.mtimeMs - b.mtimeMs); // plus ancien d'abord
    const excess = files.length - cap;
    let n = 0;
    for (let i = 0; i < excess; i++) {
      try { fs.unlinkSync(files[i].p); n++; } catch (_) { /* fail-open */ }
    }
    return n;
  } catch (_) {
    return 0;
  }
}

// Nom de log « où se passe quoi » (US#188) : <YYYYMMDD-HHMM>-<US<id>|sans>-<sid6>-<rnd4>.<ext>.
// `ctx` = { sid, usId, now } ; sid absent -> « xxxxxx ». Pur (rnd4 injectable pour les tests).
function sid6Of(sid) {
  const s = String(sid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 6);
  return s || 'xxxxxx';
}
function logName(ctx, ext, rnd) {
  const c = ctx || {};
  const d = new Date(c.now == null ? Date.now() : c.now);
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
  const us = c.usId != null && c.usId !== '' ? `US${c.usId}` : 'sans';
  const r = rnd || Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `${stamp}-${us}-${sid6Of(c.sid)}-${r}.${ext || 'log'}`;
}
// Première ligne : « # Session <sid6> · <titre> · US#N » (titre/US inconnus : « — »).
function logHeader(ctx) {
  const c = ctx || {};
  return `# Session ${sid6Of(c.sid)} · ${c.title || '—'} · US#${c.usId != null && c.usId !== '' ? c.usId : '—'}`;
}
// Contexte de session d'un log : sid (fourni, sinon heuristique « état le plus récent »), titre
// (session-roles.json), US tenue (session_owner = sid, ou unique US en cours). Fail-open : {}.
function logContext(root, sid, now) {
  const ctx = { now };
  try {
    ctx.sid = sid || require('./state').previousSessionId(root) || null;
  } catch (_) { ctx.sid = sid || null; }
  try { ctx.title = require('./roles').getRole(root, ctx.sid).title || null; } catch (_) { /* fail-open */ }
  try {
    const b = require('./backlog');
    const lot = b.costLotFor(b.loadBacklog(root), ctx.sid);
    if (lot) ctx.usId = lot.id;
  } catch (_) { /* fail-open */ }
  return ctx;
}

// Écrit la sortie complète (stdout + stderr) sous .vibe-agent/logs/<nom>.log. Renvoie le chemin
// RELATIF au repo (pour affichage) ou null si l'écriture échoue. best-effort, jamais throw.
function writeFullLog(root, command, stdout, stderr, ctx) {
  try {
    const dir = path.join(root, '.vibe-agent', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const c = ctx || logContext(root, null, Date.now());
    const file = path.join(dir, logName(c, 'log'));
    const body = `${logHeader(c)}\n# Commande : ${command}\n\n## stdout\n${stdout}\n${stderr ? `\n## stderr\n${stderr}\n` : ''}`;
    fs.writeFileSync(file, body);
    try { purgeLogs(root); } catch (_) { /* fail-open : la purge ne doit jamais invalider l'écriture */ }
    return path.relative(root, file);
  } catch (_) {
    return null;
  }
}

// Point d'entrée. Renvoie { updatedToolOutput, summary, logPath } si une réduction est appliquée,
// sinon null (aucune réduction — la sortie brute passe intacte). L'appelant (post-tool-use.js) ne
// fait qu'émettre updatedToolOutput ; summary est déjà PRÉFIXÉ dans le stdout réduit.
function reduceBashOutput(opts) {
  const o = opts || {};
  const env = o.env || process.env;
  if (disabled(env)) return null;

  const tr = o.toolResponse;
  if (!tr || typeof tr !== 'object') return null;
  if (tr.isImage === true) return null; // jamais sur du binaire/image (§10, limite 4)
  const stdout = tr.stdout;
  if (typeof stdout !== 'string' || stdout.length === 0) return null;

  // RTK actif → fallback INACTIF : pas de double traitement de la sortie (contrainte du lot).
  try {
    if (require('./rtk-status').isBridgeEnabled(env)) return null;
  } catch (_) { /* rtk-status indisponible : on continue, le fallback reste utile */ }

  // Pas de repo git → nulle part où stocker la sortie complète : on refuse de réduire plutôt que
  // de perdre du texte silencieusement (§10 : la sortie complète doit toujours être conservée).
  const root = o.root;
  if (!root) return null;

  const rawLines = stdout.split('\n');
  // Split trailing "" quand la sortie finit par \n : ne le compte pas comme une ligne.
  if (rawLines.length && rawLines[rawLines.length - 1] === '') rawLines.pop();
  const rawCount = rawLines.length;
  if (rawCount <= trigLines(env)) return null; // sortie courte : intacte (§10, limite 1)

  const { lines: deduped } = dedupeConsecutive(rawLines);
  const kept = keepSalient(deduped);
  // Gain négligeable (dédup + élision n'ont presque rien retiré) : ne pas réécrire pour rien.
  if (kept.length >= rawCount * 0.9) return null;

  const command = typeof o.command === 'string' ? o.command : '';
  const logPath = writeFullLog(root, command, stdout, tr.stderr, logContext(root, o.sessionId, Date.now()));
  if (!logPath) return null; // stockage impossible → on ne réduit pas (cf. supra)

  const errCount = countErrors(rawLines);
  const header = [
    '[PMZ sortie réduite]',
    command ? `Commande : ${command}` : null,
    `Lignes brutes : ${group(rawCount)}`,
    `Lignes transmises : ${group(kept.length)}`,
    `Erreurs détectées : ${group(errCount)}`,
    `Sortie complète : ${logPath}`,
    '',
  ].filter((l) => l !== null).join('\n');

  const reducedStdout = header + '\n' + kept.join('\n') + '\n';
  // Shape identique à l'entrée par construction (seul stdout change) → match garanti du schéma Bash.
  const updatedToolOutput = Object.assign({}, tr, { stdout: reducedStdout });
  return { updatedToolOutput, summary: header, logPath };
}

module.exports = { reduceBashOutput, dedupeConsecutive, keepSalient, countErrors, purgeLogs, writeFullLog, logName, logHeader, logContext, sid6Of };
