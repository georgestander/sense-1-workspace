import type {
  AppServerNotification,
  DesktopInputRequestState,
  DesktopInteractionState,
  DesktopPlanState,
  DesktopThreadInputState,
  DesktopThreadReviewSummary,
  DesktopThreadEntry,
  DesktopThreadSnapshot,
} from "../contracts";

export interface ThreadDeltaSnapshot {
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
  readonly planState: DesktopPlanState | null;
  readonly diffState: { readonly diffs: unknown[] } | null;
  readonly inputRequestState: DesktopInputRequestState | null;
  readonly threadInputState: DesktopThreadInputState | null;
}

export interface ThreadDeltaEntryDelta {
  readonly kind: "entryDelta";
  readonly threadId: string;
  readonly entryId: string;
  readonly field: "body";
  readonly append: string;
}

export interface ThreadDeltaEntryStarted {
  readonly kind: "entryStarted";
  readonly threadId: string;
  readonly entry: DesktopThreadEntry;
}

export interface ThreadDeltaEntryCompleted {
  readonly kind: "entryCompleted";
  readonly threadId: string;
  readonly entryId: string;
  readonly entry: DesktopThreadEntry;
}

export interface ThreadDeltaStateChanged {
  readonly kind: "threadStateChanged";
  readonly threadId: string;
  readonly state: string;
  readonly updatedAt: string;
  readonly turnId?: string | null;
}

export interface ThreadDeltaInteractionStateChanged {
  readonly kind: "interactionStateChanged";
  readonly threadId: string;
  readonly interactionState: DesktopInteractionState;
  readonly updatedAt: string;
}

export interface ThreadDeltaMetadataChanged {
  readonly kind: "threadMetadataChanged";
  readonly threadId: string;
  readonly title: string;
  readonly updatedAt: string;
}

export interface ThreadDeltaReviewSummaryUpdated {
  readonly kind: "reviewSummaryUpdated";
  readonly threadId: string;
  readonly reviewSummary: DesktopThreadReviewSummary | null;
}

export interface ThreadDeltaPlanUpdated {
  readonly kind: "planUpdated";
  readonly threadId: string;
  readonly planText: string | null;
  readonly planSteps: string[];
  readonly planScopeSummary: string | null;
  readonly planExpectedOutputSummary: string | null;
  readonly planState: DesktopPlanState;
}

export interface ThreadDeltaDiffUpdated {
  readonly kind: "diffUpdated";
  readonly threadId: string;
  readonly diffs: unknown[];
}

export interface ThreadDeltaInputRequested {
  readonly kind: "inputRequested";
  readonly threadId: string;
  readonly requestId: number | null;
  readonly prompt: string;
  readonly questions: DesktopInputRequestState["questions"];
}

export interface ThreadDeltaThreadInputStateChanged {
  readonly kind: "threadInputStateChanged";
  readonly threadId: string;
  readonly updatedAt: string;
  readonly threadInputState: DesktopThreadInputState | null;
}

export type ThreadDelta =
  | ThreadDeltaSnapshot
  | ThreadDeltaEntryDelta
  | ThreadDeltaEntryStarted
  | ThreadDeltaEntryCompleted
  | ThreadDeltaStateChanged
  | ThreadDeltaInteractionStateChanged
  | ThreadDeltaMetadataChanged
  | ThreadDeltaReviewSummaryUpdated
  | ThreadDeltaPlanUpdated
  | ThreadDeltaDiffUpdated
  | ThreadDeltaInputRequested
  | ThreadDeltaThreadInputStateChanged;

export interface ThreadBufferState {
  readonly threadId: string;
  readonly state: string;
  readonly interactionState: DesktopInteractionState;
  readonly title: string;
  readonly subtitle: string;
  readonly updatedAt: string;
  readonly workspaceRoot: string | null;
  readonly cwd: string | null;
  readonly entries: DesktopThreadEntry[];
  readonly reviewSummary: DesktopThreadReviewSummary | null;
  readonly planState: DesktopPlanState | null;
  readonly diffState: { readonly diffs: unknown[] } | null;
  readonly inputRequestState: DesktopInputRequestState | null;
  readonly threadInputState: DesktopThreadInputState | null;
}

export class ThreadStateAccumulator {
  activeThreadId: string | null;
  getBuffer(threadId: string): {
    threadId: string;
    state: string;
    interactionState: DesktopInteractionState;
    title: string;
    workspaceRoot: string | null;
    cwd: string | null;
    getOrderedEntries(): DesktopThreadEntry[];
  };
  loadSnapshot(threadId: string, snapshot: DesktopThreadSnapshot | null): ThreadDeltaSnapshot;
  setActiveThread(threadId: string | null): void;
  dropBuffer(threadId: string): void;
  applyNotification(message: AppServerNotification): ThreadDelta[];
  getThreadState(threadId: string): ThreadBufferState | null;
  setDiffState(threadId: string, diffs: unknown[]): Array<ThreadDeltaDiffUpdated | ThreadDeltaInteractionStateChanged>;
  setInputRequestState(
    threadId: string,
    requestId: number | null,
    prompt: string,
    questions?: DesktopInputRequestState["questions"],
  ): ThreadDeltaInputRequested;
  setThreadInputState(
    threadId: string,
    threadInputState: DesktopThreadInputState | null,
  ): ThreadDeltaThreadInputStateChanged;
  appendSyntheticEntry(
    threadId: string,
    entry: Partial<DesktopThreadEntry> & { id?: string; kind?: DesktopThreadEntry["kind"] },
  ): Array<ThreadDeltaEntryCompleted | ThreadDeltaInteractionStateChanged>;
  hasBlockingWork(): boolean;
  clear(): void;
}

export function mapItemToEntry(item: Record<string, unknown>): DesktopThreadEntry | null;
