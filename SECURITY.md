# Security Policy

Promptimizer (PMZ) is a Claude Code plugin whose hooks run on every session start, prompt, tool
call and turn end. We take reports about it seriously. For exactly what the hooks read and
write, see [docs/PRIVACY.md](docs/PRIVACY.md).

## Supported versions

Only the latest minor release line receives security fixes (currently `2.12.x`). The version in
use is in `promptimizer/VERSION`. Older minors are not patched: update to the latest release.

| Version  | Supported |
|----------|-----------|
| 2.12.x   | yes       |
| < 2.12   | no        |

## Reporting a vulnerability

Please report privately through GitHub Security Advisories:

<https://github.com/shwrm-xx/pmz/security/advisories/new>

Do not open a public issue for a vulnerability. Include the PMZ version, your OS and Node.js
version, the hook or script involved, and steps to reproduce.

## What to expect

- Acknowledgement: we aim to reply within 7 days (indicative, not a contractual SLA).
- Assessment and fix timeline: shared in the advisory thread once the report is triaged.
- Disclosure: coordinated through the advisory, with credit to the reporter if wanted.

## Bug bounty

There is no bug bounty programme. Reports are appreciated and credited, but not paid.

## Scope

In scope: the hooks, libraries and install scripts under `promptimizer/`, and the plugin build
(`promptimizer/install/build-plugin.js`).

Out of scope: vulnerabilities in Claude Code itself, Node.js, git, or third-party tools PMZ can
call when you opt in (for example `rtk`).
