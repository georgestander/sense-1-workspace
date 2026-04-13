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

function toTimestamp(value) {
  const resolvedValue = firstString(value);
  if (!resolvedValue) {
    return 0;
  }

  const timestamp = Date.parse(resolvedValue);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function findProjectedWorkspaceByRoot(workspaces, workspaceRoot) {
  const resolvedWorkspaceRoot = firstString(workspaceRoot);
  if (!resolvedWorkspaceRoot) {
    return null;
  }

  return (Array.isArray(workspaces) ? workspaces : []).find(
    (workspace) => firstString(workspace?.root_path) === resolvedWorkspaceRoot,
  ) ?? null;
}

export function sortProjectedSessionsByContinuity(sessions) {
  return [...(Array.isArray(sessions) ? sessions : [])].sort((left, right) => {
    const delta =
      toTimestamp(firstString(right?.last_activity_at, right?.started_at)) -
      toTimestamp(firstString(left?.last_activity_at, left?.started_at));
    if (delta !== 0) {
      return delta;
    }

    return toTimestamp(right?.started_at) - toTimestamp(left?.started_at);
  });
}

export function buildWorkspaceContinuityState({ sessions = [], workspaceRoot = null, workspaces = [] } = {}) {
  const workspace = findProjectedWorkspaceByRoot(workspaces, workspaceRoot);
  const orderedSessions = sortProjectedSessionsByContinuity(sessions);
  const resumableSessions = orderedSessions.filter((session) => Boolean(firstString(session?.codex_thread_id)));

  return {
    workspace,
    orderedSessions,
    resumableSessions,
    latestResumableSession: resumableSessions[0] ?? null,
    hasHistory: orderedSessions.length > 0,
    hasResumableHistory: resumableSessions.length > 0,
    historyOnlySessionCount: orderedSessions.length - resumableSessions.length,
  };
}
