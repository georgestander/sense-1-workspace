import { resolveDesktopInteractionState } from "./interaction-state.ts";

function firstString(...values) {
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

const EXECUTION_ENTRY_KINDS = new Set(["command", "fileChange"]);

function hasEntriesOfKind(entries, kinds) {
  return (Array.isArray(entries) ? entries : []).some((entry) => kinds.has(firstString(entry?.kind) || ""));
}

function hasMeaningfulPlanState(planState) {
  return Boolean(
    firstString(planState?.text) || (Array.isArray(planState?.steps) && planState.steps.length > 0),
  );
}

function hasExecutionApproval(pendingApprovals) {
  return (Array.isArray(pendingApprovals) ? pendingApprovals : []).some((approval) => {
    const kind = firstString(approval?.kind);
    return Boolean(kind);
  });
}

function hasExecutionContext(buffer) {
  return (
    hasEntriesOfKind(buffer.getOrderedEntries(), EXECUTION_ENTRY_KINDS) ||
    (Array.isArray(buffer.diffState?.diffs) && buffer.diffState.diffs.length > 0) ||
    hasExecutionApproval(Array.from(buffer.pendingApprovalsById.values()))
  );
}

export function shouldSurfaceTurnPlanUpdate(buffer, planState) {
  if (!hasMeaningfulPlanState(planState)) {
    return false;
  }

  if (hasExecutionContext(buffer)) {
    return false;
  }

  return true;
}

export function buildInteractionState(buffer) {
  const folderRoot = buffer.workspaceRoot || buffer.cwd;
  return resolveDesktopInteractionState({
    diffState: buffer.diffState,
    entries: buffer.getOrderedEntries(),
    inputRequestState: buffer.inputRequestState,
    pendingApprovals: Array.from(buffer.pendingApprovalsById.values()),
    planState: buffer.planState,
    planStateVisible: buffer.planStateVisible,
    previousInteractionState: buffer.interactionState,
    threadState: buffer.state,
    workspaceRoot: folderRoot,
  });
}

export function maybeInteractionStateChanged(buffer, threadId) {
  const nextInteractionState = buildInteractionState(buffer);
  if (nextInteractionState === buffer.interactionState) {
    return null;
  }

  buffer.interactionState = nextInteractionState;
  buffer.updatedAt = new Date().toISOString();
  return {
    kind: "interactionStateChanged",
    threadId,
    interactionState: buffer.interactionState,
    updatedAt: buffer.updatedAt,
  };
}
