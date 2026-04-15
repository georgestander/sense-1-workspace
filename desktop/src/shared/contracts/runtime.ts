export const DESKTOP_BRIDGE_API_VERSION = "1.0.0" as const;

export const IPC_CHANNELS = {
  runtimeInfo: "sense1:desktop:get-runtime-info",
  getUpdateState: "sense1:desktop:update:get-state",
  checkForUpdates: "sense1:desktop:update:check",
  installUpdate: "sense1:desktop:update:install",
  openLatestRelease: "sense1:desktop:update:open-latest-release",
  getDesktopBootstrap: "sense1:desktop:get-bootstrap",
  rememberLastSelectedThread: "sense1:desktop:thread:remember-last-selected",
  renameDesktopThread: "sense1:desktop:thread:rename",
  archiveDesktopThread: "sense1:desktop:thread:archive",
  restoreDesktopThread: "sense1:desktop:thread:restore",
  deleteDesktopThread: "sense1:desktop:thread:delete",
  selectDesktopProfile: "sense1:desktop:profile:select",
  launchChatgptSignIn: "sense1:desktop:auth:launch-chatgpt",
  logoutChatgpt: "sense1:desktop:auth:logout-chatgpt",
  pickWorkspaceFolder: "sense1:desktop:workspace:pick-folder",
  archiveWorkspace: "sense1:desktop:workspace:archive",
  restoreWorkspace: "sense1:desktop:workspace:restore",
  deleteWorkspace: "sense1:desktop:workspace:delete",
  getWorkspacePolicy: "sense1:desktop:workspace:get-policy",
  hydrateWorkspace: "sense1:desktop:workspace:hydrate",
  grantWorkspacePermission: "sense1:desktop:workspace:grant-permission",
  setWorkspaceOperatingMode: "sense1:desktop:workspace:set-operating-mode",
  rememberThreadWorkspaceRoot: "sense1:desktop:workspace:remember-thread-root",
  rememberWorkspaceSidebarOrder: "sense1:desktop:workspace:remember-sidebar-order",
  readDesktopThread: "sense1:desktop:thread:read",
  runDesktopTask: "sense1:desktop:task:run",
  interruptDesktopTurn: "sense1:desktop:turn:interrupt",
  steerTurn: "sense1:desktop:turn:steer",
  queueTurnInput: "sense1:desktop:turn:queue-input",
  respondToDesktopApproval: "sense1:desktop:approval:respond",
  startDesktopVoice: "sense1:desktop:voice:start",
  appendDesktopVoiceAudio: "sense1:desktop:voice:append-audio",
  stopDesktopVoice: "sense1:desktop:voice:stop",
  runtimeEvent: "sense1:desktop:runtime:event",
  threadDelta: "sense1:desktop:thread:delta",
  listModels: "sense1:desktop:models:list",
  pickFiles: "sense1:desktop:workspace:pick-files",
  respondToInputRequest: "sense1:desktop:input:respond",
  substrateRecentWorkspaces: "sense1:desktop:substrate:recent-workspaces",
  substrateRecentSessions: "sense1:desktop:substrate:recent-sessions",
  substrateSessionsByWorkspace: "sense1:desktop:substrate:sessions-by-workspace",
  substrateSessionDetail: "sense1:desktop:substrate:session-detail",
  substrateWorkspaceDetail: "sense1:desktop:substrate:workspace-detail",
  substrateEventsBySession: "sense1:desktop:substrate:events-by-session",
  substrateObjectRefsBySession: "sense1:desktop:substrate:object-refs-by-session",
  projectedWorkspaces: "sense1:desktop:projection:workspaces",
  projectedWorkspaceByRoot: "sense1:desktop:projection:workspace-by-root",
  projectedSessions: "sense1:desktop:projection:sessions",
  getDesktopSettings: "sense1:desktop:settings:get",
  getDesktopPolicyRules: "sense1:desktop:settings:policy-rules",
  updateDesktopSettings: "sense1:desktop:settings:update",
  getDesktopExtensionOverview: "sense1:desktop:extensions:get-overview",
  readDesktopPluginDetail: "sense1:desktop:extensions:read-plugin-detail",
  installDesktopPlugin: "sense1:desktop:extensions:install-plugin",
  uninstallDesktopPlugin: "sense1:desktop:extensions:uninstall-plugin",
  setDesktopPluginEnabled: "sense1:desktop:extensions:set-plugin-enabled",
  openDesktopAppInstall: "sense1:desktop:extensions:open-app-install",
  removeDesktopApp: "sense1:desktop:extensions:remove-app",
  setDesktopAppEnabled: "sense1:desktop:extensions:set-app-enabled",
  startDesktopMcpServerAuth: "sense1:desktop:extensions:start-mcp-auth",
  setDesktopMcpServerEnabled: "sense1:desktop:extensions:set-mcp-enabled",
  readDesktopSkillDetail: "sense1:desktop:extensions:read-skill-detail",
  setDesktopSkillEnabled: "sense1:desktop:extensions:set-skill-enabled",
  uninstallDesktopSkill: "sense1:desktop:extensions:uninstall-skill",
  getDesktopTeamState: "sense1:desktop:team:get-state",
  createDesktopFirstTeam: "sense1:desktop:team:create-first",
  saveDesktopTeamMember: "sense1:desktop:team:save-member",
  listDesktopAutomations: "sense1:desktop:automations:list",
  getDesktopAutomation: "sense1:desktop:automations:get",
  saveDesktopAutomation: "sense1:desktop:automations:save",
  deleteDesktopAutomation: "sense1:desktop:automations:delete",
  runDesktopAutomationNow: "sense1:desktop:automations:run-now",
  windowMinimize: "sense1:desktop:window:minimize",
  windowToggleMaximize: "sense1:desktop:window:toggle-maximize",
  windowClose: "sense1:desktop:window:close",
  openExternalUrl: "sense1:desktop:shell:open-external-url",
  openFilePath: "sense1:desktop:shell:open-file-path",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export interface RuntimeInfo {
  readonly appVersion: string;
  readonly electronVersion: string;
  readonly platform: NodeJS.Platform;
  readonly startedAt: string;
}

export interface RuntimeInfoResult extends RuntimeInfo {
  readonly apiVersion: typeof DESKTOP_BRIDGE_API_VERSION;
}

export type DesktopUpdatePhase =
  | "unsupported"
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloadedWaitingForIdle"
  | "readyToInstall"
  | "installing"
  | "upToDate"
  | "error";

export interface DesktopUpdateState {
  readonly phase: DesktopUpdatePhase;
  readonly source: "githubReleases";
  readonly currentVersion: string;
  readonly availableVersion: string | null;
  readonly downloadedVersion: string | null;
  readonly progressPercent: number | null;
  readonly checkedAt: string | null;
  readonly readyAt: string | null;
  readonly busy: boolean;
  readonly message: string | null;
}

export interface DesktopProfileState {
  readonly id: string;
  readonly source: "environment" | "stored" | "default";
  readonly rootPath: string;
  readonly codexHome: string;
}

export interface DesktopAuthState {
  readonly isSignedIn: boolean;
  readonly email: string | null;
  readonly accountType: string | null;
  readonly requiresOpenaiAuth: boolean;
  readonly error?: string;
}

export interface DesktopRuntimeState {
  readonly apiVersion: typeof DESKTOP_BRIDGE_API_VERSION;
  readonly appVersion: string;
  readonly electronVersion: string;
  readonly platform: NodeJS.Platform;
  readonly startedAt: string;
  readonly state: string;
  readonly lastError: string | null;
  readonly restartCount: number;
  readonly lastStateAt: string;
  readonly setupBlocked?: boolean;
  readonly setupCode?: string | null;
  readonly setupTitle?: string | null;
  readonly setupMessage?: string | null;
  readonly setupDetail?: string | null;
}

export type DesktopInteractionState =
  | "conversation"
  | "clarification"
  | "executing"
  | "review";
