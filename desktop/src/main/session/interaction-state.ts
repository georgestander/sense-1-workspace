import type {
  DesktopApprovalEvent,
  DesktopInteractionState,
  DesktopPlanState,
  DesktopThreadEntry,
} from "../contracts.ts";

function firstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

const VALID_INTERACTION_STATES = new Set<DesktopInteractionState>([
  "conversation",
  "clarification",
  "executing",
  "review",
]);

const PLANNING_INTERACTION_STATES = new Set<DesktopInteractionState>([
  "clarification",
]);

const EXECUTION_ENTRY_KINDS = new Set<DesktopThreadEntry["kind"]>([
  "command",
  "fileChange",
]);

function hasEntriesOfKind(
  entries: DesktopThreadEntry[],
  kinds: ReadonlySet<DesktopThreadEntry["kind"]>,
): boolean {
  return entries.some((entry) => kinds.has(entry.kind));
}

function hasExecutionApproval(pendingApprovals: Array<Partial<DesktopApprovalEvent>>): boolean {
  return pendingApprovals.some((approval) => Boolean(firstString(approval.kind)));
}

export function normalizeDesktopInteractionState(value: unknown): DesktopInteractionState {
  const resolved = firstString(value);
  return resolved && VALID_INTERACTION_STATES.has(resolved as DesktopInteractionState)
    ? (resolved as DesktopInteractionState)
    : "conversation";
}

export function resolveDesktopInteractionState({
  diffState = null,
  entries = [],
  inputRequestState = null,
  pendingApprovals = [],
  planState = null,
  planStateVisible = null,
  previousInteractionState = null,
  threadState = null,
}: {
  diffState?: { readonly diffs: unknown[] } | null;
  entries?: DesktopThreadEntry[];
  inputRequestState?: {
    readonly requestId: number | null;
    readonly prompt: string;
    readonly threadId?: string;
  } | null;
  pendingApprovals?: Array<Partial<DesktopApprovalEvent>>;
  planState?: DesktopPlanState | null;
  planStateVisible?: boolean | null;
  previousInteractionState?: DesktopInteractionState | null;
  threadState?: string | null;
  workspaceRoot?: string | null;
} = {}): DesktopInteractionState {
  const previous = normalizeDesktopInteractionState(previousInteractionState);
  const resolvedThreadState = firstString(threadState, "idle");
  const isRunning = resolvedThreadState === "running" || resolvedThreadState === "active";
  const hasInputRequest = Boolean(firstString(inputRequestState?.prompt));
  const hasPlanState =
    Boolean(
      typeof planStateVisible === "boolean"
        ? planStateVisible
        : firstString(planState?.text) || (Array.isArray(planState?.steps) && planState.steps.length > 0),
    ) || hasEntriesOfKind(entries, new Set(["plan"]));
  const hasExecutionApprovalRequest = hasExecutionApproval(pendingApprovals);
  const hasExecutionEntries = hasEntriesOfKind(entries, EXECUTION_ENTRY_KINDS);
  const hasReviewEntries = hasEntriesOfKind(entries, new Set(["review"]));
  const hasDiffs = Array.isArray(diffState?.diffs) && diffState.diffs.length > 0;
  const hasPlanningContext =
    hasPlanState ||
    PLANNING_INTERACTION_STATES.has(previous);

  if (hasInputRequest) {
    return "clarification";
  }

  if (isRunning) {
    if (hasExecutionApprovalRequest || hasExecutionEntries || hasDiffs) {
      return "executing";
    }

    if (hasPlanningContext) {
      return "conversation";
    }

    return "conversation";
  }

  if (hasExecutionApprovalRequest) {
    return "executing";
  }

  if (hasReviewEntries || previous === "review") {
    return "review";
  }

  if (hasPlanState || PLANNING_INTERACTION_STATES.has(previous)) {
    return "conversation";
  }

  return "conversation";
}
