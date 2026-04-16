# Extension Lifecycle Contract

This document defines the first normalized management contract for Sense-1 extensions. It is intentionally additive: the existing tab-specific records remain in `DesktopExtensionOverviewResult`, and the new normalized `managedExtensions` collection exists to stabilize downstream lifecycle, ownership, and management work.

For the executable verification surface that sits on top of this contract, see
`EXTENSION_ACCEPTANCE_MATRIX.md`.

## Why This Exists

Sense-1 already aggregates extension data from multiple app-server and profile-local sources in `desktop/src/main/settings/desktop-extension-service.ts`, but the current public contract is only a set of tab-specific inventory arrays:

- `plugins`
- `apps`
- `mcpServers`
- `skills`

That shape is enough for a flat inventory page, but not for a real extension lifecycle product. The normalized contract captures orthogonal state dimensions and explicit ownership so later issues can build backend lifecycle rules and frontend detail views on stable data.

## Upstream Inputs Observed Today

`DesktopExtensionService.getOverview()` currently merges the following upstream inputs:

- `config/read`
- `plugin/list`
- `app/list`
- `mcpServerStatus/list`
- `skills/list`
- `account/read`
- profile-local `config.toml` toggles
- plugin-local metadata from:
  - `.app.json`
  - `.mcp.json`
  - `skills/*/SKILL.md`

See:

- `desktop/src/main/settings/desktop-extension-service.ts`
- `desktop/src/shared/contracts/management.ts`

## Merge Rules

### Provider state

Provider state is derived from `account/read` plus `config/read`, with local environment detection for Gemini and Ollama. This remains unchanged by the normalized extension contract.

### Plugin records

Plugin records are sourced from `plugin/list`, then enriched with local plugin metadata:

1. Start with app-server marketplace/plugin summary fields.
2. Overlay enablement from config:
   - runtime config first
   - then profile-local `config.toml` toggles when runtime config is stale
3. Enrich installed state, `sourcePath`, `appIds`, plugin-owned skills, and plugin-owned MCP IDs from plugin-local files under the resolved plugin root.

### App records

App records are sourced from `app/list`, then backfilled with plugin linkage based on plugin metadata:

1. Start with app-server app summary fields.
2. Overlay enablement from config:
   - runtime config first
   - then profile-local `config.toml` toggles when runtime config is stale
3. Backfill plugin ownership hints from plugin metadata when the runtime app payload is incomplete.

### Skill records

Skill records are sourced from `skills/list`, then merged with plugin-local skill discovery:

1. Start with runtime skill records.
2. Add plugin-owned skills found under installed plugin `skills/*/SKILL.md`.
3. Preserve runtime skill data when a skill already exists in the runtime payload.

### MCP records

MCP records are sourced from `mcpServerStatus/list` plus config:

1. Use the union of configured MCP IDs and runtime status IDs.
2. Derive enablement from config.
3. Derive runtime state, auth state hints, and tools/resources counts from runtime status.
4. Backfill plugin ownership from plugin-local `.mcp.json` when available.

## Normalized Managed Extension Contract

The normalized contract adds `contractVersion: 1` and `managedExtensions` to `DesktopExtensionOverviewResult`.

Each managed extension record models orthogonal state dimensions separately:

- `installState`: `discoverable` or `installed`
- `enablementState`: `enabled` or `disabled`
- `authState`: `not-required`, `required`, `connected`, or `failed`
- `healthState`: `healthy`, `warning`, or `error`
- `ownership`: `built-in`, `profile-owned`, `plugin-owned`, or `marketplace-installed`

It also carries:

- `ownerPluginIds`
- bundled child IDs for plugin records
- `capabilities`
- `sourcePath`
- `marketplaceName`
- `marketplacePath`
- action capability hints:
  - `canOpen`
  - `canUninstall`
  - `canDisable`

## Current Intentional Limits

The first contract version is intentionally conservative.

1. `managedExtensions` is additive and does not replace the current tab arrays.
2. Action capability hints describe what the current backend can safely support; they are not a promise of final Codex parity yet.
3. App install/discovery semantics are still partly inferred because current `app/list` payloads do not cleanly distinguish every lifecycle state.
4. Plugin-owned MCP linkage depends on plugin-local `.mcp.json`; if a plugin does not provide that file, MCP ownership falls back to profile-owned.

These limits should be revisited in later lifecycle issues once `plugin/read`, richer auth flows, and full management detail surfaces are implemented.
