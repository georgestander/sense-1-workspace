# Changelog

All notable changes to Sense-1 Workspace are recorded here.

## [Unreleased]

## [0.11.0] - 2026-04-17

### Added

- Appearance settings with light, dark, and system themes, applied before paint so Sense-1 avoids theme-flash on launch.
- Richer extension management with dedicated detail views, healthier activation state handling, and clearer runtime feedback when plugins or MCP entries go bad.
- Expanded file icons and a clearer right-rail Progress section with an item count badge and percent bar.

### Changed

- Rebuilt the visual token system around true light and near-black dark surfaces, including theme-aware shadow tokens and fully token-driven button and input primitives.
- Tightened the shell layout with more compact side rails, denser section cards, and cleaner thread chrome so more of the workspace stays visible at once.
- Hardened extension lifecycle handling so activation follows native runtime truth, invalid plugin MCP entries are quarantined instead of poisoning the backend, and management state stays recoverable across restarts.

### Fixed

- Guarded theme persistence against `localStorage` security errors so appearance setup fails safely in restricted environments.
- Reduced noisy connector and MCP failure states by validating transport and renderable URLs more carefully before surfacing extension actions in the UI.
- Kept Sense-1 auth handoff, seeded mentions, fallback app toggles, and extension reload behavior aligned with the desktop runtime contract.

## [0.10.0] - 2026-04-15

### Added

- In-app fast mode controls so desktop users can opt into the faster service tier without leaving Sense-1.
- Clickable file-path artifact cards in transcript code blocks, making workspace outputs easier to reopen from the conversation.

### Changed

- Redesigned the management experience with denser extension cards, search, icons, and clearer toggles across plugins, apps, skills, and automations.
- Kept creator shortcuts rooted in the selected workspace while still allowing profile-level installs, so new extensions created from a thread show up in management without a manual refresh.
- Replaced raw Codex-home wording in user-facing skill prompts with product language that points people to the Skills library and Skills page.

### Fixed

- Scoped trusted skill approvals to the approved command so desktop approvals stay safer and more predictable.
- Tightened workspace reconstruction to ignore stale artifact roots and preserve the correct workspace for live-thread actions.
- Fixed right-rail visibility and scrolling so home and thread layouts keep the side panels usable.

## [0.9.0] - 2026-04-14

### Added

- Signed-in ChatGPT realtime voice input for supported desktop composer threads, including live microphone session and transcript event handling.

### Changed

- Reworked voice recording into a compact inline composer control so recording status stays visible without taking over the draft area.
- Improved automatic thread titles from early conversation context so active work is easier to scan while manual renames stay authoritative.

### Fixed

- Replaced the unreliable packaged macOS dictation fallback with the desktop realtime voice path used by the signed-in workspace flow.
- Kept suggested thread-title updates synchronized with the live thread list after auto-rename events.
- Prevented invalid realtime voice cleanup requests from being emitted during session startup and teardown.

## [0.8.0] - 2026-04-14

### Added

- Durable workspace continuity for fresh threads and resumed sessions, so Sense-1 can rebuild prior workspace context from local session and substrate history when folder hydration is incomplete.

### Changed

- Re-centered the thread composer and aligned its width with the start surface for a more consistent launch and reply layout.
- Tightened sidebar density and removed redundant chrome around the composer so the active thread stays visually focused.

### Fixed

- Restored busy-thread composer routing after bootstrap recovery so send and queue actions stay on the correct live-thread paths while a run is still active.
- Fixed transcript auto-follow during streaming responses by anchoring scroll behavior to the live streaming overlay.
- Resolved composer overlap and transcript spacing issues so the fixed composer clears the transcript content cleanly.

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
