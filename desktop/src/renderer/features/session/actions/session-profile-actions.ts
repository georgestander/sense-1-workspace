import type { DesktopSessionActionDependencies, DesktopSessionActionHandlers } from "../session-action-types.js";
import { createRememberSelectedThread } from "./session-action-shared.ts";

export function createSessionProfileActions(
  deps: DesktopSessionActionDependencies,
): Pick<
  DesktopSessionActionHandlers,
  | "rememberSelectedThread"
  | "selectProfileForBootstrap"
  | "handleContinueWithProfile"
  | "handleStartAuthLogin"
  | "handleLogout"
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
    deps.setBootstrapError("Sense-1 now signs in directly from this screen.");
  }

  async function handleStartAuthLogin(
    request: Parameters<DesktopSessionActionHandlers["handleStartAuthLogin"]>[0],
  ) {
    const resolvedRequest = request.method === "apiKey"
      ? { ...request, apiKey: request.apiKey?.trim() ?? "" }
      : request;

    if (resolvedRequest.method === "apiKey" && !resolvedRequest.apiKey) {
      deps.setBootstrapError("Paste an OpenAI API key to continue.");
      return;
    }

    deps.setAuthPendingMethod(resolvedRequest.method);
    deps.setSignInPending(true);
    try {
      const bridge = deps.requireDesktopBridge();
      const result = await bridge.auth.startLogin(resolvedRequest);
      if (!result.success) {
        deps.setBootstrapError(
          result.reason || (
            resolvedRequest.method === "apiKey"
              ? "Could not sign in with an OpenAI API key."
              : "Could not start sign-in."
          ),
        );
        return;
      }
      if (result.completed) {
        await deps.refreshBootstrap({ restoreSelection: true });
        deps.setBootstrapError(null);
        return;
      }
      deps.setBootstrapError("Finish signing in in your browser. Sense-1 will continue automatically.");
    } catch (error) {
      deps.setBootstrapError(
        error instanceof Error
          ? error.message
          : (
            resolvedRequest.method === "apiKey"
              ? "Could not sign in with an OpenAI API key."
              : "Could not start sign-in."
          ),
      );
    } finally {
      deps.setSignInPending(false);
      deps.setAuthPendingMethod(null);
    }
  }

  async function handleLogout() {
    deps.setLogoutPending(true);
    try {
      const bridge = deps.requireDesktopBridge();
      const result = await bridge.auth.logout();
      if (!result.success) {
        deps.setTaskError(result.reason || "Could not sign out.");
        return;
      }

      await deps.refreshBootstrap({ preserveSignedInShell: false, restoreSelection: true });
      deps.setTaskError(null);
      deps.setBootstrapError(null);
    } catch (error) {
      deps.setTaskError(error instanceof Error ? error.message : "Could not sign out.");
    } finally {
      deps.setLogoutPending(false);
    }
  }

  return {
    handleContinueWithProfile,
    handleStartAuthLogin,
    handleLogout,
    rememberSelectedThread,
    selectProfileForBootstrap,
  };
}
