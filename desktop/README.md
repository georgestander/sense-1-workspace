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

Each packaging run now also writes:

- `desktop/release/INSTALL-macOS.md`
- `desktop/release/INSTALL-Windows.md`
- `desktop/release/ALPHA-README.md`
- `desktop/release/alpha-release-manifest.json`

Those files are intended to travel with the shared alpha artifacts so testers get the right manual-install guidance for each platform.

## Sentry releases and source maps

Desktop production bundles now emit source maps for main, preload, and renderer. Release packaging injects Sentry Debug IDs into the built JavaScript bundles, and packaged apps exclude raw `.map` files so source maps are available for upload without shipping them inside the installed app.

Set these environment variables before preparing or uploading a release:

```bash
export SENSE1_DESKTOP_BUILD_ID="alpha-mac-001"   # optional but recommended; becomes the Sentry dist
export SENTRY_AUTH_TOKEN="..."
export SENTRY_ORG="..."
export SENTRY_PROJECT="..."
```

Use this flow for a desktop build you intend to ship:

```bash
pnpm -C desktop sentry:sourcemaps:smoke
pnpm -C desktop sentry:sourcemaps:upload
pnpm -C desktop dist:mac   # or: pnpm -C desktop dist:win
```

Notes:

- `pnpm -C desktop sentry:sourcemaps:smoke` prepares release artifacts, injects Debug IDs, and locally verifies that main, preload, and renderer bundles resolve back to `src/...` files through `sentry-cli sourcemaps resolve`.
- `pnpm -C desktop sentry:sourcemaps:upload` prepares the same style of artifacts and uploads them to Sentry with release `sense-1-workspace@<desktop-version>` and optional `dist=$SENSE1_DESKTOP_BUILD_ID`.
- `pnpm -C desktop release:mac` now reuses a prepared release build, uploads source maps, and then publishes the packaged macOS release.
- Upload source maps before testers trigger production errors from that packaged build; Sentry only applies new artifacts to events captured after the upload.

After shipping, confirm the end-to-end result in Sentry by triggering a desktop event from that build, opening the event stack trace, and verifying frames resolve to readable `src/...` paths instead of minified `dist/...` bundle locations.

## Alpha install flow

Sense-1 desktop alpha builds install manually. The app does not deliver in-app auto-updates for this alpha, so testers should grab the newest packaged build from the shared download location and replace the existing install themselves.

### macOS

1. Run `pnpm -C desktop dist:mac` to generate the alpha artifacts for manual sharing.
2. Open the generated DMG from `desktop/release/`.
3. Drag `Sense-1 Workspace.app` into `Applications`.
4. When sending an updated alpha build, have testers replace the existing app in `Applications` with the newer one.

The release folder also includes `INSTALL-macOS.md`, which repeats these steps for testers.

If Gatekeeper blocks the app because the alpha is unsigned, open it via Finder with `Control`-click -> `Open`, or use `System Settings` -> `Privacy & Security` -> `Open Anyway` after the first launch attempt.

### Windows

1. Run `pnpm -C desktop dist:win` to generate the x64 NSIS installer in `desktop/release/`.
2. Share the generated `.exe` with testers through the alpha download location.
3. Testers install updates by running the newer installer again.

The release folder also includes `INSTALL-Windows.md`, which repeats these steps for testers.

If Windows SmartScreen warns that the installer is from an unrecognized app, use `More info` -> `Run anyway` only for trusted internal alpha builds.

## Packaging notes

- Electron-builder's Windows NSIS target is already configured in `desktop/package.json`.
- `dist:mac` validates that the release folder contains both `.dmg` and `.zip` artifacts for the packaged alpha build.
- `dist:win` validates that the release folder contains the packaged NSIS `.exe` installer.
- Electron-builder's multi-platform guidance says not to assume every host can build every target, so use a Windows-capable packaging machine or CI lane if local cross-build support is unavailable.

## Architecture

The desktop app uses a three-process Electron model:

- `src/main/` owns lifecycle, auth restore, runtime supervision, dialogs, secure storage, and IPC
- `src/preload/bridge/` exposes the typed renderer bridge
- `src/renderer/` owns the desktop user experience
- `src/shared/contracts/` defines stable cross-process types
