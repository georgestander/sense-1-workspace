# Contributing

Thanks for contributing to Sense-1 Workspace.

## Scope

This repository is for the standalone desktop workspace product. Contributions are welcome when they improve:

- desktop stability
- local workspace and file flows
- chat and session behavior
- automations
- plugin, skill, and app management
- approvals, operating modes, and behavior settings
- tests, CI, docs, and packaging quality

Changes that do not fit the product scope may be closed or redirected.

## Before you open a PR

Use an issue or an explicit roadmap item as the reason for the change.

Good fits:

- bug fixes
- behavior regressions
- test coverage improvements
- UX/UI polish inside the current product surface
- CI and developer-experience improvements

Discuss first before making large changes to:

- app architecture
- release/update behavior
- major UI rewrites
- new product surfaces

## Development

```bash
pnpm -C desktop install --frozen-lockfile
./scripts/install-git-hooks.sh
pnpm -C desktop typecheck
pnpm -C desktop test:perf:smoke
pnpm -C desktop test:unit
pnpm -C desktop build
pnpm -C desktop check:structure
node scripts/check-public-boundary.mjs
```

## Pull request rules

- open a PR instead of pushing directly to `main`
- keep changes focused and reviewable
- link the PR to an issue or roadmap item
- update tests when behavior changes
- make sure CI passes before requesting review

Local hooks are the first regression gate. After running `./scripts/install-git-hooks.sh`, every push will run the desktop renderer tests, a local renderer perf smoke, and a full desktop build before GitHub ever sees the branch.

CI passing is necessary, not sufficient. Maintainers may still reject PRs that do not fit the repo contract.

## What should not land here by accident

Do not add private or unrelated repo material such as:

- internal planning folders
- copied private product docs
- unrelated generated artifacts
- release workflows that require maintainer signing credentials

If you are unsure whether something belongs here, open an issue first.
