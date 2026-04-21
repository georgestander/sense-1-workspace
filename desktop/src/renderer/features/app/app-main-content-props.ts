import type { Dispatch, RefObject, SetStateAction } from "react";

import type { useDesktopSessionState } from "../../use-desktop-session-state.js";
import type { StartSurfaceProps } from "../../components/StartSurface";
import type { ThreadViewProps } from "../../components/ThreadView";
import { perfCount, perfMeasure } from "../../lib/perf-debug.ts";
import { REASONING_LABELS } from "../settings/use-app-model-settings.js";

type SessionState = ReturnType<typeof useDesktopSessionState>;

type BuildThreadViewPropsArgs = {
  sessionState: SessionState;
  extensionOverview: ThreadViewProps["extensionOverview"];
  ui: {
    setReasoning: Dispatch<SetStateAction<string>>;
  };
  reportBug: {
    onReportBug: () => void;
  };
  composer: Pick<
    ThreadViewProps,
    | "clarificationAnswer"
    | "setClarificationAnswer"
    | "clarificationPending"
    | "setClarificationPending"
    | "selectedChipIndex"
    | "setSelectedChipIndex"
    | "inputResponseText"
    | "setInputResponseText"
    | "inputResponsePending"
    | "threadPromptOverride"
    | "attachedFiles"
    | "setAttachedFiles"
    | "structuredQuestions"
    | "queueSelectedThreadPrompt"
    | "submitSelectedThreadPrompt"
  >;
  modelState: Pick<
    ThreadViewProps,
    | "selectedModel"
    | "selectedReasoning"
    | "selectedServiceTier"
    | "modelOptions"
    | "reasoningOptions"
    | "handleModelSelection"
    | "handleServiceTierSelection"
  >;
  rightRail: Pick<
    ThreadViewProps,
    | "threadInteractionState"
    | "structuredQuestions"
    | "hasStructuredQuestions"
    | "isClarifying"
    | "rightRailChangeGroups"
    | "configNotices"
    | "footerStatusText"
    | "effectiveThreadBusy"
  >;
  transcript: Pick<ThreadViewProps, "transcriptContainerRef" | "transcriptEndRef">;
};

type BuildStartSurfacePropsArgs = {
  sessionState: SessionState;
  extensionOverview: StartSurfaceProps["extensionOverview"];
  ui: Pick<
    StartSurfaceProps,
    | "workInFolder"
    | "setWorkInFolder"
    | "workspaceFolder"
    | "setWorkspaceFolder"
    | "folderMenuOpen"
    | "setFolderMenuOpen"
  >;
  composer: Pick<
    StartSurfaceProps,
    | "draftPrompt"
    | "setDraftPrompt"
    | "attachedFiles"
    | "setAttachedFiles"
    | "pickFiles"
    | "submitDraftTask"
  >;
  modelState: Pick<
    StartSurfaceProps,
    | "selectedModel"
    | "selectedServiceTier"
    | "handleModelSelection"
    | "handleServiceTierSelection"
    | "modelOptions"
  >;
  workspace: Pick<
    StartSurfaceProps,
    | "activeWorkspaceProjection"
    | "workspaceSessions"
    | "workspaceSessionsLoading"
    | "archivedWorkspaces"
    | "archivedSessions"
    | "navigateToWorkspaceFolder"
    | "pickRecentFolder"
    | "chooseDifferentFolder"
    | "workspaceMenuOpenId"
    | "setWorkspaceMenuOpenId"
    | "handleArchiveWorkspace"
    | "handleRestoreWorkspace"
    | "handleDeleteWorkspace"
    | "workspaceArchivePendingId"
    | "workspaceRestorePendingId"
    | "workspaceDeletePendingId"
    | "workspaceIdByRoot"
    | "resumeWorkspaceSession"
    | "workspaceThreadGroups"
  >;
  threadShell: Pick<
    StartSurfaceProps,
    | "threadArchivePendingId"
    | "threadMenuOpenId"
    | "setThreadMenuOpenId"
    | "threadRenameId"
    | "threadRenameDraft"
    | "setThreadRenameDraft"
    | "handleArchiveThread"
    | "handleRestoreThread"
    | "handleDeleteThread"
    | "threadDeletePendingId"
    | "threadRestorePendingId"
    | "openThreadRename"
    | "cancelThreadRename"
    | "submitThreadRename"
  >;
};

