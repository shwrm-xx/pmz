[![CI](https://github.com/shwrm-xx/pmz/actions/workflows/ci.yml/badge.svg)](https://github.com/shwrm-xx/pmz/actions/workflows/ci.yml)

# Promptimizer (PMZ)

English home page. The full documentation is in French: see [README.md](README.md).

## What it does

PMZ is a Claude Code plugin that keeps vibecoding sessions under control:

- **Context economy** - non-blocking alerts on real context usage, on the cost of the last turn
  and on the number of turns, with a prescription to start a fresh session before costs balloon.
- **Clean closing of work items** - reminds you to verify, update the changelog, commit and write
  a handoff; the handoff is injected automatically at the start of the next session.
- **Scoped backlog** - splits a big request into 2-5 user stories with a recommended model and
  an optional `verify` command replayed as proof of completion.
- **Careful project init** - proposes `CLAUDE.md` / `AGENTS.md` / `.vibe-agent/` / `CHANGELOG.md`
  only after you confirm, and never overwrites existing files.

Hooks are fail-open: an error, a timeout or invalid input never breaks a session.

## Requirements

- Claude Code
- Node.js >= 18, available in your `PATH` (the plugin scripts use the Node standard library only,
  no `npm install` needed)

## Install

```
claude plugin marketplace add shwrm-xx/pmz
claude plugin install pmz@pmz-marketplace
```

Then restart Claude Code.

## Update

```
claude plugin marketplace update pmz-marketplace && claude plugin update pmz@pmz-marketplace
```

Then restart Claude Code. Do not run `marketplace add` again to update: it is refused when the
declared source differs.

## Uninstall

```
claude plugin uninstall pmz@pmz-marketplace
claude plugin marketplace remove pmz-marketplace
```

## Commands

Commands are namespaced `/pmz:<name>`.

| Command | Description |
|---|---|
| `/pmz:about` | Show the Promptimizer version and the current epic / user story |
| `/pmz:archive` | Browse the archive of closed user stories |
| `/pmz:budget` | Session status, with absolute priority on saving context |
| `/pmz:check-context` | Audit the risks of needless re-reading |
| `/pmz:close-batch` | Close the current user story (verify + changelog + commit + handoff) |
| `/pmz:dashboard` | Generate the HTML dashboard of context savings |
| `/pmz:doctor` | Diagnose the installation (channel, version, hooks, scripts) |
| `/pmz:epicmaster` | Master session: run all open backlog stories as sub-agents |
| `/pmz:fresh-session` | Prepare a new session with minimal context (short handoff) |
| `/pmz:help` | List all Promptimizer commands |
| `/pmz:init` | Initialize the Promptimizer base in the project (after confirmation) |
| `/pmz:maquette` | Mock up screens before coding them |
| `/pmz:parallelize` | Compute a plan of parallel waves without launching anything |
| `/pmz:pickymaster` | Selective master session: pick the stories before launching |
| `/pmz:reintegrate` | Reintegrate a parallel wave as a pipeline (ordered merge + verify gate) |
| `/pmz:rtk` | Status and guided activation of the RTK command-optimizer bridge |
| `/pmz:scope` | Split a big request into 2-5 persisted user stories |
| `/pmz:statusline` | Set or remove the Promptimizer status line (opt-in) |

## Privacy

PMZ runs locally and sends nothing to any server. See [docs/PRIVACY.md](docs/PRIVACY.md) for details.

## License

MIT
