import type { DesktopAuthState, DesktopProfileState, DesktopRuntimeState } from "./runtime.js";
import type { DesktopRunContext, DesktopAuditEvent } from "./run.js";
import type { DesktopApprovalEvent } from "./events.js";
import type { DesktopThreadSummary, DesktopFolderSummary, DesktopProfileOption, DesktopThreadSnapshot } from "./thread.js";

export interface DesktopBootstrapRuntimeStatus {
  readonly appVersion: string;
  readonly platform: NodeJS.Platform;
}

export interface DesktopBootstrapRuntimeSetup {
  readonly blocked: true;
  readonly code: string | null;
  readonly title: string;
  readonly message: string;
  readonly detail: string | null;
}

export interface DesktopBootstrapTenant {
  readonly id: string;
  readonly displayName: string;
  readonly role: "member" | "admin";
  readonly scopeId: string;
  readonly scopeDisplayName: string;
  readonly actorId: string;
  readonly actorDisplayName: string;
}

export interface DesktopBootstrapTeamSetup {
  readonly mode: "local" | "team";
  readonly source: "desktopLocal";
  readonly canWorkLocally: boolean;
  readonly canCreateFirstTeam: boolean;
  readonly canManageTeam: boolean;
}

export interface DesktopBootstrap {
  readonly profile: DesktopProfileState;
  readonly auth: DesktopAuthState;
  readonly runtime: DesktopRuntimeState;
  readonly profileId: string;
  readonly profileOptions: DesktopProfileOption[];
  readonly isSignedIn: boolean;
  readonly accountEmail: string | null;
  readonly runtimeStatus: DesktopBootstrapRuntimeStatus | null;
  readonly runtimeSetup: DesktopBootstrapRuntimeSetup | null;
  readonly tenant: DesktopBootstrapTenant | null;
  readonly teamSetup: DesktopBootstrapTeamSetup;
  readonly runContext: DesktopRunContext | null;
  readonly auditEvents: DesktopAuditEvent[];
  readonly recentThreads: DesktopThreadSummary[];
  readonly recentFolders: DesktopFolderSummary[];
  readonly workspaceSidebarOrder: string[];
  readonly lastSelectedThreadId: string | null;
  readonly selectedThread: DesktopThreadSnapshot | null;
  readonly pendingApprovals: DesktopApprovalEvent[];
}

export interface SelectDesktopProfileSuccess {
  readonly success: true;
  readonly bootstrap: DesktopBootstrap;
}

export interface SelectDesktopProfileFailure {
  readonly success: false;
  readonly reason: string;
}

export type SelectDesktopProfileResult =
  | SelectDesktopProfileSuccess
  | SelectDesktopProfileFailure;

export type DesktopAuthLoginMethod = "chatgpt" | "apiKey";

export interface DesktopAuthLoginRequest {
  readonly method: DesktopAuthLoginMethod;
  readonly apiKey?: string;
}

export interface DesktopAuthStartResult {
  readonly success: boolean;
  readonly method: DesktopAuthLoginMethod;
  readonly url: string | null;
  readonly reason?: string;
  readonly completed?: boolean;
}

export interface DesktopAuthLogoutResult {
  readonly success: boolean;
  readonly reason?: string;
}

export interface WindowActionSuccess {
  readonly success: true;
}

export interface WindowActionFailure {
  readonly success: false;
  readonly reason: string;
}

export type WindowActionResult = WindowActionSuccess | WindowActionFailure;

export interface WindowToggleResultSuccess extends WindowActionSuccess {
  readonly isMaximized: boolean;
}

export interface WindowToggleResultFailure extends WindowActionFailure {
  readonly isMaximized: boolean;
}

export type WindowToggleResult = WindowToggleResultSuccess | WindowToggleResultFailure;

export type WorkspaceFolderPickerResult =
  | {
      readonly canceled: true;
      readonly path: null;
    }
  | {
      readonly canceled: false;
      readonly path: string;
    };
