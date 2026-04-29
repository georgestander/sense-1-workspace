import type { DesktopBootstrap } from "./bootstrap.js";
import type {
  DesktopBrowserBoundsRequest,
  DesktopBrowserConsoleResult,
  DesktopBrowserInspectRequest,
  DesktopBrowserInspectResult,
  DesktopBrowserNavigateRequest,
  DesktopBrowserOpenRequest,
  DesktopBrowserPointRequest,
  DesktopBrowserScreenshotRequest,
  DesktopBrowserScreenshotResult,
  DesktopBrowserState,
  DesktopBrowserThreadRequest,
  DesktopBrowserTrustCheckRequest,
  DesktopBrowserTrustCheckResult,
  DesktopBrowserTrustRequest,
  DesktopBrowserTrustState,
  DesktopBrowserTypeRequest,
  DesktopBrowserNetworkResult,
  DesktopBrowserViewportRequest,
} from "./browser.js";
import type {
  DesktopBugReportDraft,
  DesktopBugReportResult,
  DesktopBugReportingStatus,
  DesktopCrashReportAcknowledgeRequest,
  DesktopCrashReportAcknowledgeResult,
} from "./bug-reporting.js";
import type {
  DesktopAutomationDeleteRequest,
  DesktopAutomationDetailResult,
  DesktopAutomationListResult,
  DesktopAutomationRunNowRequest,
  DesktopAutomationSaveRequest,
  DesktopAutomationRecord,
} from "./automations.js";
import type { DesktopApprovalResponseRequest, DesktopInputResponseRequest, DesktopInterruptTurnRequest, DesktopQueueTurnInputRequest, DesktopRuntimeEvent, DesktopSteerTurnRequest, DesktopSteerTurnResult, DesktopTaskRunRequest, DesktopTaskRunResult } from "./events.js";
import type {
  DesktopAppRemoveRequest,
  DesktopAppInstallRequest,
  DesktopAppEnabledRequest,
  DesktopMcpServerAuthRequest,
  DesktopMcpServerAuthResult,
  DesktopExtensionOverviewRequest,
  DesktopExtensionOverviewResult,
  DesktopMcpServerEnabledRequest,
  DesktopPluginDetailRequest,
  DesktopPluginDetailResult,
  DesktopPluginInstallRequest,
  DesktopPluginUninstallRequest,
  DesktopPluginEnabledRequest,
  DesktopSkillDetailRequest,
  DesktopSkillDetailResult,
  DesktopSkillEnabledRequest,
  DesktopSkillUninstallRequest,
} from "./management.js";
import type { DesktopModelListResult } from "./models.js";
import type { ProjectedSessionsRequest, ProjectedSessionsResult, ProjectedWorkspaceByRootRequest, ProjectedWorkspaceDetailResult, ProjectedWorkspacesRequest, ProjectedWorkspacesResult } from "./projections.js";
import type { RuntimeInfo } from "./runtime.js";
import type { DesktopPolicyRulesResult, DesktopSettingsResult, DesktopSettingsUpdateRequest } from "./settings.js";
import type {
  DesktopCreateFirstTeamRequest,
  DesktopRemoveTeamMemberRequest,
  DesktopSaveTeamMemberRequest,
  DesktopTeamStateResult,
} from "./tenant.js";
import type {
  DesktopVoiceAppendAudioRequest,
  DesktopVoiceStartRequest,
  DesktopVoiceStopRequest,
} from "./voice.js";
import type { DesktopThreadArchiveRequest, DesktopThreadDeleteRequest, DesktopThreadRenameRequest, DesktopThreadRestoreRequest, DesktopThreadWorkspaceRootRequest, DesktopWorkspaceArchiveRequest, DesktopWorkspaceDeleteRequest, DesktopWorkspaceHydrateResult, DesktopWorkspaceOperatingModeRequest, DesktopWorkspacePermissionGrantRequest, DesktopWorkspacePolicyRequest, DesktopWorkspacePolicyResult, DesktopWorkspaceRestoreRequest, DesktopWorkspaceSidebarOrderRequest } from "./workspace.js";
import type { SubstrateEventsBySessionRequest, SubstrateEventsResult, SubstrateObjectRefsBySessionRequest, SubstrateObjectRefsResult, SubstrateRecentSessionsRequest, SubstrateRecentWorkspacesRequest, SubstrateSessionDetailRequest, SubstrateSessionDetailResult, SubstrateSessionsByWorkspaceRequest, SubstrateSessionsResult, SubstrateWorkspaceDetailRequest, SubstrateWorkspaceDetailResult, SubstrateWorkspacesResult } from "./substrate.js";
import type { DesktopAuthLoginRequest, DesktopAuthLogoutResult, DesktopAuthStartResult, SelectDesktopProfileResult, WindowActionResult, WindowToggleResult, WorkspaceFolderPickerResult } from "./bootstrap.js";
import type { DesktopCompleteDisplayNameRequest, DesktopCompleteDisplayNameResult } from "./identity.js";
import type { DesktopThreadDelta } from "./thread.js";
import { DESKTOP_BRIDGE_API_VERSION } from "./runtime.js";

