import type {
  SubstrateSessionRecord,
  SubstrateWorkspaceRecord,
} from "../main/contracts";

export type VisibleSubstrateSession = {
  readonly status: string;
  readonly threadId: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly workspaceRoot: string | null;
};

export function listVisibleSubstrateSessions(args: {
  readonly existingThreadIds?: readonly string[];
  readonly sessions?: readonly SubstrateSessionRecord[];
  readonly workspaces?: readonly SubstrateWorkspaceRecord[];
}): VisibleSubstrateSession[];
