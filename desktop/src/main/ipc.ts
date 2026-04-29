import { ipcMain } from "electron";

import { registerDesktopShellHandlers } from "./ipc/desktop-shell-handlers";
import { getMainWindow } from "./window";
import {
  type DesktopAppRemoveRequest,
  type DesktopAppInstallRequest,
  type DesktopAppEnabledRequest,
  type DesktopAuthLoginRequest,
  type DesktopAuthLogoutResult,
  type DesktopAuthStartResult,
  type DesktopBugReportDraft,
  type DesktopCompleteDisplayNameRequest,
  type DesktopCompleteDisplayNameResult,
  type DesktopBugReportResult,
  type DesktopBugReportingStatus,
  type DesktopCrashReportAcknowledgeRequest,
  type DesktopCrashReportAcknowledgeResult,
  type DesktopMcpServerAuthRequest,
  type DesktopMcpServerAuthResult,
  type DesktopAutomationDeleteRequest,
  type DesktopAutomationDetailResult,
  type DesktopAutomationListResult,
  type DesktopAutomationRunNowRequest,
  type DesktopAutomationSaveRequest,
  type DesktopBrowserBoundsRequest,
  type DesktopBrowserConsoleResult,
  type DesktopBrowserInspectRequest,
  type DesktopBrowserInspectResult,
  type DesktopBrowserNavigateRequest,
  type DesktopBrowserNetworkResult,
  type DesktopBrowserOpenRequest,
  type DesktopBrowserPointRequest,
  type DesktopBrowserScreenshotRequest,
  type DesktopBrowserScreenshotResult,
  type DesktopBrowserState,
  type DesktopBrowserThreadRequest,
  type DesktopBrowserTrustCheckRequest,
  type DesktopBrowserTrustCheckResult,
  type DesktopBrowserTrustRequest,
  type DesktopBrowserTrustState,
  type DesktopBrowserTypeRequest,
  type DesktopBrowserViewportRequest,
  type DesktopApprovalResponseRequest,
  type DesktopExtensionOverviewRequest,
  type DesktopExtensionOverviewResult,
  type DesktopInputResponseRequest,
  type DesktopInterruptTurnRequest,
  type DesktopMcpServerEnabledRequest,
  type DesktopPluginDetailRequest,
  type DesktopPluginDetailResult,
  type DesktopPolicyRulesResult,
  type DesktopPluginEnabledRequest,
  type DesktopPluginInstallRequest,
  type DesktopPluginUninstallRequest,
  type DesktopQueueTurnInputRequest,
  type DesktopSkillUninstallRequest,
  type DesktopSkillDetailRequest,
  type DesktopSkillDetailResult,
  type DesktopSkillEnabledRequest,
  type DesktopSteerTurnRequest,
  type DesktopSteerTurnResult,
  type DesktopSettingsResult,
  type DesktopSettingsUpdateRequest,
  type DesktopCreateFirstTeamRequest,
  type DesktopSaveTeamMemberRequest,
  type DesktopRemoveTeamMemberRequest,
  type DesktopTeamStateResult,
  IPC_CHANNELS,
  type DesktopBootstrap,
  type DesktopLastSelectedThreadRequest,
  type DesktopModelListResult,
  type DesktopRuntimeEvent,
  type DesktopThreadDelta,
  type DesktopUpdateState,
  type DesktopVoiceAppendAudioRequest,
  type DesktopVoiceStartRequest,
  type DesktopVoiceStopRequest,
  type DesktopThreadArchiveRequest,
  type DesktopThreadDeleteRequest,
  type DesktopThreadRenameRequest,
  type DesktopThreadRestoreRequest,
  type DesktopTaskRunRequest,
  type DesktopTaskRunResult,
  type DesktopThreadReadResult,
  type DesktopThreadWorkspaceRootRequest,
  type DesktopWorkspaceArchiveRequest,
  type DesktopWorkspaceDeleteRequest,
  type DesktopWorkspaceHydrateResult,
  type DesktopWorkspaceOperatingModeRequest,
  type DesktopWorkspacePermissionGrantRequest,
  type DesktopWorkspacePolicyRequest,
  type DesktopWorkspacePolicyResult,
  type DesktopWorkspaceRestoreRequest,
  type DesktopWorkspaceSidebarOrderRequest,
  type ProjectedWorkspacesRequest,
  type ProjectedWorkspacesResult,
  type ProjectedWorkspaceByRootRequest,
  type ProjectedWorkspaceDetailResult,
  type ProjectedSessionsRequest,
  type ProjectedSessionsResult,
  type RuntimeInfoResult,
  type SelectDesktopProfileResult,
  type SubstrateEventsResult,
  type SubstrateEventsBySessionRequest,
  type SubstrateObjectRefsBySessionRequest,
  type SubstrateObjectRefsResult,
  type SubstrateRecentSessionsRequest,
  type SubstrateRecentWorkspacesRequest,
  type SubstrateSessionDetailRequest,
  type SubstrateSessionDetailResult,
  type SubstrateSessionsByWorkspaceRequest,
  type SubstrateSessionsResult,
  type SubstrateWorkspaceDetailRequest,
  type SubstrateWorkspaceDetailResult,
  type SubstrateWorkspacesResult,
} from "../shared/contracts/index";

