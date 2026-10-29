#!/usr/bin/env node
'use strict';
// CLI du plan de lots (.vibe-agent/backlog.json). Invoqué par l'assistant via
// /scope, /close-batch ou la consigne MSG_LARGE. Arguments par argv (citables,
// auditables par PreToolUse), sortie lisible par défaut, --json pour la machine.
// Toujours exit 0 (fail-open) : une erreur de plan ne doit jamais casser un flux.
const fs = require('fs');
const path = require('path');
const { gitRoot, runVerify } = require('../lib/project');
const { resolveVerifyCloseMs } = require('../lib/timeouts');
const { parseCwd } = require('../lib/cli');
const backlog = require('../lib/backlog');
const reint = require('../lib/reintegrate');
const lot = require('../lib/lot');
const trigram = require('../lib/trigram');
const perimeter = require('../lib/perimeter');
const { fmtK } = require('../lib/messages');
const { previousSessionId, markPlanSession } = require('../lib/state');
const { loadContextLedger } = require('../lib/ledger');

const LABELS = { todo: 'à faire', in_progress: 'en cours', done: 'fait', dropped: 'abandonné' };
// Accord au féminin quand le statut qualifie « l'US » dans une phrase (les tags [à faire]/[fait] restent neutres).
const LABELS_F = { todo: 'à faire', in_progress: 'en cours', done: 'faite', dropped: 'abandonnée' };

function flag(name) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] != null ? process.argv[i + 1] : null;
}
// Liste de valeurs, RÉPÉTABLE (« --perimeter a --perimeter b ») ET à virgules
// (« --perimeter "lib/a,lib/b" ») — les deux formes se cumulent dans l'ordre d'apparition.
// Nettoyée (trim, vides écartés). [] si le flag est absent.
function flagList(name) {
  const out = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--' + name && process.argv[i + 1] != null) {
      for (const s of String(process.argv[i + 1]).split(',').map((x) => x.trim()).filter(Boolean)) out.push(s);
    }
  }
  return out;
}
// Pointeur de spec détaillée : `--spec` (canonique) ; `--us` reste accepté comme alias
// DÉPRÉCIÉ (le champ s'appelait `us` avant que « US » ne devienne le nom de l'item du backlog).
function specFlag() { return flag('spec') != null ? flag('spec') : flag('us'); }
function specFlagName() { return flag('spec') == null && flag('us') != null ? '--us' : '--spec'; }
function out(s) { process.stdout.write(s + '\n'); }
// État live de la session maître (lot #136) : best-effort, jamais bloquant — n'écrit que si le
// lot appartient à une session « master/lot-* » (lib/epicmaster-live.js).
function liveRecord(root, kind, lot, owner, verdict, extra) {
  try {
    const live = require('../lib/epicmaster-live');
    if (kind === 'start') live.recordStart(root, lot, owner);
    else if (kind === 'done') live.recordDone(root, lot, owner, undefined, verdict, extra && extra.tokens); // verdict `failed` -> lot failed (lot #141)
    else if (kind === 'note') live.recordNote(root, lot, owner, undefined, extra && extra.decide);
  } catch (_) { /* fail-open : l'état live est indicatif */ }
}
// Suffixe texte de l'estimation prédictive (lot #63) : vide si backlog.estimateCost n'a
// aucune famille comparable (pas de lot clos avec cost_tokens > 0 sur ce modèle/effort/epic).
function estimateSuffix(b, l) {
  const est = backlog.estimateCost(b, l);
  if (!est) return '';
  return ` Estimation (${est.count} US comparable${est.count > 1 ? 's' : ''} par ${est.basis}) : ~${fmtK(est.avg)} tokens.`;
}
// Base des chemins d'aide affichés : racine du plugin en mode plugin (substituée par
// Claude Code / exportée aux hooks), sinon l'emplacement de l'install manuelle.
const PMZ_BASE = (process.env.CLAUDE_PLUGIN_ROOT || '').trim() || '~/.claude/promptimizer';

// Garde anti-troncature de champ (#90) : une valeur au-delà de son plafond MAX_* serait
// stockée coupée par trunc() (« … » en pleine phrase) sans un mot dans la sortie. On refuse
// explicitement — longueur reçue vs plafond — sauf --allow-trunc (acceptation consciente,
// coupe annoncée). Renvoie true si la commande doit s'arrêter (refus émis).
function truncGuard(fields) {
  const over = backlog.overflowFields(fields);
  if (!over.length) return false;
  const detail = over.map((o) => `${o.name} : ${o.length} caractères reçus pour ${o.max} max`).join(' ; ');
  if (!process.argv.includes('--allow-trunc')) {
    out(`Refusé : ${detail} — la valeur serait tronquée en silence au stockage (« … » en pleine phrase).`);
    out('Préfère un résumé court sous le plafond + la spec complète dans un fichier du dépôt, référencé en note.');
    out('Pour accepter sciemment la troncature : ajoute --allow-trunc.');
    return true;
  }
  out(`⚠️ Troncature acceptée (--allow-trunc) : ${detail}.`);
  return false;
}

// Garde de `--depends` PARTAGÉE par `add` et `depends` (dette #98 soldée au lot #100) : `add`
// faisait `.map(Number).filter(Number.isFinite)`, donc `--depends "2,abc"` créait le lot avec
// [2] et jetait « abc » sans un mot — exactement le filtrage silencieux que la commande
// `depends` refuse depuis FIA-24. Une seule garde, un seul message, aucune dérive possible.
// Renvoie { ok:false } après avoir émis le refus, ou { ok:true, ids }.
function parseDepends() {
  const raw = flagList('depends');
  const bad = raw.filter((s) => !Number.isFinite(Number(s)));
  if (bad.length) {
    out(`Refusé : --depends attend des ids d'US — ${bad.map((s) => `« ${s} »`).join(', ')} n'en sont pas. `
      + 'Ex. --depends "2,3" ; pour vider : --depends "".');
    return { ok: false, ids: [] };
  }
  return { ok: true, ids: raw.map(Number) };
}

function show(root, json, epicFilter) {
  const b = backlog.loadBacklog(root);
  const lots = epicFilter ? b.lots.filter((l) => l.epic === epicFilter) : b.lots;
  if (json) return out(JSON.stringify(epicFilter ? { ...b, lots } : b, null, 2));
  if (!lots.length) {
    out(epicFilter ? `Aucune US pour l'epic « ${epicFilter} ».` : 'Aucun plan d\'US.');
    if (!epicFilter) out(`Créer : node ${PMZ_BASE}/scripts/backlog.js add --title "…" --scope "fait quand : …"`);
    return;
  }
  const p = epicFilter ? { done: lots.filter((l) => l.status === 'done').length, total: lots.length } : backlog.progress(b);
  out('## Plan des US');
  out(`${p.done}/${p.total} faites.`);
  out('');
  for (const l of lots) {
    let line = `- [${LABELS[l.status]}] #${l.id} « ${l.title} »`;
    if (l.epic) line += ` [epic : ${l.epic}]`;
    line += backlog.modelEffortTag(l);
    if (l.verify) line += ` [verify : ${l.verify}]`;
    if (l.spec) line += ` [Spec : ${l.spec}]`;
    if (l.perimeter && l.perimeter.length) line += ` [périmètre : ${l.perimeter.join(', ')}]`;
    if (l.depends_on && l.depends_on.length) line += ` [dépend de : ${l.depends_on.map((d) => '#' + d).join(', ')}]`;
    if (l.status === 'done' && l.closed_commit) line += ` — commit ${l.closed_commit}`;
    else if (l.scope) line += ` — ${l.scope}`;
    if (l.status === 'done' && l.closed_verify) line += ` [verify à la clôture : ${l.closed_verify}]`;
    if (l.status === 'done' && Number.isFinite(l.closed_occupancy)) line += ` (occupation à la clôture : ${l.closed_occupancy})`;
    if (Number.isFinite(l.cost_tokens) && l.cost_tokens > 0) line += ` (coût ~${fmtK(l.cost_tokens)} tokens de sortie)`;
    if (l.note) line += ` (note : ${l.note})`;
    // Troncature EN DONNÉE (#90) : show n'abrège rien à l'affichage — un « … » ici signifie
    // que le contenu STOCKÉ est coupé (legacy, ou --allow-trunc). On le rend explicite.
    const cut = [
      ['title', l.title, backlog.MAX_TITLE], ['scope', l.scope, backlog.MAX_SCOPE],
      ['epic', l.epic, backlog.MAX_EPIC], ['verify', l.verify, backlog.MAX_VERIFY],
      ['spec', l.spec, backlog.MAX_SPEC], ['note', l.note, backlog.MAX_NOTE],
    ].filter(([, v, max]) => v && backlog.isTruncated(v, max)).map(([name]) => name);
    if (cut.length) line += ` [⚠️ tronqué en donnée : ${cut.join(', ')}]`;
    out(line);
  }
}

