import type { DesktopSessionActionDependencies, DesktopSessionActionHandlers } from "../session-action-types.js";

export function createSessionIdentityActions(
  deps: DesktopSessionActionDependencies,
): Pick<DesktopSessionActionHandlers, "handleCompleteDisplayName"> {
  async function handleCompleteDisplayName(displayName: string): Promise<void> {
    const trimmed = displayName.trim();
    if (!trimmed) {
      deps.setIdentityCompletionError("Enter a name before continuing.");
      return;
    }

    deps.setIdentityCompletionError(null);
    deps.setIdentityCompletionPending(true);
    try {
      const bridge = deps.requireDesktopBridge();
      const result = await bridge.profile.completeDisplayName({ displayName: trimmed });
      if (!result.success) {
        deps.setIdentityCompletionError(result.reason || "Could not save your name.");
        return;
      }
      await deps.refreshBootstrap({ restoreSelection: true });
    } catch (error) {
      deps.setIdentityCompletionError(
        error instanceof Error ? error.message : "Could not save your name.",
      );
    } finally {
      deps.setIdentityCompletionPending(false);
    }
  }

  return { handleCompleteDisplayName };
}
