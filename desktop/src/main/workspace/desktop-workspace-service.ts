import fs from "node:fs/promises";
import path from "node:path";
import type { AppServerProcessManager } from "../runtime/app-server-process-manager.js";
import {
  resolveProfileArtifactRoot,
  resolveProfileSubstrateDbPath,
  resolveSessionArtifactRoot,
} from "../profile/profile-state.js";
import type {
  DesktopInteractionState,
  DesktopLastSelectedThreadRequest,
  DesktopThreadArchiveRequest,
  DesktopThreadDeleteRequest,
  DesktopThreadRenameRequest,
  DesktopThreadRestoreRequest,
  DesktopThreadWorkspaceRootRequest,
  DesktopWorkspaceArchiveRequest,
  DesktopWorkspaceDeleteRequest,
  DesktopWorkspaceHydrateResult,
  DesktopWorkspacePermissionGrantRequest,
  DesktopWorkspacePolicyResult,
  DesktopWorkspaceOperatingModeRequest,
  DesktopWorkspaceRestoreRequest,
  DesktopWorkspaceSidebarOrderRequest,
} from "../contracts.ts";
import { DesktopWorkspaceStateService } from "./workspace-state-service.ts";
import {
  deleteSubstrateSession,
  deleteSubstrateWorkspace,
  getSubstrateSessionByThreadId,
  listSubstrateSessionsByWorkspace,
  setSubstrateSessionStatus,
  setSubstrateWorkspaceLifecycleState,
} from "../substrate/substrate.js";
import { rebuildSubstrateProjections } from "../substrate/substrate-projections.js";
import { getWorkspace as queryWorkspace, listObjectRefsBySession } from "../substrate/substrate-reader.js";
import { finalizeSessionSummary } from "../session/session-record.ts";
import {
  firstString,
} from "./workspace-service-helpers.ts";
import { DesktopWorkspacePolicyService } from "./workspace-policy-service.ts";
import {
  archiveThreadForPermanentDelete,
  cleanupDeletedThreadState,
  shouldAllowUnverifiedDelete,
} from "./workspace-thread-cleanup.ts";

export type DesktopWorkspaceServiceOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly manager: AppServerProcessManager;
  readonly resolveProfile?: () => Promise<{ id: string }>;
  readonly workspaceState: DesktopWorkspaceStateService;
};

export class DesktopWorkspaceService {
  readonly #env: NodeJS.ProcessEnv;
  readonly #manager: AppServerProcessManager;
  readonly #policyService: DesktopWorkspacePolicyService;
  readonly #resolveProfile: () => Promise<{ id: string }>;
  readonly #workspaceState: DesktopWorkspaceStateService;
  readonly #runtimeArchivedThreadIds = new Set<string>();

