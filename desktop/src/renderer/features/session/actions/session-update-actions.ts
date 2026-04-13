import type { DesktopSessionActionDependencies, DesktopSessionActionHandlers } from "../session-action-types.js";

export function createSessionUpdateActions(
  deps: DesktopSessionActionDependencies,
): Pick<DesktopSessionActionHandlers, "checkForUpdates" | "installReadyUpdate" | "openLatestRelease"> {
  async function checkForUpdates() {
    try {
      const bridge = deps.requireDesktopBridge();
      const nextState = await bridge.updates.check();
      deps.setUpdateState(nextState);
    } catch {
      // Keep updater failures quiet in the main chrome.
    }
  }

  async function installReadyUpdate() {
    try {
      const bridge = deps.requireDesktopBridge();
      await bridge.updates.install();
    } catch {
      // The main process will publish any install failure back through updater state.
    }
  }

  async function openLatestRelease() {
    try {
      const bridge = deps.requireDesktopBridge();
      await bridge.updates.openLatestRelease();
    } catch {
      // Keep manual download fallback quiet if the bridge is unavailable.
    }
  }

  return {
    checkForUpdates,
    installReadyUpdate,
    openLatestRelease,
  };
}
