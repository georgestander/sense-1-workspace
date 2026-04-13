import type { DesktopSessionActionDependencies, DesktopSessionActionHandlers } from "../session-action-types.js";
import { createRememberSelectedThread } from "./session-action-shared.ts";

export function createSessionProfileActions(
  deps: DesktopSessionActionDependencies,
): Pick<
  DesktopSessionActionHandlers,
  "rememberSelectedThread" | "selectProfileForBootstrap" | "handleContinueWithProfile" | "handleLaunchSignIn" | "handleLogout"
> {
  const rememberSelectedThread = createRememberSelectedThread(deps);

  async function selectProfileForBootstrap(profileId: string): Promise<boolean> {
    try {
      const bridge = deps.requireDesktopBridge();
      const result = await bridge.profiles.select(profileId);
      if (!result.success) {
        deps.setBootstrapError(result.reason);
        return false;
      }

      deps.setSelectedProfileId(profileId);
      deps.setProfileFieldValue(profileId);
      deps.hasRestoredInitialSelectionRef.current = false;
      deps.applyBootstrap(result.bootstrap, {
        restoreSelection: true,
        replaceSessionState: true,
      });
      deps.setBootstrapError(null);
      return true;
    } catch (error) {
      deps.setBootstrapError(error instanceof Error ? error.message : "Could not select desktop profile.");
      return false;
    }
  }

  async function handleContinueWithProfile() {
    deps.setBootstrapError("Sense-1 now signs in directly with ChatGPT.");
  }

  async function handleLaunchSignIn() {
    deps.setSignInPending(true);
    try {
      const bridge = deps.requireDesktopBridge();
      const result = await bridge.auth.launchChatgptSignIn();
      if (!result.success) {
        deps.setBootstrapError(result.reason || "Could not start ChatGPT sign-in.");
        return;
      }
      if (result.completed) {
        await deps.refreshBootstrap({ restoreSelection: true });
        return;
      }
      deps.setBootstrapError("Finish signing in in your browser. Sense-1 will continue automatically.");
    } catch (error) {
      deps.setBootstrapError(error instanceof Error ? error.message : "Could not start ChatGPT sign-in.");
    } finally {
      deps.setSignInPending(false);
    }
  }

  async function handleLogout() {
    deps.setLogoutPending(true);
    try {
      const bridge = deps.requireDesktopBridge();
      const result = await bridge.auth.logoutChatgpt();
      if (!result.success) {
        deps.setTaskError(result.reason || "Could not sign out from ChatGPT.");
        return;
      }

      await deps.refreshBootstrap({ preserveSignedInShell: false, restoreSelection: true });
      deps.setTaskError(null);
    } catch (error) {
      deps.setTaskError(error instanceof Error ? error.message : "Could not sign out from ChatGPT.");
    } finally {
      deps.setLogoutPending(false);
    }
  }

  return {
    handleContinueWithProfile,
    handleLaunchSignIn,
    handleLogout,
    rememberSelectedThread,
    selectProfileForBootstrap,
  };
}
