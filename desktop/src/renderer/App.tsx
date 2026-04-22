import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDesktopSessionState } from "./use-desktop-session-state.js";
import { useSettingsController } from "./features/settings/use-settings-controller.js";
import { useAuthenticatedDesktopApp } from "./features/app/use-authenticated-desktop-app.js";
import { useDesktopManagement } from "./features/management/use-desktop-management.js";
import { useDesktopAutomations } from "./features/automation/use-desktop-automations.js";
import { updateReportBugViewContext } from "./features/bug-report/report-bug-correlation.js";
import { useReportBugController } from "./features/bug-report/use-report-bug-controller.js";
import { installPerfTraceMonitor, perfCount } from "./lib/perf-debug.ts";

import { AutomationsPage } from "./components/AutomationsPage";
import { AuthScreens } from "./components/AuthScreens";
import { DesktopAuthenticatedShell } from "./components/DesktopAuthenticatedShell";
import { PluginsPage } from "./components/PluginsPage";
import { ProfileNamingStep } from "./components/ProfileNamingStep";
import { StartSurface } from "./components/StartSurface";
import { ThreadView } from "./components/ThreadView";
import { shouldShowHomeRightRail } from "./features/app/app-view-visibility.js";
import type { DesktopPromptShortcutSuggestion } from "../shared/prompt-shortcuts.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "";
const DEFAULT_REASONING_EFFORT = "";
const DEFAULT_SERVICE_TIER = "flex";

// ---------------------------------------------------------------------------
// App (orchestrator)
// ---------------------------------------------------------------------------

