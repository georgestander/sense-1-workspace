import { resolveDesktopInteractionState } from "../session/interaction-state.ts";

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

function formatUpdatedLabel(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    return "recently";
  }

  const date = new Date(raw);
  if (Number.isNaN(date.valueOf())) {
    return raw;
  }

  const now = Date.now();
  const diffMs = now - date.valueOf();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return "just now";
  }

  if (diffMs < hour) {
    const value = Math.max(1, Math.round(diffMs / minute));
    return `${value} min ago`;
  }

  if (diffMs < day) {
    const value = Math.max(1, Math.round(diffMs / hour));
    return `${value} hr ago`;
  }

  const value = Math.max(1, Math.round(diffMs / day));
  if (value <= 7) {
    return `${value} day${value === 1 ? "" : "s"} ago`;
  }

  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  });
}

export function deriveWorkspaceRoot(thread, fallbackWorkspaceRoot = null) {
  const rememberedWorkspaceRoot = firstString(fallbackWorkspaceRoot);
  if (rememberedWorkspaceRoot) {
    return rememberedWorkspaceRoot;
  }

  const turns = Array.isArray(thread?.turns) ? thread.turns : [];
  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const items = Array.isArray(turns[turnIndex]?.items) ? turns[turnIndex].items : [];
    for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const item = items[itemIndex];
      if (item?.type !== "commandExecution") {
        continue;
      }

      const cwd = firstString(item.cwd);
      if (cwd) {
        return cwd;
      }
    }
  }

  return null;
}

export function deriveThreadCwd(thread, fallbackCwd = null) {
  const rememberedCwd = firstString(thread?.cwd, fallbackCwd);
  if (rememberedCwd) {
    return rememberedCwd;
  }

  const turns = Array.isArray(thread?.turns) ? thread.turns : [];
  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const items = Array.isArray(turns[turnIndex]?.items) ? turns[turnIndex].items : [];
    for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const item = items[itemIndex];
      if (item?.type !== "commandExecution") {
        continue;
      }

      const cwd = firstString(item.cwd);
      if (cwd) {
        return cwd;
      }
    }
  }

  return null;
}

export function normalizeDesktopSummary(summary, workspaceRoot = null, cwd = null, interactionState = null) {
  return {
    id: summary.id,
    title: summary.title,
    subtitle: summary.subtitle,
    state: summary.state,
    interactionState:
      firstString(summary.interactionState) ||
      resolveDesktopInteractionState({
        previousInteractionState: interactionState,
        threadState: summary.state,
        workspaceRoot,
      }),
    updatedAt: summary.updatedAt,
    updatedLabel: formatUpdatedLabel(summary.updatedAt),
    workspaceRoot,
    cwd,
  };
}

export function normalizeDesktopThreadSummary(thread, workspaceRoot = null, interactionState = null) {
  const updatedAtRaw =
    typeof thread?.updatedAt === "number"
      ? thread.updatedAt
      : typeof thread?.createdAt === "number"
        ? thread.createdAt
        : Math.floor(Date.now() / 1000);
  const updatedAt = new Date(updatedAtRaw * 1000).toISOString();

  return {
    id: firstString(thread?.id) ?? "",
    title: firstString(thread?.name, thread?.preview) ?? "Untitled thread",
    subtitle: firstString(thread?.preview) ?? "Sense-1 thread",
    state:
      thread?.status?.type === "active"
        ? firstString(...(Array.isArray(thread.status?.activeFlags) ? thread.status.activeFlags : [])) || "active"
        : firstString(thread?.status?.type) || "idle",
    interactionState: resolveDesktopInteractionState({
      previousInteractionState: interactionState,
      threadState:
        thread?.status?.type === "active"
          ? firstString(...(Array.isArray(thread.status?.activeFlags) ? thread.status.activeFlags : [])) || "active"
          : firstString(thread?.status?.type) || "idle",
      workspaceRoot: deriveWorkspaceRoot(thread, workspaceRoot),
    }),
    updatedAt,
    workspaceRoot: deriveWorkspaceRoot(thread, workspaceRoot),
    cwd: deriveThreadCwd(thread, workspaceRoot),
  };
}
