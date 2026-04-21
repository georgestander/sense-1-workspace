import type { DesktopAppServerInputItem, DesktopThreadDelta, DesktopThreadSummary, DesktopInputQuestion, DesktopInputRequestState, DesktopThreadInputState } from "./thread.js";
import type { DesktopRunContext } from "./run.js";
import type { DesktopVerbosity } from "./settings.js";
import type { DesktopUpdateState } from "./runtime.js";
import type { DesktopVoiceState } from "./voice.js";
import type { DesktopWorkspacePermissionRequest } from "./workspace.js";

export type DesktopApprovalDecision = "accept" | "acceptForSession" | "decline";

export interface DesktopApprovalEvent {
  readonly id: number;
  readonly kind: "command" | "file" | "permissions" | "network";
  readonly threadId: string;
  readonly reason: string | null;
  readonly command: string[];
  readonly cwd: string | null;
  readonly grantRoot: string | null;
  readonly permissions?: {
    readonly fileSystem?: {
      readonly read?: string[] | null;
      readonly write?: string[] | null;
    } | null;
    readonly network?: {
      readonly enabled?: boolean | null;
    } | null;
  } | null;
  readonly runContext: DesktopRunContext | null;
}

export interface DesktopApprovalResponseRequest {
  readonly requestId: number;
  readonly decision: DesktopApprovalDecision;
}

export interface DesktopInputResponseRequest {
  readonly requestId: number;
  readonly text: string;
}

export interface DesktopTaskRunRequest {
  readonly prompt: string;
  readonly threadId?: string;
  readonly cwd?: string | null;
  readonly workspaceRoot?: string | null;
  readonly contextPaths?: string[];
  readonly model?: string;
  readonly personality?: string;
  readonly reasoningEffort?: string;
  readonly serviceTier?: "flex" | "fast";
  readonly verbosity?: DesktopVerbosity;
  readonly attachments?: string[];
  readonly inputItems?: DesktopAppServerInputItem[];
  readonly runContext?: DesktopRunContext | null;
}

export interface DesktopStartedTaskRunResult {
  readonly status: "started" | "approvalRequired";
  readonly cwd: string | null;
  readonly workspaceRoot: string | null;
  readonly runContext: DesktopRunContext | null;
  readonly permissionRequest: null;
  readonly thread: DesktopThreadSummary;
  readonly threadId: string;
  readonly turnId: string | null;
}

export interface DesktopPermissionRequiredTaskRunResult {
  readonly status: "permissionRequired";
  readonly cwd: string | null;
  readonly workspaceRoot: string | null;
  readonly runContext: DesktopRunContext | null;
  readonly permissionRequest: DesktopWorkspacePermissionRequest;
  readonly thread: null;
  readonly threadId: null;
  readonly turnId: null;
}

export type DesktopTaskRunResult =
  | DesktopStartedTaskRunResult
  | DesktopPermissionRequiredTaskRunResult;

export interface DesktopInterruptTurnRequest {
  readonly threadId: string;
  readonly turnId?: string | null;
}

export interface DesktopSteerTurnRequest {
  readonly threadId: string;
  readonly input: string;
}

export interface DesktopSteerTurnResult {
  readonly status: "steered" | "queued";
  readonly threadInputState: DesktopThreadInputState | null;
}

export interface DesktopQueueTurnInputRequest {
  readonly threadId: string;
  readonly input: string;
}

export type DesktopRuntimeEvent =
  | {
      readonly kind: "approvalRequested";
      readonly approval: DesktopApprovalEvent;
    }
  | {
      readonly kind: "approvalResolved";
      readonly requestId: number;
    }
  | {
      readonly kind: "accountChanged";
    }
  | {
      readonly kind: "managementInventoryChanged";
    }
  | {
      readonly kind: "threadContentChanged";
      readonly threadId: string | null;
    }
  | {
      readonly kind: "threadListChanged";
      readonly threadId: string | null;
    }
  | {
      readonly kind: "permissionRequired";
      readonly rootPath: string;
      readonly displayName: string;
    }
  | {
      readonly kind: "updateStateChanged";
      readonly update: DesktopUpdateState;
    }
  | {
      readonly kind: "voiceStateChanged";
      readonly threadId: string;
      readonly state: DesktopVoiceState;
      readonly sessionId: string | null;
      readonly reason: string | null;
    }
  | {
      readonly kind: "voiceTranscriptUpdated";
      readonly threadId: string;
      readonly role: string;
      readonly text: string;
      readonly isFinal: boolean;
    }
  | {
      readonly kind: "voiceSdpReceived";
      readonly threadId: string;
      readonly sdp: string;
    }
  | {
      readonly kind: "voiceError";
      readonly threadId: string;
      readonly message: string;
    }
  | {
      readonly kind: "crashReportSuggested";
      readonly reason: "runtime-crashed" | "runtime-errored" | "bootstrap-blocked" | "renderer-gone";
      readonly detail: string | null;
      readonly setupCode: string | null;
      readonly restartCount: number | null;
      readonly occurredAt: string;
    };
