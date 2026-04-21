# Native macOS Desktop Smoke Runbook

Use this runbook when filling the `mac-chatgpt` and `mac-api-key` rows in the alpha verification matrix.

## Preconditions

- Latest branch-matched macOS alpha build exists.
- You have the build id being validated.
- The packaged app is available as `Sense-1 Workspace.app` or a DMG/ZIP containing it.
- You can sign in with both ChatGPT and an OpenAI API key.

## Install and launch

1. Install the packaged app from the DMG into `Applications`.
2. Launch the packaged app.
3. If Gatekeeper blocks the unsigned alpha, use `Control`-click -> `Open` or `Open Anyway`.
4. Confirm the app shell renders instead of a blank/dev-fallback state.

## Per-auth smoke

Run this once for ChatGPT and once for OpenAI API key:

1. Sign in with the target auth mode.
2. Confirm the home surface loads.
3. Create a thread.
4. Bind a folder.
5. Send a prompt.
6. Exercise composer actions:
   - send
   - stop
   - revise or steer
   - queue
7. Confirm model selection works if the runtime offers alternatives.
8. Open plugins, MCP, apps, and automations surfaces.
9. Verify bug reporting opens and submits its desktop flow cleanly.

## Evidence to capture

- Build id
- macOS version
- Auth mode used
- Path to the packaged app tested
- Short pass/fail note
- Screenshot or note for any blocker

Record the result back into `pnpm -C desktop verify:alpha -- --scenario ...`.