export default function App() {
  perfCount("render.App");
  // ── Local UI state ──
  const previousSelectedThreadIdRef = useRef<string | null>(null);
  const perfTraceContextRef = useRef<Record<string, unknown>>({});
  const [activeView, setActiveView] = useState<"home" | "plugins" | "automations">("home");
  const [leftRailOpen, setLeftRailOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [reasoning, setReasoning] = useState(DEFAULT_REASONING_EFFORT);
  const [serviceTier, setServiceTier] = useState<"flex" | "fast">(DEFAULT_SERVICE_TIER);
  const [workInFolder, setWorkInFolder] = useState(false);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [workspaceFolder, setWorkspaceFolder] = useState<string | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const openAutomations = useCallback(() => setActiveView("automations"), []);
  const openPlugins = useCallback(() => setActiveView("plugins"), []);
  const toggleLeftRail = useCallback(() => setLeftRailOpen((value) => !value), []);
  const toggleRightRail = useCallback(() => setRightRailOpen((value) => !value), []);

  const sessionState = useDesktopSessionState({ model, reasoningEffort: reasoning, serviceTier });
  const settingsController = useSettingsController({
    isSignedIn: sessionState.isSignedIn,
    selectedProfileId: sessionState.selectedProfileId,
    setModel,
    setReasoning,
    setServiceTier,
  });
  const management = useDesktopManagement({
    enabled: !sessionState.bootstrapLoading && !sessionState.runtimeSetup?.blocked,
  });
  const automations = useDesktopAutomations({
    isSignedIn: sessionState.isSignedIn,
  });
  const reportBug = useReportBugController();
  const {
    leftSidebarProps,
    resetToStartSurface,
    rightRailOpen,
    rightRailProps,
    setDraftPrompt,
    setDraftPromptSeed,
    setRightRailOpen,
    setThreadPrompt,
    setThreadPromptSeed,
    settingsModalProps,
    showInstallUpdateAction,
    startSurfaceProps,
    threadViewProps,
  } = useAuthenticatedDesktopApp({
    extensionOverview: management.overview,
    navigation: {
      activeView,
      openAutomations,
      openPlugins,
    },
    sessionState,
    settingsController,
    reportBug,
    ui: {
      accountMenuOpen,
      folderMenuOpen,
      leftRailOpen,
      model,
      reasoning,
      searchQuery,
      serviceTier,
      setAccountMenuOpen,
      setFolderMenuOpen,
      setModel,
      setReasoning,
      setSearchQuery,
      setServiceTier,
      setWorkInFolder,
      setWorkspaceFolder,
      workInFolder,
      workspaceFolder,
    },
  });

  useEffect(() => {
    const previousThreadId = previousSelectedThreadIdRef.current;
    const currentThreadId = sessionState.selectedThreadId;
    if (currentThreadId && currentThreadId !== previousThreadId && activeView !== "home") {
      setActiveView("home");
    }
    previousSelectedThreadIdRef.current = currentThreadId;
  }, [activeView, sessionState.selectedThreadId]);

  useEffect(() => {
    const view =
      activeView === "home"
        ? (sessionState.selectedThreadId ? "thread" : "start")
        : activeView;
    updateReportBugViewContext({
      view,
      selectedThreadId: sessionState.selectedThreadId,
    });
  }, [activeView, sessionState.selectedThreadId]);

  const createPluginPrompt = "$plugin-creator scaffold a new Sense-1 Workspace profile plugin and explain the inputs you need.";
  const createSkillPrompt = "$skill-creator create a new Sense-1 Workspace profile skill and keep the flow native to Codex.";
  const showHomeRightRail = shouldShowHomeRightRail(activeView, sessionState.showRightRail);
  perfTraceContextRef.current = {
    activeView,
    pendingApprovalCount: sessionState.pendingApprovals.length,
    selectedThreadId: sessionState.selectedThreadId,
    showRightRail: sessionState.showRightRail,
    taskPending: sessionState.taskPending,
    threadCount: sessionState.threads.length,
  };

  useEffect(() => installPerfTraceMonitor(() => perfTraceContextRef.current), []);

  const mainContent = useMemo(() => {
    if (activeView === "plugins") {
      return (
        <PluginsPage
          error={management.error}
          loading={management.loading}
          onCreatePlugin={() => {
            setActiveView("home");
            if (sessionState.selectedThread) {
              setThreadPrompt(createPluginPrompt);
              return;
            }
            setDraftPrompt(createPluginPrompt);
          }}
          onCreateSkill={() => {
            setActiveView("home");
            if (sessionState.selectedThread) {
              setThreadPrompt(createSkillPrompt);
              return;
            }
            setDraftPrompt(createSkillPrompt);
          }}
          onRefresh={() => {
            void management.loadOverview(true);
          }}
          onTryInChat={(shortcut: DesktopPromptShortcutSuggestion) => {
            setActiveView("home");
            const prompt = `$${shortcut.token} `;
            if (sessionState.selectedThread) {
              setThreadPromptSeed(prompt, [shortcut.item]);
              return;
            }
            setDraftPromptSeed(prompt, [shortcut.item]);
          }}
          installPlugin={management.installPlugin}
          openAppInstall={management.openAppInstall}
          overview={management.overview}
          removeApp={management.removeApp}
          setAppEnabled={management.setAppEnabled}
          setMcpServerEnabled={management.setMcpServerEnabled}
          setPluginEnabled={management.setPluginEnabled}
          setSkillEnabled={management.setSkillEnabled}
          startMcpServerAuth={management.startMcpServerAuth}
          uninstallPlugin={management.uninstallPlugin}
          uninstallSkill={management.uninstallSkill}
        />
      );
    }

    if (activeView === "automations") {
      return (
        <AutomationsPage
          automations={automations.automations}
          deleteAutomation={automations.deleteAutomation}
          error={automations.error}
          loading={automations.loading}
          projectOptions={sessionState.recentFolders.map((folder) => folder.path)}
          runAutomationNow={automations.runAutomationNow}
          saveAutomation={automations.saveAutomation}
          saving={automations.saving}
          selectedAutomation={automations.selectedAutomation}
          selectedAutomationId={automations.selectedAutomationId}
          setSelectedAutomationId={automations.setSelectedAutomationId}
        />
      );
    }

    if (sessionState.selectedThread && threadViewProps) {
      return <ThreadView {...threadViewProps} />;
    }

    return <StartSurface {...startSurfaceProps} />;
  }, [
    activeView,
    automations.automations,
    automations.deleteAutomation,
    automations.error,
    automations.loading,
    automations.runAutomationNow,
    automations.saveAutomation,
    automations.saving,
    automations.selectedAutomation,
    automations.selectedAutomationId,
    automations.setSelectedAutomationId,
    management.error,
    management.installPlugin,
    management.loadOverview,
    management.loading,
    management.openAppInstall,
    management.overview,
    management.removeApp,
    management.setAppEnabled,
    management.setMcpServerEnabled,
    management.setPluginEnabled,
    management.setSkillEnabled,
    management.startMcpServerAuth,
    management.uninstallPlugin,
    management.uninstallSkill,
    sessionState.recentFolders,
    sessionState.selectedThread,
    setDraftPrompt,
    setDraftPromptSeed,
    setThreadPrompt,
    setThreadPromptSeed,
    startSurfaceProps,
    threadViewProps,
  ]);
  const shellRightRailProps = useMemo(
    () => ({ ...rightRailProps, showRightRail: showHomeRightRail }),
    [rightRailProps, showHomeRightRail],
  );

  // ── Auth gate ──
  if (sessionState.bootstrapLoading || sessionState.runtimeSetup?.blocked || !sessionState.isSignedIn) {
    return (
      <AuthScreens
        bootstrapLoading={sessionState.bootstrapLoading}
        runtimeSetup={sessionState.runtimeSetup}
        isSignedIn={sessionState.isSignedIn}
        accountEmail={sessionState.accountEmail ?? ""}
        handleStartAuthLogin={sessionState.handleStartAuthLogin}
        authPendingMethod={sessionState.authPendingMethod}
        signInPending={sessionState.signInPending}
        bootstrapError={sessionState.bootstrapError}
        runtimeStatus={sessionState.runtimeStatus}
        providerState={management.overview?.provider ?? null}
        refreshBootstrap={sessionState.refreshBootstrap}
      />
    );
  }

  if (sessionState.identity?.needsDisplayName) {
    return (
      <ProfileNamingStep
        inferredDisplayName={sessionState.identity.inferredDisplayName}
        submitting={sessionState.identityCompletionPending}
        errorMessage={sessionState.identityCompletionError}
        runtimeStatus={sessionState.runtimeStatus}
        onSubmit={sessionState.handleCompleteDisplayName}
      />
    );
  }

  return (
    <DesktopAuthenticatedShell
      showInstallUpdateAction={showInstallUpdateAction}
      onInstallReadyUpdate={() => {
        void sessionState.installReadyUpdate();
      }}
      leftRailOpen={leftRailOpen}
      onToggleLeftRail={toggleLeftRail}
      onResetToStartSurface={() => {
        setActiveView("home");
        resetToStartSurface();
      }}
      showRightRail={showHomeRightRail}
      rightRailOpen={rightRailOpen}
      onToggleRightRail={toggleRightRail}
      runtimeStatus={sessionState.runtimeStatus}
      leftSidebarProps={leftSidebarProps}
      mainContent={mainContent}
      rightRailProps={shellRightRailProps}
      settingsModalProps={settingsModalProps}
      reportBugController={reportBug}
    />
  );
}
