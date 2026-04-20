# Sense-1 Workspace Desktop

Native Electron desktop app for local-first chat, file work, automations, and extensibility.

## Core behavior

- start a chat session quickly
- attach a local folder through the desktop shell
- keep workspace activity, recent threads, and session state stable across restarts
- expose approvals, operating modes, and behavior settings in the desktop app
- support automations plus plugin, skill, and app management

## Development

```bash
pnpm -C desktop dev
pnpm -C desktop dev:full
pnpm -C desktop typecheck
pnpm -C desktop test:unit
pnpm -C desktop check:structure
pnpm -C desktop build
```

## Packaging

Local alpha packaging stays separate from release publishing.

```bash
pnpm -C desktop dist:mac
pnpm -C desktop dist:win
```

Packaged artifacts land in `desktop/release/`.

## Alpha install flow

Sense-1 desktop alpha builds install manually. The app does not deliver in-app auto-updates for this alpha, so testers should grab the newest packaged build from the shared download location and replace the existing install themselves.

### macOS

1. Run `pnpm -C desktop dist:mac` to generate the signed-off alpha artifacts for manual sharing.
2. Open the generated DMG from `desktop/release/`.
3. Drag `Sense-1 Workspace.app` into `Applications`.
4. When sending an updated alpha build, have testers replace the existing app in `Applications` with the newer one.

If Gatekeeper blocks the app because the alpha is unsigned, open it via Finder with `Control`-click -> `Open`, or use `System Settings` -> `Privacy & Security` -> `Open Anyway` after the first launch attempt.

### Windows

1. Run `pnpm -C desktop dist:win` to generate the x64 NSIS installer in `desktop/release/`.
2. Share the generated `.exe` with testers through the alpha download location.
3. Testers install updates by running the newer installer again.

If Windows SmartScreen warns that the installer is from an unrecognized app, use `More info` -> `Run anyway` only for trusted internal alpha builds.

## Packaging notes

- Electron-builder's Windows NSIS target is already configured in `desktop/package.json`.
- Electron-builder's multi-platform guidance says not to assume every host can build every target, so use a Windows-capable packaging machine or CI lane if local cross-build support is unavailable.

## Architecture

The desktop app uses a three-process Electron model:

- `src/main/` owns lifecycle, auth restore, runtime supervision, dialogs, secure storage, and IPC
- `src/preload/bridge/` exposes the typed renderer bridge
- `src/renderer/` owns the desktop user experience
- `src/shared/contracts/` defines stable cross-process types