  constructor(options: DesktopWorkspaceServiceOptions) {
    this.#env = options.env ?? process.env;
    this.#manager = options.manager;
    this.#resolveProfile = options.resolveProfile ?? (async () => ({ id: "default" }));
    this.#workspaceState = options.workspaceState;
    this.#policyService = new DesktopWorkspacePolicyService({
      env: this.#env,
      resolveProfile: this.#resolveProfile,
      workspaceState: this.#workspaceState,
    });
  }

  async #profile(): Promise<{ id: string }> {
    return await this.#resolveProfile();
  }

  async rememberLastSelectedThread({ threadId }: DesktopLastSelectedThreadRequest): Promise<string> {
    return await this.#workspaceState.rememberLastSelectedThread(threadId);
  }

  async renameDesktopThread({ threadId, title }: DesktopThreadRenameRequest): Promise<void> {
    const resolvedThreadId = threadId.trim();
    const resolvedTitle = title.trim();
    if (!resolvedThreadId) {
      throw new Error("Choose a thread before renaming it.");
    }
    if (!resolvedTitle) {
      throw new Error("Thread title cannot be empty.");
    }

    await this.#manager.request("thread/name/set", {
      threadId: resolvedThreadId,
      name: resolvedTitle,
    });
  }

  async archiveDesktopThread({ threadId }: DesktopThreadArchiveRequest): Promise<void> {
    const resolvedThreadId = threadId.trim();
    if (!resolvedThreadId) {
      throw new Error("Choose a thread before archiving it.");
    }

    const profile = await this.#profile();
    const artifactRoot = await resolveProfileArtifactRoot(profile.id, this.#env);
    const session = await this.resolveSubstrateSessionByThreadId(resolvedThreadId);
    await this.#manager.request("thread/archive", {
      threadId: resolvedThreadId,
    });
    if (session?.id) {
      try {
        await this.#finalizeSessionSummary({
          artifactRoot,
          endedAt: new Date().toISOString(),
          sessionId: session.id,
        });
      } catch {
        // Non-fatal — the thread should still archive even if the summary write fails.
      }
    }
    await this.#workspaceState.forgetThreadInteractionState(resolvedThreadId);
    if (session?.id) {
      await setSubstrateSessionStatus({
        dbPath: resolveProfileSubstrateDbPath(profile.id, this.#env),
        sessionId: session.id,
        status: "archived",
      });
      await this.rebuildProjections();
    }
  }

  async restoreDesktopThread({ threadId }: DesktopThreadRestoreRequest): Promise<void> {
    const resolvedThreadId = threadId.trim();
    if (!resolvedThreadId) {
      throw new Error("Choose a thread before restoring it.");
    }

    const profile = await this.#profile();
    const dbPath = resolveProfileSubstrateDbPath(profile.id, this.#env);
    const session = await this.resolveSubstrateSessionByThreadId(resolvedThreadId);
    if (!session?.id) {
      throw new Error("This thread could not be restored.");
    }

    try {
      await this.#manager.request("thread/unarchive", {
        threadId: resolvedThreadId,
      });
    } catch {
      // Older runtimes may not expose unarchive yet. Restoring the local
      // session state is still enough to make the thread visible again.
    }

    await setSubstrateSessionStatus({
      dbPath,
      sessionId: session.id,
      status: "active",
    });
    await this.rebuildProjections();
  }

  async deleteDesktopThread({ threadId }: DesktopThreadDeleteRequest): Promise<void> {
    const resolvedThreadId = threadId.trim();
    if (!resolvedThreadId) {
      throw new Error("Choose a thread before deleting it.");
    }

    const profile = await this.#profile();
    const dbPath = resolveProfileSubstrateDbPath(profile.id, this.#env);
    const artifactRoot = await resolveProfileArtifactRoot(profile.id, this.#env);
    const session = await this.resolveSubstrateSessionByThreadId(resolvedThreadId);
    const threadWorkspaceRoot = firstString(session?.metadata?.workspaceRoot)
      ?? await this.resolveThreadWorkspaceRoot(resolvedThreadId);
    const allowUnverifiedDelete = await shouldAllowUnverifiedDelete(
      this.#env,
      [threadWorkspaceRoot],
      this.#resolveProfile,
    );

    if (session?.status !== "archived") {
      await archiveThreadForPermanentDelete({
        allowUnverifiedDelete,
        failureMessage: "This thread could not be deleted because Sense-1 could not archive it safely.",
        manager: this.#manager,
        runtimeArchivedThreadIds: this.#runtimeArchivedThreadIds,
        threadId: resolvedThreadId,
      });
    }

    await cleanupDeletedThreadState(this.#workspaceState, resolvedThreadId);
    if (session?.id) {
      await deleteSubstrateSession({
        dbPath,
        sessionId: session.id,
      });
      await this.removeSessionArtifacts(
        (typeof session.metadata?.artifactRoot === "string" ? session.metadata.artifactRoot : null) ?? artifactRoot,
        session.id,
      );
    }
    await this.rebuildProjections();
  }

  async rememberThreadWorkspaceRoot({
    threadId,
    workspaceRoot,
  }: DesktopThreadWorkspaceRootRequest): Promise<void> {
    await this.#workspaceState.rememberThreadWorkspaceRoot(threadId, workspaceRoot);
  }

  async rememberWorkspaceSidebarOrder({
    rootPaths,
  }: DesktopWorkspaceSidebarOrderRequest): Promise<void> {
    await this.#workspaceState.rememberWorkspaceSidebarOrder(rootPaths);
  }

  async resolveThreadWorkspaceRoot(threadId: string | null | undefined): Promise<string | null> {
    return await this.#policyService.resolveThreadWorkspaceRoot(threadId);
  }

  async loadThreadReviewContext(threadId: string) {
    const session = await this.resolveSubstrateSessionByThreadId(threadId);
    if (!session?.id) {
      return null;
    }

    const profile = await this.#profile();
    const dbPath = resolveProfileSubstrateDbPath(profile.id, this.#env);
    const refs = await listObjectRefsBySession({
      dbPath,
      limit: 250,
      sessionId: session.id,
    });
    const metadataReview =
      session.metadata?.reviewSummary && typeof session.metadata.reviewSummary === "object"
        ? session.metadata.reviewSummary as Record<string, unknown>
        : null;
    return {
      objectRefs: refs,
      summary:
        typeof metadataReview?.summary === "string" && metadataReview.summary.trim()
          ? metadataReview.summary.trim()
          : session.summary,
      updatedAt:
        typeof metadataReview?.updatedAt === "string" && metadataReview.updatedAt.trim()
          ? metadataReview.updatedAt.trim()
          : session.ended_at,
    };
  }

  async rememberThreadInteractionState(
    threadId: string | null | undefined,
    interactionState: DesktopInteractionState,
  ): Promise<void> {
    if (!threadId) {
      return;
    }

    try {
      await this.#workspaceState.rememberThreadInteractionState(threadId, interactionState);
    } catch {
      // Non-fatal — best-effort durability.
    }
  }

  async archiveWorkspace({ workspaceId }: DesktopWorkspaceArchiveRequest): Promise<void> {
    const resolvedWorkspaceId = workspaceId.trim();
    if (!resolvedWorkspaceId) {
      throw new Error("Choose a workspace before archiving it.");
    }

    const dbPath = await this.#resolveDbPath();
    const workspace = await queryWorkspace({ dbPath, workspaceId: resolvedWorkspaceId });
    if (!workspace) {
      throw new Error("This workspace could not be found.");
    }

    await setSubstrateWorkspaceLifecycleState({
      dbPath,
      workspaceId: resolvedWorkspaceId,
      status: "archived",
    });
    await this.#workspaceState.forgetRecentWorkspaceFolder(workspace.root_path);
    await this.#workspaceState.forgetWorkspaceSidebarRoot(workspace.root_path);
    await this.rebuildProjections();
  }

  async restoreWorkspace({ workspaceId }: DesktopWorkspaceRestoreRequest): Promise<void> {
    const resolvedWorkspaceId = workspaceId.trim();
    if (!resolvedWorkspaceId) {
      throw new Error("Choose a workspace before restoring it.");
    }

    const dbPath = await this.#resolveDbPath();
    const workspace = await queryWorkspace({ dbPath, workspaceId: resolvedWorkspaceId });
    if (!workspace) {
      throw new Error("This workspace could not be restored.");
    }

    await setSubstrateWorkspaceLifecycleState({
      dbPath,
      workspaceId: resolvedWorkspaceId,
      status: "active",
      archivedAt: null,
    });
    await this.#workspaceState.rememberWorkspaceFolder(workspace.root_path);
    await this.rebuildProjections();
  }

  async deleteWorkspace({ workspaceId }: DesktopWorkspaceDeleteRequest): Promise<void> {
    const resolvedWorkspaceId = workspaceId.trim();
    if (!resolvedWorkspaceId) {
      throw new Error("Choose a workspace before deleting it.");
    }

    const profile = await this.#profile();
    const dbPath = resolveProfileSubstrateDbPath(profile.id, this.#env);
    const defaultArtifactRoot = await resolveProfileArtifactRoot(profile.id, this.#env);
    const workspace = await queryWorkspace({ dbPath, workspaceId: resolvedWorkspaceId });
    if (!workspace) {
      throw new Error("This workspace could not be found.");
    }
    const allowUnverifiedDelete = await shouldAllowUnverifiedDelete(
      this.#env,
      [workspace.root_path],
      this.#resolveProfile,
    );

    const sessions = await listSubstrateSessionsByWorkspace({
      dbPath,
      workspaceId: resolvedWorkspaceId,
    });

    for (const session of sessions) {
      const threadId = session.codex_thread_id?.trim() ?? "";
      if (threadId && session.status !== "archived") {
        await archiveThreadForPermanentDelete({
          allowUnverifiedDelete,
          failureMessage: "This workspace could not be deleted because one of its threads could not be archived safely.",
          manager: this.#manager,
          runtimeArchivedThreadIds: this.#runtimeArchivedThreadIds,
          threadId,
        });
      }

      if (threadId) {
        await cleanupDeletedThreadState(this.#workspaceState, threadId);
      }

      await deleteSubstrateSession({
        dbPath,
        sessionId: session.id,
      });
      await this.removeSessionArtifacts(
        (typeof session.metadata?.artifactRoot === "string" ? session.metadata.artifactRoot : null) ?? defaultArtifactRoot,
        session.id,
      );
    }

    await deleteSubstrateWorkspace({
      dbPath,
      workspaceId: resolvedWorkspaceId,
    });
    await this.#workspaceState.forgetRecentWorkspaceFolder(workspace.root_path);
    await this.#workspaceState.forgetWorkspaceSidebarRoot(workspace.root_path);
    await this.rebuildProjections();
  }

  async rememberWorkspaceFolder(folderPath: string): Promise<void> {
    await this.#policyService.rememberWorkspaceFolder(folderPath);
  }

  async getWorkspacePolicy(rootPath: string): Promise<DesktopWorkspacePolicyResult> {
    return await this.#policyService.getWorkspacePolicy(rootPath);
  }

  async grantWorkspacePermission({
    mode,
    rootPath,
  }: DesktopWorkspacePermissionGrantRequest): Promise<DesktopWorkspacePolicyResult> {
    return await this.#policyService.grantWorkspacePermission({ mode, rootPath });
  }

  async setWorkspaceOperatingMode({
    mode,
    rootPath,
  }: DesktopWorkspaceOperatingModeRequest): Promise<DesktopWorkspacePolicyResult> {
    return await this.#policyService.setWorkspaceOperatingMode({ mode, rootPath });
  }

  async hydrateWorkspace(rootPath: string): Promise<DesktopWorkspaceHydrateResult> {
    return await this.#policyService.hydrateWorkspace(rootPath);
  }

  async resolveSubstrateSessionByThreadId(threadId: string) {
    const resolvedThreadId = threadId?.trim();
    if (!resolvedThreadId) {
      return null;
    }

    const profile = await this.#profile();
    return await getSubstrateSessionByThreadId({
      codexThreadId: resolvedThreadId,
      dbPath: resolveProfileSubstrateDbPath(profile.id, this.#env),
    });
  }

  async rebuildProjections(): Promise<void> {
    const profile = await this.#profile();
    await rebuildSubstrateProjections({
      dbPath: resolveProfileSubstrateDbPath(profile.id, this.#env),
      profileId: profile.id,
    });
  }

  async removeSessionArtifacts(artifactRoot: string | null, sessionId: string | null): Promise<void> {
    const resolvedArtifactRoot = artifactRoot?.trim();
    const resolvedSessionId = sessionId?.trim();
    if (!resolvedArtifactRoot || !resolvedSessionId) {
      return;
    }

    await fs.rm(resolveSessionArtifactRoot(resolvedArtifactRoot, resolvedSessionId), {
      force: true,
      recursive: true,
    });
  }

  async #resolveDbPath(): Promise<string> {
    const profile = await this.#profile();
    return resolveProfileSubstrateDbPath(profile.id, this.#env);
  }

  markRuntimeThreadArchived(threadId: string): void {
    const resolvedThreadId = threadId.trim();
    if (resolvedThreadId) {
      this.#runtimeArchivedThreadIds.add(resolvedThreadId);
    }
  }

  unmarkRuntimeThreadArchived(threadId: string): void {
    const resolvedThreadId = threadId.trim();
    if (resolvedThreadId) {
      this.#runtimeArchivedThreadIds.delete(resolvedThreadId);
    }
  }

  async #finalizeSessionSummary({
    artifactRoot,
    endedAt,
    sessionId,
    }: {
    artifactRoot: string;
    endedAt: string;
    sessionId: string;
  }): Promise<void> {
    const summaryRoot = artifactRoot.trim();
    if (!summaryRoot) {
      return;
    }
    await finalizeSessionSummary({
      artifactRoot: summaryRoot,
      endedAt,
      sessionId,
    });
  }
}
