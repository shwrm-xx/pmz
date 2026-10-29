# Privacy and transparency

This page lists what each Promptimizer (PMZ) hook reads and writes. It was written from
`promptimizer/hooks/hooks.json` and the scripts it points to (version in `promptimizer/VERSION`).
If you find a discrepancy, report it (see [SECURITY.md](../SECURITY.md)).

Summary:

- No network access and no telemetry: nothing is sent anywhere.
- Writes go to `.vibe-agent/` in your git project, to the PMZ state directory, and (only on an
  explicit "new project" prompt in a non-git folder) to the project root.
- Every hook is fail-open: an error never blocks your session.

## Hooks

All seven events below are declared in `promptimizer/hooks/hooks.json`. Each hook is launched as
`sh bin/pmz-hook hooks/<script>.js`, which finds `node` and runs the script. Hooks receive the
Claude Code hook JSON on stdin (session id, cwd, transcript path, tool input) and print JSON on
stdout. In the tables, "project" means the git root found with `git rev-parse --show-toplevel`.
"State dir" is defined in [Files written](#files-written).

### SessionStart (`startup|resume|clear|compact`) — `session-start.js`

| Event | Script | Reads | Writes | Blocks? |
|---|---|---|---|---|
| SessionStart | `hooks/session-start.js` | `.vibe-agent/` (backlog, handoff, fleet, ledgers, session state), project `CLAUDE.md` (checks for the PMZ rules marker), git status | `.vibe-agent/session-state.json`, `.vibe-agent/` ledgers; deletes orphan `handoff-lot-*.md`; state-dir `welcomed.json` (first start only); state-dir `rtk-state.json` only if RTK is configured | No (injects context text) |

### UserPromptSubmit — `user-prompt-submit.js`

| Event | Script | Reads | Writes | Blocks? |
|---|---|---|---|---|
| UserPromptSubmit | `hooks/user-prompt-submit.js` | Your prompt text (pattern matching only), `.vibe-agent/` backlog and state, transcript file (last model, context occupancy, turn stats) | `.vibe-agent/session-state.json`; state-dir per-session files (`*-turns.json`, `*-ttl`, `*-drift`, budget markers); `$TMPDIR/pmz-title-<session>` marker. If the prompt looks like a new-project request and the folder is not a git repo: `git init`, scaffold files, first commit (see below) | No (injects context text) |

### PreToolUse (`Bash|Edit|Write|MultiEdit|ExitPlanMode|EnterPlanMode`) — `pre-tool-use.js`

| Event | Script | Reads | Writes | Blocks? |
|---|---|---|---|---|
| PreToolUse | `hooks/pre-tool-use.js` | Tool input (Bash command, target `file_path`), `.vibe-agent/fleet.json` | `.vibe-agent/session-state.json` (plan-mode mark, once per session); state-dir `rtk-metrics.json` only if RTK rewriting is on | Yes, in two cases only: `deny` for catastrophic Bash commands (`lib/bash-guard.js`: `rm -rf` on root or home, `curl`/`wget` piped to an interpreter, and similar); `deny` for an Edit/Write outside the exclusive perimeter of a session that belongs to an active parallel wave. Everything else is allowed |

When the opt-in RTK bridge is enabled, the Bash command may be rewritten by the local `rtk`
binary (`rtk rewrite <command>`), after the command was judged safe. It is off by default.

### PostToolUse (`Read|Edit|Write|TodoWrite|Bash`) — `post-tool-use.js`

| Event | Script | Reads | Writes | Blocks? |
|---|---|---|---|---|
| PostToolUse | `hooks/post-tool-use.js` | Tool input and, for Bash, the tool output; for Read, only `stat` (size, mtime) of the file, never its content | `.vibe-agent/read-ledger.json`, `.vibe-agent/context-ledger.json`, `.vibe-agent/todo-snapshot.json` (TodoWrite); `.vibe-agent/logs/<id>.log` (full Bash output, at most 200 files kept); state-dir `*-advisory` | No. It can add an advisory note, and it replaces a Bash output longer than 300 lines by a reduced version (header, errors, tail) pointing to the full log. Disable with `PMZ_OUTPUT_FALLBACK_DISABLE=1` |

Note: `.vibe-agent/logs/*.log` contains the full stdout/stderr of the long Bash commands it
reduced. Treat it like your shell history. It is created in the project; the scaffolded
`.vibe-agent/.gitignore` (template `vibe-gitignore`) ignores it, but a project that lacks that
file would not.

### Stop — `stop.js`

| Event | Script | Reads | Writes | Blocks? |
|---|---|---|---|---|
| Stop | `hooks/stop.js` | Transcript file and sub-agent transcripts of the session (token usage), `.vibe-agent/` files, project `CLAUDE.md`, `git log`, `git status`, `git diff HEAD --numstat` | `.vibe-agent/` (`backlog.json`, `session-state.json`, ledgers, `lot-counter.json`, `handoff.md` or `handoff-lot-<id>.md`, `archive/**`, `trigram`); state-dir per-session files (`*-gitdebt.json`, `*-loops.json`, `*-subagents.json`, `*-hygiene`, `*-subagent`, occupancy and budget markers) | No |

Two behaviours deserve attention:

- **Auto-close runs a command from your backlog.** When a user story is armed for closing, the
  hook runs that story's `verify` command (stored in `.vibe-agent/backlog.json`) through the
  shell, in the project root, with a 2.5 s timeout (`runVerify` in `lib/project.js`). Review the
  `verify` fields of a backlog you did not write.
- **Optional desktop notifications** (off unless `PMZ_NOTIFY=1`) start `osascript`
  (macOS), `notify-send` (Linux) or `powershell.exe` (Windows) with a short text. Nothing else.

### PreCompact (`manual|auto`) — `pre-compact.js`

| Event | Script | Reads | Writes | Blocks? |
|---|---|---|---|---|
| PreCompact | `hooks/pre-compact.js` | `.vibe-agent/` state, transcript file (last context occupancy) | `.vibe-agent/handoff.md` or `.vibe-agent/handoff-lot-<id>.md` (refuses to overwrite an unconsumed manual handoff); creates `.vibe-agent/` if absent | No |

### SubagentStart — `subagent-live.js`

| Event | Script | Reads | Writes | Blocks? |
|---|---|---|---|---|
| SubagentStart | `hooks/subagent-live.js` | Hook payload (sub-agent id and type), `.vibe-agent/epicmaster-live.json` | `.vibe-agent/epicmaster-live.json`; mirror `<config dir>/promptimizer/epicmaster-live/<project>-<hash>.json` (skipped with `PMZ_NO_LIVE_MIRROR=1`) | No |

### SubagentStop — `subagent-live.js`

| Event | Script | Reads | Writes | Blocks? |
|---|---|---|---|---|
| SubagentStop | `hooks/subagent-live.js` | Same as SubagentStart, plus the wave state in `.vibe-agent/` (backlog lots) | Same as SubagentStart, plus `.vibe-agent/epicmaster-concurrency-alert.json` (one-shot concurrency alert) | No |

## Files written

Project (only inside a git repository, except for the new-project case below):

- `.vibe-agent/**`: session state, backlog, ledgers, handoffs, `logs/`, `archive/`, live-wave
  files. Plumbing created silently by `ensureLedger`; no visible file is added to your project
  by the hooks themselves.
- New-project bootstrap, only when your prompt matches a "new project / scaffold / setup"
  pattern **and** the folder is not inside a git repository (and is not `/`, `/tmp`, your home
  directory or another system directory): `git init`, then `CLAUDE.md`, `AGENTS.md`,
  `CHANGELOG.md` and `.vibe-agent/*` templates (never overwriting an existing file), then one
  `git commit` of the scaffold.

User level:

- State directory: `${CLAUDE_PLUGIN_DATA}/state` when run as a plugin, else
  `<claude config dir>/promptimizer/state` (`~/.claude/promptimizer/state`, or under
  `$CLAUDE_CONFIG_DIR`; override with `PMZ_STATE_DIR`). Holds small per-session counters named
  by a SHA-1 prefix of the session id, `welcomed.json`, and the optional RTK files.
- `<claude config dir>/promptimizer/epicmaster-live/<project>-<hash>.json`: live-wave mirror
  written by SubagentStart/SubagentStop.
- `$TMPDIR/pmz-title-<session>`: one-byte marker.

PMZ hooks never write to `~/.claude/settings.json`; only the manual installer
(`promptimizer/install/`) does, with a tagged, reversible merge.

## Network

None. `git grep -nE "require\('(node:)?(https?|net|dgram|dns|tls|http2)'\)|fetch\(|XMLHttpRequest|WebSocket" -- promptimizer`
finds no network call in the code (the only `curl`/`wget` mention is a pattern in
`lib/bash-guard.js` used to block `curl | sh` commands). PMZ has no telemetry, no analytics,
no update check and no remote configuration.

The only subprocesses started by the hooks are: `git` (read-only queries, plus `init`, `add`
and `commit` in the new-project bootstrap); the project's own `verify` command at Stop
auto-close; and, only if you opted in, `rtk` (RTK bridge) and the OS notification tool
(`PMZ_NOTIFY=1`). Those tools have their own behaviour, outside PMZ.

## Fail-open policy

A hook must never break a session:

- Every script installs `uncaughtException` and `unhandledRejection` handlers that call
  `process.exit(0)`, and a watchdog timer (`lib/guard.js`) that exits 0 before the hook timeout
  (10 s for SessionStart, 5 s for the others, as set in `hooks.json`).
- Invalid or missing stdin JSON, I/O errors and timeouts end in a silent `exit 0`. No hook ever
  uses `exit 2`.
- If `node` cannot be found, `bin/pmz-hook` exits 0 without output.
- When in doubt, the decision is `allow`.

## Disabling PMZ

- Plugin: `claude plugin disable pmz@pmz-marketplace` (and `claude plugin uninstall
  pmz@pmz-marketplace` to remove it).
- Per process: set `PMZ_DISABLE=1` in the environment; every hook then exits 0 immediately.
- Finer switches: `PMZ_OUTPUT_FALLBACK_DISABLE=1` (no Bash output reduction), `PMZ_NO_ADVISORY=1`
  (no re-read notes), `PMZ_NO_LIVE_MIRROR=1` (no user-level live mirror).
- Data cleanup: delete `.vibe-agent/` in your project and the state directory above.
