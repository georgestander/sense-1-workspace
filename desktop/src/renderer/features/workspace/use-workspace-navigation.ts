import { useEffect, type Dispatch, type SetStateAction } from "react";

import type { DesktopThreadSnapshot, ProjectedSessionRecord, ProjectedWorkspaceRecord } from "../../../main/contracts";
import type { FolderOption } from "../../state/session/session-types.js";

type UseWorkspaceNavigationArgs = {
  chooseDifferentFolderFromSession: () => Promise<FolderOption | null>;
  clearSelectedThread: () => Promise<void>;
  isSignedIn: boolean;
  projectedWorkspaces: ProjectedWorkspaceRecord[];
  requestWorkspacePermission: (rootPath: string, displayName: string) => void;
  selectThread: (threadId: string, options?: { workspaceRoot?: string | null }) => Promise<void>;
  setAttachedFiles: Dispatch<SetStateAction<string[]>>;
  setDraftPrompt: (value: string) => void;
  setFolderMenuOpen: Dispatch<SetStateAction<boolean>>;
  setTaskError: (value: string | null) => void;
  setWorkInFolder: Dispatch<SetStateAction<boolean>>;
  setWorkspaceFolder: Dispatch<SetStateAction<string | null>>;
  threads: DesktopThreadSnapshot[];
  workInFolder: boolean;
};

type UseWorkspaceNavigationResult = {
  chooseDifferentFolder: () => Promise<void>;
  navigateToWorkspaceFolder: (path: string) => void;
  onNewThreadInWorkspace: (root: string) => void;
  pickRecentFolder: (path: string) => void;
  resetWorkspaceShell: () => void;
  resumeWorkspaceSession: (session: ProjectedSessionRecord, workspaceRoot: string | null) => Promise<void>;
};

export function useWorkspaceNavigation({
  chooseDifferentFolderFromSession,
  clearSelectedThread,
  isSignedIn,
  projectedWorkspaces,
  requestWorkspacePermission,
  selectThread,
  setAttachedFiles,
  setDraftPrompt,
  setFolderMenuOpen,
  setTaskError,
  setWorkInFolder,
  setWorkspaceFolder,
  threads,
  workInFolder,
}: UseWorkspaceNavigationArgs): UseWorkspaceNavigationResult {
  useEffect(() => {
    if (!workInFolder) {
      setFolderMenuOpen(false);
      setWorkspaceFolder(null);
    }
  }, [setFolderMenuOpen, setWorkspaceFolder, workInFolder]);

  useEffect(() => {
    if (isSignedIn) {
      return;
    }
    setWorkInFolder(false);
    setWorkspaceFolder(null);
    setFolderMenuOpen(false);
  }, [isSignedIn, setFolderMenuOpen, setWorkInFolder, setWorkspaceFolder]);

  async function resumeWorkspaceSession(session: ProjectedSessionRecord, workspaceRoot: string | null) {
    const threadId = session.codex_thread_id?.trim();
    if (!threadId) {
      return;
    }

    const resumeRoot =
      workspaceRoot?.trim()
      || (typeof session.metadata?.workspaceRoot === "string" ? session.metadata.workspaceRoot : null)
      || null;
    setWorkInFolder(Boolean(resumeRoot));
    setWorkspaceFolder(resumeRoot);
    setFolderMenuOpen(false);
    setDraftPrompt("");
    setAttachedFiles([]);
    setTaskError(null);
    await selectThread(threadId, { workspaceRoot: resumeRoot });
  }

  function requestWorkspacePermissionForPath(path: string) {
    const displayName = path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
    requestWorkspacePermission(path, displayName);
  }

  function resolveWorkspacePolicy(path: string, onGranted: () => void) {
    void (async () => {
      try {
        const bridge = window.sense1Desktop;
        if (bridge?.workspace?.getPolicy) {
          const result = await bridge.workspace.getPolicy({ rootPath: path });
          if (result?.policy && !result.policy.read_granted) {
            requestWorkspacePermissionForPath(path);
            return;
          }
        }
      } catch (error) {
        console.warn("[sense1:workspace-policy] Failed to load workspace policy", path, error);
        requestWorkspacePermissionForPath(path);
        return;
      }
      onGranted();
    })();
  }

  function navigateToWorkspaceFolder(path: string) {
    setWorkInFolder(true);
    setWorkspaceFolder(path);
    setFolderMenuOpen(false);

    resolveWorkspacePolicy(path, () => {
      const matching = projectedWorkspaces.find((workspace) => workspace.root_path === path);
      if (matching?.last_thread_id) {
        void selectThread(matching.last_thread_id);
        return;
      }
      const workspaceThread = threads.find((thread) => thread.workspaceRoot === path);
      if (workspaceThread) {
        void selectThread(workspaceThread.id);
        return;
      }
      void clearSelectedThread();
    });
  }

  function pickRecentFolder(path: string) {
    navigateToWorkspaceFolder(path);
  }

  async function chooseDifferentFolder() {
    const nextFolder = await chooseDifferentFolderFromSession();
    if (nextFolder) {
      navigateToWorkspaceFolder(nextFolder.path);
      return;
    }
    setFolderMenuOpen(false);
  }

  function onNewThreadInWorkspace(root: string) {
    setWorkInFolder(true);
    setWorkspaceFolder(root);
    setFolderMenuOpen(false);
    setDraftPrompt("");
    setTaskError(null);
    resolveWorkspacePolicy(root, () => {
      void clearSelectedThread();
    });
  }

  function resetWorkspaceShell() {
    setWorkInFolder(false);
    setWorkspaceFolder(null);
    setFolderMenuOpen(false);
  }

  return {
    chooseDifferentFolder,
    navigateToWorkspaceFolder,
    onNewThreadInWorkspace,
    pickRecentFolder,
    resetWorkspaceShell,
    resumeWorkspaceSession,
  };
}
