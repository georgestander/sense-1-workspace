import type { Dispatch, SetStateAction } from "react";
import type { DesktopBootstrapTeamSetup, DesktopBootstrapTenant, DesktopExtensionOverviewResult, DesktopModelEntry, DesktopThreadSnapshot, ProjectedSessionRecord, ProjectedWorkspaceRecord, SubstrateSessionRecord, SubstrateWorkspaceRecord } from "../../main/contracts";
import type { ThreadRenameTarget } from "../features/threads/use-thread-shell.js";
import { type FolderOption } from "../state/session/session-types.js";
import { type WorkspaceSidebarGroup, type WorkspaceSidebarThreadSummary } from "../features/workspace/workspace-sidebar.js";
import { StartSurfaceCollectionsPanel, StartSurfaceLaunchPanel } from "./start-surface/StartSurfacePanels";

export type StartSurfaceProps = {
  accountEmail: string | null;
  tenant: DesktopBootstrapTenant | null;
  teamSetup: DesktopBootstrapTeamSetup;
  extensionOverview: Pick<DesktopExtensionOverviewResult, "apps" | "plugins" | "skills"> | null;
  draftPrompt: string;
  setDraftPrompt: (value: string) => void;
  workInFolder: boolean;
  setWorkInFolder: (value: boolean) => void;
  workspaceFolder: string | null;
  setWorkspaceFolder: (value: string | null) => void;
  folderMenuOpen: boolean;
  setFolderMenuOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  attachedFiles: string[];
  setAttachedFiles: Dispatch<SetStateAction<string[]>>;
  pickFiles: () => Promise<string[]>;
  selectedModel: string | null;
  handleModelSelection: (nextModel: string) => void;
  modelOptions: string[];
  availableModels: DesktopModelEntry[];
  submitDraftTask: () => void;
  activeWorkspaceProjection: ProjectedWorkspaceRecord | null;
  workspaceSessions: ProjectedSessionRecord[];
  workspaceSessionsLoading: boolean;
  archivedWorkspaces: SubstrateWorkspaceRecord[];
  archivedSessions: SubstrateSessionRecord[];
  navigateToWorkspaceFolder: (path: string) => void;
  pickRecentFolder: (path: string) => void;
  chooseDifferentFolder: () => void;
  workspaceMenuOpenId: string | null;
  setWorkspaceMenuOpenId: Dispatch<SetStateAction<string | null>>;
  handleArchiveWorkspace: (workspaceId: string, workspaceRoot: string) => Promise<void>;
  handleRestoreWorkspace: (workspaceId: string) => Promise<void>;
  handleDeleteWorkspace: (workspaceId: string, workspaceRoot: string) => Promise<void>;
  workspaceArchivePendingId: string | null;
  workspaceRestorePendingId: string | null;
  workspaceDeletePendingId: string | null;
  workspaceIdByRoot: Record<string, string>;
  resumeWorkspaceSession: (session: ProjectedSessionRecord, workspaceRoot: string | null) => Promise<void>;
  recentFolders: FolderOption[];
  threads: DesktopThreadSnapshot[];
  workspaceThreadGroups: {
    workspaces: WorkspaceSidebarGroup<WorkspaceSidebarThreadSummary>[];
    standalone: WorkspaceSidebarThreadSummary[];
    baseOrder: string[];
    displayOrder: string[];
  };
  threadArchivePendingId: string | null;
  threadMenuOpenId: string | null;
  setThreadMenuOpenId: Dispatch<SetStateAction<string | null>>;
  threadRenameId: string | null;
  threadRenameDraft: string;
  setThreadRenameDraft: (value: string) => void;
  handleArchiveThread: (threadId: string) => Promise<void>;
  handleRestoreThread: (threadId: string) => Promise<void>;
  handleDeleteThread: (threadId: string) => Promise<void>;
  threadDeletePendingId: string | null;
  threadRestorePendingId: string | null;
  openThreadRename: (thread: ThreadRenameTarget) => void;
  cancelThreadRename: () => void;
  submitThreadRename: (threadId: string) => Promise<void>;
  selectThread: (threadId: string) => void;
  pendingPermission: {
    rootPath: string;
    displayName: string;
    originalRequest: { prompt: string; threadId?: string | null; workspaceRoot?: string | null };
  } | null;
  grantWorkspacePermission: (mode: "once" | "always") => void;
  cancelWorkspacePermission: () => void;
  taskPending: boolean;
  taskError: string | null;
  refreshBootstrap: () => Promise<unknown>;
};

