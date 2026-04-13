import type { AppServerProcessManager } from "../runtime/app-server-process-manager.js";
import { resolveDesktopProfile } from "../bootstrap/desktop-bootstrap.js";
import { resolveProfileArtifactRoot } from "../profile/profile-state.js";
import {
  firstString,
  isLikelyLegacySenseSessionRoot,
  isRuntimeUnavailableDeleteError,
  isSafeMissingThreadError,
  isSenseGeneratedTempWorkspaceRoot,
  isWithinPath,
} from "./workspace-service-helpers.ts";

type CleanupWorkspaceState = {
  clearLastSelectedThreadIdIfMatches: (threadId: string) => Promise<unknown>;
  forgetPendingApprovalsForThread: (threadId: string) => Promise<unknown>;
  forgetThreadInteractionState: (threadId: string) => Promise<unknown>;
  forgetThreadWorkspaceRoot: (threadId: string) => Promise<unknown>;
};

type ArchiveThreadForPermanentDeleteArgs = {
  allowUnverifiedDelete?: boolean;
  failureMessage: string;
  manager: AppServerProcessManager;
  runtimeArchivedThreadIds: Set<string>;
  threadId: string;
};

export async function cleanupDeletedThreadState(
  workspaceState: CleanupWorkspaceState,
  threadId: string,
): Promise<void> {
  await workspaceState.forgetThreadInteractionState(threadId);
  await workspaceState.forgetThreadWorkspaceRoot(threadId);
  await workspaceState.clearLastSelectedThreadIdIfMatches(threadId);
  await workspaceState.forgetPendingApprovalsForThread(threadId);
}

export async function archiveThreadForPermanentDelete({
  allowUnverifiedDelete = false,
  failureMessage,
  manager,
  runtimeArchivedThreadIds,
  threadId,
}: ArchiveThreadForPermanentDeleteArgs): Promise<void> {
  const resolvedThreadId = threadId.trim();
  if (!resolvedThreadId) {
    return;
  }

  try {
    await manager.request("thread/archive", {
      threadId: resolvedThreadId,
    });
    runtimeArchivedThreadIds.add(resolvedThreadId);
  } catch (archiveError) {
    if (isSafeMissingThreadError(archiveError)) {
      runtimeArchivedThreadIds.delete(resolvedThreadId);
      return;
    }
    if (isRuntimeUnavailableDeleteError(archiveError)) {
      return;
    }
    if (runtimeArchivedThreadIds.has(resolvedThreadId)) {
      return;
    }

    try {
      const result = await manager.request("thread/read", {
        threadId: resolvedThreadId,
        includeTurns: false,
      }) as {
        thread?: {
          status?: {
            type?: string | null;
          } | null;
        } | null;
      };
      const status = firstString(result?.thread?.status?.type);
      if (!result?.thread || status === "archived") {
        runtimeArchivedThreadIds.add(resolvedThreadId);
        return;
      }
    } catch (readError) {
      if (isSafeMissingThreadError(readError)) {
        runtimeArchivedThreadIds.delete(resolvedThreadId);
        return;
      }
      if (isRuntimeUnavailableDeleteError(readError)) {
        return;
      }
    }

    if (allowUnverifiedDelete) {
      return;
    }

    const runtimeKnowsThread = await runtimeStillKnowsThread(manager, resolvedThreadId);
    if (runtimeKnowsThread === false) {
      return;
    }

    throw new Error(failureMessage);
  }
}

async function runtimeStillKnowsThread(
  manager: AppServerProcessManager,
  threadId: string,
): Promise<boolean | null> {
  const resolvedThreadId = threadId.trim();
  if (!resolvedThreadId) {
    return null;
  }

  let listedThreadIds: string[];
  try {
    const listedResult = await manager.request("thread/list", {
      limit: 200,
      sortKey: "updated_at",
      sourceKinds: ["appServer"],
    }) as {
      data?: Array<{ id?: unknown }>;
    };
    listedThreadIds = Array.isArray(listedResult?.data)
      ? listedResult.data
        .map((entry) => firstString(entry?.id))
        .filter((entry): entry is string => Boolean(entry))
      : [];
  } catch {
    return null;
  }

  if (listedThreadIds.includes(resolvedThreadId)) {
    return true;
  }

  try {
    const loadedResult = await manager.request("thread/loaded/list") as {
      data?: unknown[];
    };
    const loadedThreadIds = Array.isArray(loadedResult?.data)
      ? loadedResult.data
        .map((entry) => typeof entry === "string" ? entry.trim() : "")
        .filter(Boolean)
      : [];
    return loadedThreadIds.includes(resolvedThreadId);
  } catch {
    return null;
  }
}

export async function shouldAllowUnverifiedDelete(
  env: NodeJS.ProcessEnv,
  candidateRoots: Array<string | null | undefined>,
  resolveProfile: () => Promise<{ id: string }> = async () => await resolveDesktopProfile(env),
): Promise<boolean> {
  if (candidateRoots.some((candidateRoot) => isSenseGeneratedTempWorkspaceRoot(candidateRoot))) {
    return true;
  }

  if (candidateRoots.some((candidateRoot) => isLikelyLegacySenseSessionRoot(candidateRoot))) {
    return true;
  }

  const profile = await resolveProfile();
  const profileArtifactRoot = await resolveProfileArtifactRoot(profile.id, env);
  return candidateRoots.some((candidateRoot) => isWithinPath(profileArtifactRoot, candidateRoot));
}
