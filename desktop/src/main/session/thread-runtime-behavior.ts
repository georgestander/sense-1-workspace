import type { DesktopBootstrap, DesktopPermissionRequiredTaskRunResult, DesktopTaskRunResult } from "../../shared/contracts/index";

export function shouldRestoreQueuedFollowUp(result: DesktopTaskRunResult): result is DesktopPermissionRequiredTaskRunResult {
  return result.status === "permissionRequired";
}

export function resolveBootstrapVisibleThreadId(bootstrap: DesktopBootstrap): string | null {
  const threadId = bootstrap.selectedThread?.id;
  if (typeof threadId !== "string") {
    return null;
  }

  const trimmed = threadId.trim();
  return trimmed ? trimmed : null;
}
