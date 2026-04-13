import type { AppServerProcessManager } from "../runtime/app-server-process-manager.js";
import type {
  DesktopApprovalEvent,
  DesktopAuditEvent,
  DesktopInteractionState,
  DesktopRunContext,
  DesktopThreadSnapshot,
} from "../contracts";

export interface DesktopProfileSnapshot {
  readonly id: string;
  readonly source: "environment" | "stored" | "default";
  readonly rootPath: string;
  readonly codexHome: string;
}

export interface DesktopAuthSnapshot {
  readonly isSignedIn: boolean;
  readonly email: string | null;
  readonly accountType: string | null;
  readonly requiresOpenaiAuth: boolean;
  readonly error?: string;
}

export interface DesktopRuntimeSnapshot {
  readonly apiVersion: "1.0.0";
  readonly appVersion: string;
  readonly electronVersion: string;
  readonly platform: NodeJS.Platform;
  readonly state: string;
  readonly lastError: string | null;
  readonly restartCount: number;
  readonly lastStateAt: string;
  readonly startedAt: string;
  readonly setupBlocked?: boolean;
  readonly setupCode?: string | null;
  readonly setupTitle?: string | null;
  readonly setupMessage?: string | null;
  readonly setupDetail?: string | null;
}

export interface DesktopRecentThreadSummary {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly state: string;
  readonly interactionState: DesktopInteractionState;
  readonly updatedAt: string;
  readonly workspaceRoot?: string | null;
}

export interface DesktopRecentFolderSummary {
  readonly path: string;
  readonly name: string;
  readonly lastUsedAt: string | null;
}

export interface DesktopProfileOption {
  readonly id: string;
  readonly label: string;
}

export interface DesktopRuntimeStatusSummary {
  readonly appVersion: string;
  readonly platform: NodeJS.Platform;
}

export interface DesktopRuntimeSetupSummary {
  readonly blocked: true;
  readonly code: string | null;
  readonly title: string;
  readonly message: string;
  readonly detail: string | null;
}

export interface DesktopBootstrapTenantSummary {
  readonly id: string;
  readonly displayName: string;
  readonly role: "member" | "admin";
  readonly scopeId: string;
  readonly scopeDisplayName: string;
  readonly actorId: string;
  readonly actorDisplayName: string;
}

export interface DesktopBootstrapTeamSetupSummary {
  readonly mode: "local" | "team";
  readonly source: "desktopLocal";
  readonly canWorkLocally: boolean;
  readonly canCreateFirstTeam: boolean;
  readonly canManageTeam: boolean;
}

export interface DesktopBootstrapPayload {
  readonly profile: DesktopProfileSnapshot;
  readonly auth: DesktopAuthSnapshot;
  readonly runtime: DesktopRuntimeSnapshot;
  readonly profileId: string;
  readonly profileOptions: DesktopProfileOption[];
  readonly isSignedIn: boolean;
  readonly accountEmail: string | null;
  readonly runtimeStatus: DesktopRuntimeStatusSummary | null;
  readonly runtimeSetup: DesktopRuntimeSetupSummary | null;
  readonly tenant: DesktopBootstrapTenantSummary | null;
  readonly teamSetup: DesktopBootstrapTeamSetupSummary;
  readonly runContext: DesktopRunContext | null;
  readonly auditEvents: DesktopAuditEvent[];
  readonly recentThreads: DesktopRecentThreadSummary[];
  readonly recentFolders: DesktopRecentFolderSummary[];
  readonly workspaceSidebarOrder: string[];
  readonly lastSelectedThreadId: string | null;
  readonly selectedThread: DesktopThreadSnapshot | null;
  readonly pendingApprovals: DesktopApprovalEvent[];
}

export interface DesktopProfileSelectionResult {
  readonly success: true;
  readonly profile: DesktopProfileSnapshot;
}

export interface DesktopProfileSelectionFailure {
  readonly success: false;
  readonly reason: string;
}

export type DesktopProfileSelectionOutcome =
  | DesktopProfileSelectionResult
  | DesktopProfileSelectionFailure;

export function resolveDesktopProfile(
  env?: NodeJS.ProcessEnv,
): Promise<DesktopProfileSnapshot>;
export function selectDesktopProfile(
  profileId: string,
  env?: NodeJS.ProcessEnv,
): Promise<DesktopProfileSelectionOutcome>;
export function resolveChatgptSignInUrl(env?: NodeJS.ProcessEnv): string;
export function normalizeRecentThreads(
  result: unknown,
  workspaceRootByThreadId?: Record<string, string>,
): DesktopRecentThreadSummary[];
export function resolveThreadWorkspaceRoot(
  profileId: string,
  threadId: string,
  workspaceRootByThreadId?: Record<string, string>,
  env?: NodeJS.ProcessEnv,
): Promise<string | null>;
export function getDesktopBootstrap(
  manager: AppServerProcessManager,
  options?: {
    env?: NodeJS.ProcessEnv;
    appStartedAt?: string;
    auditEvents?: DesktopAuditEvent[];
    pendingApprovals?: DesktopApprovalEvent[];
    selectedThreadIdByProfile?: Record<string, string | null>;
    runtimeInfo?: {
      apiVersion?: "1.0.0";
      appVersion?: string;
      electronVersion?: string;
      platform?: NodeJS.Platform;
      startedAt?: string;
    };
  },
): Promise<DesktopBootstrapPayload>;
