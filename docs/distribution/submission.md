# Kit de soumission — répertoire de plugins

Soumission faite à la main par le mainteneur. Blocs prêts à coller.

- **Name** : Promptimizer (`pmz`)
- **Category** : `workflow`
- **Repository** : https://github.com/shwrm-xx/pmz
- **License** : MIT
- **Keywords** : session, context, tokens, handoff, governance, vibecoding

## Short description (EN)

Claude Code plugin that keeps vibecoding sessions lean: alerts on context cost, enforces clean story closing, and injects handoffs between sessions. Local only, fail-open hooks.

## Long description (EN)

Promptimizer (PMZ) governs Claude Code vibecoding sessions. It warns, without blocking, about
context usage, the cost of the last turn and the number of turns, and prescribes a fresh session
before costs balloon. It reminds you to verify, update the changelog, commit and write a handoff,
which is injected automatically at the start of the next session. A big request can be split into
2-5 user stories, each with a recommended model and an optional verify command. Project init only
creates files after confirmation and never overwrites existing ones. Everything runs locally, uses
the Node standard library only (Node >= 18 in the PATH) and hooks are fail-open.

## Install command

```
claude plugin marketplace add shwrm-xx/pmz
claude plugin install pmz@pmz-marketplace
```

## Checklist avant soumission

- [ ] Dépôt GitHub public et branche `plugin-release` publiée (`publish-plugin.js --push`)
- [ ] Badge CI vert (workflow `ci.yml` présent et passant)
- [ ] `node test/run-tests.js` vert
- [ ] `description` identique dans `plugin.json` et `marketplace.json`, en anglais
- [ ] `README.en.md` à jour (install, mise à jour, désinstallation)
- [ ] `docs/PRIVACY.md` présent (US#166)
- [ ] Installation testée sur un poste propre : `marketplace add` puis `install`
- [ ] `/pmz:doctor` vert après installation
- [ ] Aucun secret dans le dépôt
