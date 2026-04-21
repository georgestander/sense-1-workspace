import { useCallback, useMemo, type ComponentProps, type Dispatch, type SetStateAction } from "react";

import { LeftSidebar } from "../../components/LeftSidebar";
import { SettingsModal } from "../../components/SettingsModal";

type LeftSidebarProps = ComponentProps<typeof LeftSidebar>;
type SettingsModalProps = ComponentProps<typeof SettingsModal>;

type BuildAppShellPropsArgs = {
  navigation: {
    activeView: LeftSidebarProps["activeView"];
    openAutomations: LeftSidebarProps["openAutomations"];
    openPlugins: LeftSidebarProps["openPlugins"];
  };
  account: {
    accountEmail: LeftSidebarProps["accountEmail"];
    accountType: LeftSidebarProps["accountType"];
    accountMenuOpen: boolean;
    handleLogout: LeftSidebarProps["handleLogout"];
    logoutPending: LeftSidebarProps["logoutPending"];
    setAccountMenuOpen: Dispatch<SetStateAction<boolean>>;
    teamSetup: LeftSidebarProps["teamSetup"];
    tenant: LeftSidebarProps["tenant"];
  };
  reportBug: {
    openReportBug: () => void;
  };
  search: {
    filteredThreads: LeftSidebarProps["filteredThreads"];
    leftRailOpen: LeftSidebarProps["leftRailOpen"];
    noThreadSearchMatches: LeftSidebarProps["noThreadSearchMatches"];
    searchQuery: LeftSidebarProps["searchQuery"];
    setSearchQuery: LeftSidebarProps["setSearchQuery"];
    trimmedSearchQuery: LeftSidebarProps["trimmedSearchQuery"];
  };
  settings: {
    accountEmail: SettingsModalProps["accountEmail"];
    availableModels: SettingsModalProps["availableModels"];
    checkForUpdates: SettingsModalProps["checkForUpdates"];
    currentVersion: SettingsModalProps["currentVersion"];
    modelOptions: SettingsModalProps["modelOptions"];
    openLatestRelease: SettingsModalProps["openLatestRelease"];
    openSettingsFromHook: () => Promise<void>;
    saveSettings: SettingsModalProps["saveSettings"];
    saveSettingsModelSelection: SettingsModalProps["saveSettingsModelSelection"];
    setSettingsOpen: SettingsModalProps["setSettingsOpen"];
    setSettingsSection: SettingsModalProps["setSettingsSection"];
    settingsData: SettingsModalProps["settingsData"];
    settingsError: SettingsModalProps["settingsError"];
    settingsModel: SettingsModalProps["settingsModel"];
    settingsOpen: SettingsModalProps["settingsOpen"];
    settingsReasoning: SettingsModalProps["settingsReasoning"];
    settingsReasoningOptions: SettingsModalProps["settingsReasoningOptions"];
    settingsServiceTier: SettingsModalProps["settingsServiceTier"];
    settingsSaving: SettingsModalProps["settingsSaving"];
    settingsSection: SettingsModalProps["settingsSection"];
    teamSetup: SettingsModalProps["teamSetup"];
    tenant: SettingsModalProps["tenant"];
    refreshBootstrap: SettingsModalProps["refreshBootstrap"];
    updateState: SettingsModalProps["updateState"];
  };
  threadShell: {
    cancelThreadRename: LeftSidebarProps["cancelThreadRename"];
    handleArchiveThread: LeftSidebarProps["handleArchiveThread"];
    handleDeleteThread: LeftSidebarProps["handleDeleteThread"];
    openThreadRename: LeftSidebarProps["openThreadRename"];
    resetThreadShell: () => void;
    selectThread: LeftSidebarProps["selectThread"];
    selectedThread: LeftSidebarProps["selectedThread"];
    setSidebarThreadMenu: LeftSidebarProps["setThreadMenuOpenId"];
    setThreadRenameDraft: LeftSidebarProps["setThreadRenameDraft"];
    sidebarThreadMenuOpenId: LeftSidebarProps["threadMenuOpenId"];
    submitThreadRename: LeftSidebarProps["submitThreadRename"];
    threadArchivePendingId: LeftSidebarProps["threadArchivePendingId"];
    threadDeletePendingId: LeftSidebarProps["threadDeletePendingId"];
    threadRenameDraft: LeftSidebarProps["threadRenameDraft"];
    threadRenameId: LeftSidebarProps["threadRenameId"];
  };
  workspace: {
    activeWorkspaceRoot: LeftSidebarProps["activeWorkspaceRoot"];
    dragOverRoot: LeftSidebarProps["dragOverRoot"];
    expandedWorkspaces: LeftSidebarProps["expandedWorkspaces"];
    handleArchiveWorkspace: LeftSidebarProps["handleArchiveWorkspace"];
    handleDeleteWorkspace: LeftSidebarProps["handleDeleteWorkspace"];
    handleWorkspaceDragEnd: LeftSidebarProps["handleWorkspaceDragEnd"];
    handleWorkspaceDragLeave: LeftSidebarProps["handleWorkspaceDragLeave"];
    handleWorkspaceDragOver: LeftSidebarProps["handleWorkspaceDragOver"];
    handleWorkspaceDragStart: LeftSidebarProps["handleWorkspaceDragStart"];
    handleWorkspaceDrop: LeftSidebarProps["handleWorkspaceDrop"];
    onNewThreadInWorkspace: LeftSidebarProps["onNewThreadInWorkspace"];
    resetWorkspaceShell: () => void;
    setSidebarWorkspaceMenu: LeftSidebarProps["setWorkspaceMenuOpenId"];
    sidebarWorkspaceMenuOpenId: LeftSidebarProps["workspaceMenuOpenId"];
    toggleWorkspaceExpanded: LeftSidebarProps["toggleWorkspaceExpanded"];
    visibleWorkspaceThreadGroups: LeftSidebarProps["workspaceThreadGroups"];
    workspaceArchivePendingId: LeftSidebarProps["workspaceArchivePendingId"];
    workspaceDeletePendingId: LeftSidebarProps["workspaceDeletePendingId"];
    workspaceIdByRoot: LeftSidebarProps["workspaceIdByRoot"];
  };
  resetComposerState: () => void;
};