export interface DesktopBridge {
  readonly apiVersion: typeof DESKTOP_BRIDGE_API_VERSION;
  runtime: {
    getInfo(): Promise<RuntimeInfo>;
  };
  updates: {
    getState(): Promise<import("./runtime.js").DesktopUpdateState>;
    check(): Promise<import("./runtime.js").DesktopUpdateState>;
    install(): Promise<void>;
    openLatestRelease(): Promise<void>;
  };
  session: {
    get(): Promise<DesktopBootstrap>;
    subscribe(listener: (bootstrap: DesktopBootstrap) => void): () => void;
    onRuntimeEvent(listener: (event: DesktopRuntimeEvent) => void): () => void;
  };
  auth: {
    startLogin(request: DesktopAuthLoginRequest): Promise<DesktopAuthStartResult>;
    logout(): Promise<DesktopAuthLogoutResult>;
  };
  profiles: {
    select(profileId: string): Promise<SelectDesktopProfileResult>;
  };
  profile: {
    completeDisplayName(request: DesktopCompleteDisplayNameRequest): Promise<DesktopCompleteDisplayNameResult>;
  };
  threads: {
    rememberLastSelected(request: import("./workspace.js").DesktopLastSelectedThreadRequest): Promise<void>;
    rename(request: DesktopThreadRenameRequest): Promise<void>;
    archive(request: DesktopThreadArchiveRequest): Promise<void>;
    restore(request: DesktopThreadRestoreRequest): Promise<void>;
    delete(request: DesktopThreadDeleteRequest): Promise<void>;
    onDelta(listener: (delta: DesktopThreadDelta) => void): () => void;
  };
  turns: {
    run(request: DesktopTaskRunRequest): Promise<DesktopTaskRunResult>;
    interrupt(request: DesktopInterruptTurnRequest): Promise<void>;
    steer(request: DesktopSteerTurnRequest): Promise<DesktopSteerTurnResult>;
    queue(request: DesktopQueueTurnInputRequest): Promise<void>;
  };
  approvals: {
    respond(request: DesktopApprovalResponseRequest): Promise<void>;
  };
  models: {
    list(): Promise<DesktopModelListResult>;
  };
  input: {
    respond(request: DesktopInputResponseRequest): Promise<void>;
  };
  reports: {
    submit(request: DesktopBugReportDraft): Promise<DesktopBugReportResult>;
    getStatus(): Promise<DesktopBugReportingStatus>;
    acknowledgeCrashReport(request: DesktopCrashReportAcknowledgeRequest): Promise<DesktopCrashReportAcknowledgeResult>;
  };
  voice: {
    start(request: DesktopVoiceStartRequest): Promise<void>;
    appendAudio(request: DesktopVoiceAppendAudioRequest): Promise<void>;
    stop(request: DesktopVoiceStopRequest): Promise<void>;
  };
  workspace: {
    pickFolder(): Promise<WorkspaceFolderPickerResult>;
    pickFiles(): Promise<import("./workspace.js").FilePickerResult>;
    archive(request: DesktopWorkspaceArchiveRequest): Promise<void>;
    restore(request: DesktopWorkspaceRestoreRequest): Promise<void>;
    delete(request: DesktopWorkspaceDeleteRequest): Promise<void>;
    getPolicy(request: DesktopWorkspacePolicyRequest): Promise<DesktopWorkspacePolicyResult>;
    hydrate(request: DesktopWorkspacePolicyRequest): Promise<DesktopWorkspaceHydrateResult>;
    grantPermission(request: DesktopWorkspacePermissionGrantRequest): Promise<DesktopWorkspacePolicyResult>;
    setOperatingMode(request: DesktopWorkspaceOperatingModeRequest): Promise<DesktopWorkspacePolicyResult>;
    rememberThreadRoot(request: DesktopThreadWorkspaceRootRequest): Promise<void>;
    rememberSidebarOrder(request: DesktopWorkspaceSidebarOrderRequest): Promise<void>;
    openFilePath(filePath: string): Promise<void>;
  };
  settings: {
    get(): Promise<DesktopSettingsResult>;
    getPolicyRules(): Promise<DesktopPolicyRulesResult>;
    update(request: DesktopSettingsUpdateRequest): Promise<DesktopSettingsResult>;
  };
  management: {
    getOverview(request?: DesktopExtensionOverviewRequest): Promise<DesktopExtensionOverviewResult>;
    readPluginDetail(request: DesktopPluginDetailRequest): Promise<DesktopPluginDetailResult>;
    installPlugin(request: DesktopPluginInstallRequest): Promise<DesktopExtensionOverviewResult>;
    uninstallPlugin(request: DesktopPluginUninstallRequest): Promise<DesktopExtensionOverviewResult>;
    setPluginEnabled(request: DesktopPluginEnabledRequest): Promise<DesktopExtensionOverviewResult>;
    openAppInstall(request: DesktopAppInstallRequest): Promise<DesktopExtensionOverviewResult>;
    removeApp(request: DesktopAppRemoveRequest): Promise<DesktopExtensionOverviewResult>;
    setAppEnabled(request: DesktopAppEnabledRequest): Promise<DesktopExtensionOverviewResult>;
    startMcpServerAuth(request: DesktopMcpServerAuthRequest): Promise<DesktopMcpServerAuthResult>;
    setMcpServerEnabled(request: DesktopMcpServerEnabledRequest): Promise<DesktopExtensionOverviewResult>;
    readSkillDetail(request: DesktopSkillDetailRequest): Promise<DesktopSkillDetailResult>;
    setSkillEnabled(request: DesktopSkillEnabledRequest): Promise<DesktopExtensionOverviewResult>;
    uninstallSkill(request: DesktopSkillUninstallRequest): Promise<DesktopExtensionOverviewResult>;
  };
  team: {
    getState(): Promise<DesktopTeamStateResult>;
    createFirstTeam(request: DesktopCreateFirstTeamRequest): Promise<DesktopTeamStateResult>;
    saveMember(request: DesktopSaveTeamMemberRequest): Promise<DesktopTeamStateResult>;
    removeMember(request: DesktopRemoveTeamMemberRequest): Promise<DesktopTeamStateResult>;
  };
  automations: {
    list(): Promise<DesktopAutomationListResult>;
    get(id: string): Promise<DesktopAutomationDetailResult>;
    save(request: DesktopAutomationSaveRequest): Promise<DesktopAutomationDetailResult>;
    delete(request: DesktopAutomationDeleteRequest): Promise<void>;
    runNow(request: DesktopAutomationRunNowRequest): Promise<DesktopAutomationDetailResult>;
  };
  projections: {
    workspaces(request: ProjectedWorkspacesRequest): Promise<ProjectedWorkspacesResult>;
    workspaceByRoot(request: ProjectedWorkspaceByRootRequest): Promise<ProjectedWorkspaceDetailResult>;
    sessions(request: ProjectedSessionsRequest): Promise<ProjectedSessionsResult>;
  };
  substrate: {
    recentWorkspaces(request: SubstrateRecentWorkspacesRequest): Promise<SubstrateWorkspacesResult>;
    recentSessions(request: SubstrateRecentSessionsRequest): Promise<SubstrateSessionsResult>;
    sessionsByWorkspace(request: SubstrateSessionsByWorkspaceRequest): Promise<SubstrateSessionsResult>;
    sessionDetail(request: SubstrateSessionDetailRequest): Promise<SubstrateSessionDetailResult>;
    workspaceDetail(request: SubstrateWorkspaceDetailRequest): Promise<SubstrateWorkspaceDetailResult>;
    eventsBySession(request: SubstrateEventsBySessionRequest): Promise<SubstrateEventsResult>;
    objectRefsBySession(request: SubstrateObjectRefsBySessionRequest): Promise<SubstrateObjectRefsResult>;
  };
  window: {
    minimize(): Promise<WindowActionResult>;
    toggleMaximize(): Promise<WindowToggleResult>;
    close(): Promise<WindowActionResult>;
    openExternalUrl(url: string): Promise<void>;
  };
  browser: {
    open(request: DesktopBrowserOpenRequest): Promise<DesktopBrowserState>;
    close(request: DesktopBrowserThreadRequest): Promise<void>;
    setBounds(request: DesktopBrowserBoundsRequest): Promise<void>;
    navigate(request: DesktopBrowserNavigateRequest): Promise<DesktopBrowserState>;
    goBack(request: DesktopBrowserThreadRequest): Promise<DesktopBrowserState>;
    goForward(request: DesktopBrowserThreadRequest): Promise<DesktopBrowserState>;
    reload(request: DesktopBrowserThreadRequest): Promise<DesktopBrowserState>;
    stop(request: DesktopBrowserThreadRequest): Promise<DesktopBrowserState>;
    setViewport(request: DesktopBrowserViewportRequest): Promise<DesktopBrowserState>;
    screenshot(request: DesktopBrowserScreenshotRequest): Promise<DesktopBrowserScreenshotResult>;
    inspect(request: DesktopBrowserInspectRequest): Promise<DesktopBrowserInspectResult>;
    click(request: DesktopBrowserPointRequest): Promise<DesktopBrowserState>;
    type(request: DesktopBrowserTypeRequest): Promise<DesktopBrowserState>;
    console(request: DesktopBrowserThreadRequest): Promise<DesktopBrowserConsoleResult>;
    network(request: DesktopBrowserThreadRequest): Promise<DesktopBrowserNetworkResult>;
    checkTrust(request: DesktopBrowserTrustCheckRequest): Promise<DesktopBrowserTrustCheckResult>;
    updateTrust(request: DesktopBrowserTrustRequest): Promise<DesktopBrowserTrustState>;
    getTrustState(): Promise<DesktopBrowserTrustState>;
  };
}
