#!/bin/sh
set -eu

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

chmod +x "$repo_root/.githooks/pre-commit" "$repo_root/.githooks/pre-push"
git -C "$repo_root" config core.hooksPath .githooks

printf '%s\n' "Installed repo-local git hooks from .githooks/"
printf '%s\n' "pre-commit: pnpm -C desktop check:pre-commit"
printf '%s\n' "pre-push:   pnpm -C desktop check:pre-push"
