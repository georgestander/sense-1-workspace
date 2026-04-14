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

export function normalizeWorkspaceRoot(workspaceRoot) {
  const resolvedWorkspaceRoot = firstString(workspaceRoot);
  if (!resolvedWorkspaceRoot) {
    return null;
  }

  return resolvedWorkspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
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
  const resolvedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
  if (!resolvedWorkspaceRoot) {
    return null;
  }

  return (Array.isArray(workspaces) ? workspaces : []).find(
    (workspace) => normalizeWorkspaceRoot(workspace?.root_path) === resolvedWorkspaceRoot,
  ) ?? null;
}

export function findSubstrateWorkspaceByRoot(workspaces, workspaceRoot) {
  const resolvedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
  if (!resolvedWorkspaceRoot) {
    return null;
  }

  return (Array.isArray(workspaces) ? workspaces : []).find(
    (workspace) => normalizeWorkspaceRoot(workspace?.root_path) === resolvedWorkspaceRoot,
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

export function matchesWorkspaceSession(session, { workspaceId = null, workspaceRoot = null } = {}) {
  const resolvedWorkspaceId = firstString(workspaceId);
  if (resolvedWorkspaceId && firstString(session?.workspace_id) === resolvedWorkspaceId) {
    return true;
  }

  const resolvedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
  if (!resolvedWorkspaceRoot) {
    return false;
  }

  return normalizeWorkspaceRoot(session?.metadata?.workspaceRoot) === resolvedWorkspaceRoot;
}

export function projectSubstrateSessionToProjectedSession(session, workspaceId = null) {
  return {
    session_id: session.id,
    profile_id: session.profile_id,
    workspace_id: firstString(session.workspace_id, workspaceId),
    actor_id: session.actor_id,
    codex_thread_id: firstString(session.codex_thread_id),
    title: firstString(session.title),
    model: firstString(session.model),
    status: firstString(session.status) ?? "active",
    started_at: firstString(session.started_at) ?? "",
    ended_at: firstString(session.ended_at),
    last_activity_at: firstString(session.ended_at, session.started_at),
    event_count: 0,
    file_change_count: 0,
    metadata: session?.metadata && typeof session.metadata === "object" ? session.metadata : {},
  };
}

export function projectSubstrateWorkspaceToProjectedWorkspace(workspace) {
  return {
    workspace_id: workspace.id,
    profile_id: workspace.profile_id,
    scope_id: workspace.scope_id,
    root_path: workspace.root_path,
    display_name: firstString(workspace.display_name),
    status: workspace.status === "archived" ? "archived" : "active",
    archived_at: firstString(workspace.archived_at),
    registered_at: firstString(workspace.registered_at) ?? "",
    last_activity_at: firstString(workspace.last_active_at, workspace.registered_at),
    session_count: Number.isFinite(workspace?.session_count) ? workspace.session_count : 0,
    event_count: 0,
    file_change_count: 0,
    last_session_id: null,
    last_thread_id: null,
    recent_file_paths: [],
    metadata: workspace?.metadata && typeof workspace.metadata === "object" ? workspace.metadata : {},
  };
}

export function synthesizeProjectedWorkspaceFromSessions({
  profileId = "",
  rootPath,
  sessions = [],
  workspaceId = null,
}) {
  const orderedSessions = sortProjectedSessionsByContinuity(sessions);
  const latestSession = orderedSessions[0] ?? null;
  return {
    workspace_id: firstString(workspaceId) ?? `workspace:${normalizeWorkspaceRoot(rootPath) ?? "unknown"}`,
    profile_id: firstString(profileId, latestSession?.profile_id) ?? "",
    scope_id: "",
    root_path: firstString(rootPath) ?? "",
    display_name: null,
    status: "active",
    archived_at: null,
    registered_at: firstString(latestSession?.started_at) ?? "",
    last_activity_at: firstString(latestSession?.last_activity_at, latestSession?.started_at),
    session_count: orderedSessions.length,
    event_count: 0,
    file_change_count: 0,
    last_session_id: firstString(latestSession?.session_id) ?? null,
    last_thread_id: firstString(latestSession?.codex_thread_id) ?? null,
    recent_file_paths: [],
    metadata: {},
  };
}
