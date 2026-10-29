#!/usr/bin/env node
'use strict';
// Publie le plugin `pmz` assemblé sur une branche dédiée (commit orphelin), pour
// distribution via une marketplace GitHub PUBLIQUE (lot D4-bis, canal alternatif au
// partage local/git-interne déjà documenté).
//
// `main` reste le miroir plat source, intact : la branche ne contient QUE l'artefact
// de build (plugin assemblé + .claude-plugin/marketplace.json), régénéré à chaque
// publication — jamais d'historique hérité de main (commit orphelin, comme gh-pages).
//
// Usage :
//   node install/publish-plugin.js                  # build + commit local sur la branche
//   node install/publish-plugin.js --push            # + push --force vers origin
//   node install/publish-plugin.js --push --remote X --branch Y
//
// stdlib seule ; ne pousse vers un remote QUE si --push est explicitement passé.
// Exige un working tree propre (sinon on publierait un état local non commité).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// Tag de release (US#168) : `--push` crée/pousse aussi le tag annoté vX.Y.Z (VERSION) sur le
// HEAD de main ; no-op si le tag est déjà sur ce commit, exit 1 s'il est sur un autre.
// Sans --push, affiche seulement le tag prévu.

const REPO = path.resolve(__dirname, '..', '..');
const BRANCH = argValue('--branch') || 'plugin-release';
const REMOTE = argValue('--remote') || 'origin';
const PUSH = process.argv.includes('--push');
const MARKETPLACE_NAME = 'pmz-marketplace';

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
}

function log(s) { process.stdout.write(s + '\n'); }
function fail(s) { process.stderr.write('ERREUR publish-plugin : ' + s + '\n'); process.exit(1); }

function git(args, cwd) {
  return execFileSync('git', args, { cwd: cwd || REPO, encoding: 'utf8' });
}

// Décision pure : 'create' (pas de tag), 'noop' (même commit), 'conflict' (autre commit).
function tagPlan({ version, headSha, existingSha }) {
  if (!version) throw new Error('tagPlan : version manquante');
  if (!existingSha) return 'create';
  return existingSha === headSha ? 'noop' : 'conflict';
}

