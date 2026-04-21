# Native Windows Desktop Smoke Runbook

Use this runbook when filling the `windows-chatgpt` and `windows-api-key` rows in the alpha verification matrix.

## Preconditions

- Latest branch-matched Windows alpha installer exists.
- You have the build id being validated.
- The packaged installer is available as the NSIS `.exe`.
- You can sign in with both ChatGPT and an OpenAI API key.

## Install and launch

1. Run the packaged NSIS installer.
2. If SmartScreen blocks the unsigned alpha, use `More info` -> `Run anyway` for trusted internal builds.
3. Launch the installed app.
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
- Windows version
- Auth mode used
- Path to the installer tested
- Short pass/fail note
- Screenshot or note for any blocker

Record the result back into `pnpm -C desktop verify:alpha -- --scenario ...`.
