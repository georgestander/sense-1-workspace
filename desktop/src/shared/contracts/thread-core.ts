import type { DesktopInteractionState } from "./runtime.js";
import type { DesktopInputRequestState, DesktopPlanState, DesktopThreadInputState } from "./thread-input.js";

export interface DesktopThreadSummary {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly state: string;
  readonly interactionState: DesktopInteractionState;
  readonly updatedAt: string;
  readonly workspaceRoot?: string | null;
  readonly cwd?: string | null;
  readonly threadInputState?: DesktopThreadInputState | null;
}

export interface DesktopAppServerThread {
  readonly id: string;
  readonly name?: string | null;
  readonly preview?: string | null;
  readonly createdAt?: number;
  readonly updatedAt?: number;
  readonly cwd?: string | null;
  readonly status?: {
    readonly type?: string | null;
    readonly activeFlags?: string[] | null;
  } | null;
}

export interface DesktopAppServerThreadTurn {
  readonly id: string;
  readonly status?: string;
  readonly items?: DesktopAppServerItem[];
}

export type DesktopAppServerInputItem =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "localImage"; readonly path: string }
  | { readonly type: "mention"; readonly path: string; readonly name?: string; readonly token?: string };

export type DesktopAppServerItem =
  | {
      readonly id: string;
      readonly type: "userMessage";
      readonly content?: DesktopAppServerInputItem[];
    }
  | {
      readonly id: string;
      readonly type: "agentMessage";
      readonly text?: string;
      readonly phase?: string;
    }
  | {
      readonly id: string;
      readonly type: "reasoning";
      readonly summary?: Array<{ readonly text?: string }> | null;
      readonly content?: Array<{ readonly text?: string }> | null;
    }
  | {
      readonly id: string;
      readonly type: "plan";
      readonly text?: string;
    }
  | {
      readonly id: string;
      readonly type: "commandExecution";
      readonly command?: string[] | string;
      readonly cwd?: string;
      readonly status?: string;
      readonly aggregatedOutput?: string;
      readonly exitCode?: number;
      readonly durationMs?: number;
    }
  | {
      readonly id: string;
      readonly type: "fileChange";
      readonly status?: string;
      readonly changes?: Array<{ readonly path?: string; readonly kind?: string; readonly diff?: string }>;
    }
  | {
      readonly id: string;
      readonly type: "enteredReviewMode" | "exitedReviewMode" | "contextCompaction";
      readonly review?: { readonly text?: string };
    }
  | {
      readonly id: string;
      readonly type: "mcpToolCall" | "dynamicToolCall" | "collabToolCall" | "webSearch" | "imageView";
      readonly tool?: string;
      readonly query?: string;
      readonly path?: string;
      readonly status?: string;
    };

export type DesktopThreadEntry =
  | {
      readonly id: string;
      readonly kind: "user" | "assistant" | "tool" | "review" | "activity";
      readonly title: string;
      readonly body: string;
      readonly promptShortcuts?: Array<{
        readonly kind: "app" | "plugin" | "skill";
        readonly label: string;
        readonly token: string;
      }>;
      readonly status?: string;
    }
  | {
      readonly id: string;
      readonly kind: "reasoning";
      readonly title: string;
      readonly summary: string;
      readonly body: string;
    }
  | {
      readonly id: string;
      readonly kind: "plan";
      readonly title: string;
      readonly body: string;
      readonly steps: string[];
    }
  | {
      readonly id: string;
      readonly kind: "command";
      readonly title: string;
      readonly body: string;
      readonly command: string;
      readonly cwd: string | null;
      readonly status: string;
      readonly exitCode: number | null;
      readonly durationMs: number | null;
    }
  | {
      readonly id: string;
      readonly kind: "fileChange";
      readonly title: string;
      readonly status: string;
      readonly changes: Array<{ readonly path?: string; readonly kind?: string; readonly diff?: string }>;
    };

export interface DesktopThreadChangeGroup {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly files: string[];
}

export interface DesktopReviewArtifactRef {
  readonly id: string;
  readonly refType: string;
  readonly path: string | null;
  readonly refId: string | null;
  readonly action: string | null;
  readonly recordedAt: string | null;
  readonly metadata: Record<string, unknown>;
}

export interface DesktopThreadReviewSummary {
  readonly summary: string | null;
  readonly outputArtifacts: DesktopReviewArtifactRef[];
  readonly createdFiles: DesktopReviewArtifactRef[];
  readonly modifiedFiles: DesktopReviewArtifactRef[];
  readonly changedArtifacts: DesktopReviewArtifactRef[];
  readonly updatedAt: string | null;
}

export interface DesktopThreadSnapshot {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly state: string;
  readonly interactionState: DesktopInteractionState;
  readonly updatedAt: string;
  readonly updatedLabel: string;
  readonly workspaceRoot: string | null;
  readonly cwd: string | null;
  readonly entries: DesktopThreadEntry[];
  readonly changeGroups: DesktopThreadChangeGroup[];
  readonly progressSummary: string[];
  readonly reviewSummary: DesktopThreadReviewSummary | null;
  readonly hasLoadedDetails: boolean;
  readonly planState?: DesktopPlanState | null;
  readonly diffState?: { readonly diffs: unknown[] } | null;
  readonly inputRequestState?: DesktopInputRequestState | null;
  readonly threadInputState?: DesktopThreadInputState | null;
}

export interface DesktopThreadReadResult {
  readonly thread: DesktopThreadSnapshot | null;
}
