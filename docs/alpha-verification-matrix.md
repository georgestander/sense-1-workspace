# Alpha Verification Matrix

The alpha release gate stays blocked until every required automated check and every required packaged manual scenario passes.

Use the gate command from the repo root:

```bash
pnpm -C desktop verify:alpha -- --desktop-build-id alpha-001
```

That command writes `desktop/release/alpha-verification/alpha-verification-matrix.json` plus a human-readable `README.md` summary. It exits non-zero until the full matrix is green, which is the intended "tester invites stay blocked" behavior.

## Automated proof

The gate runs these repo-local checks:

- `pnpm -C desktop typecheck`
- `pnpm -C desktop build`
- `node --test desktop/src/main/auth/desktop-auth.test.js`
- `node --test desktop/src/main/bootstrap/bootstrap-identity.test.js`
- `node --test desktop/src/main/settings/desktop-extension-service.test.js`
- `node --test desktop/src/main/session/api-key-credits-notification.test.js`
- `node --test desktop/src/main/bug-reporting/redaction.test.js`
- `node --test desktop/src/main/bug-reporting/crash-class-detector.test.js desktop/src/main/bug-reporting/crash-recovery-tracker.test.js desktop/src/main/bug-reporting/crash-report-suggestion-store.test.js`
- `node --test desktop/src/renderer/features/updates/update-presentation.test.js`

These checks cover the targeted issue areas called out in the alpha acceptance criteria:

- auth
- identity fallback
- provider rendering
- quota notification detection/copy
- diagnostics redaction
- crash suggestion timing
- update-copy changes

## Manual packaged scenarios

Each of these scenarios must pass before invites are unblocked:

- `mac-chatgpt`
- `mac-api-key`
- `windows-chatgpt`
- `windows-api-key`

Every manual scenario must cover:

- packaged install and launch
- home surface
- thread creation
- folder binding
- composer actions: send / stop / revise / queue
- model selection
- plugins / MCP / apps / automations
- bug reporting

## Recording manual proof

Rerun the gate command with scenario overrides as proof arrives.

Example:

```bash
pnpm -C desktop verify:alpha -- \
  --desktop-build-id alpha-001 \
  --mac-app-path desktop/release/Sense-1\\ Workspace.app \
  --win-installer-path desktop/release/Sense-1\\ Workspace-0.11.1-x64.exe \
  --scenario mac-chatgpt=pass \
  --scenario-note mac-chatgpt="Manual packaged smoke passed on macOS 14.5." \
  --scenario-evidence mac-chatgpt=desktop/release/evidence/mac-chatgpt.md
```

Supported scenario statuses:

- `pass`
- `failed`
- `blocked`
- `pending`

`pending` and `blocked` keep tester invites blocked. `failed` marks the gate failed. Only all-`pass` manual scenarios plus passing automated checks unblock invites.

## Platform runbooks

- [Native macOS desktop smoke runbook](/Users/georgestander/dev/tools/sense-1-workspace/docs/native-macos-desktop-smoke-runbook.md)
- [Native Windows desktop smoke runbook](/Users/georgestander/dev/tools/sense-1-workspace/docs/native-windows-desktop-smoke-runbook.md)
