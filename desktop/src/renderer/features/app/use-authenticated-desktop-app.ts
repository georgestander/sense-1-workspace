import type { Dispatch, SetStateAction } from "react";

import type { DesktopExtensionOverviewResult } from "../../../main/contracts";
import type { useDesktopSessionState } from "../../use-desktop-session-state.js";
import type { useSettingsController } from "../settings/use-settings-controller.js";
import { shouldShowHeaderUpdateAction } from "../updates/update-presentation.js";
import { buildStartSurfaceProps, buildThreadViewProps } from "./app-main-content-props.js";
import { perfCount } from "../../lib/perf-debug.ts";
import { useAppShellProps } from "./use-app-shell-props.js";
import { useAuthenticatedDesktopContent } from "./use-authenticated-desktop-content.js";

type SessionState = ReturnType<typeof useDesktopSessionState>;
type SettingsControllerState = ReturnType<typeof useSettingsController>;

type UseAuthenticatedDesktopAppArgs = {
  navigation: {
    activeView: "home" | "plugins" | "automations";
    openAutomations: () => void;
    openPlugins: () => void;
  };
  extensionOverview: Pick<DesktopExtensionOverviewResult, "apps" | "plugins" | "skills"> | null;
  sessionState: SessionState;
  settingsController: SettingsControllerState;
  ui: {
    accountMenuOpen: boolean;
    folderMenuOpen: boolean;
    leftRailOpen: boolean;
    model: string;
    reasoning: string;
    searchQuery: string;
    serviceTier: "flex" | "fast";
    setAccountMenuOpen: Dispatch<SetStateAction<boolean>>;
    setFolderMenuOpen: Dispatch<SetStateAction<boolean>>;
    setModel: Dispatch<SetStateAction<string>>;
    setReasoning: Dispatch<SetStateAction<string>>;
    setSearchQuery: Dispatch<SetStateAction<string>>;
    setServiceTier: Dispatch<SetStateAction<"flex" | "fast">>;
    setWorkInFolder: Dispatch<SetStateAction<boolean>>;
    setWorkspaceFolder: Dispatch<SetStateAction<string | null>>;
    workInFolder: boolean;
    workspaceFolder: string | null;
  };
};

