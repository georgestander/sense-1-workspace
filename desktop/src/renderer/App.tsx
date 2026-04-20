import { useEffect, useRef, useState } from "react";

import { useDesktopSessionState } from "./use-desktop-session-state.js";
import { useSettingsController } from "./features/settings/use-settings-controller.js";
import { useAuthenticatedDesktopApp } from "./features/app/use-authenticated-desktop-app.js";
import { useDesktopManagement } from "./features/management/use-desktop-management.js";
import { useDesktopAutomations } from "./features/automation/use-desktop-automations.js";
import { useReportBugController } from "./features/bug-report/use-report-bug-controller.js";
import { perfCount } from "./lib/perf-debug.ts";

import { AutomationsPage } from "./components/AutomationsPage";
import { AuthScreens } from "./components/AuthScreens";
import { DesktopAuthenticatedShell } from "./components/DesktopAuthenticatedShell";
import { PluginsPage } from "./components/PluginsPage";
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
      openAutomations: () => setActiveView("automations"),
      openPlugins: () => setActiveView("plugins"),
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

  const createPluginPrompt = "$plugin-creator scaffold a new Sense-1 Workspace profile plugin and explain the inputs you need.";
  const createSkillPrompt = "$skill-creator create a new Sense-1 Workspace profile skill and keep the flow native to Codex.";
  const showHomeRightRail = shouldShowHomeRightRail(activeView, sessionState.showRightRail);

  const mainContent = activeView === "plugins"
    ? (
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
    )
    : activeView === "automations"
      ? (
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
      )
      : sessionState.selectedThread && threadViewProps
        ? <ThreadView {...threadViewProps} />
        : <StartSurface {...startSurfaceProps} />;

  return (
    <DesktopAuthenticatedShell
      showInstallUpdateAction={showInstallUpdateAction}
      onInstallReadyUpdate={() => {
        void sessionState.installReadyUpdate();
      }}
      leftRailOpen={leftRailOpen}
      onToggleLeftRail={() => setLeftRailOpen((value) => !value)}
      onResetToStartSurface={() => {
        setActiveView("home");
        resetToStartSurface();
      }}
      showRightRail={showHomeRightRail}
      rightRailOpen={rightRailOpen}
      onToggleRightRail={() => setRightRailOpen((value) => !value)}
      runtimeStatus={sessionState.runtimeStatus}
      leftSidebarProps={leftSidebarProps}
      mainContent={mainContent}
      rightRailProps={{ ...rightRailProps, showRightRail: showHomeRightRail }}
      settingsModalProps={settingsModalProps}
      reportBugController={reportBug}
    />
  );
}