// pmz:parallelize — calcule un plan de vagues parallèles (périmètres disjoints + ordre
// depends_on) et le PROPOSE : branches + périmètres, sans RIEN lancer (ni branche, ni worktree,
// ni session fille). Refuse les intersections (jamais deux périmètres chevauchants dans une
// vague). Le lancement reste manuel et validé par l'humain (cf. D3, palier 2).
function parallelize(root, json, epicFilter) {
  let b = backlog.loadBacklog(root);
  if (epicFilter) b = { ...b, lots: b.lots.filter((l) => l.epic === epicFilter) };
  const plan = backlog.planWaves(b);
  const withBranch = (l) => ({ id: l.id, title: l.title, branch: backlog.waveBranch(l), perimeter: l.perimeter, depends_on: l.depends_on });

  if (json) {
    return out(JSON.stringify({
      launched: false,
      waves: plan.waves.map((w) => w.map(withBranch)),
      unplannable: plan.unplannable.map((u) => ({ id: u.lot.id, title: u.lot.title, reason: u.reason })),
      blocked: plan.blocked.map((x) => ({ id: x.lot.id, title: x.lot.title, reason: x.reason })),
    }, null, 2));
  }

  const nParallel = plan.waves.reduce((s, w) => s + w.length, 0);
  out('## Plan de vagues (proposition — rien n\'est lancé)');
  if (!nParallel && !plan.unplannable.length && !plan.blocked.length) {
    return out(epicFilter ? `Aucune US « à faire » pour l'epic « ${epicFilter} » — rien à paralléliser.`
      : 'Aucune US « à faire » — rien à paralléliser.');
  }
  out(`${nParallel} US parallélisable(s) sur ${plan.waves.length} vague(s).`);
  out('');
  plan.waves.forEach((w, i) => {
    out(`### Vague ${i + 1} — ${w.length} US en parallèle`);
    for (const l of w) {
      const dep = l.depends_on.length ? ` (dépend de ${l.depends_on.map((d) => '#' + d).join(', ')})` : '';
      out(`- #${l.id} « ${l.title} »${dep} — branche \`${backlog.waveBranch(l)}\` — périmètre : ${l.perimeter.join(', ')}`);
    }
    // Zone partagée (lot #119) : `test/**` & co. ne comptent plus dans la disjonction — sans quoi
    // la vague se réduisait à un lot. Le dire explicitement : le conflit de merge y est ATTENDU,
    // pas un accident, et c'est la réintégration en pipeline qui l'arbitre.
    const shared = Array.from(new Set(w.flatMap((l) => l.perimeter.filter((g) => perimeter.isShared(g)))));
    if (w.length > 1 && shared.length) {
      out(`Zone partagée entre ces US (hors test de disjonction) : ${shared.join(', ')} — chaque US y AJOUTE ses cas.`);
      out('Un conflit de merge y est normal : la réintégration en pipeline l\'annule et nomme l\'US coupable.');
    }
    out('');
  });
  if (plan.unplannable.length) {
    out(`Non parallélisables (aucun périmètre) : ${plan.unplannable.map((u) => '#' + u.lot.id).join(', ')} — à traiter en série.`);
  }
  if (plan.blocked.length) {
    for (const x of plan.blocked) out(`Bloqué : #${x.lot.id} « ${x.lot.title} » — ${x.reason}.`);
  }
  out('');
  out('⚠️ Proposition seule : aucune branche, worktree ni session fille n\'a été créé.');
  out(`Pour lancer une vague, valide le plan puis démarre chaque US manuellement : node ${PMZ_BASE}/scripts/backlog.js start --id <id> --owner <session>.`);
}

