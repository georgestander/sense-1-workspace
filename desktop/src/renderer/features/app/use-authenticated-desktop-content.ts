import { useRef } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { useDesktopSessionState } from "../../use-desktop-session-state.js";
import type { useSettingsController } from "../settings/use-settings-controller.js";
import { REASONING_LABELS, useAppModelSettings } from "../settings/use-app-model-settings.js";
import { useAppComposer } from "../session/use-app-composer.js";
import { parseFastModeCommand } from "../session/fast-mode-command.js";
import { useThreadShell } from "../threads/use-thread-shell.js";
import { useWorkspaceActivity } from "../workspace/use-workspace-activity.js";
import { useWorkspaceCollections } from "../workspace/use-workspace-collections.js";
import { useWorkspaceShell } from "../workspace/use-workspace-shell.js";
import { useAppRightRail } from "./use-app-right-rail.js";
import { perfCount, perfMeasure } from "../../lib/perf-debug.ts";

type SessionState = ReturnType<typeof useDesktopSessionState>;
type SettingsControllerState = ReturnType<typeof useSettingsController>;

type UseAuthenticatedDesktopContentArgs = {
  sessionState: SessionState;
  settingsController: SettingsControllerState;
  ui: {
    folderMenuOpen: boolean;
    model: string;
    reasoning: string;
    searchQuery: string;
    serviceTier: "flex" | "fast";
    setFolderMenuOpen: Dispatch<SetStateAction<boolean>>;
    setModel: Dispatch<SetStateAction<string>>;
    setReasoning: Dispatch<SetStateAction<string>>;
    setServiceTier: Dispatch<SetStateAction<"flex" | "fast">>;
    setWorkInFolder: Dispatch<SetStateAction<boolean>>;
    setWorkspaceFolder: Dispatch<SetStateAction<string | null>>;
    workInFolder: boolean;
    workspaceFolder: string | null;
  };
};