export function buildThreadViewProps({
  sessionState,
  extensionOverview,
  ui,
  reportBug,
  composer,
  modelState,
  rightRail,
  transcript,
}: BuildThreadViewPropsArgs): ThreadViewProps | null {
  perfCount("build.ThreadViewProps");
  const selectedThread = sessionState.selectedThread;
  if (!selectedThread) {
    return null;
  }

  return perfMeasure("build.ThreadViewProps.duration", () => ({
    selectedThreadId: selectedThread.id,
    tenant: sessionState.tenant,
    teamSetup: sessionState.teamSetup,
    selectedThread,
    threadInteractionState: rightRail.threadInteractionState,
    selectedThreadApprovals: sessionState.selectedThreadApprovals,
    pendingApprovals: sessionState.pendingApprovals,
    respondToApproval: sessionState.respondToApproval,
    processingApprovalIds: sessionState.processingApprovalIds,
    clarificationAnswer: composer.clarificationAnswer,
    setClarificationAnswer: composer.setClarificationAnswer,
    clarificationPending: composer.clarificationPending,
    setClarificationPending: composer.setClarificationPending,
    selectedChipIndex: composer.selectedChipIndex,
    setSelectedChipIndex: composer.setSelectedChipIndex,
    structuredQuestions: rightRail.structuredQuestions,
    hasStructuredQuestions: rightRail.hasStructuredQuestions,
    isClarifying: rightRail.isClarifying,
    threadInputRequest: sessionState.threadInputRequest ?? null,
    respondToInputRequest: sessionState.respondToInputRequest,
    inputResponseText: composer.inputResponseText,
    setInputResponseText: composer.setInputResponseText,
    inputResponsePending: composer.inputResponsePending,
    extensionOverview,
    threadPromptOverride: composer.threadPromptOverride,
    attachedFiles: composer.attachedFiles,
    setAttachedFiles: composer.setAttachedFiles,
    pickFiles: sessionState.pickFiles,
    queueSelectedThreadPrompt: composer.queueSelectedThreadPrompt,
    queuedMessageCount: selectedThread.threadInputState?.queuedMessages.length ?? 0,
    submitSelectedThreadPrompt: composer.submitSelectedThreadPrompt,
    selectedModel: modelState.selectedModel,
    selectedReasoning: modelState.selectedReasoning,
    selectedServiceTier: modelState.selectedServiceTier,
    setReasoning: ui.setReasoning,
    modelOptions: modelState.modelOptions,
    reasoningOptions: modelState.reasoningOptions,
    handleModelSelection: modelState.handleModelSelection,
    handleServiceTierSelection: modelState.handleServiceTierSelection,
    REASONING_LABELS,
    availableModels: sessionState.availableModels,
    taskPending: sessionState.taskPending,
    taskError: sessionState.taskError,
    setTaskError: sessionState.setTaskError,
    effectiveThreadBusy: rightRail.effectiveThreadBusy,
    interruptTurn: sessionState.interruptTurn,
    steerTurn: sessionState.steerTurn,
    pendingPermission: sessionState.pendingPermission,
    grantWorkspacePermission: sessionState.grantWorkspacePermission,
    cancelWorkspacePermission: sessionState.cancelWorkspacePermission,
    rightRailChangeGroups: rightRail.rightRailChangeGroups,
    transcriptContainerRef: transcript.transcriptContainerRef,
    transcriptEndRef: transcript.transcriptEndRef,
    configNotices: rightRail.configNotices,
    footerStatusText: rightRail.footerStatusText,
    onReportBug: reportBug.onReportBug,
  }));
}

