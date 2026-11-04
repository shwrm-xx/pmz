'use strict';
// Capture du plan validé en sortie de mode plan (US#178) : écrit <gitRoot>/.vibe-agent/plan.md
// (unique, écrasé) pour que /pmz:scope --plan le consomme. Fail-open absolu : null sur tout doute.
const fs = require('fs');
const path = require('path');
const { gitRoot, vibeDir } = require('./project');

function capturePlan(cwd, sessionId, planText) {
  try {
    if (typeof planText !== 'string' || !planText.trim()) return null;
    const root = gitRoot(cwd || process.cwd());
    if (!root) return null;
    const dir = vibeDir(root);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'plan.md');
    const sid = String(sessionId || '').replace(/[\r\n]/g, ' ');
    const head = `<!-- pmz:plan session=${sid} at=${new Date().toISOString()} -->`;
    fs.writeFileSync(file, head + '\n' + planText + (planText.endsWith('\n') ? '' : '\n'));
    return file;
  } catch (_) {
    return null;
  }
}

module.exports = { capturePlan };
