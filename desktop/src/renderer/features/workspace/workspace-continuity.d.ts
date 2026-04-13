import type { ProjectedSessionRecord, ProjectedWorkspaceRecord } from "../main/contracts";

export function findProjectedWorkspaceByRoot(
  workspaces: ProjectedWorkspaceRecord[],
  workspaceRoot: string | null | undefined,
): ProjectedWorkspaceRecord | null;

export function sortProjectedSessionsByContinuity(
  sessions: ProjectedSessionRecord[],
): ProjectedSessionRecord[];

export function buildWorkspaceContinuityState(options?: {
  sessions?: ProjectedSessionRecord[];
  workspaceRoot?: string | null;
  workspaces?: ProjectedWorkspaceRecord[];
}): {
  workspace: ProjectedWorkspaceRecord | null;
  orderedSessions: ProjectedSessionRecord[];
  resumableSessions: ProjectedSessionRecord[];
  latestResumableSession: ProjectedSessionRecord | null;
  hasHistory: boolean;
  hasResumableHistory: boolean;
  historyOnlySessionCount: number;
};
