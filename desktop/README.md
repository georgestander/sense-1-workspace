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

Local packaging stays separate from release publishing.

```bash
pnpm -C desktop dist:mac
```

## Architecture

The desktop app uses a three-process Electron model:

- `src/main/` owns lifecycle, auth restore, runtime supervision, dialogs, secure storage, and IPC
- `src/preload/bridge/` exposes the typed renderer bridge
- `src/renderer/` owns the desktop user experience
- `src/shared/contracts/` defines stable cross-process types