export function StartSurface(props: StartSurfaceProps) {
  const {
    accountEmail,
    tenant,
    teamSetup,
    extensionOverview,
    draftPrompt,
    setDraftPrompt,
    workInFolder,
    setWorkInFolder,
    workspaceFolder,
    setWorkspaceFolder,
    folderMenuOpen,
    setFolderMenuOpen,
    attachedFiles,
    setAttachedFiles,
    pickFiles,
    selectedModel,
    handleModelSelection,
    modelOptions,
    availableModels,
    submitDraftTask,
    activeWorkspaceProjection,
    workspaceSessions,
    workspaceSessionsLoading,
    archivedWorkspaces,
    archivedSessions,
    navigateToWorkspaceFolder,
    pickRecentFolder,
    chooseDifferentFolder,
    workspaceMenuOpenId,
    setWorkspaceMenuOpenId,
    handleArchiveWorkspace,
    handleRestoreWorkspace,
    handleDeleteWorkspace,
    workspaceArchivePendingId,
    workspaceRestorePendingId,
    workspaceDeletePendingId,
    workspaceIdByRoot,
    resumeWorkspaceSession,
    recentFolders,
    threads,
    workspaceThreadGroups,
    threadArchivePendingId,
    threadMenuOpenId,
    setThreadMenuOpenId,
    threadRenameId,
    threadRenameDraft,
    setThreadRenameDraft,
    handleArchiveThread,
    handleRestoreThread,
    handleDeleteThread,
    threadDeletePendingId,
    threadRestorePendingId,
    openThreadRename,
    cancelThreadRename,
    submitThreadRename,
    selectThread,
    pendingPermission,
    grantWorkspacePermission,
    cancelWorkspacePermission,
    taskPending,
    taskError,
    refreshBootstrap,
  } = props;

  return (
    <>
      <StartSurfaceLaunchPanel
        accountEmail={accountEmail}
        activeWorkspaceProjection={activeWorkspaceProjection}
        attachedFiles={attachedFiles}
        availableModels={availableModels}
        cancelWorkspacePermission={cancelWorkspacePermission}
        chooseDifferentFolder={chooseDifferentFolder}
        draftPrompt={draftPrompt}
        extensionOverview={extensionOverview}
        folderMenuOpen={folderMenuOpen}
        grantWorkspacePermission={grantWorkspacePermission}
        handleModelSelection={handleModelSelection}
        modelOptions={modelOptions}
        pendingPermission={pendingPermission}
        pickFiles={pickFiles}
        pickRecentFolder={pickRecentFolder}
        recentFolders={recentFolders}
        resumeWorkspaceSession={resumeWorkspaceSession}
        selectedModel={selectedModel}
        setAttachedFiles={setAttachedFiles}
        setDraftPrompt={setDraftPrompt}
        setFolderMenuOpen={setFolderMenuOpen}
        setWorkInFolder={setWorkInFolder}
        setWorkspaceFolder={setWorkspaceFolder}
        submitDraftTask={submitDraftTask}
        taskError={taskError}
        taskPending={taskPending}
        tenant={tenant}
        teamSetup={teamSetup}
        threads={threads}
        refreshBootstrap={refreshBootstrap}
        workspaceSessions={workspaceSessions}
        workspaceSessionsLoading={workspaceSessionsLoading}
        workspaceFolder={workspaceFolder}
        workInFolder={workInFolder}
      />
      <StartSurfaceCollectionsPanel
        archivedSessions={archivedSessions}
        archivedWorkspaces={archivedWorkspaces}
        handleArchiveThread={handleArchiveThread}
        handleArchiveWorkspace={handleArchiveWorkspace}
        handleDeleteThread={handleDeleteThread}
        handleDeleteWorkspace={handleDeleteWorkspace}
        handleRestoreThread={handleRestoreThread}
        handleRestoreWorkspace={handleRestoreWorkspace}
        navigateToWorkspaceFolder={navigateToWorkspaceFolder}
        cancelThreadRename={cancelThreadRename}
        openThreadRename={openThreadRename}
        selectThread={selectThread}
        setThreadMenuOpenId={setThreadMenuOpenId}
        setThreadRenameDraft={setThreadRenameDraft}
        setWorkspaceMenuOpenId={setWorkspaceMenuOpenId}
        submitThreadRename={submitThreadRename}
        threadArchivePendingId={threadArchivePendingId}
        threadDeletePendingId={threadDeletePendingId}
        threadMenuOpenId={threadMenuOpenId}
        threadRenameDraft={threadRenameDraft}
        threadRenameId={threadRenameId}
        threadRestorePendingId={threadRestorePendingId}
        threads={threads}
        workInFolder={workInFolder}
        workspaceFolder={workspaceFolder}
        workspaceIdByRoot={workspaceIdByRoot}
        workspaceMenuOpenId={workspaceMenuOpenId}
        workspaceRestorePendingId={workspaceRestorePendingId}
        workspaceArchivePendingId={workspaceArchivePendingId}
        workspaceDeletePendingId={workspaceDeletePendingId}
        workspaceThreadGroups={workspaceThreadGroups}
      />
    </>
  );
}