export function useAuthenticatedDesktopApp({
  navigation,
  extensionOverview,
  sessionState,
  settingsController,
  ui,
}: UseAuthenticatedDesktopAppArgs) {
  perfCount("render.useAuthenticatedDesktopApp");
  const content = useAuthenticatedDesktopContent({
    sessionState,
    settingsController,
    ui: {
      folderMenuOpen: ui.folderMenuOpen,
      model: ui.model,
      reasoning: ui.reasoning,
      searchQuery: ui.searchQuery,
      serviceTier: ui.serviceTier,
      setFolderMenuOpen: ui.setFolderMenuOpen,
      setModel: ui.setModel,
      setReasoning: ui.setReasoning,
      setServiceTier: ui.setServiceTier,
      setWorkInFolder: ui.setWorkInFolder,
      setWorkspaceFolder: ui.setWorkspaceFolder,
      workInFolder: ui.workInFolder,
      workspaceFolder: ui.workspaceFolder,
    },
  });

  const { leftSidebarProps, resetToStartSurface, settingsModalProps } = useAppShellProps({
    navigation,
    account: {
      accountEmail: sessionState.accountEmail,
      accountMenuOpen: ui.accountMenuOpen,
      handleLogout: sessionState.handleLogout,
      logoutPending: sessionState.logoutPending,
      setAccountMenuOpen: ui.setAccountMenuOpen,
      teamSetup: sessionState.teamSetup,
      tenant: sessionState.tenant,
    },
    search: {
      filteredThreads: content.filteredThreads,
      leftRailOpen: ui.leftRailOpen,
      noThreadSearchMatches: content.noThreadSearchMatches,
      searchQuery: ui.searchQuery,
      setSearchQuery: ui.setSearchQuery,
      trimmedSearchQuery: content.trimmedSearchQuery,
    },
    settings: {
      accountEmail: sessionState.accountEmail,
      availableModels: sessionState.availableModels,
      checkForUpdates: sessionState.checkForUpdates,
      currentVersion: sessionState.runtimeStatus?.appVersion ?? sessionState.updateState?.currentVersion ?? null,
      modelOptions: content.modelSettings.modelOptions,
      openLatestRelease: sessionState.openLatestRelease,
      openSettingsFromHook: settingsController.openSettings,
      saveSettings: settingsController.saveSettings,
      saveSettingsModelSelection: content.modelSettings.saveSettingsModelSelection,
      setSettingsOpen: settingsController.setSettingsOpen,
      setSettingsSection: settingsController.setSettingsSection,
      settingsData: settingsController.settingsData,
      settingsError: settingsController.settingsError,
      settingsModel: content.modelSettings.settingsModel,
      settingsOpen: settingsController.settingsOpen,
      settingsReasoning: content.modelSettings.settingsReasoning,
      settingsReasoningOptions: content.modelSettings.settingsReasoningOptions,
      settingsServiceTier: content.modelSettings.settingsServiceTier,
      settingsSaving: settingsController.settingsSaving,
      settingsSection: settingsController.settingsSection,
      teamSetup: sessionState.teamSetup,
      tenant: sessionState.tenant,
      refreshBootstrap: sessionState.refreshBootstrap,
      updateState: sessionState.updateState,
    },
    threadShell: {
      cancelThreadRename: content.threadShell.cancelThreadRename,
      handleArchiveThread: content.threadShell.handleArchiveThread,
      handleDeleteThread: content.threadShell.handleDeleteThread,
      openThreadRename: content.threadShell.openThreadRename,
      resetThreadShell: content.threadShell.resetThreadShell,
      selectThread: sessionState.selectThread,
      selectedThread: sessionState.selectedThread,
      setSidebarThreadMenu: content.threadShell.setSidebarThreadMenu,
      setThreadRenameDraft: content.threadShell.setThreadRenameDraft,
      sidebarThreadMenuOpenId: content.threadShell.sidebarThreadMenuOpenId,
      submitThreadRename: content.threadShell.submitThreadRename,
      threadArchivePendingId: content.threadShell.threadArchivePendingId,
      threadDeletePendingId: content.threadShell.threadDeletePendingId,
      threadRenameDraft: content.threadShell.threadRenameDraft,
      threadRenameId: content.threadShell.threadRenameId,
    },
    workspace: {
      activeWorkspaceRoot: content.activeWorkspaceRoot,
      dragOverRoot: content.workspaceShell.dragOverRoot,
      expandedWorkspaces: content.workspaceShell.expandedWorkspaces,
      handleArchiveWorkspace: content.workspaceShell.handleArchiveWorkspace,
      handleDeleteWorkspace: content.workspaceShell.handleDeleteWorkspace,
      handleWorkspaceDragEnd: content.workspaceShell.handleWorkspaceDragEnd,
      handleWorkspaceDragLeave: content.workspaceShell.handleWorkspaceDragLeave,
      handleWorkspaceDragOver: content.workspaceShell.handleWorkspaceDragOver,
      handleWorkspaceDragStart: content.workspaceShell.handleWorkspaceDragStart,
      handleWorkspaceDrop: content.workspaceShell.handleWorkspaceDrop,
      onNewThreadInWorkspace: content.workspaceShell.onNewThreadInWorkspace,
      resetWorkspaceShell: content.workspaceShell.resetWorkspaceShell,
      setSidebarWorkspaceMenu: content.workspaceShell.setSidebarWorkspaceMenu,
      sidebarWorkspaceMenuOpenId: content.workspaceShell.sidebarWorkspaceMenuOpenId,
      toggleWorkspaceExpanded: content.workspaceShell.toggleWorkspaceExpanded,
      visibleWorkspaceThreadGroups: content.workspaceShell.visibleWorkspaceThreadGroups,
      workspaceArchivePendingId: content.workspaceShell.workspaceArchivePendingId,
      workspaceDeletePendingId: content.workspaceShell.workspaceDeletePendingId,
      workspaceIdByRoot: content.workspaceShell.workspaceIdByRoot,
    },
    resetComposerState: content.composer.resetComposerState,
  });

  const threadViewProps = buildThreadViewProps({
    extensionOverview,
    sessionState,
    ui: {
      setReasoning: ui.setReasoning,
    },
    composer: {
      attachedFiles: content.composer.attachedFiles,
      clarificationAnswer: content.composer.clarificationAnswer,
      clarificationPending: content.composer.clarificationPending,
      inputResponsePending: content.composer.inputResponsePending,
      inputResponseText: content.composer.inputResponseText,
      selectedChipIndex: content.composer.selectedChipIndex,
      setAttachedFiles: content.composer.setAttachedFiles,
      setClarificationAnswer: content.composer.setClarificationAnswer,
      setClarificationPending: content.composer.setClarificationPending,
      setInputResponseText: content.composer.setInputResponseText,
      setSelectedChipIndex: content.composer.setSelectedChipIndex,
      structuredQuestions: content.rightRail.structuredQuestions,
      queueSelectedThreadPrompt: content.composer.queueSelectedThreadPrompt,
      submitSelectedThreadPrompt: content.composer.submitSelectedThreadPrompt,
      threadPromptOverride: content.composer.threadPromptOverride,
    },
    modelState: {
      handleModelSelection: content.modelSettings.handleModelSelection,
      handleServiceTierSelection: content.modelSettings.handleServiceTierSelection,
      selectedModel: content.modelSettings.selectedModel,
      selectedReasoning: content.modelSettings.selectedReasoning,
      selectedServiceTier: content.modelSettings.selectedServiceTier,
      modelOptions: content.modelSettings.modelOptions,
      reasoningOptions: content.modelSettings.reasoningOptions,
    },
    rightRail: {
      threadInteractionState: content.rightRail.threadInteractionState,
      structuredQuestions: content.rightRail.structuredQuestions,
      hasStructuredQuestions: content.rightRail.hasStructuredQuestions,
      isClarifying: content.rightRail.isClarifying,
      rightRailChangeGroups: content.rightRail.rightRailChangeGroups,
      configNotices: content.modelSettings.configNotices,
      footerStatusText: content.rightRail.footerStatusText,
      effectiveThreadBusy: content.rightRail.effectiveThreadBusy,
    },
    transcript: {
      transcriptContainerRef: content.transcriptContainerRef,
      transcriptEndRef: content.transcriptEndRef,
    },
  });

  const startSurfaceProps = buildStartSurfaceProps({
    extensionOverview,
    sessionState,
    ui: {
      workInFolder: ui.workInFolder,
      setWorkInFolder: ui.setWorkInFolder,
      workspaceFolder: ui.workspaceFolder,
      setWorkspaceFolder: ui.setWorkspaceFolder,
      folderMenuOpen: ui.folderMenuOpen,
      setFolderMenuOpen: ui.setFolderMenuOpen,
    },
    composer: {
      draftPrompt: content.composer.draftPrompt,
      setDraftPrompt: content.composer.setDraftPrompt,
      attachedFiles: content.composer.attachedFiles,
      setAttachedFiles: content.composer.setAttachedFiles,
      pickFiles: sessionState.pickFiles,
      submitDraftTask: content.composer.submitDraftTask,
    },
    modelState: {
      selectedModel: content.modelSettings.selectedModel,
      selectedServiceTier: content.modelSettings.selectedServiceTier,
      handleModelSelection: content.modelSettings.handleModelSelection,
      handleServiceTierSelection: content.modelSettings.handleServiceTierSelection,
      modelOptions: content.modelSettings.modelOptions,
    },
    workspace: {
      activeWorkspaceProjection: content.workspaceCollections.activeWorkspaceProjection,
      workspaceSessions: content.workspaceCollections.workspaceSessions,
      workspaceSessionsLoading: content.workspaceCollections.workspaceSessionsLoading,
      archivedWorkspaces: content.workspaceCollections.archivedWorkspaces,
      archivedSessions: content.workspaceCollections.archivedSessions,
      navigateToWorkspaceFolder: content.workspaceShell.navigateToWorkspaceFolder,
      pickRecentFolder: content.workspaceShell.pickRecentFolder,
      chooseDifferentFolder: content.workspaceShell.chooseDifferentFolder,
      workspaceMenuOpenId: content.workspaceShell.homeWorkspaceMenuOpenId,
      setWorkspaceMenuOpenId: content.workspaceShell.setHomeWorkspaceMenu,
      handleArchiveWorkspace: content.workspaceShell.handleArchiveWorkspace,
      handleRestoreWorkspace: content.workspaceShell.handleRestoreWorkspace,
      handleDeleteWorkspace: content.workspaceShell.handleDeleteWorkspace,
      workspaceArchivePendingId: content.workspaceShell.workspaceArchivePendingId,
      workspaceRestorePendingId: content.workspaceShell.workspaceRestorePendingId,
      workspaceDeletePendingId: content.workspaceShell.workspaceDeletePendingId,
      workspaceIdByRoot: content.workspaceShell.workspaceIdByRoot,
      resumeWorkspaceSession: content.workspaceShell.resumeWorkspaceSession,
      workspaceThreadGroups: content.workspaceShell.workspaceThreadGroups,
    },
    threadShell: {
      threadArchivePendingId: content.threadShell.threadArchivePendingId,
      threadMenuOpenId: content.threadShell.homeThreadMenuOpenId,
      setThreadMenuOpenId: content.threadShell.setHomeThreadMenu,
      threadRenameId: content.threadShell.threadRenameId,
      threadRenameDraft: content.threadShell.threadRenameDraft,
      setThreadRenameDraft: content.threadShell.setThreadRenameDraft,
      cancelThreadRename: content.threadShell.cancelThreadRename,
      handleArchiveThread: content.threadShell.handleArchiveThread,
      handleDeleteThread: content.threadShell.handleDeleteThread,
      handleRestoreThread: content.threadShell.handleRestoreThread,
      openThreadRename: content.threadShell.openThreadRename,
      submitThreadRename: content.threadShell.submitThreadRename,
      threadRestorePendingId: content.threadShell.threadRestorePendingId,
      threadDeletePendingId: content.threadShell.threadDeletePendingId,
    },
  });

  return {
    leftSidebarProps,
    resetToStartSurface,
    rightRailOpen: content.rightRail.rightRailOpen,
    rightRailProps: content.rightRail.rightRailProps,
    setDraftPrompt: content.composer.setDraftPrompt,
    setDraftPromptSeed: content.composer.setDraftPromptSeed,
    setRightRailOpen: content.rightRail.setRightRailOpen,
    setThreadPrompt: content.composer.setThreadPrompt,
    setThreadPromptSeed: content.composer.setThreadPromptSeed,
    settingsModalProps,
    showInstallUpdateAction: shouldShowHeaderUpdateAction(sessionState.updateState),
    startSurfaceProps,
    threadViewProps,
  };
}