let desktopIpcHandlersRegistered = false;
const THREAD_DELTA_FLUSH_MS = 16;
let pendingThreadDeltas: DesktopThreadDelta[] = [];
let pendingThreadDeltaFlushTimer: NodeJS.Timeout | null = null;

type DesktopIpcServices = {
  getBootstrap(): Promise<DesktopBootstrap>;
  submitDesktopBugReport(request: DesktopBugReportDraft): Promise<DesktopBugReportResult>;
  getDesktopBugReportingStatus(): Promise<DesktopBugReportingStatus>;
  acknowledgeDesktopCrashReport(request: DesktopCrashReportAcknowledgeRequest): Promise<DesktopCrashReportAcknowledgeResult>;
  getRuntimeInfo(): RuntimeInfoResult;
  getUpdateState(): Promise<DesktopUpdateState>;
  checkForUpdates(): Promise<DesktopUpdateState>;
  installUpdate(): Promise<void>;
  openLatestRelease(): Promise<void>;
  startDesktopAuthLogin(request: DesktopAuthLoginRequest): Promise<DesktopAuthStartResult>;
  logoutDesktopAuth(): Promise<DesktopAuthLogoutResult>;
  rememberLastSelectedThread(request: DesktopLastSelectedThreadRequest): Promise<void>;
  renameDesktopThread(request: DesktopThreadRenameRequest): Promise<void>;
  archiveDesktopThread(request: DesktopThreadArchiveRequest): Promise<void>;
  restoreDesktopThread(request: DesktopThreadRestoreRequest): Promise<void>;
  deleteDesktopThread(request: DesktopThreadDeleteRequest): Promise<void>;
  readDesktopThread(threadId: string): Promise<DesktopThreadReadResult>;
  rememberThreadWorkspaceRoot(request: DesktopThreadWorkspaceRootRequest): Promise<void>;
  rememberWorkspaceSidebarOrder(request: DesktopWorkspaceSidebarOrderRequest): Promise<void>;
  runDesktopTask(request: DesktopTaskRunRequest): Promise<DesktopTaskRunResult>;
  interruptTurn(request: DesktopInterruptTurnRequest): Promise<void>;
  steerTurn(threadId: string, input: string): Promise<DesktopSteerTurnResult>;
  queueTurnInput(request: DesktopQueueTurnInputRequest): Promise<void>;
  respondToDesktopApproval(request: DesktopApprovalResponseRequest): Promise<void>;
  selectDesktopProfile(profileId: string): Promise<SelectDesktopProfileResult>;
  completeDesktopDisplayName(request: DesktopCompleteDisplayNameRequest): Promise<DesktopCompleteDisplayNameResult>;
  listModels(): Promise<DesktopModelListResult>;
  respondToInputRequest(request: DesktopInputResponseRequest): Promise<void>;
  startDesktopVoice(request: DesktopVoiceStartRequest): Promise<void>;
  appendDesktopVoiceAudio(request: DesktopVoiceAppendAudioRequest): Promise<void>;
  stopDesktopVoice(request: DesktopVoiceStopRequest): Promise<void>;
  rememberWorkspaceFolder(folderPath: string): Promise<void>;
  archiveWorkspace(request: DesktopWorkspaceArchiveRequest): Promise<void>;
  restoreWorkspace(request: DesktopWorkspaceRestoreRequest): Promise<void>;
  deleteWorkspace(request: DesktopWorkspaceDeleteRequest): Promise<void>;
  getWorkspacePolicy(request: DesktopWorkspacePolicyRequest): Promise<DesktopWorkspacePolicyResult>;
  hydrateWorkspace(request: DesktopWorkspacePolicyRequest): Promise<DesktopWorkspaceHydrateResult>;
  grantWorkspacePermission(request: DesktopWorkspacePermissionGrantRequest): Promise<DesktopWorkspacePolicyResult>;
  setWorkspaceOperatingMode(request: DesktopWorkspaceOperatingModeRequest): Promise<DesktopWorkspacePolicyResult>;
  getDesktopSettings(): Promise<DesktopSettingsResult>;
  getDesktopPolicyRules(): Promise<DesktopPolicyRulesResult>;
  updateDesktopSettings(request: DesktopSettingsUpdateRequest): Promise<DesktopSettingsResult>;
  getDesktopExtensionOverview(request?: DesktopExtensionOverviewRequest): Promise<DesktopExtensionOverviewResult>;
  readDesktopPluginDetail(request: DesktopPluginDetailRequest): Promise<DesktopPluginDetailResult>;
  installDesktopPlugin(request: DesktopPluginInstallRequest): Promise<DesktopExtensionOverviewResult>;
  uninstallDesktopPlugin(request: DesktopPluginUninstallRequest): Promise<DesktopExtensionOverviewResult>;
  setDesktopPluginEnabled(request: DesktopPluginEnabledRequest): Promise<DesktopExtensionOverviewResult>;
  openDesktopAppInstall(request: DesktopAppInstallRequest): Promise<DesktopExtensionOverviewResult>;
  removeDesktopApp(request: DesktopAppRemoveRequest): Promise<DesktopExtensionOverviewResult>;
  setDesktopAppEnabled(request: DesktopAppEnabledRequest): Promise<DesktopExtensionOverviewResult>;
  startDesktopMcpServerAuth(request: DesktopMcpServerAuthRequest): Promise<DesktopMcpServerAuthResult>;
  setDesktopMcpServerEnabled(request: DesktopMcpServerEnabledRequest): Promise<DesktopExtensionOverviewResult>;
  readDesktopSkillDetail(request: DesktopSkillDetailRequest): Promise<DesktopSkillDetailResult>;
  setDesktopSkillEnabled(request: DesktopSkillEnabledRequest): Promise<DesktopExtensionOverviewResult>;
  uninstallDesktopSkill(request: DesktopSkillUninstallRequest): Promise<DesktopExtensionOverviewResult>;
  getDesktopTeamState(): Promise<DesktopTeamStateResult>;
  createDesktopFirstTeam(request: DesktopCreateFirstTeamRequest): Promise<DesktopTeamStateResult>;
  saveDesktopTeamMember(request: DesktopSaveTeamMemberRequest): Promise<DesktopTeamStateResult>;
  removeDesktopTeamMember(request: DesktopRemoveTeamMemberRequest): Promise<DesktopTeamStateResult>;
  listDesktopAutomations(): Promise<DesktopAutomationListResult>;
  getDesktopAutomation(id: string): Promise<DesktopAutomationDetailResult>;
  saveDesktopAutomation(request: DesktopAutomationSaveRequest): Promise<DesktopAutomationDetailResult>;
  deleteDesktopAutomation(request: DesktopAutomationDeleteRequest): Promise<void>;
  runDesktopAutomationNow(request: DesktopAutomationRunNowRequest): Promise<DesktopAutomationDetailResult>;
  substrateRecentWorkspaces(request: SubstrateRecentWorkspacesRequest): Promise<SubstrateWorkspacesResult>;
  substrateRecentSessions(request: SubstrateRecentSessionsRequest): Promise<SubstrateSessionsResult>;
  substrateSessionsByWorkspace(request: SubstrateSessionsByWorkspaceRequest): Promise<SubstrateSessionsResult>;
  substrateSessionDetail(request: SubstrateSessionDetailRequest): Promise<SubstrateSessionDetailResult>;
  substrateWorkspaceDetail(request: SubstrateWorkspaceDetailRequest): Promise<SubstrateWorkspaceDetailResult>;
  substrateEventsBySession(request: SubstrateEventsBySessionRequest): Promise<SubstrateEventsResult>;
  substrateObjectRefsBySession(request: SubstrateObjectRefsBySessionRequest): Promise<SubstrateObjectRefsResult>;
  projectedWorkspaces(request: ProjectedWorkspacesRequest): Promise<ProjectedWorkspacesResult>;
  projectedWorkspaceByRoot(request: ProjectedWorkspaceByRootRequest): Promise<ProjectedWorkspaceDetailResult>;
  projectedSessions(request: ProjectedSessionsRequest): Promise<ProjectedSessionsResult>;
  browserOpen(request: DesktopBrowserOpenRequest): Promise<DesktopBrowserState>;
  browserClose(request: DesktopBrowserThreadRequest): Promise<void>;
  browserSetBounds(request: DesktopBrowserBoundsRequest): Promise<void>;
  browserNavigate(request: DesktopBrowserNavigateRequest): Promise<DesktopBrowserState>;
  browserGoBack(request: DesktopBrowserThreadRequest): Promise<DesktopBrowserState>;
  browserGoForward(request: DesktopBrowserThreadRequest): Promise<DesktopBrowserState>;
  browserReload(request: DesktopBrowserThreadRequest): Promise<DesktopBrowserState>;
  browserStop(request: DesktopBrowserThreadRequest): Promise<DesktopBrowserState>;
  browserSetViewport(request: DesktopBrowserViewportRequest): Promise<DesktopBrowserState>;
  browserScreenshot(request: DesktopBrowserScreenshotRequest): Promise<DesktopBrowserScreenshotResult>;
  browserInspect(request: DesktopBrowserInspectRequest): Promise<DesktopBrowserInspectResult>;
  browserClick(request: DesktopBrowserPointRequest): Promise<DesktopBrowserState>;
  browserType(request: DesktopBrowserTypeRequest): Promise<DesktopBrowserState>;
  browserConsole(request: DesktopBrowserThreadRequest): Promise<DesktopBrowserConsoleResult>;
  browserNetwork(request: DesktopBrowserThreadRequest): Promise<DesktopBrowserNetworkResult>;
  browserTrustCheck(request: DesktopBrowserTrustCheckRequest): Promise<DesktopBrowserTrustCheckResult>;
  browserTrustUpdate(request: DesktopBrowserTrustRequest): Promise<DesktopBrowserTrustState>;
  browserTrustState(): Promise<DesktopBrowserTrustState>;
};

