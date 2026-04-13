import type { DesktopRunContext, DesktopTaskRunResult } from "../contracts";

export function createPermissionRequiredResult({
  runContext,
  workspaceRoot,
}: {
  runContext: DesktopRunContext | null;
  workspaceRoot: string;
}): DesktopTaskRunResult {
  return {
    status: "permissionRequired",
    cwd: workspaceRoot,
    workspaceRoot,
    runContext,
    permissionRequest: {
      displayName: workspaceRoot.split(/[\\/]/).filter(Boolean).at(-1) ?? workspaceRoot,
      rootPath: workspaceRoot,
    },
    thread: null,
    threadId: null,
    turnId: null,
  };
}
