import { isSessionArchived, isWorkspaceArchived } from "../../../shared/lifecycle.js";

export function listVisibleSubstrateSessions({
  existingThreadIds = [],
  sessions = [],
  workspaces = [],
}) {
  const existingIds = new Set(existingThreadIds);
  const workspaceRootById = new Map(
    workspaces
      .filter((workspace) => !isWorkspaceArchived(workspace.metadata))
      .map((workspace) => [workspace.id, workspace.root_path]),
  );
  const visibleSessions = [];

  for (const session of sessions) {
    if (isSessionArchived(session)) {
      continue;
    }

    const threadId = typeof session.codex_thread_id === "string" ? session.codex_thread_id.trim() : "";
    if (!threadId || existingIds.has(threadId)) {
      continue;
    }

    if (session.workspace_id && !workspaceRootById.has(session.workspace_id)) {
      continue;
    }

    visibleSessions.push({
      status: session.status,
      threadId,
      title: session.title || "Untitled session",
      updatedAt: session.ended_at || session.started_at,
      workspaceRoot: session.workspace_id ? workspaceRootById.get(session.workspace_id) ?? null : null,
    });
  }

  return visibleSessions;
}
