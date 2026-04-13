/**
 * @typedef {import("../main/contracts").DesktopUpdateState} DesktopUpdateState
 */

/**
 * @param {DesktopUpdateState | null | undefined} updateState
 */
export function shouldShowHeaderUpdateAction(updateState) {
  return updateState?.phase === "readyToInstall";
}

/**
 * @param {DesktopUpdateState | null | undefined} updateState
 */
export function resolveSettingsUpdateSummary(updateState) {
  if (!updateState) {
    return {
      title: "Checking is unavailable right now.",
      detail: "Sense-1 Workspace will check for updates automatically when the desktop bridge is ready.",
      isError: false,
    };
  }

  switch (updateState.phase) {
    case "unsupported":
      return {
        title: "In-app updates are unavailable in this build.",
        detail: updateState.message ?? "Use “Download latest release” below to install a newer packaged build manually.",
        isError: false,
      };
    case "idle":
      return {
        title: "Automatic updates are enabled.",
        detail: "Sense-1 Workspace checks for stable GitHub releases when it launches.",
        isError: false,
      };
    case "checking":
      return {
        title: "Checking for updates…",
        detail: "Looking for the latest stable Sense-1 Workspace release on GitHub.",
        isError: false,
      };
    case "available":
    case "downloading":
      return {
        title: updateState.availableVersion
          ? `Downloading v${updateState.availableVersion}…`
          : "Downloading the latest release…",
        detail:
          typeof updateState.progressPercent === "number"
            ? `${updateState.progressPercent}% downloaded in the background.`
            : "Sense-1 Workspace is downloading the latest stable release in the background.",
        isError: false,
      };
    case "downloadedWaitingForIdle":
      return {
        title: updateState.downloadedVersion
          ? `v${updateState.downloadedVersion} is ready.`
          : "Update is ready.",
        detail: "Sense-1 Workspace will wait for active work to finish before it restarts to install.",
        isError: false,
      };
    case "readyToInstall":
      return {
        title: updateState.downloadedVersion
          ? `v${updateState.downloadedVersion} is ready to install.`
          : "Update ready to install.",
        detail: "Use the blue Update button in the top-left when you're ready to restart.",
        isError: false,
      };
    case "installing":
      return {
        title: updateState.downloadedVersion
          ? `Installing v${updateState.downloadedVersion}…`
          : "Installing update…",
        detail: "Sense-1 Workspace is restarting into the latest release.",
        isError: false,
      };
    case "upToDate":
      return {
        title: "You're up to date.",
        detail: "No newer stable Sense-1 Workspace release is available right now.",
        isError: false,
      };
    case "error":
      return {
        title: "Update failed.",
        detail: updateState.message
          ? `Try “Check for updates” again, or use “Download latest release.” ${updateState.message}`
          : "Try “Check for updates” again, or use “Download latest release” from Settings.",
        isError: true,
      };
    default:
      return {
        title: "Updates are available.",
        detail: "Sense-1 Workspace will keep checking for the latest stable release.",
        isError: false,
      };
  }
}