export function registerDesktopIpcHandlers(services: DesktopIpcServices): void {
  if (desktopIpcHandlersRegistered) {
    return;
  }

  registerDesktopShellHandlers(services);

  ipcMain.handle(IPC_CHANNELS.runtimeInfo, (): RuntimeInfoResult => services.getRuntimeInfo());

  ipcMain.handle(IPC_CHANNELS.getUpdateState, async (): Promise<DesktopUpdateState> => {
    return await services.getUpdateState();
  });

  ipcMain.handle(IPC_CHANNELS.checkForUpdates, async (): Promise<DesktopUpdateState> => {
    return await services.checkForUpdates();
  });

  ipcMain.handle(IPC_CHANNELS.installUpdate, async (): Promise<void> => {
    await services.installUpdate();
  });

  ipcMain.handle(IPC_CHANNELS.openLatestRelease, async (): Promise<void> => {
    await services.openLatestRelease();
  });

  ipcMain.handle(IPC_CHANNELS.getDesktopBootstrap, async (): Promise<DesktopBootstrap> => {
    return await services.getBootstrap();
  });

  ipcMain.handle(
    IPC_CHANNELS.submitDesktopBugReport,
    async (_event, request: DesktopBugReportDraft): Promise<DesktopBugReportResult> => {
      return await services.submitDesktopBugReport(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.getDesktopBugReportingStatus,
    async (): Promise<DesktopBugReportingStatus> => {
      return await services.getDesktopBugReportingStatus();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.acknowledgeDesktopCrashReport,
    async (_event, request: DesktopCrashReportAcknowledgeRequest): Promise<DesktopCrashReportAcknowledgeResult> => {
      return await services.acknowledgeDesktopCrashReport(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.rememberLastSelectedThread,
    async (_event, request: DesktopLastSelectedThreadRequest): Promise<void> => {
      await services.rememberLastSelectedThread(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.renameDesktopThread,
    async (_event, request: DesktopThreadRenameRequest): Promise<void> => {
      await services.renameDesktopThread(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.archiveDesktopThread,
    async (_event, request: DesktopThreadArchiveRequest): Promise<void> => {
      await services.archiveDesktopThread(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.restoreDesktopThread,
    async (_event, request: DesktopThreadRestoreRequest): Promise<void> => {
      await services.restoreDesktopThread(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.deleteDesktopThread,
    async (_event, request: DesktopThreadDeleteRequest): Promise<void> => {
      await services.deleteDesktopThread(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.rememberThreadWorkspaceRoot,
    async (_event, request: DesktopThreadWorkspaceRootRequest): Promise<void> => {
      await services.rememberThreadWorkspaceRoot(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.rememberWorkspaceSidebarOrder,
    async (_event, request: DesktopWorkspaceSidebarOrderRequest): Promise<void> => {
      await services.rememberWorkspaceSidebarOrder(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.readDesktopThread,
    async (_event, threadId: string): Promise<DesktopThreadReadResult> => {
      return await services.readDesktopThread(threadId);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.runDesktopTask,
    async (_event, request: DesktopTaskRunRequest): Promise<DesktopTaskRunResult> => {
      return await services.runDesktopTask(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.interruptDesktopTurn,
    async (_event, request: DesktopInterruptTurnRequest): Promise<void> => {
      await services.interruptTurn(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.steerTurn,
    async (_event, request: DesktopSteerTurnRequest): Promise<DesktopSteerTurnResult> => {
      return await services.steerTurn(request.threadId, request.input);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.queueTurnInput,
    async (_event, request: DesktopQueueTurnInputRequest): Promise<void> => {
      await services.queueTurnInput(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.respondToDesktopApproval,
    async (_event, request: DesktopApprovalResponseRequest): Promise<void> => {
      await services.respondToDesktopApproval(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.selectDesktopProfile,
    async (_event, profileId: string): Promise<SelectDesktopProfileResult> => {
      return await services.selectDesktopProfile(profileId);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.completeDesktopDisplayName,
    async (_event, request: DesktopCompleteDisplayNameRequest): Promise<DesktopCompleteDisplayNameResult> => {
      return await services.completeDesktopDisplayName(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.startDesktopAuthLogin,
    async (_event, request: DesktopAuthLoginRequest): Promise<DesktopAuthStartResult> => {
      return await services.startDesktopAuthLogin(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.logoutDesktopAuth,
    async (): Promise<DesktopAuthLogoutResult> => {
      return await services.logoutDesktopAuth();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.listModels,
    async (): Promise<DesktopModelListResult> => {
      return await services.listModels();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.respondToInputRequest,
    async (_event, request: DesktopInputResponseRequest): Promise<void> => {
      await services.respondToInputRequest(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.startDesktopVoice,
    async (_event, request: DesktopVoiceStartRequest): Promise<void> => {
      await services.startDesktopVoice(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.appendDesktopVoiceAudio,
    async (_event, request: DesktopVoiceAppendAudioRequest): Promise<void> => {
      await services.appendDesktopVoiceAudio(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.stopDesktopVoice,
    async (_event, request: DesktopVoiceStopRequest): Promise<void> => {
      await services.stopDesktopVoice(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.getDesktopSettings,
    async (): Promise<DesktopSettingsResult> => {
      return await services.getDesktopSettings();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.getDesktopPolicyRules,
    async (): Promise<DesktopPolicyRulesResult> => {
      return await services.getDesktopPolicyRules();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.updateDesktopSettings,
    async (_event, request: DesktopSettingsUpdateRequest): Promise<DesktopSettingsResult> => {
      return await services.updateDesktopSettings(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.getDesktopExtensionOverview,
    async (_event, request?: DesktopExtensionOverviewRequest): Promise<DesktopExtensionOverviewResult> => {
      return await services.getDesktopExtensionOverview(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.readDesktopPluginDetail,
    async (_event, request: DesktopPluginDetailRequest): Promise<DesktopPluginDetailResult> => {
      return await services.readDesktopPluginDetail(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.installDesktopPlugin,
    async (_event, request: DesktopPluginInstallRequest): Promise<DesktopExtensionOverviewResult> => {
      return await services.installDesktopPlugin(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.uninstallDesktopPlugin,
    async (_event, request: DesktopPluginUninstallRequest): Promise<DesktopExtensionOverviewResult> => {
      return await services.uninstallDesktopPlugin(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.setDesktopPluginEnabled,
    async (_event, request: DesktopPluginEnabledRequest): Promise<DesktopExtensionOverviewResult> => {
      return await services.setDesktopPluginEnabled(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.openDesktopAppInstall,
    async (_event, request: DesktopAppInstallRequest): Promise<DesktopExtensionOverviewResult> => {
      return await services.openDesktopAppInstall(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.removeDesktopApp,
    async (_event, request: DesktopAppRemoveRequest): Promise<DesktopExtensionOverviewResult> => {
      return await services.removeDesktopApp(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.setDesktopAppEnabled,
    async (_event, request: DesktopAppEnabledRequest): Promise<DesktopExtensionOverviewResult> => {
      return await services.setDesktopAppEnabled(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.startDesktopMcpServerAuth,
    async (_event, request: DesktopMcpServerAuthRequest): Promise<DesktopMcpServerAuthResult> => {
      return await services.startDesktopMcpServerAuth(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.setDesktopMcpServerEnabled,
    async (_event, request: DesktopMcpServerEnabledRequest): Promise<DesktopExtensionOverviewResult> => {
      return await services.setDesktopMcpServerEnabled(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.readDesktopSkillDetail,
    async (_event, request: DesktopSkillDetailRequest): Promise<DesktopSkillDetailResult> => {
      return await services.readDesktopSkillDetail(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.setDesktopSkillEnabled,
    async (_event, request: DesktopSkillEnabledRequest): Promise<DesktopExtensionOverviewResult> => {
      return await services.setDesktopSkillEnabled(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.uninstallDesktopSkill,
    async (_event, request: DesktopSkillUninstallRequest): Promise<DesktopExtensionOverviewResult> => {
      return await services.uninstallDesktopSkill(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.getDesktopTeamState,
    async (): Promise<DesktopTeamStateResult> => {
      return await services.getDesktopTeamState();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.createDesktopFirstTeam,
    async (_event, request: DesktopCreateFirstTeamRequest): Promise<DesktopTeamStateResult> => {
      return await services.createDesktopFirstTeam(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.saveDesktopTeamMember,
    async (_event, request: DesktopSaveTeamMemberRequest): Promise<DesktopTeamStateResult> => {
      return await services.saveDesktopTeamMember(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.removeDesktopTeamMember,
    async (_event, request: DesktopRemoveTeamMemberRequest): Promise<DesktopTeamStateResult> => {
      return await services.removeDesktopTeamMember(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.listDesktopAutomations,
    async (): Promise<DesktopAutomationListResult> => {
      return await services.listDesktopAutomations();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.getDesktopAutomation,
    async (_event, id: string): Promise<DesktopAutomationDetailResult> => {
      return await services.getDesktopAutomation(id);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.saveDesktopAutomation,
    async (_event, request: DesktopAutomationSaveRequest): Promise<DesktopAutomationDetailResult> => {
      return await services.saveDesktopAutomation(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.deleteDesktopAutomation,
    async (_event, request: DesktopAutomationDeleteRequest): Promise<void> => {
      await services.deleteDesktopAutomation(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.runDesktopAutomationNow,
    async (_event, request: DesktopAutomationRunNowRequest): Promise<DesktopAutomationDetailResult> => {
      return await services.runDesktopAutomationNow(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.substrateRecentWorkspaces,
    async (_event, request: SubstrateRecentWorkspacesRequest): Promise<SubstrateWorkspacesResult> => {
      return await services.substrateRecentWorkspaces(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.substrateRecentSessions,
    async (_event, request: SubstrateRecentSessionsRequest): Promise<SubstrateSessionsResult> => {
      return await services.substrateRecentSessions(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.substrateSessionsByWorkspace,
    async (_event, request: SubstrateSessionsByWorkspaceRequest): Promise<SubstrateSessionsResult> => {
      return await services.substrateSessionsByWorkspace(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.substrateSessionDetail,
    async (_event, request: SubstrateSessionDetailRequest): Promise<SubstrateSessionDetailResult> => {
      return await services.substrateSessionDetail(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.substrateWorkspaceDetail,
    async (_event, request: SubstrateWorkspaceDetailRequest): Promise<SubstrateWorkspaceDetailResult> => {
      return await services.substrateWorkspaceDetail(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.substrateEventsBySession,
    async (_event, request: SubstrateEventsBySessionRequest): Promise<SubstrateEventsResult> => {
      return await services.substrateEventsBySession(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.substrateObjectRefsBySession,
    async (_event, request: SubstrateObjectRefsBySessionRequest): Promise<SubstrateObjectRefsResult> => {
      return await services.substrateObjectRefsBySession(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.projectedWorkspaces,
    async (_event, request: ProjectedWorkspacesRequest): Promise<ProjectedWorkspacesResult> => {
      return await services.projectedWorkspaces(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.projectedWorkspaceByRoot,
    async (_event, request: ProjectedWorkspaceByRootRequest): Promise<ProjectedWorkspaceDetailResult> => {
      return await services.projectedWorkspaceByRoot(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.projectedSessions,
    async (_event, request: ProjectedSessionsRequest): Promise<ProjectedSessionsResult> => {
      return await services.projectedSessions(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.browserOpen,
    async (_event, request: DesktopBrowserOpenRequest): Promise<DesktopBrowserState> => {
      return await services.browserOpen(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.browserClose,
    async (_event, request: DesktopBrowserThreadRequest): Promise<void> => {
      await services.browserClose(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.browserSetBounds,
    async (_event, request: DesktopBrowserBoundsRequest): Promise<void> => {
      await services.browserSetBounds(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.browserNavigate,
    async (_event, request: DesktopBrowserNavigateRequest): Promise<DesktopBrowserState> => {
      return await services.browserNavigate(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.browserGoBack,
    async (_event, request: DesktopBrowserThreadRequest): Promise<DesktopBrowserState> => {
      return await services.browserGoBack(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.browserGoForward,
    async (_event, request: DesktopBrowserThreadRequest): Promise<DesktopBrowserState> => {
      return await services.browserGoForward(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.browserReload,
    async (_event, request: DesktopBrowserThreadRequest): Promise<DesktopBrowserState> => {
      return await services.browserReload(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.browserStop,
    async (_event, request: DesktopBrowserThreadRequest): Promise<DesktopBrowserState> => {
      return await services.browserStop(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.browserSetViewport,
    async (_event, request: DesktopBrowserViewportRequest): Promise<DesktopBrowserState> => {
      return await services.browserSetViewport(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.browserScreenshot,
    async (_event, request: DesktopBrowserScreenshotRequest): Promise<DesktopBrowserScreenshotResult> => {
      return await services.browserScreenshot(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.browserInspect,
    async (_event, request: DesktopBrowserInspectRequest): Promise<DesktopBrowserInspectResult> => {
      return await services.browserInspect(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.browserClick,
    async (_event, request: DesktopBrowserPointRequest): Promise<DesktopBrowserState> => {
      return await services.browserClick(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.browserType,
    async (_event, request: DesktopBrowserTypeRequest): Promise<DesktopBrowserState> => {
      return await services.browserType(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.browserConsole,
    async (_event, request: DesktopBrowserThreadRequest): Promise<DesktopBrowserConsoleResult> => {
      return await services.browserConsole(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.browserNetwork,
    async (_event, request: DesktopBrowserThreadRequest): Promise<DesktopBrowserNetworkResult> => {
      return await services.browserNetwork(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.browserTrustCheck,
    async (_event, request: DesktopBrowserTrustCheckRequest): Promise<DesktopBrowserTrustCheckResult> => {
      return await services.browserTrustCheck(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.browserTrustUpdate,
    async (_event, request: DesktopBrowserTrustRequest): Promise<DesktopBrowserTrustState> => {
      return await services.browserTrustUpdate(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.browserTrustState,
    async (): Promise<DesktopBrowserTrustState> => {
      return await services.browserTrustState();
    },
  );

  desktopIpcHandlersRegistered = true;
}

export function unregisterDesktopIpcHandlers(): void {
  Object.values(IPC_CHANNELS).forEach((channel) => {
    if (channel === IPC_CHANNELS.runtimeEvent) {
      return;
    }

    ipcMain.removeHandler(channel);
  });

  desktopIpcHandlersRegistered = false;
}

export function emitDesktopRuntimeEvent(payload: DesktopRuntimeEvent): void {
  const window = getMainWindow();
  if (!window || window.isDestroyed()) {
    return;
  }

  window.webContents.send(IPC_CHANNELS.runtimeEvent, payload);
}

export function emitDesktopThreadDelta(delta: DesktopThreadDelta): void {
  pendingThreadDeltas.push(delta);
  scheduleThreadDeltaFlush();
}

function scheduleThreadDeltaFlush(): void {
  if (pendingThreadDeltaFlushTimer) {
    return;
  }

  pendingThreadDeltaFlushTimer = setTimeout(() => {
    pendingThreadDeltaFlushTimer = null;
    flushPendingThreadDeltas();
  }, THREAD_DELTA_FLUSH_MS);
}

function flushPendingThreadDeltas(): void {
  const window = getMainWindow();
  if (!window || window.isDestroyed()) {
    pendingThreadDeltas = [];
    return;
  }

  if (pendingThreadDeltas.length === 0) {
    return;
  }

  const deltasToSend = pendingThreadDeltas;
  pendingThreadDeltas = [];

  window.webContents.send(
    IPC_CHANNELS.threadDelta,
    deltasToSend.length === 1 ? deltasToSend[0] : deltasToSend,
  );
}
