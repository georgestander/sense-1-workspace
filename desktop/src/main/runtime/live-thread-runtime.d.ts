import type {
  DesktopPolicyRuleGroup,
  DesktopReviewArtifactRef,
  DesktopStartedTaskRunResult,
  DesktopThreadReviewSummary,
  DesktopTaskRunRequest,
  DesktopThreadReadResult,
  DesktopThreadSnapshot,
  DesktopThreadSummary,
  DesktopRunContext,
} from "../contracts";
import type { AppServerProcessManager } from "./app-server-process-manager.js";
import type { classifyDesktopExecutionIntent } from "../settings/policy.js";

export function normalizeDesktopThreadSummary(thread: {
  id?: string | null;
  name?: string | null;
  preview?: string | null;
  createdAt?: number;
  updatedAt?: number;
  cwd?: string | null;
  turns?: Array<{
    items?: Array<{
      type?: string | null;
      cwd?: string | null;
    }>;
  }>;
  status?: {
    type?: string | null;
    activeFlags?: string[] | null;
  } | null;
}, workspaceRoot?: string | null, interactionState?: string | null): DesktopThreadSummary;

export function buildDesktopThreadSnapshot(
  thread: {
    id?: string | null;
    name?: string | null;
    preview?: string | null;
    createdAt?: number;
    updatedAt?: number;
    cwd?: string | null;
    turns?: Array<{
      items?: Array<Record<string, unknown>>;
    }>;
    status?: {
      type?: string | null;
      activeFlags?: string[] | null;
    } | null;
  },
  workspaceRoot?: string | null,
  interactionState?: string | null,
  reviewContext?: {
    summary?: string | null;
    updatedAt?: string | null;
    objectRefs?: Array<{
      id?: string | null;
      ref_type?: string | null;
      ref_path?: string | null;
      ref_id?: string | null;
      action?: string | null;
      ts?: string | null;
      metadata?: Record<string, unknown> | null;
    }>;
  } | null,
): DesktopThreadSnapshot;

export function buildDesktopThreadReviewSummary(request?: {
  thread?: {
    turns?: Array<{
      items?: Array<Record<string, unknown>>;
    }>;
  } | null;
  persistedSummary?: string | null;
  persistedUpdatedAt?: string | null;
  objectRefs?: Array<{
    id?: string | null;
    ref_type?: string | null;
    ref_path?: string | null;
    ref_id?: string | null;
    action?: string | null;
    ts?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
} | null): DesktopThreadReviewSummary | null;

export function readDesktopThread(
  manager: AppServerProcessManager,
  threadId: string,
  workspaceRoot?: string | null,
  interactionState?: string | null,
  reviewContext?: {
    summary?: string | null;
    updatedAt?: string | null;
    objectRefs?: Array<{
      id?: string | null;
      ref_type?: string | null;
      ref_path?: string | null;
      ref_id?: string | null;
      action?: string | null;
      ts?: string | null;
      metadata?: Record<string, unknown> | null;
    }>;
  } | null,
): Promise<DesktopThreadReadResult>;

export function describePolicyRules(settings?: Record<string, unknown> | null): DesktopPolicyRuleGroup[];

export function runDesktopTask(
  manager: AppServerProcessManager,
  request: DesktopTaskRunRequest & {
    readonly personality?: string | null;
    readonly runtimeInstructions?: string | null;
    readonly settings?: Record<string, unknown> | null;
  },
): Promise<DesktopStartedTaskRunResult>;

export const DEFAULT_DESKTOP_RUNTIME_INSTRUCTIONS: string;

export function ensureDesktopThread(
  manager: AppServerProcessManager,
  request: {
    contextPaths?: string[] | null;
    cwd?: string | null;
    executionIntent?: ReturnType<typeof classifyDesktopExecutionIntent> | null;
    model?: string | null;
    personality?: string | null;
    serviceTier?: "flex" | "fast" | null;
    runContext?: DesktopRunContext | null;
    runtimeInstructions?: string | null;
    settings?: Record<string, unknown> | null;
    threadId?: string | null;
    workspaceRoot?: string | null;
  },
): Promise<{
  thread: Record<string, unknown>;
  threadId: string;
  threadSummary: DesktopThreadSummary;
}>;