export function useAuthenticatedDesktopContent({
  sessionState,
  settingsController,
  ui,
}: UseAuthenticatedDesktopContentArgs) {
  perfCount("render.useAuthenticatedDesktopContent");
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const currentRequestId = sessionState.threadInputRequest?.requestId ?? null;
  const modelSettings = useAppModelSettings({
    availableModels: sessionState.availableModels,
    model: ui.model,
    reasoning: ui.reasoning,
    serviceTier: ui.serviceTier,
    selectedThreadId: sessionState.selectedThreadId,
    setModel: ui.setModel,
    setReasoning: ui.setReasoning,
    setServiceTier: ui.setServiceTier,
    settingsData: settingsController.settingsData,
    saveSettings: settingsController.saveSettings,
  });

  const composer = useAppComposer({
    canSteerSelectedThread: Boolean(sessionState.activeTurnId),
    currentRequestId,
    clearSelectedThread: sessionState.clearSelectedThread,
    effectiveThreadBusy: sessionState.selectedThread?.state === "running",
    handleFastModeCommand: async (prompt) => {
      const action = parseFastModeCommand(prompt);
      if (!action) {
        return false;
      }
      if (action === "on") {
        modelSettings.handleServiceTierSelection("fast");
        return true;
      }
      if (action === "off") {
        modelSettings.handleServiceTierSelection("flex");
        return true;
      }
      if (action === "status") {
        modelSettings.pushConfigNotice(
          modelSettings.selectedServiceTier === "fast"
            ? "Fast mode is on"
            : "Fast mode is off",
        );
        return true;
      }
      return false;
    },
    queueTurnInput: sessionState.queueTurnInput,
    runTask: sessionState.runTask,
    selectedThread: sessionState.selectedThread,
    selectedThreadId: sessionState.selectedThreadId,
    setFolderMenuOpen: ui.setFolderMenuOpen,
    setTaskError: sessionState.setTaskError,
    steerTurn: sessionState.steerTurn,
    transcriptEndRef,
    workInFolder: ui.workInFolder,
    workspaceFolder: ui.workspaceFolder,
  });

  const activeWorkspaceRoot = sessionState.selectedThread?.workspaceRoot ?? (ui.workInFolder ? ui.workspaceFolder : null);
  const workspaceCollections = useWorkspaceCollections({
    activeWorkspaceRoot,
    isSignedIn: sessionState.isSignedIn,
    selectedProfileId: sessionState.selectedProfileId,
  });

  const trimmedSearchQuery = ui.searchQuery.trim();
  const normalizedSearchQuery = trimmedSearchQuery.toLowerCase();
  const filteredThreads = perfMeasure("app-content.filter-threads", () => (
    normalizedSearchQuery
      ? sessionState.threads.filter((thread) => thread.title.toLowerCase().includes(normalizedSearchQuery))
      : sessionState.threads
  ));
  const noThreadSearchMatches = Boolean(
    normalizedSearchQuery && sessionState.threads.length > 0 && filteredThreads.length === 0,
  );

  const workspaceShell = useWorkspaceShell({
    archiveWorkspace: sessionState.archiveWorkspace,
    chooseDifferentFolderFromSession: sessionState.chooseDifferentFolder,
    clearSelectedThread: sessionState.clearSelectedThread,
    defaultOperatingMode: settingsController.settingsData?.defaultOperatingMode ?? null,
    deleteWorkspace: sessionState.deleteWorkspace,
    filteredThreads,
    isSignedIn: sessionState.isSignedIn,
    knownWorkspaces: workspaceCollections.knownWorkspaces,
    projectedWorkspaces: workspaceCollections.projectedWorkspaces,
    refreshWorkspaceCollections: workspaceCollections.refreshWorkspaceCollections,
    removeWorkspaceFromCollections: workspaceCollections.removeWorkspaceFromCollections,
    rememberWorkspaceSidebarOrder: sessionState.rememberWorkspaceSidebarOrder,
    requestWorkspacePermission: sessionState.requestWorkspacePermission,
    restoreWorkspace: sessionState.restoreWorkspace,
    selectThread: sessionState.selectThread,
    selectedThread: sessionState.selectedThread,
    setAttachedFiles: composer.setAttachedFiles,
    setDraftPrompt: composer.setDraftPrompt,
    setFolderMenuOpen: ui.setFolderMenuOpen,
    setTaskError: sessionState.setTaskError,
    setWorkInFolder: ui.setWorkInFolder,
    setWorkspaceOperatingMode: sessionState.setWorkspaceOperatingMode,
    setWorkspaceFolder: ui.setWorkspaceFolder,
    threads: sessionState.threads,
    workInFolder: ui.workInFolder,
    workspaceFolder: ui.workspaceFolder,
    workspacePolicy: sessionState.workspacePolicy,
    workspaceSidebarOrder: sessionState.workspaceSidebarOrder,
  });

  const workspaceActivity = useWorkspaceActivity({
    hydrateWorkspace: sessionState.hydrateWorkspace,
    selectedThreadId: sessionState.selectedThreadId,
    selectedThreadWorkspaceRoot: sessionState.selectedThread?.workspaceRoot ?? null,
    workspacePolicy: sessionState.workspacePolicy,
    workspaceSessions: workspaceCollections.workspaceSessions,
  });

  const threadShell = useThreadShell({
    selectedThreadId: sessionState.selectedThreadId,
    renameThread: sessionState.renameThread,
    archiveThread: sessionState.archiveThread,
    restoreThread: sessionState.restoreThread,
    deleteThread: sessionState.deleteThread,
    refreshWorkspaceCollections: workspaceCollections.refreshWorkspaceCollections,
    resetToStartSurface: () => {
      composer.resetComposerState();
      workspaceShell.resetWorkspaceShell();
    },
  });

  const rightRail = useAppRightRail({
    activeWorkspaceProjection: workspaceCollections.activeWorkspaceProjection,
    attachedFiles: composer.attachedFiles,
    inputResponsePending: composer.inputResponsePending,
    inputResponseText: composer.inputResponseText,
    pendingApprovals: sessionState.pendingApprovals,
    persistedSessionActivityLoading: workspaceActivity.persistedSessionActivityLoading,
    persistedSessionActivitySummary: workspaceActivity.persistedSessionActivitySummary,
    persistedSessionWrittenPaths: workspaceActivity.persistedSessionWrittenPaths,
    processingApprovalIds: sessionState.processingApprovalIds,
    refreshWorkspaceStructure: workspaceActivity.refreshWorkspaceStructure,
    respondToApproval: sessionState.respondToApproval,
    respondToInputRequest: sessionState.respondToInputRequest,
    resumeWorkspaceSession: workspaceShell.resumeWorkspaceSession,
    rightRailThread: sessionState.rightRailThread,
    selectedThread: sessionState.selectedThread,
    selectedThreadApprovals: sessionState.selectedThreadApprovals,
    selectedThreadId: sessionState.selectedThreadId,
    setInputResponsePending: composer.setInputResponsePending,
    setInputResponseText: composer.setInputResponseText,
    showRightRail: sessionState.showRightRail,
    taskPending: sessionState.taskPending,
    threadInputRequest: sessionState.threadInputRequest,
    threadPlanState: sessionState.threadPlanState,
    transcriptContainerRef,
    transcriptEndRef,
    workspacePolicy: sessionState.workspacePolicy,
    workspaceSessions: workspaceCollections.workspaceSessions,
    workspaceStructureRefreshing: workspaceActivity.workspaceStructureRefreshing,
  });

  return {
    REASONING_LABELS,
    activeWorkspaceRoot,
    composer,
    filteredThreads,
    modelSettings,
    noThreadSearchMatches,
    rightRail,
    threadShell,
    transcriptContainerRef,
    transcriptEndRef,
    trimmedSearchQuery,
    workspaceActivity,
    workspaceCollections,
    workspaceShell,
  };
}