// SHA du commit visé par un tag (local d'abord, puis remote si push), ou null.
function existingTagSha(tag) {
  try {
    return git(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`]).trim() || null;
  } catch (_) { /* pas de tag local */ }
  if (!PUSH) return null;
  try {
    const out = git(['ls-remote', '--tags', REMOTE, `refs/tags/${tag}`, `refs/tags/${tag}^{}`]).trim();
    if (!out) return null;
    const lines = out.split('\n').map((l) => l.split(/\s+/));
    const peeled = lines.find((l) => l[1].endsWith('^{}'));
    return (peeled || lines[0])[0];
  } catch (_) { return null; }
}

function main() {
  // ── 0. Working tree propre requis ──
  const status = git(['status', '--porcelain']).trim();
  if (status) fail('working tree non propre — commit ou stash avant de publier :\n' + status);

  // ── 0b. Plan du tag de release (échec précoce si conflit, avant tout push) ──
  const version = fs.readFileSync(path.join(REPO, 'promptimizer', 'VERSION'), 'utf8').trim();
  const TAG = 'v' + version;
  const headSha = git(['rev-parse', 'HEAD']).trim();
  const plan = tagPlan({ version, headSha, existingSha: existingTagSha(TAG) });
  if (plan === 'conflict') {
    fail(`le tag ${TAG} existe déjà sur un autre commit que HEAD (${headSha.slice(0, 7)}) — ni écrasé ni forcé. Bumper VERSION ou résoudre à la main.`);
  }

  // ── 1. Build l'artefact plugin dans un dossier temporaire ──
  const tmpBuild = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-publish-build-'));
  execFileSync(process.execPath, [path.join(__dirname, 'build-plugin.js'), tmpBuild], { stdio: 'inherit' });
  const market = path.join(tmpBuild, 'marketplace');
  if (!fs.existsSync(market)) fail('build-plugin.js n’a pas produit ' + market);

  // ── 2. Renomme la marketplace locale ("pmz-local") en marketplace publique ──
  const marketManifestPath = path.join(market, '.claude-plugin', 'marketplace.json');
  const marketManifest = JSON.parse(fs.readFileSync(marketManifestPath, 'utf8'));
  marketManifest.name = MARKETPLACE_NAME;
  marketManifest.metadata = {
    description: 'Marketplace publique Promptimizer (gouvernance de session vibecoding).',
  };
  fs.writeFileSync(marketManifestPath, JSON.stringify(marketManifest, null, 2) + '\n');

  // ── 3. Worktree détaché pour ne pas perturber le checkout courant ──
  const tmpWorktree = fs.mkdtempSync(path.join(os.tmpdir(), 'pmz-publish-wt-'));
  fs.rmSync(tmpWorktree, { recursive: true, force: true }); // git worktree add crée le dossier lui-même
  git(['worktree', 'add', '--detach', tmpWorktree, 'HEAD']);

  // La branche est régénérée à chaque publication : purge l'ancienne si présente
  // (sinon `checkout --orphan` échoue sur un nom déjà pris).
  try {
    git(['show-ref', '--verify', '--quiet', 'refs/heads/' + BRANCH]);
    git(['branch', '-D', BRANCH]);
  } catch (_) { /* pas de branche existante — rien à purger */ }

  try {
    // Branche orpheline : aucun historique hérité de main.
    git(['checkout', '--orphan', BRANCH], tmpWorktree);
    git(['rm', '-rf', '--quiet', '.'], tmpWorktree);

    // Copie l'artefact assemblé (plugin + marketplace.json) à la racine de la branche.
    for (const entry of fs.readdirSync(market)) {
      fs.cpSync(path.join(market, entry), path.join(tmpWorktree, entry), { recursive: true });
    }

    git(['add', '-A'], tmpWorktree);
    git(['commit', '--quiet', '-m', 'build(plugin): publication pmz — artefact régénéré depuis main'], tmpWorktree);

    log('Branche « ' + BRANCH + ' » régénérée (commit orphelin, local).');

    if (PUSH) {
      execFileSync('git', ['push', REMOTE, `HEAD:refs/heads/${BRANCH}`, '--force'], { cwd: tmpWorktree, stdio: 'inherit' });
      log('Poussé sur ' + REMOTE + '/' + BRANCH + '.');
      if (plan === 'create') {
        git(['tag', '-a', TAG, '-m', 'Release ' + TAG, headSha]);
        execFileSync('git', ['push', REMOTE, TAG], { cwd: REPO, stdio: 'inherit' });
        log('Tag ' + TAG + ' créé et poussé sur ' + REMOTE + ' (' + headSha.slice(0, 7) + ').');
      } else {
        log('Tag ' + TAG + ' déjà présent sur ce commit — rien à faire.');
      }
    } else {
      log('Tag prévu (avec --push) : ' + TAG + ' sur ' + headSha.slice(0, 7) + ' (' + (plan === 'create' ? 'à créer' : 'déjà présent') + ').');
      log('Local uniquement (pas de --push). Pour publier :');
      log(`  git push ${REMOTE} ${BRANCH} --force`);
    }
  } finally {
    git(['worktree', 'remove', '--force', tmpWorktree]);
    fs.rmSync(tmpBuild, { recursive: true, force: true });
  }

  log('');
  log('Canal recommandé — catalogue committé sur main (.claude-plugin/marketplace.json), qui');
  log('déclare le plugin en source git-subdir vers cette branche. Rien d\'autre à faire :');
  log('  claude plugin marketplace add <owner>/<repo>');
  log('  claude plugin install pmz@' + MARKETPLACE_NAME);
  log('');
  log('Fallback (ajouter la branche elle-même — même nom de marketplace, donc remplace le canal');
  log('main chez l\'utilisateur ; noter la syntaxe « #ref », et NON « @ref ») :');
  log('  claude plugin marketplace add https://github.com/<owner>/<repo>.git#' + BRANCH);
}

if (require.main === module) main();
module.exports = { tagPlan };