// pmz:reintegrate — réintègre une vague parallèle EN PIPELINE (D3, P3) : merge séquentiel dans
// l'ordre du graphe depends_on, gate `verify` à chaque étape, avance de la tête d'intégration
// (signal de rebase) + changelog agrégé. Par défaut PROPOSE le plan (rien mergé) ; `--execute`
// exécute réellement. `--into <branche>` force la branche d'intégration.
// Gates (lot #97) : `--gate <cmd>` = gate de REPLI pour les lots sans verify ; `--allow-no-gate` =
// merge assumé sans filet (refus explicite sinon) ; `--final-gate <cmd>` = gate FINAL de vague
// dédié (à défaut : union des verify de la vague, dédoublonnée de la dernière déjà passée verte).
function reintegrate(root, json, execute, into, gates) {
  const g = gates || {};
  const fleet = require('../lib/fleet').loadFleet(root);
  const b = backlog.loadBacklog(root);
  const plan = reint.planReintegration(fleet, b);
  const byId = new Map(b.lots.map((l) => [l.id, l]));
  const dateOf = () => new Date().toISOString().slice(0, 10);

  const extensions = require('../lib/fleet').pendingExtensions(fleet);
  if (!execute) {
    if (json) {
      return out(JSON.stringify({
        executed: false,
        integration_branch: into || fleet.integration_branch || null,
        steps: plan.steps,
        notReady: plan.notReady,
        blocked: plan.blocked,
        extensions,
        no_gate: reint.noGateSteps(plan, g.gate),
        wave_gate: reint.waveGateCommands(fleet, b),
        complete: plan.complete,
      }, null, 2));
    }
    out('## Plan de réintégration (proposition — rien n\'est mergé)');
    if (!plan.steps.length && !plan.notReady.length && !plan.blocked.length) {
      return out('Aucune vague active à réintégrer (aucune US « prêt à merger » dans fleet.json).');
    }
    const ib = into || fleet.integration_branch;
    out(ib ? `Branche d'intégration : \`${ib}\`.` : 'Branche d\'intégration : (courante au moment du --execute).');
    out('');
    if (plan.steps.length) {
      out(`${plan.steps.length} US à merger, dans l'ordre du graphe :`);
      plan.steps.forEach((s, i) => {
        const dep = s.depends_on.length ? ` (dépend de ${s.depends_on.map((d) => '#' + d).join(', ')})` : '';
        const gate = s.verify || g.gate || null;
        out(`${i + 1}. #${s.id} « ${s.title || '?'} »${dep} — branche \`${s.branch || '?'}\` — gate : ${gate || '⚠️ (aucune)'}`);
      });
      // FIA-16 : un lot sans gate est mergé sans filet ; si ce merge casse le build, c'est le gate
      // du lot SUIVANT qui rougit et le pipeline nomme le mauvais coupable.
      const ng = reint.noGateSteps(plan, g.gate);
      if (ng.length) {
        out('');
        out(`⚠️ ${ng.length} US sans gate (${ng.map((x) => '#' + x.id).join(', ')}) : mergée(s) sans aucune vérification.`);
        out('Le --execute REFUSERA tant que tu n\'auras pas tranché : --gate "<cmd>" (gate de repli) ou --allow-no-gate (merge assumé sans filet).');
      }
    } else {
      out('Aucune US « prêt à merger ».');
    }
    if (plan.notReady.length) {
      out('');
      out(`Encore en vol (tiennent la vague ouverte) : ${plan.notReady.map((x) => '#' + x.id).join(', ')}.`);
    }
    if (plan.blocked.length) {
      out('');
      for (const x of plan.blocked) out(`Bloqué : #${x.id} « ${x.title || '?'} » — ${x.reason}.`);
    }
    if (extensions.length) {
      out('');
      out('Demandes d\'élargissement de périmètre en attente (à arbitrer avant de merger) :');
      for (const e of extensions) {
        out(`- #${e.id}${e.title ? ` « ${e.title} »` : ''} a voulu écrire hors zone : ${e.paths.join(', ')}.`);
      }
    }
    out('');
    out('⚠️ Proposition seule : aucune branche n\'a été mergée, fleet.json inchangé.');
    out(`Pour exécuter le pipeline (merge + gate à chaque étape) : node ${PMZ_BASE}/scripts/backlog.js reintegrate --execute.`);
    const wg = reint.waveGateCommands(fleet, b);
    out(wg.length
      ? `Gate FINAL de vague (après le dernier merge, sur la branche d'intégration) : ${wg.join(' && ')} — ou --final-gate "<cmd>" pour une commande dédiée (typecheck + tests + build).`
      : 'Gate FINAL de vague : aucune US ne porte de verify — la vague se clôturerait sans preuve (pose --final-gate "<cmd>").');
    return;
  }

  // --execute : exécution réelle du pipeline.
  const res = reint.runPipeline(root, { into, gate: g.gate, allowNoGate: g.allowNoGate, finalGate: g.finalGate });
  // FIA-22 : rapport persisté AVANT toute sortie, donc valable pour TOUS les chemins de retour
  // (conflit, gate rouge, succès). Écrit seulement si quelque chose a réellement été tenté —
  // un refus (nothing-ready, no-gate) n'a aucun diagnostic à conserver.
  const report = (res.merged && res.merged.length) || res.finalGate
    ? reint.writeReintegrateReport(root, res, { waveId: fleet.wave_id })
    : null;
  const reportLine = report ? `Rapport complet (plan, sorties de gates, bloc changelog) : ${report}` : null;
  if (json) {
    return out(JSON.stringify({ executed: true, report, ...res }, null, 2));
  }
  if (res.reason === 'no-integration-branch') return out('Refusé : aucune branche d\'intégration (ni fleet.integration_branch, ni --into, ni branche courante).');
  if (res.reason === 'nothing-ready') return out('Rien à réintégrer : aucune US « prêt à merger ».');
  if (res.reason === 'checkout-failed') return out(`Refusé : checkout de \`${res.integrationBranch}\` impossible (arbre sale ?).\n${(res.out || '').trim()}`);
  if (res.reason === 'no-gate') {
    out(`Refusé : ${res.noGate.length} US sans gate (${res.noGate.map((x) => '#' + x.id).join(', ')}) — rien n'a été mergé.`);
    out('Un merge non vérifié fait rougir le gate de l\'US SUIVANTE et nomme le mauvais coupable.');
    return out('Tranche : --gate "<cmd>" (gate de repli pour ces US) ou --allow-no-gate (merge assumé sans filet).');
  }

  out('## Réintégration de vague');
  out(`Branche d'intégration : \`${res.integrationBranch}\`.`);
  out('');
  for (const m of res.merged) {
    const t = m.title ? ` « ${m.title} »` : '';
    if (m.status === 'reintegrated') out(`✅ #${m.id}${t} — mergé + gate vert (${String(m.head || '').slice(0, 7)}).`);
    else if (m.status === 'conflict') out(`❌ #${m.id}${t} — CONFLIT de merge, annulé. Pipeline stoppé (le coupable est cette US).`);
    else if (m.status === 'gate-failed') out(`❌ #${m.id}${t} — merge OK mais GATE ROUGE, merge annulé. Pipeline stoppé (le coupable est cette US).`);
    else out(`⏭️ #${m.id}${t} — sauté (${m.reason || 'raison inconnue'}).`);
  }
  if (!res.ok && res.culprit) {
    out('');
    // La sortie brute du conflit/gate rouge n'est PAS affichée ici (elle noierait le message) :
    // elle est intégralement dans le rapport persisté, référencé par chemin.
    out(`⛔ Vague NON close : corrige l'US#${res.culprit.id}, remets-la « prêt », puis relance --execute.`);
    if (reportLine) out(reportLine);
    return;
  }
  out('');
  out(reint.aggregateChangelog(res.merged, { waveId: fleet.wave_id, date: dateOf(), integrationBranch: res.integrationBranch }));
  out('');
  // Gate FINAL de vague (lot #97) : deux lots verts séparément peuvent être rouges combinés.
  const fg = res.finalGate;
  if (fg) {
    if (fg.ran && fg.ok) out(`✅ Gate final de vague vert sur \`${res.integrationBranch}\` : ${fg.commands.join(' && ')}.`);
    else if (fg.ran) out(`❌ Gate final de vague ROUGE : \`${fg.failed}\`.\n${(fg.out || '').trim().slice(-1500)}`);
    else if (fg.reason === 'already-green') out('✅ Gate final de vague : déjà couvert (le gate de la dernière US a tourné vert sur l\'état final).');
    else out('⚠️ Gate final de vague : AUCUNE US de la vague ne porte de verify — vague close sans preuve (pose --final-gate "<cmd>").');
    out('');
  }
  if (res.reason === 'final-gate-failed') {
    out('⛔ Vague NON close : les merges restent faits (aucun rollback automatique), la branche d\'intégration est rouge. Corrige sur place, puis relance --execute (ou --final-gate) pour reclôturer.');
    if (reportLine) out(reportLine);
    return;
  }
  out(res.waveClosed
    ? '🎉 Vague entièrement réintégrée et close. Colle le bloc ci-dessus dans CHANGELOG.md, puis commit.'
    : 'US prêtes réintégrées. La vague reste ouverte (des US sont encore en vol).');
  // Rangement de fin de vague (FIA-19/FIA-20) : annoncé, jamais silencieux — l'orchestrateur
  // doit savoir que fleet.json est vidé (la vague redevient inerte) et que les handoffs de lot
  // ont disparu. Le snapshot de la vague reste dans le rapport.
  if (res.waveClosed && (res.wavePurged || res.handoffsPurged)) {
    out(`Rangement : fleet.json vidé (vague inerte)${res.handoffsPurged ? `, ${res.handoffsPurged} handoff(s) d'US purgé(s)` : ''}.`);
  }
  if (reportLine) out(reportLine);
}

// FIA-21 (lot #99) : canal d'écriture OUTILLÉ du registre de vague. Jusqu'ici, s'inscrire dans
// fleet.json et passer un lot « prêt » se faisaient à la main dans le JSON : une faute de frappe
// et loadFleet (fail-open, contrat hooks) désactive TOUTE la vague en silence — garde de
// périmètre ET injection de périmètre éteintes, sans un mot. Ici on est dans une COMMANDE, pas
// un hook : les refus sont explicites (toujours exit 0, cf. en-tête).
function fleetCmd(root, sub, json) {
  const fleetLib = require('../lib/fleet');
  const fs = require('fs');
  const file = fleetLib.fleetFile(root);
  const rel = '.vibe-agent/fleet.json';

  // Diagnostic du fichier AVANT tout loadFleet : readJson quarantine un JSON invalide
  // (rename en .corrupt) dès la première lecture — après, on ne saurait plus distinguer
  // « absent » de « corrompu », que loadFleet confond de toute façon (les deux → vague inerte).
  function diagnose() {
    if (!fs.existsSync(file)) {
      const quarantined = fs.existsSync(`${file}.corrupt`);
      return { state: 'absent', quarantined };
    }
    try {
      const v = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!v || typeof v !== 'object') return { state: 'invalid', why: 'racine JSON non-objet' };
      return { state: 'ok' };
    } catch (e) {
      return { state: 'invalid', why: String((e && e.message) || 'JSON invalide') };
    }
  }

  if (sub === 'show' || !sub) {
    const d = diagnose();
    if (d.state === 'invalid') {
      if (json) return out(JSON.stringify({ active: false, diagnostic: 'invalid', why: d.why }, null, 2));
      out(`⚠️ Vague DÉSACTIVÉE : ${rel} existe mais son JSON est illisible (${d.why}).`);
      out('Les hooks échouent en silence (contrat fail-open) : garde de périmètre ET injection de vague sont éteintes SANS avertissement.');
      return out('Répare le fichier à la main, ou supprime-le et réinscris les US avec `fleet join`.');
    }
    if (d.state === 'absent') {
      if (json) return out(JSON.stringify({ active: false, diagnostic: d.quarantined ? 'quarantined' : 'absent' }, null, 2));
      if (d.quarantined) out(`⚠️ ${rel} absent mais ${rel}.corrupt présent : un fleet corrompu a été mis en quarantaine — la vague est éteinte.`);
      return out('Aucune vague active (pas de fleet.json). Les sessions sont autonomes.');
    }
    const f = fleetLib.loadFleet(root);
    if (json) return out(JSON.stringify(f, null, 2));
    if (!f.active) return out(`Vague inerte : ${rel} présent mais aucune US en vol (vague close ou purgée).`);
    out(`Vague${f.wave_id ? ` « ${f.wave_id} »` : ''} : ${f.lots.length} US.`);
    if (f.integration_branch || f.integration_head) {
      out(`Tête d'intégration : ${f.integration_branch || '?'}${f.integration_head ? `@${String(f.integration_head).slice(0, 7)}` : ''}.`);
    }
    for (const l of f.lots) {
      const per = l.perimeter.length ? ` — périmètre : ${l.perimeter.join(', ')}` : ' — ⚠️ AUCUN périmètre (écritures non bridées)';
      const ext = l.ext_requests.length ? ` — demandes hors zone : ${l.ext_requests.join(', ')}` : '';
      out(`- #${l.id}${l.title ? ` « ${l.title} »` : ''} [${l.state}] — session ${l.session_owner} — branche \`${l.branch || '?'}\`${per}${ext}`);
    }
    return;
  }

  // Number(null) vaut 0 (fini !) : tester la PRÉSENCE du flag avant sa finitude, sinon un
  // `fleet ready` sans --id irait chercher un lot #0 fantôme.
  const rawId = flag('id');
  const idn = Number(rawId);
  if (rawId == null || String(rawId).trim() === '' || !Number.isFinite(idn)) {
    return out('Refusé : --id manquant ou non numérique. Ex. `fleet join --id 42 --perimeter "src/a/**"`.');
  }
  const d = diagnose();
  if (d.state === 'invalid') {
    return out(`Refusé : ${rel} est illisible (${d.why}) — l'écrire par-dessus perdrait les autres US de la vague. Répare-le (ou supprime-le) d'abord, puis relance.`);
  }

  if (sub === 'join') {
    // Une entrée sans session_owner est rejetée par normalizeLot : le refus doit être explicite
    // ici, pas un no-op silencieux. Repli sur l'id de session persisté (session-state.json),
    // que l'assistant n'a aucun moyen de connaître autrement.
    //
    // Dette #99 soldée (lot #100) : ce repli n'est fiable QU'APRÈS le premier SessionStart de la
    // session courante — avant, session-state.json porte encore l'id de la session PRÉCÉDENTE
    // (c'est même sa raison d'être, cf. lib/state.js:previousSessionId). Inscrire un lot au nom
    // d'une session morte est silencieusement catastrophique : la garde de périmètre ne bride
    // personne et l'injection de vague n'arrive jamais. Deux parades, sans jamais bloquer le cas
    // nominal : (1) si l'id déduit tient DÉJÀ un autre lot en vol, c'est le symptôme direct du
    // mauvais propriétaire — on refuse et on exige --session ; (2) sinon on annonce la déduction
    // au lieu de la taire, pour qu'une attribution fausse soit rattrapable.
    const explicitSession = flag('session');
    const session = explicitSession || previousSessionId(root);
    if (!session) {
      return out('Refusé : --session manquante et aucun id de session persisté dans .vibe-agent/session-state.json. '
        + 'Sans propriétaire, l\'US ne peut être attribuée à personne (ni garde de périmètre, ni injection).');
    }
    if (!explicitSession) {
      const held = fleetLib.lotForSession(root, session);
      if (held && held.id !== idn) {
        return out(`Refusé : --session absente, et l'id déduit de .vibe-agent/session-state.json (${session}) tient déjà l'US#${held.id}. `
          + 'Une session ne tient qu\'une US par vague : soit ce fichier porte encore l\'id de la session précédente '
          + `(il n'est à jour qu'après le 1er SessionStart), soit l'inscription est en double. Relance avec \`--session <id réel>\`.`);
      }
    }
    const state = flag('state') || 'in_flight';
    if (!fleetLib.STATES.includes(state)) {
      return out(`Refusé : --state invalide (« ${state} »). Valeurs acceptées : ${fleetLib.STATES.join(' | ')}.`);
    }
    const perimeter = flagList('perimeter');
    const fields = [
      { name: '--session', value: session, max: fleetLib.MAX_STR },
      { name: '--branch', value: flag('branch'), max: fleetLib.MAX_STR },
      { name: '--title', value: flag('title'), max: fleetLib.MAX_STR },
    ].concat(perimeter.map((p, i) => ({ name: `--perimeter[${i + 1}]`, value: p, max: fleetLib.MAX_STR })));
    if (truncGuard(fields)) return;

    const b = backlog.loadBacklog(root);
    const known = b.lots.find((x) => x.id === idn);
    const okw = fleetLib.upsertLot(root, {
      id: idn,
      session_owner: session,
      branch: flag('branch') || (known ? backlog.waveBranch(known) : null),
      perimeter,
      state,
      title: flag('title') || (known ? known.title : null),
    });
    if (!okw) return out(`Refusé : inscription de l'US#${idn} impossible (écriture de ${rel} en échec).`);
    const warn = known ? '' : ` ⚠️ Aucune US#${idn} au plan (backlog.json) — vérifie l'id.`;
    const noPer = perimeter.length ? '' : ' ⚠️ Sans --perimeter, la garde d\'écriture ne bride RIEN pour cette session.';
    const deduced = explicitSession ? '' : ' ⚠️ Session DÉDUITE de .vibe-agent/session-state.json (à jour seulement après le 1er SessionStart)'
      + ' — si ce n\'est pas la tienne, refais l\'inscription avec `--session <id réel>`.';
    out(`US#${idn} inscrite dans la vague (session ${session}, état ${state}).${warn}${noPer}${deduced}`);
    return;
  }

  if (sub === 'ready') {
    if (!fleetLib.setLotState(root, idn, 'ready')) {
      return out(`Refusé : US#${idn} absente du registre de vague (inscris-la d'abord : \`fleet join --id ${idn}\`).`);
    }
    return out(`US#${idn} passée « prêt à merger ». L'orchestrateur peut la réintégrer (\`reintegrate --execute\`).`);
  }

  // Dette #99 soldée (lot #100) : `join` n'avait pas de réciproque. Une fille inscrite à tort
  // (mauvais id, mauvaise session, vague abandonnée) ne pouvait se désinscrire qu'en éditant
  // fleet.json à la main — hors gardes — ou en subissant une réintégration qu'elle ne voulait
  // pas. `leave` retire l'entrée ET son handoff de lot (sinon il traîne en orphelin jusqu'à la
  // clôture d'une vague, cf. purgeLotHandoffs). Ne touche PAS au backlog : quitter la vague
  // n'abandonne pas le lot, il redevient simplement un lot de session autonome.
  if (sub === 'leave') {
    if (d.state === 'absent') return out('Refusé : aucune vague active (pas de fleet.json) — rien à quitter.');
    const before = fleetLib.loadFleet(root).lots.find((l) => l.id === idn);
    if (!fleetLib.removeLot(root, idn)) {
      return out(`Refusé : US#${idn} absente du registre de vague (rien à désinscrire).`);
    }
    let purged = 0;
    try { purged = require('../lib/handoff').purgeLotHandoffs(root, [idn]); } catch (_) { /* best-effort */ }
    const wasReady = before && before.state === 'ready';
    const rest = fleetLib.loadFleet(root);
    out(`US#${idn} retirée de la vague${purged ? ` (handoff d'US purgé)` : ''}. `
      + 'La session redevient autonome : plus de garde de périmètre, plus d\'injection de vague.');
    if (wasReady) out('⚠️ Cette US était « prêt à merger » : elle sort du plan de réintégration — sa branche ne sera plus mergée automatiquement.');
    if (!rest.active) out(`Plus aucune US en vol : la vague est inerte (${rel} vidé de ses US).`);
    return;
  }

  return out(`Sous-commande fleet inconnue : ${sub}. Sous-commandes : join | ready | leave | show.`);
}

// pmz:epicmaster (lot #133) — plan de SESSION MAÎTRE : lots ouverts (todo + in_progress) groupés
// par epic, vagues « maître » (périmètres disjoints ; lot sans périmètre = seul en vol, en série),
// parallélisme borné (plafond + budget de contexte du maître), modèle/effort préconisés pour la
// session maître elle-même. PROPOSE seulement — rien démarré, aucun sous-agent lancé. Options :
//   --epic "…"            ne garder que cet epic        --only 1,2 / --skip 3   cocher/décocher
//   --max-parallel N      plafond de sous-agents en vol  --master-model/--master-effort
//   --write-handoff       pose le handoff maître dans .vibe-agent/handoff.md (--handoff-file <chemin>)
//   --brief --id N        brief autonome d'UN lot, à coller dans le prompt du sous-agent
//   --json                plan machine
//   --live [--detailed]   état live de la session maître (lecture seule, lot #136)
//   --live-seed           sème le plan COMPLET dans .vibe-agent/epicmaster-live.json (lot #141) : epic,
//                         vagues, lots pending (modèle·effort, depends_on, tokens est.) — mêmes filtres que le plan
//                         [--wave-labels "1=Socle;2=Providers"] : libellé de chaque vague affiché par la bande
//   --review-brief --ids a,b [--unverified "…"]  brief du relecteur opus de consolidation (US#160)
//   --session-title       titre de la session maître (« [XXX · EP#a–#b] <nom de l'epic> »)
function epicmaster(root, json) {
  // --live [--detailed] (lot #136) : état LIVE de la session maître (.vibe-agent/epicmaster-live.json),
  // lecture seule — ne calcule ni plan ni handoff. Compact par défaut ; --detailed : une ligne par lot/agent.
  if (process.argv.includes('--live')) {
    const r = require('../lib/epicmaster-live').renderLive(root, { detailed: process.argv.includes('--detailed') });
    return out(json ? JSON.stringify(r.summary, null, 2) : r.text);
  }
  const em = require('../lib/epicmaster');
  const b = backlog.loadBacklog(root);
  const opts = {
    epic: flag('epic'), only: flagList('only'), skip: flagList('skip'),
    maxParallel: flag('max-parallel'), masterModel: flag('master-model'), masterEffort: flag('master-effort'),
  };
  if (opts.masterEffort && !backlog.EFFORT_LEVELS.includes(opts.masterEffort)) {
    return out(`Refusé : --master-effort invalide (« ${opts.masterEffort} »). Valeurs acceptées : ${backlog.EFFORT_LEVELS.join(' | ')}.`);
  }
  // --review-brief --ids a,b [--unverified "<texte>" …] (US#160) : brief du relecteur opus de fin de
  // session maître (1 seul, si >= 2 US closes). Lecture seule : n'écrit rien, ne lance rien.
  if (process.argv.includes('--review-brief')) {
    const ids = flagList('ids');
    const unverified = [];
    for (let i = 0; i < process.argv.length; i++) if (process.argv[i] === '--unverified' && process.argv[i + 1] != null) unverified.push(process.argv[i + 1]);
    try { // « Non vérifié » des fiches d'archive déjà écrites (fail-open : absent -> ignoré)
      const ar = require('../lib/archive');
      for (const id of ids) {
        const t = ar.readFiche(root, id);
        const sec = t ? (t.split(/^## Non vérifié[^\n]*\n/m)[1] || '').split(/^## /m)[0] : '';
        for (const ln of sec.split('\n').map((x) => x.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean)) unverified.push(`${ln} (US#${id})`);
      }
    } catch (_) { /* fail-open */ }
    const r = em.renderReviewBrief(b, ids, { unverified });
    return out(json ? JSON.stringify({ ok: r.ok, ids: r.ids, base: r.base, reason: r.reason, model: em.REVIEW_MODEL, effort: em.REVIEW_EFFORT, brief: r.text }, null, 2) : (r.ok ? r.text : r.reason));
  }
  if (process.argv.includes('--brief')) {
    const rawId = flag('id');
    const l = b.lots.find((x) => x.id === Number(rawId));
    if (rawId == null || !l) return out(`Refusé : --brief exige --id d'une US existante (reçu : ${rawId == null ? 'aucun' : rawId}).`);
    if (!(l.status === 'todo' || l.status === 'in_progress')) return out(`Refusé : l'US#${l.id} est ${LABELS_F[l.status]} — pas de brief pour une US fermée.`);
    out(em.renderBrief(l, b, PMZ_BASE));
    out('');
    out('Côté maître, AVANT de lancer le sous-agent :');
    out(`  ${em.launchCommand(l, PMZ_BASE)}`);
    out('Côté maître, à la réception du rapport (verify verte seulement, dans cet ordre) :');
    for (const c of em.closeCommands(l, PMZ_BASE)) out(`  ${c}`);
    return;
  }
  const plan = em.planMaster(root, b, opts);
  // --session-title : titre de la session maître courante (« [XXX · EP#a–#b] <nom de l'epic> »), mêmes
  // filtres que le plan ; le maître renomme SA session avec, dès le plan confirmé.
  if (process.argv.includes('--session-title')) {
    if (!plan.lots.length) return out('Aucune US à embarquer : pas de titre.');
    const epics = [...new Set(plan.lots.map((l) => l.epic).filter(Boolean))];
    return out(require('../lib/lot').titleForMasterSession(trigram.readTrigram(root), opts.epic || epics.join(' + '), plan.lots.map((l) => l.id)));
  }
  // --live-seed (lot #141) : écrit le plan complet dans le fichier live (la bande l'affiche dès le
  // lancement, avant tout `start`). N'écrit QUE ce fichier — aucun lot démarré, aucun handoff.
  if (process.argv.includes('--live-seed')) {
    const r = require('../lib/epicmaster-live').seedFromPlan(root, plan, b, { epic: opts.epic, waveLabels: flag('wave-labels') });
    if (json) return out(JSON.stringify({ seeded: r.ok, epic: r.epic, waves: r.waves, lots: r.lots, file: '.vibe-agent/epicmaster-live.json' }, null, 2));
    if (!plan.lots.length) return out('Aucune US à semer : état live NON écrit (rien à embarquer).');
    return out(r.ok
      ? `État live semé : epic « ${r.epic} », ${r.waves} vague${r.waves > 1 ? 's' : ''}, ${r.lots} US en attente — .vibe-agent/epicmaster-live.json (aucune US démarrée).`
      : 'Refusé : écriture de l\'état live impossible (droits ? .vibe-agent absent ?).');
  }
  let handoffPath = null;
  if (process.argv.includes('--write-handoff')) {
    if (!plan.lots.length) {
      if (!json) out('Aucune US à embarquer : handoff maître NON écrit (rien à préparer).');
    } else {
      const text = em.renderMasterHandoff(plan, { epic: opts.epic, pmzBase: PMZ_BASE });
      const target = flag('handoff-file') ? path.resolve(root, flag('handoff-file')) : null;
      handoffPath = em.writeMasterHandoff(root, text, target);
    }
  }
  if (json) {
    const { _lotsById, ...rest } = plan;
    return out(JSON.stringify(Object.assign(rest, { handoff_written: handoffPath ? path.relative(root, handoffPath) : null }), null, 2));
  }
  out(em.renderPlan(plan, b, PMZ_BASE));
  if (process.argv.includes('--write-handoff') && plan.lots.length) {
    out(handoffPath
      ? `Handoff maître écrit : ${path.relative(root, handoffPath)} — injecté automatiquement au démarrage de la prochaine session fraîche (pose-y le modèle ${plan.master.model}).`
      : 'Refusé : écriture du handoff maître impossible (droits ? .vibe-agent absent ?).');
  }
}

// US#156 — close-wave : clôture groupée d'une vague (commit borné, done, fiche d'archive,
// CHANGELOG) en UN appel. Entrée JSON (--file <chemin> | --stdin) :
//   { "date"?: "YYYY-MM-DD", "allow_incomplete_spec"?: bool, "items": [ { "id", "paths": [...],
//     "message", "verdict": "ok|failed|none|timeout", "tokens"?, "fiche"?: "<markdown>",
//     "changelog"?: { "title", "bullets": [...] }, "reason"? (verify rouge) } ] }
// Ordre = ordre du plan. Commit BORNÉ aux chemins (`git commit -- <chemins>` : backlog.json déjà
// indexé par `start` n'est jamais embarqué). Un chemin partagé n'ira que dans un seul commit.
// Verify rouge : pas de commit, note --decide + done failed + reopen. --dry-run : rien d'écrit.
// `done` refusé pour spec incomplète : relayer `allow_incomplete_spec` / --allow-incomplete-spec.
function closeWave(root, json) {
  const { spawnSync } = require('child_process');
  const specPath = flag('file');
  let raw = null;
  try { raw = process.argv.includes('--stdin') ? fs.readFileSync(0, 'utf8') : (specPath ? fs.readFileSync(specPath, 'utf8') : null); } catch (_) { raw = null; }
  if (!raw || !raw.trim()) return out('Usage : close-wave --file <vague.json> | --stdin [--dry-run] [--allow-incomplete-spec] [--json]. Entrée vide ou illisible : rien fait.');
  let input;
  try { input = JSON.parse(raw); } catch (_) { return out('Refusé : JSON de vague invalide — rien fait.'); }
  const plan = backlog.planCloseWave(input && input.items);
  if (!plan.items.length) return out('Refusé : aucune US dans la vague — rien fait.');
  const dry = process.argv.includes('--dry-run');
  const allowInc = !!(input && input.allow_incomplete_spec) || process.argv.includes('--allow-incomplete-spec');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || '')) ? input.date : new Date().toISOString().slice(0, 10);
  const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  const node = (script, args, inp) => {
    const r = spawnSync(process.execPath, [path.join(__dirname, script), ...args, '--cwd', root], { encoding: 'utf8', input: inp });
    return ((r.stdout || '') + (r.stderr || '')).trim();
  };
  const first = (r) => String((r.stderr || r.stdout) || '').trim().split('\n')[0].slice(0, 160);
  const rep = { closed: [], open: [], warnings: plan.shared.map((x) => `chemin partagé « ${x.path} » : gardé par US#${x.kept_by}, retiré de US#${x.dropped_for} (un seul commit)`), changelog: null, doc_commit: null };
  const entries = [];
  for (const it of plan.items) {
    const idS = String(it.id);
    const tk = it.tokens ? ['--tokens', String(it.tokens)] : [];
    if (it.verdict === 'failed' || it.verdict === 'timeout') {
      const cause = String(it.reason || `verify ${it.verdict}`).slice(0, 200);
      if (!dry) {
        node('backlog.js', ['note', '--id', idS, '--note', `verify rouge : ${cause}`, '--decide']);
        node('backlog.js', ['done', '--id', idS, '--verify-verdict', it.verdict, ...tk, '--allow-incomplete-spec']);
        node('backlog.js', ['reopen', '--id', idS, '--note', `verify rouge : ${cause}`]);
      }
      rep.open.push({ id: it.id, why: `verify ${it.verdict} : ${cause}` });
      continue;
    }
    if (!it.message || !it.paths.length) { rep.open.push({ id: it.id, why: 'message ou chemins manquants (commit borné impossible)' }); continue; }
    if (dry) { rep.closed.push({ id: it.id, commit: '(dry-run)', verdict: it.verdict }); continue; }
    const a = git(['add', '--', ...it.paths]);
    if (a.status !== 0) { rep.open.push({ id: it.id, why: 'git add : ' + first(a) }); continue; }
    const c = git(['commit', '-q', '-m', String(it.message), '--', ...it.paths]);
    if (c.status !== 0) { rep.open.push({ id: it.id, why: 'git commit : ' + first(c) }); continue; }
    const sha = (git(['rev-parse', '--short', 'HEAD']).stdout || '').trim();
    const d = node('backlog.js', ['done', '--id', idS, '--commit', sha, '--verify-verdict', it.verdict, ...tk, ...(allowInc ? ['--allow-incomplete-spec'] : [])]);
    if (/^Refusé/.test(d)) { rep.open.push({ id: it.id, why: `commit ${sha} fait, done refusé : ${d.slice(0, 160)}` }); continue; }
    let fiche = 'aucune';
    if (it.fiche && String(it.fiche).trim()) {
      // Le marqueur de 1re ligne est exigé par archive.js : on l'ajoute s'il manque (le maître n'a pas à le connaître).
      const mk = require('../lib/archive').ficheMarker(it.id);
      const body = String(it.fiche).startsWith(mk) ? String(it.fiche) : `${mk}\n${String(it.fiche)}`;
      fiche = /écrite/.test(node('archive.js', ['write', '--id', idS, '--stdin'], body)) ? 'écrite' : 'refusée';
    }
    rep.closed.push({ id: it.id, commit: sha, verdict: it.verdict, fiche });
    if (it.changelog && it.changelog.title) entries.push(backlog.renderChangelogEntry(date, it.id, it.changelog.title, it.changelog.bullets));
  }
  if (!dry && entries.length) {
    const cl = path.join(root, 'CHANGELOG.md');
    let cur = ''; try { cur = fs.readFileSync(cl, 'utf8'); } catch (_) { /* absent : créé */ }
    try { fs.writeFileSync(cl, backlog.insertChangelog(cur, entries)); rep.changelog = 'CHANGELOG.md'; } catch (_) { rep.warnings.push('CHANGELOG.md non écrit'); }
  }
  if (!dry && rep.closed.length) {
    // Commit de suivi borné : CHANGELOG + état du backlog + archive (uniquement ce qui existe).
    const docPaths = ['CHANGELOG.md', '.vibe-agent/backlog.json', '.vibe-agent/archive'].filter((p) => fs.existsSync(path.join(root, p)));
    if (docPaths.length && git(['add', '--', ...docPaths]).status === 0) {
      const ids = rep.closed.map((x) => '#' + x.id).join(', ');
      const c = git(['commit', '-q', '-m', `docs(changelog): clôture ${ids}`, '--', ...docPaths]);
      if (c.status === 0) rep.doc_commit = (git(['rev-parse', '--short', 'HEAD']).stdout || '').trim();
      else rep.warnings.push('commit de suivi non fait : ' + first(c));
    }
  }
  if (json) return out(JSON.stringify(rep, null, 2));
  out(`close-wave${dry ? ' (dry-run)' : ''} — ${rep.closed.length} close(s), ${rep.open.length} ouverte(s).`);
  for (const x of rep.closed) out(`  ✓ US#${x.id} commit ${x.commit} · verify ${x.verdict}${x.fiche ? ' · fiche ' + x.fiche : ''}`);
  for (const x of rep.open) out(`  ✗ US#${x.id} reste ouverte — ${x.why}`);
  if (rep.changelog) out(`  CHANGELOG mis à jour${rep.doc_commit ? ` · commit de suivi ${rep.doc_commit}` : ''}.`);
  for (const w of rep.warnings) out(`  ⚠️ ${w}`);
}

function main() {
  const root = gitRoot(parseCwd());
  if (!root) return out('Pas un dépôt git — backlog indisponible.');
  const cmd = (process.argv[2] || '').startsWith('--') ? 'show' : (process.argv[2] || 'show');
  // Garde anti-troncature (#88) : un flag mono-valeur non quoté (« --title fait quand : X »)
  // ne capte que le 1er token ; les tokens nus suivants seraient jetés en silence.
  // On les repère et on rejette explicitement plutôt que de tronquer sans le dire.
  // Dispatch à DEUX tokens pour `fleet <sub>` (seul verbe à sous-commandes) : le sous-verbe
  // n'est pas un argument orphelin, il décale le début du balayage argv d'un cran.
  const rawSub = process.argv[3] || '';
  const sub = cmd === 'fleet' && rawSub && !rawSub.startsWith('--') ? rawSub : null;
  const argStart = (process.argv[2] || '').startsWith('--') ? 2 : (sub ? 4 : 3);
  // US#160 : flags de `epicmaster --review-brief` déclarés ici (VALUE_FLAGS exporté, mutable) — la
  // garde anti-orphelins les traite comme mono-valeur ; lib/backlog.js reste hors périmètre.
  for (const f of ['ids', 'unverified']) if (!backlog.VALUE_FLAGS.includes(f)) backlog.VALUE_FLAGS.push(f);
  const orphans = backlog.orphanArgs(process.argv, argStart);
  if (orphans.length) {
    return out(`Refusé : argument(s) orphelin(s) ignoré(s) — ${orphans.map((o) => `« ${o} »`).join(', ')}. `
      + 'Probablement une valeur non quotée : mets-la entre guillemets, ex. --title "fait quand : …".');
  }
  const json = process.argv.includes('--json');
  const id = flag('id');

  if (cmd === 'show') return show(root, json, flag('epic'));

  if (cmd === 'epic') {
    const name = flag('set');
    if (!name) return out(`Epic actuel : ${lot.readEpic(root)}`);
    const okw = lot.writeEpic(root, name);
    // Poser un epic = acte de CONCEPTION (/pmz:scope étape 3, lot #130) : la session courante
    // sera titrée « [XXX · Plan] <epic> » par la suivante. Best-effort, jamais bloquant.
    if (okw) { try { markPlanSession(root); } catch (_) { /* fail-open */ } }
    return out(okw ? `Epic « ${name.trim().slice(0, lot.MAX_EPIC)} » enregistré (.vibe-agent/epic).`
      : 'Refusé : nom vide ou échec d\'écriture.');
  }

  if (cmd === 'trigram') {
    if (process.argv.includes('--suggest')) {
      return out(trigram.suggestTrigrams(root).map((t) => `[${t}]`).join(' / '));
    }
    const set = flag('set');
    if (!set) return out(`Trigramme actuel : [${trigram.readTrigram(root)}]`);
    const applied = trigram.writeTrigram(root, set);
    return out(applied ? `Trigramme « [${applied}] » enregistré (.vibe-agent/trigram).`
      : 'Refusé : trigramme invalide.');
  }

  if (cmd === 'add') {
    const model = flag('model');
    if (!model) {
      return out('Refusé : --model manquant. Une préconisation de modèle par US est obligatoire (ex. --model sonnet ou --model opus).');
    }
    const effort = flag('effort');
    if (effort && !backlog.EFFORT_LEVELS.includes(effort)) {
      return out(`Refusé : --effort invalide (« ${effort} »). Valeurs acceptées : ${backlog.EFFORT_LEVELS.join(' | ')}.`);
    }
    if (truncGuard([
      { name: '--title', value: flag('title'), max: backlog.MAX_TITLE },
      { name: '--scope', value: flag('scope'), max: backlog.MAX_SCOPE },
      { name: '--model', value: model, max: backlog.MAX_MODEL_HINT },
      { name: '--epic', value: flag('epic'), max: backlog.MAX_EPIC },
      { name: '--verify', value: flag('verify'), max: backlog.MAX_VERIFY },
      { name: specFlagName(), value: specFlag(), max: backlog.MAX_SPEC },
    ])) return;
    const dep = parseDepends();
    if (!dep.ok) return;
    // Garde d'existence (fait quand du lot « Pointeur US vérifié ») : un chemin --spec (ex --us,
    // alias déprécié) qui ne pointe vers rien est REFUSÉ, jamais avalé — un pointeur mort serait
    // pire qu'aucune spec.
    // addLot revalide en interne (défense en profondeur) ; on refuse ici en premier pour un
    // message explicite, distinct du refus générique --title/plafond ci-dessous.
    const specPath = specFlag();
    if (specPath && !fs.existsSync(path.join(root, specPath))) {
      return out(`Refusé : ${specFlagName()} pointe vers un chemin inexistant (« ${specPath} », relatif à la racine du dépôt « ${root} »). `
        + `Crée le fichier d'abord (cf. templates/spec-template.md, ex. docs/us/US-42/spec.md), ou omets ${specFlagName()} si la spec n'est pas encore rédigée.`);
    }
    const newLot = backlog.addLot(root, flag('title'), flag('scope'), model, flag('epic'), flag('verify'), effort, flagList('perimeter'), dep.ids, specPath);
    if (!newLot) {
      const b = backlog.loadBacklog(root);
      if (b.lots.filter((l) => l.status === 'todo' || l.status === 'in_progress').length >= backlog.MAX_LOTS_OPEN) {
        return out(`Refusé : ${backlog.MAX_LOTS_OPEN} US ouvertes au plafond — un backlog n'est pas un Jira. Clore ou abandonner d'abord.`);
      }
      return out('Refusé : --title manquant ou vide.');
    }
    // NOTE (lot #130) : `add` ne marque PAS la session comme session de plan, même avec --epic.
    // Se poser un lot avant de le traiter est le geste ORDINAIRE d'une session de travail (et le
    // marquer « Plan » la décrivait à faux) ; l'acte de conception tracé est `epic --set`, que
    // /pmz:scope exécute pour le plan qu'il découpe.
    let addMsg =`US#${newLot.id} « ${newLot.title} » ajoutée (à faire)${backlog.modelEffortTag(newLot)}${newLot.epic ? ` [epic : ${newLot.epic}]` : ''}${newLot.verify ? ` [verify : ${newLot.verify}]` : ''}${newLot.spec ? ` [Spec : ${newLot.spec}]` : ''}${newLot.perimeter.length ? ` [périmètre : ${newLot.perimeter.join(', ')}]` : ''}${newLot.depends_on.length ? ` [dépend de : ${newLot.depends_on.map((d) => '#' + d).join(', ')}]` : ''}.`;
    addMsg += estimateSuffix(backlog.loadBacklog(root), newLot);
    addMsg += backlog.costlyChoiceWarning(model, effort, flag('why'));
    return out(addMsg);
  }

  if (cmd === 'verify') {
    const set = flag('set');
    if (!set) {
      const b = backlog.loadBacklog(root);
      const l = b.lots.find((x) => x.id === Number(id));
      return out(l ? `Verify de l'US#${l.id} : ${l.verify || '(aucune)'}` : `US#${id} introuvable.`);
    }
    if (truncGuard([{ name: '--set', value: set, max: backlog.MAX_VERIFY }])) return;
    const l = backlog.setVerify(root, id, set);
    return out(l ? `Verify de l'US#${l.id} enregistrée : ${l.verify}` : `US#${id} introuvable ou commande vide.`);
  }

  // Lot #106 : le champ `spec` (ex-`us`, lot #101) n'avait qu'une porte d'entrée, `add --spec`,
  // et supposait la spec déjà rédigée. Trois régimes ici, sur le modèle de `verify` :
  //  - sans flag : LECTURE du pointeur (coût zéro, pas d'ouverture du fichier) ;
  //  - --new : pose docs/us/US-<id>/spec.md depuis le gabarit ET rattache le pointeur ;
  //  - --set <chemin> : rattache une spec déjà écrite ailleurs (issue du refus doux « existe déjà »).
  // Sous-commande `us` gardée en alias déprécié de `spec`.
  if (cmd === 'spec' || cmd === 'us') {
    const b = backlog.loadBacklog(root);
    const cur = b.lots.find((x) => x.id === Number(id));
    if (!cur) return out(`US#${id} introuvable.`);
    const set = flag('set');
    const wantNew = process.argv.includes('--new');
    if (wantNew && set) {
      return out('Refusé : --new et --set s\'excluent (générer un gabarit ou rattacher un fichier existant, pas les deux).');
    }
    if (set) {
      if (truncGuard([{ name: '--set', value: set, max: backlog.MAX_SPEC }])) return;
      if (!fs.existsSync(path.join(root, set))) {
        return out(`Refusé : --set pointe vers un chemin inexistant (« ${set} », relatif à « ${root} »). `
          + `Un pointeur mort est pire qu'aucune spec — écris le fichier d'abord, ou pose le gabarit avec \`spec --id ${cur.id} --new\`.`);
      }
      const l = backlog.setSpec(root, id, set);
      if (!l) return out(`Refusé : l'US#${cur.id} est ${LABELS_F[cur.status]} — son pointeur de spec n'est plus modifiable.`);
      return out(`Spec de l'US#${l.id} rattachée : ${l.spec}`);
    }
    if (!wantNew) {
      return out(`Spec de l'US#${cur.id} : ${cur.spec || '(aucune)'}${cur.spec ? '' : ` — poser le gabarit : \`spec --id ${cur.id} --new\``}`);
    }
    const res = backlog.createSpecFile(root, id);
    if (res.ok) {
      out(`Spec de l'US#${res.lot.id} créée : ${res.rel} (gabarit posé, pointeur rattaché).`);
      return out('À remplir à la main : récit, critères d\'acceptation vérifiables, hors périmètre. Le backlog ne porte QUE le chemin.');
    }
    if (res.reason === 'exists') {
      const already = cur.spec === res.rel;
      out(`Refusé : ${res.rel} existe déjà — cette commande génère un gabarit, elle n'écrase jamais une spec rédigée.`);
      return out(already ? 'Ce fichier est déjà le pointeur de spec de l\'US : rien à faire, édite-le directement.'
        : `${cur.spec ? `L'US pointe vers « ${cur.spec} »` : 'L\'US ne pointe vers aucune spec'} — pour rattacher ce fichier : \`spec --id ${cur.id} --set ${res.rel}\`.`);
    }
    if (res.reason === 'closed') {
      return out(`Refusé : l'US#${cur.id} est ${LABELS_F[cur.status]} — une spec écrite après la clôture ne gouverne plus rien.`);
    }
    if (res.reason === 'template') {
      return out(`Refusé : gabarit de spec illisible (attendu : ${PMZ_BASE}/templates/spec-template.md). Réinstalle Promptimizer.`);
    }
    return out(`Refusé : écriture impossible sous ${res.rel} (droits ? dépôt en lecture seule ?).`);
  }

  // FIA-24 (lot #98) : `setDepends` existait sans chemin CLI — corriger une dépendance après
  // création (ajout, retrait, faute de frappe d'id) imposait d'éditer backlog.json à la main,
  // hors des gardes que le reste du CLI applique. Sans --depends : LECTURE. Avec --depends "" :
  // vidage explicite (flagList filtre les vides — d'où le test de présence sur argv, pas sur la
  // liste). Remplacement intégral, comme setDepends côté lib.
  if (cmd === 'depends') {
    const b = backlog.loadBacklog(root);
    const cur = b.lots.find((x) => x.id === Number(id));
    if (!cur) return out(`US#${id} introuvable.`);
    const fmt = (ds) => (ds.length ? ds.map((d) => '#' + d).join(', ') : '(aucune)');
    if (!process.argv.includes('--depends')) {
      return out(`Dépendances de l'US#${cur.id} : ${fmt(cur.depends_on)}`);
    }
    const dep = parseDepends();
    if (!dep.ok) return;
    const lot = backlog.setDepends(root, id, dep.ids);
    if (!lot) return out(`Refusé : l'US#${cur.id} est ${LABELS_F[cur.status]} — ses dépendances ne sont plus modifiables.`);
    // Ids ne correspondant à aucun lot : AVERTIS, pas refusés — `blockedByOf`/`planWaves` les
    // traitent comme satisfaits (tolérance hors-plan volontaire), mais c'est le symptôme n°1
    // de la faute de frappe que cette commande sert justement à corriger.
    const unknown = lot.depends_on.filter((d) => !b.lots.some((x) => x.id === d));
    const warn = unknown.length ? ` ⚠️ Aucune US ne porte ${unknown.map((d) => '#' + d).join(', ')} (dépendance ignorée au calcul de vagues).` : '';
    return out(`Dépendances de l'US#${lot.id} : ${fmt(lot.depends_on)}.${warn}`);
  }

  // FIA-25 (lot #98) : soupape de réouverture d'un lot clos (scope insuffisant découvert après
  // coup, régression). --note obligatoire : la réouverture EFFACE la trace de clôture.
  if (cmd === 'reopen') {
    if (truncGuard([{ name: '--note', value: flag('note'), max: backlog.MAX_NOTE }])) return;
    const note = flag('note');
    const b = backlog.loadBacklog(root);
    const cur = b.lots.find((x) => x.id === Number(id));
    if (!cur) return out(`US#${id} introuvable.`);
    if (cur.status === 'dropped') {
      return out(`Refusé : l'US#${cur.id} est abandonnée, pas close — une US dropped se re-crée (add), elle ne se rouvre pas.`);
    }
    if (cur.status !== 'done') return out(`Refusé : l'US#${cur.id} est déjà ouverte (${LABELS[cur.status]}).`);
    if (!note) {
      return out('Refusé : --note manquante. Une réouverture efface la trace de clôture (commit, verdict verify, '
        + 'session, occupation) — elle doit dire pourquoi. Ex. --note "régression détectée sur X".');
    }
    const lot = backlog.reopenLot(root, id, note);
    if (!lot) return out(`US#${id} : échec d'écriture, rien n'a été modifié.`);
    const n = (lot.reopened || []).length;
    return out(`US#${lot.id} « ${lot.title} » rouverte (à faire)${backlog.modelEffortTag(lot)} — clôture effacée`
      + `, réouverture n°${n} tracée. Démarre-la avec : backlog.js start --id ${lot.id}`);
  }

  if (cmd === 'start') {
    const lot = backlog.startLot(root, id, flag('owner'));
    if (!lot) return out(`US#${id} introuvable ou déjà close/abandonnée.`);
    let startMsg = `US#${lot.id} « ${lot.title} » démarrée (en cours)${backlog.modelEffortTag(lot)}${lot.session_owner ? ` [session : ${lot.session_owner}]` : ''}.`;
    startMsg += estimateSuffix(backlog.loadBacklog(root), lot);
    liveRecord(root, 'start', lot, lot.session_owner);
    return out(startMsg);
  }

  if (cmd === 'done') {
    // Structure de la spec (lot #107) : une spec aux sections obligatoires manquantes n'a pas la
    // valeur de contrat qu'elle prétend avoir. Refus DOUX (message actionnable, pas de fail-hard
    // ni de blocage de session) — --allow-incomplete-spec (alias déprécié --allow-incomplete-us)
    // débloque la clôture malgré tout.
    const preSpec = backlog.loadBacklog(root).lots.find((x) => x.id === Number(id));
    const allowIncomplete = process.argv.includes('--allow-incomplete-spec') || process.argv.includes('--allow-incomplete-us');
    if (preSpec && preSpec.spec && !allowIncomplete) {
      const struct = backlog.checkSpecStructure(root, preSpec.spec);
      if (struct && struct.missing.length) {
        return out(`Refusé : la spec de l'US#${preSpec.id} (${preSpec.spec}) n'a pas toutes ses sections obligatoires — `
          + `manque : ${struct.missing.join(', ')}. Complète le fichier, ou clos quand même avec --allow-incomplete-spec.`);
      }
    }
    // Auto-remplissage session/occupancy (lot #96, DEP-6) : la clôture CLI est le chemin
    // RECOMMANDÉ (/close-batch) mais laissait ces deux champs à null faute de --session/
    // --occupancy jamais tapés. On lit l'état déjà posé PAR LA SESSION COURANTE plutôt que de
    // faire saisir une valeur à l'assistant (halluciner un id fausserait suggestedTitle,
    // lib/backlog.js). --no-session/--no-occupancy pour l'opt-out ; --session/--occupancy
    // pour une valeur explicite (occupancy coercée en Number, un argv est toujours une string).
    const sessionId = process.argv.includes('--no-session')
      ? null
      : (flag('session') || previousSessionId(root));
    let occupancy = null;
    if (!process.argv.includes('--no-occupancy')) {
      const occFlag = flag('occupancy');
      if (occFlag != null) occupancy = Number(occFlag);
      else {
        const cl = loadContextLedger(root);
        occupancy = cl.occupancy && Number.isFinite(cl.occupancy.last) ? cl.occupancy.last : null;
      }
    }
    // Verdict de vérification (lot #119) : jusqu'ici SEULE l'auto-clôture du hook Stop savait
    // écrire closed_verify — la clôture CLI, qui est le chemin RECOMMANDÉ (/close-batch), laissait
    // le champ à null. Résultat : les lots clos proprement étaient ceux SANS preuve persistée,
    // exactement l'inverse de l'intention (cf. #96). Deux chemins, aucun ne devine :
    //   - `--verify-verdict <ok|failed|timeout|none>` : verdict DÉJÀ obtenu (c'est ce que
    //     /close-batch injecte : il vient d'exécuter le verify, le relancer ici serait payer
    //     deux fois la même preuve) ;
    //   - à défaut, on exécute la commande `verify` du lot ici même (délai large résolu par
    //     projet, `resolveVerifyCloseMs` — même budget que /close-batch : ce n'est pas un hook).
    //     `--no-verify` coupe l'exécution — le champ reste alors null, comme avant, jamais un
    //     verdict inventé.
    // Non bloquant par choix : en CLI la clôture est un acte délibéré (le refus doux sur ÉCHEC est
    // déjà porté par /close-batch). Un verdict rouge est PERSISTÉ et ANNONCÉ, pas escamoté.
    const verdictFlag = flag('verify-verdict');
    const preDone = backlog.loadBacklog(root).lots.find((x) => x.id === Number(id));
    let verdict = null;
    let verifyTail = '';
    if (verdictFlag) {
      if (!backlog.CLOSED_VERIFY_VALUES.includes(verdictFlag)) {
        return out(`Refusé : --verify-verdict invalide (« ${verdictFlag} »). Valeurs acceptées : ${backlog.CLOSED_VERIFY_VALUES.join(' | ')}.`);
      }
      verdict = verdictFlag;
    } else if (preDone && preDone.status !== 'done' && !process.argv.includes('--no-verify')) {
      if (!preDone.verify) verdict = 'none';
      else {
        const v = runVerify(root, preDone.verify, resolveVerifyCloseMs(root));
        verdict = v.ok ? 'ok' : (v.timedOut ? 'timeout' : 'failed');
        if (verdict === 'failed') verifyTail = v.tail ? `\n  ${v.tail}` : '';
      }
    }
    const lot = backlog.doneLot(root, id, flag('commit'), null, sessionId, occupancy);
    if (!lot) return out(`US#${id} introuvable.`);
    liveRecord(root, 'done', lot, preSpec && preSpec.session_owner, verdict, { tokens: flag('tokens') }); // owner lu AVANT clôture (doneLot le vide)
    const posted = verdict ? backlog.setClosedVerify(root, lot.id, verdict) : null;
    const proof = posted
      ? ` — verify : ${verdict}${verdict === 'failed' ? ' ⚠️ échec PERSISTÉ (closed_verify), à corriger' : ''}${verdict === 'timeout' ? ' ⚠️ non terminée dans le délai — ce n\'est PAS une preuve de réussite (suite longue ? pose `verify_close_ms` sous `budget:` dans .vibe-agent/rules.yaml)' : ''}`
      : (verdict ? ` — verify : ${verdict} (verdict non persisté : déjà posé)` : '');
    return out(`US#${lot.id} « ${lot.title} » close${lot.closed_commit ? ` (commit ${lot.closed_commit})` : ''}.${proof}${verifyTail}`);
  }

  if (cmd === 'drop') {
    if (truncGuard([{ name: '--note', value: flag('note'), max: backlog.MAX_NOTE }])) return;
    const lot = backlog.dropLot(root, id, flag('note'));
    return out(lot ? `US#${lot.id} « ${lot.title} » abandonnée.`
      : `US#${id} introuvable ou déjà faite.`);
  }

  if (cmd === 'note') {
    if (truncGuard([{ name: '--note', value: flag('note'), max: backlog.MAX_NOTE }])) return;
    const lot = backlog.noteLot(root, id, flag('note'));
    if (lot) liveRecord(root, 'note', lot, lot.session_owner, undefined, { decide: process.argv.includes('--decide') });
    return out(lot ? `Note posée sur l'US#${lot.id}${process.argv.includes('--decide') ? ' (à trancher)' : ''}.` : `US#${id} introuvable ou --note manquante.`);
  }

  if (cmd === 'next') {
    const bn = backlog.loadBacklog(root);
    const lot = backlog.nextLot(bn);
    // blockedBy calculé à la volée, jamais persisté : l'objet JSON sorti est une COPIE enrichie
    // (annoter `lot` le ferait écrire dans backlog.json par un saveBacklog ultérieur).
    const bl = backlog.blockedByOf(bn, lot);
    if (json) return out(JSON.stringify(lot ? Object.assign({}, lot, { blockedBy: bl }) : null));
    if (!lot) return out('Aucune US à faire.');
    const warn = bl.length ? ` ⚠️ Bloqué par ${bl.map((d) => '#' + d).join(', ')} encore ouvert (toutes les US restantes le sont).` : '';
    return out(`Prochaine US : #${lot.id} « ${lot.title} »${backlog.modelEffortTag(lot)}${lot.scope ? ` — ${lot.scope}` : ''}.${warn}`);
  }

  if (cmd === 'export') {
    const format = flag('format') || 'md';
    if (format !== 'md' && format !== 'csv') {
      return out(`Refusé : --format invalide (« ${format} »). Valeurs acceptées : md | csv.`);
    }
    const b = backlog.loadBacklog(root);
    return out(format === 'csv' ? backlog.exportCsv(b) : backlog.exportMarkdown(b));
  }

  if (cmd === 'parallelize') return parallelize(root, json, flag('epic'));

  if (cmd === 'epicmaster') return epicmaster(root, json);

  if (cmd === 'close-wave') return closeWave(root, json);

  if (cmd === 'fleet') return fleetCmd(root, sub, json);

  if (cmd === 'reintegrate') {
    return reintegrate(root, json, process.argv.includes('--execute'), flag('into'), {
      gate: flag('gate'), finalGate: flag('final-gate'), allowNoGate: process.argv.includes('--allow-no-gate'),
    });
  }

  if (cmd === 'reconcile') {
    const r = backlog.reconcile(root);
    if (!r.fixed.length && !r.warnings.length) return out('Rien à réparer.');
    for (const f of r.fixed) out(`Réparé : ${f}`);
    for (const w of r.warnings) out(`Note : ${w}`);
    return;
  }

  out(`Commande inconnue : ${cmd}. Commandes : show | add | start | done | drop | note | reopen | depends | next | parallelize | epicmaster | close-wave | fleet <join|ready|leave|show> | reintegrate | reconcile | epic | verify | spec | trigram | export.`);
}

if (require.main === module) {
  try { main(); } catch (_) { /* fail-open */ }
  process.exit(0);
}
