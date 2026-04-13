import type { DesktopInteractionState } from "./runtime.js";
import type { DesktopInputQuestion, DesktopPlanState, DesktopThreadInputState } from "./thread-input.js";
import type { DesktopThreadEntry, DesktopThreadReviewSummary } from "./thread-core.js";

export type DesktopThreadDelta =
  | {
      readonly kind: "snapshot";
      readonly threadId: string;
      readonly entries: DesktopThreadEntry[];
      readonly state: string;
      readonly interactionState: DesktopInteractionState;
      readonly title: string;
      readonly subtitle: string;
      readonly updatedAt: string;
      readonly workspaceRoot: string | null;
      readonly cwd: string | null;
      readonly reviewSummary: DesktopThreadReviewSummary | null;
      readonly planState?: DesktopPlanState | null;
      readonly diffState?: { readonly diffs: unknown[] } | null;
      readonly inputRequestState?: {
        readonly requestId: number | null;
        readonly prompt: string;
        readonly threadId: string;
        readonly questions: DesktopInputQuestion[];
      } | null;
      readonly threadInputState?: DesktopThreadInputState | null;
    }
  | {
      readonly kind: "entryDelta";
      readonly threadId: string;
      readonly entryId: string;
      readonly field: "body";
      readonly append: string;
    }
  | {
      readonly kind: "entryStarted";
      readonly threadId: string;
      readonly entry: DesktopThreadEntry;
    }
  | {
      readonly kind: "entryCompleted";
      readonly threadId: string;
      readonly entryId: string;
      readonly entry: DesktopThreadEntry;
    }
  | {
      readonly kind: "threadStateChanged";
      readonly threadId: string;
      readonly state: string;
      readonly updatedAt: string;
      readonly turnId?: string | null;
    }
  | {
      readonly kind: "interactionStateChanged";
      readonly threadId: string;
      readonly interactionState: DesktopInteractionState;
      readonly updatedAt: string;
    }
  | {
      readonly kind: "threadMetadataChanged";
      readonly threadId: string;
      readonly title: string;
      readonly updatedAt: string;
    }
  | {
      readonly kind: "reviewSummaryUpdated";
      readonly threadId: string;
      readonly reviewSummary: DesktopThreadReviewSummary | null;
    }
  | {
      readonly kind: "planUpdated";
      readonly threadId: string;
      readonly planText: string | null;
      readonly planSteps: string[];
      readonly planScopeSummary: string | null;
      readonly planExpectedOutputSummary: string | null;
      readonly planState: DesktopPlanState;
    }
  | {
      readonly kind: "diffUpdated";
      readonly threadId: string;
      readonly diffs: unknown[];
    }
  | {
      readonly kind: "inputRequested";
      readonly threadId: string;
      readonly requestId: number | null;
      readonly prompt: string;
      readonly questions: DesktopInputQuestion[];
    }
  | {
      readonly kind: "threadInputStateChanged";
      readonly threadId: string;
      readonly updatedAt: string;
      readonly threadInputState: DesktopThreadInputState | null;
    };