export function useAppShellProps({
  navigation,
  account,
  search,
  settings,
  threadShell,
  workspace,
  reportBug,
  resetComposerState,
}: BuildAppShellPropsArgs) {
  const resetToStartSurface = useCallback(() => {
    resetComposerState();
    workspace.resetWorkspaceShell();
    threadShell.resetThreadShell();
  }, [resetComposerState, threadShell.resetThreadShell, workspace.resetWorkspaceShell]);

  const handleOpenSettings = useCallback(async () => {
    account.setAccountMenuOpen(false);
    await settings.openSettingsFromHook();
  }, [account.setAccountMenuOpen, settings.openSettingsFromHook]);

  const handleOpenReportBug = useCallback(() => {
    account.setAccountMenuOpen(false);
    reportBug.openReportBug();
  }, [account.setAccountMenuOpen, reportBug.openReportBug]);

  const leftSidebarProps: LeftSidebarProps = useMemo(() => ({
    activeView: navigation.activeView,
    leftRailOpen: search.leftRailOpen,
    searchQuery: search.searchQuery,
    setSearchQuery: search.setSearchQuery,
    filteredThreads: search.filteredThreads,
    noThreadSearchMatches: search.noThreadSearchMatches,
    trimmedSearchQuery: search.trimmedSearchQuery,
    workspaceThreadGroups: workspace.visibleWorkspaceThreadGroups,
    expandedWorkspaces: workspace.expandedWorkspaces,
    toggleWorkspaceExpanded: workspace.toggleWorkspaceExpanded,
    activeWorkspaceRoot: workspace.activeWorkspaceRoot,
    selectedThread: threadShell.selectedThread,
    selectThread: threadShell.selectThread,
    openThreadRename: threadShell.openThreadRename,
    threadRenameId: threadShell.threadRenameId,
    threadRenameDraft: threadShell.threadRenameDraft,
    setThreadRenameDraft: threadShell.setThreadRenameDraft,
    submitThreadRename: threadShell.submitThreadRename,
    cancelThreadRename: threadShell.cancelThreadRename,
    handleArchiveThread: threadShell.handleArchiveThread,
    threadArchivePendingId: threadShell.threadArchivePendingId,
    handleDeleteThread: threadShell.handleDeleteThread,
    threadDeletePendingId: threadShell.threadDeletePendingId,
    threadMenuOpenId: threadShell.sidebarThreadMenuOpenId,
    setThreadMenuOpenId: threadShell.setSidebarThreadMenu,
    workspaceMenuOpenId: workspace.sidebarWorkspaceMenuOpenId,
    setWorkspaceMenuOpenId: workspace.setSidebarWorkspaceMenu,
    handleArchiveWorkspace: workspace.handleArchiveWorkspace,
    handleDeleteWorkspace: workspace.handleDeleteWorkspace,
    workspaceArchivePendingId: workspace.workspaceArchivePendingId,
    workspaceDeletePendingId: workspace.workspaceDeletePendingId,
    workspaceIdByRoot: workspace.workspaceIdByRoot,
    dragOverRoot: workspace.dragOverRoot,
    handleWorkspaceDragStart: workspace.handleWorkspaceDragStart,
    handleWorkspaceDragEnd: workspace.handleWorkspaceDragEnd,
    handleWorkspaceDragOver: workspace.handleWorkspaceDragOver,
    handleWorkspaceDragLeave: workspace.handleWorkspaceDragLeave,
    handleWorkspaceDrop: workspace.handleWorkspaceDrop,
    onNewThreadInWorkspace: workspace.onNewThreadInWorkspace,
    openAutomations: navigation.openAutomations,
    openPlugins: navigation.openPlugins,
    resetToStartSurface,
    accountMenuOpen: account.accountMenuOpen,
    setAccountMenuOpen: account.setAccountMenuOpen,
    accountEmail: account.accountEmail,
    accountType: account.accountType,
    tenant: account.tenant,
    teamSetup: account.teamSetup,
    openSettings: handleOpenSettings,
    openReportBug: handleOpenReportBug,
    handleLogout: account.handleLogout,
    logoutPending: account.logoutPending,
  }), [
    account.accountEmail,
    account.accountMenuOpen,
    account.accountType,
    account.handleLogout,
    account.logoutPending,
    account.setAccountMenuOpen,
    account.teamSetup,
    account.tenant,
    handleOpenReportBug,
    handleOpenSettings,
    navigation.activeView,
    navigation.openAutomations,
    navigation.openPlugins,
    resetToStartSurface,
    search.filteredThreads,
    search.leftRailOpen,
    search.noThreadSearchMatches,
    search.searchQuery,
    search.setSearchQuery,
    search.trimmedSearchQuery,
    threadShell.cancelThreadRename,
    threadShell.handleArchiveThread,
    threadShell.handleDeleteThread,
    threadShell.openThreadRename,
    threadShell.selectedThread,
    threadShell.selectThread,
    threadShell.setSidebarThreadMenu,
    threadShell.setThreadRenameDraft,
    threadShell.sidebarThreadMenuOpenId,
    threadShell.submitThreadRename,
    threadShell.threadArchivePendingId,
    threadShell.threadDeletePendingId,
    threadShell.threadRenameDraft,
    threadShell.threadRenameId,
    workspace.activeWorkspaceRoot,
    workspace.dragOverRoot,
    workspace.expandedWorkspaces,
    workspace.handleArchiveWorkspace,
    workspace.handleDeleteWorkspace,
    workspace.handleWorkspaceDragEnd,
    workspace.handleWorkspaceDragLeave,
    workspace.handleWorkspaceDragOver,
    workspace.handleWorkspaceDragStart,
    workspace.handleWorkspaceDrop,
    workspace.onNewThreadInWorkspace,
    workspace.setSidebarWorkspaceMenu,
    workspace.sidebarWorkspaceMenuOpenId,
    workspace.toggleWorkspaceExpanded,
    workspace.visibleWorkspaceThreadGroups,
    workspace.workspaceArchivePendingId,
    workspace.workspaceDeletePendingId,
    workspace.workspaceIdByRoot,
  ]);

  const settingsModalProps: SettingsModalProps = useMemo(() => ({
    settingsOpen: settings.settingsOpen,
    setSettingsOpen: settings.setSettingsOpen,
    settingsSection: settings.settingsSection,
    setSettingsSection: settings.setSettingsSection,
    settingsData: settings.settingsData,
    settingsError: settings.settingsError,
    settingsSaving: settings.settingsSaving,
    saveSettings: settings.saveSettings,
    accountEmail: settings.accountEmail,
    teamSetup: settings.teamSetup,
    tenant: settings.tenant,
    refreshBootstrap: settings.refreshBootstrap,
    modelOptions: settings.modelOptions,
    settingsModel: settings.settingsModel,
    settingsReasoning: settings.settingsReasoning,
    settingsReasoningOptions: settings.settingsReasoningOptions,
    settingsServiceTier: settings.settingsServiceTier,
    saveSettingsModelSelection: settings.saveSettingsModelSelection,
    availableModels: settings.availableModels,
    currentVersion: settings.currentVersion,
    updateState: settings.updateState,
    checkForUpdates: settings.checkForUpdates,
    openLatestRelease: settings.openLatestRelease,
  }), [
    settings.accountEmail,
    settings.availableModels,
    settings.checkForUpdates,
    settings.currentVersion,
    settings.modelOptions,
    settings.openLatestRelease,
    settings.refreshBootstrap,
    settings.saveSettings,
    settings.saveSettingsModelSelection,
    settings.setSettingsOpen,
    settings.setSettingsSection,
    settings.settingsData,
    settings.settingsError,
    settings.settingsModel,
    settings.settingsOpen,
    settings.settingsReasoning,
    settings.settingsReasoningOptions,
    settings.settingsSaving,
    settings.settingsSection,
    settings.settingsServiceTier,
    settings.teamSetup,
    settings.tenant,
    settings.updateState,
  ]);

  return {
    leftSidebarProps,
    resetToStartSurface,
    settingsModalProps,
  };
}
