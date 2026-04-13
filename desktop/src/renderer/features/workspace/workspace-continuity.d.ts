import type {
  ProjectedSessionRecord,
  ProjectedWorkspaceRecord,
  SubstrateSessionRecord,
  SubstrateWorkspaceRecord,
} from "../../../main/contracts";

export function normalizeWorkspaceRoot(
  workspaceRoot: string | null | undefined,
): string | null;

export function findProjectedWorkspaceByRoot(
  workspaces: ProjectedWorkspaceRecord[],
  workspaceRoot: string | null | undefined,
): ProjectedWorkspaceRecord | null;

export function findSubstrateWorkspaceByRoot(
  workspaces: SubstrateWorkspaceRecord[],
  workspaceRoot: string | null | undefined,
): SubstrateWorkspaceRecord | null;

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

export function matchesWorkspaceSession(
  session: Pick<SubstrateSessionRecord, "workspace_id" | "metadata">,
  options?: {
    workspaceId?: string | null;
    workspaceRoot?: string | null;
  },
): boolean;

export function projectSubstrateSessionToProjectedSession(
  session: SubstrateSessionRecord,
  workspaceId?: string | null,
): ProjectedSessionRecord;

export function projectSubstrateWorkspaceToProjectedWorkspace(
  workspace: SubstrateWorkspaceRecord,
): ProjectedWorkspaceRecord;

export function synthesizeProjectedWorkspaceFromSessions(options: {
  profileId?: string;
  rootPath: string;
  sessions?: ProjectedSessionRecord[];
  workspaceId?: string | null;
}): ProjectedWorkspaceRecord;
