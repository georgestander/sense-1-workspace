# Changelog

All notable changes to Sense-1 Workspace are recorded here.

## [0.7.1] - 2026-04-13

### Fixed

- Restored live-thread responsiveness by reducing stream churn across the main
  process and renderer hot paths.
- Kept streaming transcripts lighter while responses are still arriving so long
  outputs no longer re-render the full rich transcript on every chunk.
- Tightened sidebar and right-rail updates so active sessions stay responsive
  without losing tracked lifecycle and workspace state.

### Changed

- Simplified the composer by removing the redundant operating mode toggle.
- Removed the repeated workspace name above the composer so the input area stays
  focused on the current thread.

## [0.7.0] - 2026-04-13

### Added

- Initial standalone public release of Sense-1 Workspace.
- Native desktop workspace shell.
- Local folder work and persistent chat sessions.
- Team and tenant support.
- Automations.
- Plugin, skill, and app management.
- Approval, mode, and behavior settings.

### Notes

- macOS arm64 DMG and ZIP builds were published with GitHub-updater metadata.
- The macOS build was ad-hoc signed and not notarized.