export function buildStartSurfaceProps({
  sessionState,
  extensionOverview,
  ui,
  composer,
  modelState,
  workspace,
  threadShell,
}: BuildStartSurfacePropsArgs): StartSurfaceProps {
  perfCount("build.StartSurfaceProps");
  return perfMeasure("build.StartSurfaceProps.duration", () => ({
    accountEmail: sessionState.accountEmail,
    tenant: sessionState.tenant,
    teamSetup: sessionState.teamSetup,
    extensionOverview,
    draftPrompt: composer.draftPrompt,
    setDraftPrompt: composer.setDraftPrompt,
    workInFolder: ui.workInFolder,
    setWorkInFolder: ui.setWorkInFolder,
    workspaceFolder: ui.workspaceFolder,
    setWorkspaceFolder: ui.setWorkspaceFolder,
    folderMenuOpen: ui.folderMenuOpen,
    setFolderMenuOpen: ui.setFolderMenuOpen,
    attachedFiles: composer.attachedFiles,
    setAttachedFiles: composer.setAttachedFiles,
    pickFiles: sessionState.pickFiles,
    selectedModel: modelState.selectedModel,
    selectedServiceTier: modelState.selectedServiceTier,
    handleModelSelection: modelState.handleModelSelection,
    handleServiceTierSelection: modelState.handleServiceTierSelection,
    modelOptions: modelState.modelOptions,
    availableModels: sessionState.availableModels,
    submitDraftTask: composer.submitDraftTask,
    activeWorkspaceProjection: workspace.activeWorkspaceProjection,
    workspaceSessions: workspace.workspaceSessions,
    workspaceSessionsLoading: workspace.workspaceSessionsLoading,
    archivedWorkspaces: workspace.archivedWorkspaces,
    archivedSessions: workspace.archivedSessions,
    navigateToWorkspaceFolder: workspace.navigateToWorkspaceFolder,
    pickRecentFolder: workspace.pickRecentFolder,
    chooseDifferentFolder: workspace.chooseDifferentFolder,
    workspaceMenuOpenId: workspace.workspaceMenuOpenId,
    setWorkspaceMenuOpenId: workspace.setWorkspaceMenuOpenId,
    handleArchiveWorkspace: workspace.handleArchiveWorkspace,
    handleRestoreWorkspace: workspace.handleRestoreWorkspace,
    handleDeleteWorkspace: workspace.handleDeleteWorkspace,
    workspaceArchivePendingId: workspace.workspaceArchivePendingId,
    workspaceRestorePendingId: workspace.workspaceRestorePendingId,
    workspaceDeletePendingId: workspace.workspaceDeletePendingId,
    workspaceIdByRoot: workspace.workspaceIdByRoot,
    resumeWorkspaceSession: workspace.resumeWorkspaceSession,
    recentFolders: sessionState.recentFolders,
    threads: sessionState.threads,
    workspaceThreadGroups: workspace.workspaceThreadGroups,
    threadArchivePendingId: threadShell.threadArchivePendingId,
    threadMenuOpenId: threadShell.threadMenuOpenId,
    setThreadMenuOpenId: threadShell.setThreadMenuOpenId,
    threadRenameId: threadShell.threadRenameId,
    threadRenameDraft: threadShell.threadRenameDraft,
    setThreadRenameDraft: threadShell.setThreadRenameDraft,
    handleArchiveThread: threadShell.handleArchiveThread,
    handleRestoreThread: threadShell.handleRestoreThread,
    handleDeleteThread: threadShell.handleDeleteThread,
    threadDeletePendingId: threadShell.threadDeletePendingId,
    threadRestorePendingId: threadShell.threadRestorePendingId,
    openThreadRename: threadShell.openThreadRename,
    cancelThreadRename: threadShell.cancelThreadRename,
    submitThreadRename: threadShell.submitThreadRename,
    selectThread: sessionState.selectThread,
    pendingPermission: sessionState.pendingPermission,
    grantWorkspacePermission: sessionState.grantWorkspacePermission,
    cancelWorkspacePermission: sessionState.cancelWorkspacePermission,
    taskPending: sessionState.taskPending,
    taskError: sessionState.taskError,
    refreshBootstrap: sessionState.refreshBootstrap,
  }));
}
