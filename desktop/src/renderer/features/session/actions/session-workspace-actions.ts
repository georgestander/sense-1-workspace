import type { DesktopOperatingMode } from "../../../../main/contracts";
import type { DesktopSessionActionDependencies, DesktopSessionActionHandlers } from "../session-action-types.js";
import { folderDisplayName } from "../../../state/session/session-selectors.js";
import { upsertRecentFolderOptions } from "../../../state/threads/thread-summary-state.js";

export function createSessionWorkspaceActions(
  deps: DesktopSessionActionDependencies,
  runTask: (request: {
    prompt: string;
    threadId?: string | null;
    workspaceRoot?: string | null;
    attachments?: string[];
  }) => Promise<void>,
): Pick<
  DesktopSessionActionHandlers,
  | "grantWorkspacePermission"
  | "cancelWorkspacePermission"
  | "hydrateWorkspace"
  | "setWorkspaceOperatingMode"
  | "chooseDifferentFolder"
  | "rememberWorkspaceSidebarOrder"
  | "archiveWorkspace"
  | "restoreWorkspace"
  | "deleteWorkspace"
  | "pickFiles"
> {
  async function grantWorkspacePermission(mode: "once" | "always") {
    const pendingPermission = deps.getPendingPermission();
    if (!pendingPermission) {
      return;
    }
    const rootPath = pendingPermission.rootPath;
    const originalRequest = pendingPermission.originalRequest;
    try {
      const bridge = deps.requireDesktopBridge();
      await bridge.workspace.grantPermission({ rootPath, mode });
      deps.setPendingPermission(null);
      await deps.fetchWorkspacePolicy(rootPath);
      if (originalRequest.prompt.trim()) {
        await runTask(originalRequest);
      }
    } catch (error) {
      deps.setTaskError(error instanceof Error ? error.message : "Could not grant workspace permission.");
      deps.setPendingPermission(null);
    }
  }

  function cancelWorkspacePermission() {
    deps.setPendingPermission(null);
  }

  async function hydrateWorkspace(rootPath: string) {
    try {
      const bridge = deps.requireDesktopBridge();
      const result = await bridge.workspace.hydrate({ rootPath });
      deps.setWorkspaceHydrateSummary(result);
      await deps.fetchWorkspacePolicy(rootPath);
      return result;
    } catch {
      return null;
    }
  }

  async function setWorkspaceOperatingMode(rootPath: string, mode: DesktopOperatingMode) {
    try {
      const bridge = deps.requireDesktopBridge();
      const result = await bridge.workspace.setOperatingMode({ rootPath, mode });
      deps.setWorkspacePolicy(result.policy);
      return result.policy;
    } catch (error) {
      deps.setTaskError(error instanceof Error ? error.message : "Could not update the workspace operating mode.");
      return null;
    }
  }

  async function chooseDifferentFolder() {
    try {
      const bridge = deps.requireDesktopBridge();
      const result = await bridge.workspace.pickFolder();
      if (result.canceled) {
        return null;
      }

      const nextFolder = {
        path: result.path,
        name: folderDisplayName(result.path),
      };
      deps.setRecentFolders((current) => upsertRecentFolderOptions(current, nextFolder.path));
      return nextFolder;
    } catch {
      return null;
    }
  }

  async function rememberWorkspaceSidebarOrder(rootPaths: string[]): Promise<boolean> {
    const previousOrder = deps.getWorkspaceSidebarOrder();
    const nextOrder = Array.from(new Set(rootPaths.map((rootPath) => rootPath.trim()).filter(Boolean)));
    deps.setWorkspaceSidebarOrder(nextOrder);

    try {
      const bridge = deps.requireDesktopBridge();
      await bridge.workspace.rememberSidebarOrder({ rootPaths: nextOrder });
      return true;
    } catch (error) {
      deps.setWorkspaceSidebarOrder(previousOrder);
      deps.setTaskError(error instanceof Error ? error.message : "Could not save the workspace order.");
      return false;
    }
  }

  async function archiveWorkspace(workspaceId: string): Promise<boolean> {
    try {
      const bridge = deps.requireDesktopBridge();
      await bridge.workspace.archive({ workspaceId });
      await deps.refreshBootstrap({ restoreSelection: true });
      deps.setTaskError(null);
      return true;
    } catch (error) {
      deps.setTaskError(error instanceof Error ? error.message : "Could not archive this workspace.");
      return false;
    }
  }

  async function restoreWorkspace(workspaceId: string): Promise<boolean> {
    try {
      const bridge = deps.requireDesktopBridge();
      await bridge.workspace.restore({ workspaceId });
      await deps.refreshBootstrap({ restoreSelection: true });
      deps.setTaskError(null);
      return true;
    } catch (error) {
      deps.setTaskError(error instanceof Error ? error.message : "Could not restore this workspace.");
      return false;
    }
  }

  async function deleteWorkspace(
    workspaceId: string,
    options: { workspaceRoot?: string | null } = {},
  ): Promise<boolean> {
    try {
      const bridge = deps.requireDesktopBridge();
      await bridge.workspace.delete({ workspaceId });
      const workspaceRoot = typeof options.workspaceRoot === "string" ? options.workspaceRoot.trim() : "";
      if (workspaceRoot) {
        await deps.removeWorkspaceFromLocalState(workspaceRoot);
      }
      await deps.refreshBootstrap({ restoreSelection: true });
      deps.setTaskError(null);
      return true;
    } catch (error) {
      deps.setTaskError(error instanceof Error ? error.message : "Could not delete this workspace.");
      return false;
    }
  }

  async function pickFiles(): Promise<string[]> {
    try {
      const bridge = deps.requireDesktopBridge();
      const result = await bridge.workspace.pickFiles();
      return result.canceled ? [] : result.paths;
    } catch {
      return [];
    }
  }

  return {
    archiveWorkspace,
    cancelWorkspacePermission,
    chooseDifferentFolder,
    deleteWorkspace,
    grantWorkspacePermission,
    hydrateWorkspace,
    pickFiles,
    rememberWorkspaceSidebarOrder,
    restoreWorkspace,
    setWorkspaceOperatingMode,
  };
}
