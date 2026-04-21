/**
 * @typedef {import("../main/contracts").DesktopUpdateState} DesktopUpdateState
 */

/**
 * @param {DesktopUpdateState | null | undefined} updateState
 */
export function shouldShowHeaderUpdateAction(updateState) {
  void updateState;
  return false;
}

/**
 * @param {DesktopUpdateState | null | undefined} updateState
 */
export function resolveSettingsUpdateSummary(updateState) {
  if (!updateState) {
    return {
      title: "Manual alpha installs only.",
      detail: "Open the alpha downloads below once the desktop bridge is ready. Sense-1 will not update itself inside the app during this alpha.",
      isError: false,
    };
  }

  switch (updateState.phase) {
    case "unsupported":
      return {
        title: "Manual alpha installs only.",
        detail: updateState.message ?? "Open the alpha downloads below and install the matching macOS or Windows build manually.",
        isError: false,
      };
    case "idle":
    case "checking":
    case "available":
    case "downloading":
    case "downloadedWaitingForIdle":
    case "readyToInstall":
    case "installing":
      return {
        title: "Install alpha builds manually.",
        detail: "Use Open alpha downloads below, then replace your current app with the latest macOS build or Windows installer. Sense-1 will not download or restart into updates for this alpha.",
        isError: false,
      };
    case "upToDate":
      return {
        title: "Manual alpha installs only.",
        detail: "Sense-1 will not auto-update during this alpha. Open alpha downloads below whenever you need a newer macOS or Windows build.",
        isError: false,
      };
    case "error":
      return {
        title: "Couldn't refresh alpha release status.",
        detail: updateState.message
          ? `Open alpha downloads below and install the latest build manually. ${updateState.message}`
          : "Open alpha downloads below and install the latest build manually.",
        isError: true,
      };
    default:
      return {
        title: "Manual alpha installs only.",
        detail: "Open alpha downloads below and install the latest macOS or Windows build manually.",
        isError: false,
      };
  }
}
