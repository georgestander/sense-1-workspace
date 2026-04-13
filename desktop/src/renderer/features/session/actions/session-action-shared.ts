import type { DesktopSessionActionDependencies } from "../session-action-types.js";

export function createRememberSelectedThread(deps: Pick<
  DesktopSessionActionDependencies,
  "getIsSignedIn" | "hasRestoredInitialSelectionRef" | "requireDesktopBridge"
>) {
  return async function rememberSelectedThread(threadId: string | null) {
    if (!deps.hasRestoredInitialSelectionRef.current || !deps.getIsSignedIn()) {
      return;
    }

    try {
      const bridge = deps.requireDesktopBridge();
      await bridge.threads.rememberLastSelected({ threadId });
    } catch {
      // Leave selection visible even if persistence fails.
    }
  };
}
