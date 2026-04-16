# Extension Acceptance Matrix

This matrix tracks the expected end-to-end extension lifecycle in Sense-1 and
the current verification shape for each scenario.

The goal is to keep automated coverage focused on durable backend and state
contracts, then use one signed-in Electron smoke pass to validate the final
surface behavior against real ChatGPT/App Server integrations.

## Automated coverage legend

- `Covered` means the behavior is directly asserted in automated tests.
- `Partial` means the contract is covered indirectly, but the full user flow
  still needs manual confirmation.
- `Manual` means the scenario currently requires a signed-in Electron check.

## Scenario matrix

| Scenario | Expected result | Automated coverage | Manual verification |
| --- | --- | --- | --- |
| Plugin install discovery | Discoverable plugins appear as installable inventory without being treated as installed/plugin-owned until runtime confirms install. | Covered: `desktop/src/main/settings/desktop-extension-service.test.js` (`getOverview does not treat apps linked only to discoverable plugins as installed plugin-owned inventory`) | Confirm marketplace search/install in a signed-in session. |
| Installed plugin lifecycle | Installed plugins surface ownership, uninstall capability, bundled apps/skills/MCPs, and stable metadata from runtime plus local plugin files. | Covered: `desktop/src/main/settings/desktop-extension-service.test.js` (`getOverview preserves marketplace metadata and uses the profile codex home for plugin discovery`, `getOverview emits normalized managed extensions with ownership, auth, and composition metadata`) | Confirm install, disable, uninstall, and reopen behavior from the management UI. |
| Bundled skill visibility | Plugin-owned skills appear in `Skills`, keep plugin ownership, and remain manageable from the normalized inventory. | Covered: `desktop/src/main/settings/desktop-extension-service.test.js` (`getOverview emits normalized managed extensions with ownership, auth, and composition metadata`) | Confirm bundled skills render in the `Skills` tab and respond to UI actions. |
| Standalone profile skill lifecycle | Legacy or manually installed profile skills remain visible, openable, and uninstallable after contract migration. | Covered: `desktop/src/main/settings/desktop-extension-service.test.js` (`getOverview marks legacy profile-owned skills as uninstallable profile inventory`) | Confirm `Open`, `Disable`, and `Uninstall` from the skill detail modal. |
| Manually created profile plugin migration | Profile-local plugins created outside the marketplace remain visible as managed inventory and can be removed cleanly. | Covered: `desktop/src/main/settings/desktop-extension-service.test.js` (`getOverview marks manually created profile plugins as uninstallable profile inventory`) | Confirm a profile-owned plugin renders with the expected remove action. |
| Stale config cleanup | Ghost app/plugin references in `config.toml` do not create fake installed inventory when runtime no longer reports them. | Covered: `desktop/src/main/settings/desktop-extension-service.test.js` (`getOverview ignores stale plugin and app config references without creating ghost inventory`) | Confirm management counts stay stable after removing config-only references. |
| App connect/disconnect lifecycle | Installed apps show `required` vs `connected` auth state, support connect/disconnect actions, and update inventory state after auth changes. | Partial: app state normalization is covered by existing `desktop-extension-service` tests, but the real auth/connect flow still depends on signed-in Electron and ChatGPT/App Server. | Confirm `Connect`, `Disconnect`, and retry flows in a signed-in Sense-1 session. |
| MCP enablement persistence | Local MCP enable/disable state survives restart even when runtime `config/read` is temporarily stale. | Covered: `desktop/src/main/settings/desktop-extension-service.test.js` (`getOverview preserves local mcp enablement when runtime config is stale after restart`) | Toggle an MCP, restart the app, and confirm the state persists in the management page. |
| MCP auth/error recovery | Failed MCP auth surfaces as a recoverable error state with reconnect available. | Covered: `desktop/src/main/settings/desktop-extension-service.test.js` (`getOverview marks failed MCP auth as recoverable error state`) | Confirm `Connect`/`Reload` behavior against a real MCP requiring auth. |
| Creator-installed managed inventory | `skill-creator`, `skill-installer`, and `plugin-creator` end in managed profile inventory instead of leaving workspace-only drafts when the user requested installable output. | Partial: runtime routing and management refresh are covered by the `session-controller` and `management-inventory-change` suites from issues `#48` and `#32`. | Run each creator/install flow in a folder-bound thread and confirm the new item appears in the correct management tab without manual refresh. |
| Workspace draft exclusion | Workspace-local scaffolds do not appear as installed managed inventory until explicitly installed into the Sense-1 profile inventory. | Partial: inventory detection only tracks managed profile roots, not arbitrary workspace files. | Create a workspace-only draft skill/plugin and confirm it does not appear in management until installed. |
| Try in chat | `Try in chat` launches a thread with the correct managed inventory reference instead of a loose file attachment or broken shortcut. | Manual: frontend behavior depends on live thread/runtime wiring. | Confirm each entity type opens a thread with a working mention/shortcut. |
| Restart persistence | Counts, enablement, and ownership remain stable after full app restart for plugins, apps, skills, and MCPs. | Partial: backend merge rules are covered for stale config and MCP persistence, but the final signed-in restart pass remains manual. | Perform one signed-in restart smoke run after install/toggle/auth actions. |

## Known limits

- App payloads from the current runtime contract do not expose a trustworthy
  app-auth failure detail equivalent to MCP `authStatus = failed`. Sense-1 can
  reliably distinguish `required` versus `connected`, but a separate app
  `failed` state should not be inferred until upstream payloads expose it.
- Automated coverage here validates the backend merge rules and normalized
  inventory contract. It does not replace the final signed-in Electron smoke
  pass required for auth handoffs, external windows, and real ChatGPT/App
  Server integration behavior.
