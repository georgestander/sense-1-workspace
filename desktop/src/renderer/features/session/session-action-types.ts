import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type {
  DesktopApprovalResponseRequest,
  DesktopBootstrap,
  DesktopBridge,
  DesktopOperatingMode,
  DesktopRunContext,
  DesktopUpdateState,
  DesktopWorkspaceHydrateResult,
  DesktopWorkspacePolicyRecord,
} from "../../../main/contracts";
import type { FolderOption, PendingApproval, SidebarState, ThreadRecord } from "../../state/session/session-types.js";

export type PendingPermissionState = {
  rootPath: string;
  displayName: string;
  originalRequest: { prompt: string; threadId?: string | null; cwd?: string | null; workspaceRoot?: string | null };
} | null;

type ThreadRecordSetter = Dispatch<SetStateAction<ThreadRecord[]>>;
type StringArraySetter = Dispatch<SetStateAction<string[]>>;
type FolderOptionsSetter = Dispatch<SetStateAction<FolderOption[]>>;

export type DesktopSessionActionDependencies = {
  applyBootstrap: (
    bootstrap: DesktopBootstrap,
    options?: {
      preferredThreadId?: string | null;
      restoreSelection?: boolean;
      pruneMissing?: boolean;
      replaceSessionState?: boolean;
      preserveSignedInShell?: boolean;
    },
  ) => void;
  fetchWorkspacePolicy: (rootPath: string) => Promise<DesktopWorkspacePolicyRecord | null>;
  flushPendingThreadDeltas: (threadId: string) => void;
  getActiveTurnIdsByThread: () => Record<string, string>;
  getIsSignedIn: () => boolean;
  getPendingPermission: () => PendingPermissionState;
  getProfileFieldValue: () => string;
  getRunContext: () => DesktopRunContext | null;
  getSelectedProfileId: () => string;
  getSelectedThreadId: () => string | null;
  getWorkspaceSidebarOrder: () => string[];
  hasRestoredInitialSelectionRef: MutableRefObject<boolean>;
  model: string;
  refreshBootstrap: (
    options?: {
      preferredThreadId?: string | null;
      pruneMissing?: boolean;
      restoreSelection?: boolean;
      preserveSignedInShell?: boolean;
    },
  ) => Promise<DesktopBootstrap | null>;
  rememberKnownThreadIds: (threadIds: Iterable<string>, options?: { replace?: boolean }) => void;
  requireDesktopBridge: () => DesktopBridge;
  reasoningEffort: string;
  removeThreadFromLocalState: (threadId: string) => Promise<void>;
  removeWorkspaceFromLocalState: (workspaceRoot: string) => Promise<void>;
  selectedThreadIdRef: MutableRefObject<string | null>;
  setActiveTurnIdsByThread: Dispatch<SetStateAction<Record<string, string>>>;
  setBootstrapError: (value: string | null) => void;
  setContinuePending: (value: boolean) => void;
  setLogoutPending: (value: boolean) => void;
  setPendingPermission: Dispatch<SetStateAction<PendingPermissionState>>;
  setPerThreadSidebar: Dispatch<SetStateAction<Record<string, SidebarState>>>;
  setProcessingApprovalIds: Dispatch<SetStateAction<number[]>>;
  setProfileFieldValue: Dispatch<SetStateAction<string>>;
  setRecentFolders: FolderOptionsSetter;
  setSelectedProfileId: Dispatch<SetStateAction<string>>;
  setSelectedThreadId: Dispatch<SetStateAction<string | null>>;
  setSignInPending: (value: boolean) => void;
  setTaskError: (value: string | null) => void;
  setTaskPending: (value: boolean) => void;
  setThreads: ThreadRecordSetter;
  setUpdateState: Dispatch<SetStateAction<DesktopUpdateState | null>>;
  setWorkspacePolicy: Dispatch<SetStateAction<DesktopWorkspacePolicyRecord | null>>;
  setWorkspaceHydrateSummary: Dispatch<
    SetStateAction<{
      rootPath: string;
      displayName: string;
      fileCount: number;
      keyFiles: string[];
      projectType: string;
      lastHydrated: string | null;
    } | null>
  >;
  setWorkspaceSidebarOrder: StringArraySetter;
};

export type DesktopSessionActionHandlers = {
  archiveThread: (threadId: string) => Promise<boolean>;
  archiveWorkspace: (workspaceId: string) => Promise<boolean>;
  cancelWorkspacePermission: () => void;
  checkForUpdates: () => Promise<void>;
  chooseDifferentFolder: () => Promise<FolderOption | null>;
  clearSelectedThread: () => Promise<void>;
  deleteThread: (threadId: string) => Promise<boolean>;
  deleteWorkspace: (workspaceId: string, options?: { workspaceRoot?: string | null }) => Promise<boolean>;
  grantWorkspacePermission: (mode: "once" | "always") => Promise<void>;
  handleContinueWithProfile: () => Promise<void>;
  handleLaunchSignIn: () => Promise<void>;
  handleLogout: () => Promise<void>;
  hydrateWorkspace: (rootPath: string) => Promise<DesktopWorkspaceHydrateResult | null>;
  installReadyUpdate: () => Promise<void>;
  interruptTurn: () => Promise<void>;
  openLatestRelease: () => Promise<void>;
  pickFiles: () => Promise<string[]>;
  rememberSelectedThread: (threadId: string | null) => Promise<void>;
  rememberWorkspaceSidebarOrder: (rootPaths: string[]) => Promise<boolean>;
  renameThread: (threadId: string, title: string) => Promise<boolean>;
  respondToApproval: (approval: PendingApproval, decision: DesktopApprovalResponseRequest["decision"]) => Promise<void>;
  respondToInputRequest: (requestId: number, text: string) => Promise<void>;
  restoreThread: (threadId: string) => Promise<boolean>;
  restoreWorkspace: (workspaceId: string) => Promise<boolean>;
  queueTurnInput: (input: string) => Promise<void>;
  runTask: (request: { prompt: string; threadId?: string | null; cwd?: string | null; workspaceRoot?: string | null; attachments?: string[] }) => Promise<void>;
  selectProfileForBootstrap: (profileId: string) => Promise<boolean>;
  selectThread: (threadId: string, options?: { workspaceRoot?: string | null }) => Promise<void>;
  setWorkspaceOperatingMode: (rootPath: string, mode: DesktopOperatingMode) => Promise<DesktopWorkspacePolicyRecord | null>;
  steerTurn: (input: string) => Promise<void>;
};
