import { resolveDesktopProfile } from "../bootstrap/desktop-bootstrap.js";
import {
  clearLastSelectedThreadIdIfMatches,
  forgetPendingApprovalsForThread,
  forgetRecentWorkspaceFolder,
  forgetThreadWorkspaceRoot,
  forgetThreadInteractionState,
  forgetWorkspaceSidebarRoot,
  loadWorkspaceSidebarOrder,
  loadPendingApprovals,
  loadThreadInteractionStates,
  loadThreadWorkspaceRoot,
  persistLastSelectedThreadId,
  persistPendingApprovals,
  rememberRecentWorkspaceFolder,
  rememberWorkspaceSidebarOrder,
  rememberThreadInteractionState,
  rememberThreadWorkspaceRoot,
} from "../profile/profile-state.js";
import type { DesktopInteractionState } from "../contracts.ts";

export class DesktopWorkspaceStateService {
  readonly #env: NodeJS.ProcessEnv;
  readonly #resolveProfile: () => Promise<{ id: string }>;
  readonly #threadInteractionStateCache = new Map<string, DesktopInteractionState>();
  readonly #threadInteractionStateDesired = new Map<string, DesktopInteractionState>();
  readonly #threadInteractionStateWriteQueue = new Map<string, Promise<void>>();

  constructor(
    options:
      | NodeJS.ProcessEnv
      | {
          env?: NodeJS.ProcessEnv;
          resolveProfile?: () => Promise<{ id: string }>;
        } = process.env,
  ) {
    if (isWorkspaceStateServiceOptions(options)) {
      this.#env = options.env ?? process.env;
      this.#resolveProfile = options.resolveProfile ?? (async () => await resolveDesktopProfile(this.#env));
      return;
    }

    this.#env = options ?? process.env;
    this.#resolveProfile = async () => await resolveDesktopProfile(this.#env);
  }

  async #profile(): Promise<{ id: string }> {
    return await this.#resolveProfile();
  }

  async rememberLastSelectedThread(threadId: string | null): Promise<string> {
    const profile = await this.#profile();
    await persistLastSelectedThreadId(profile.id, threadId, this.#env);
    return profile.id;
  }

  async rememberThreadWorkspaceRoot(threadId: string, workspaceRoot: string): Promise<string> {
    const profile = await this.#profile();
    await rememberThreadWorkspaceRoot(profile.id, threadId, workspaceRoot, this.#env);
    await rememberRecentWorkspaceFolder(profile.id, workspaceRoot, this.#env);
    return profile.id;
  }

  async loadThreadWorkspaceRoot(threadId: string): Promise<string | null> {
    const profile = await this.#profile();
    return await loadThreadWorkspaceRoot(profile.id, threadId, this.#env);
  }

  async rememberWorkspaceFolder(folderPath: string): Promise<string> {
    const profile = await this.#profile();
    await rememberRecentWorkspaceFolder(profile.id, folderPath, this.#env);
    return profile.id;
  }

  async loadWorkspaceSidebarOrder(): Promise<string[]> {
    const profile = await this.#profile();
    return await loadWorkspaceSidebarOrder(profile.id, this.#env);
  }

  async rememberWorkspaceSidebarOrder(rootPaths: string[]): Promise<string> {
    const profile = await this.#profile();
    await rememberWorkspaceSidebarOrder(profile.id, rootPaths, this.#env);
    return profile.id;
  }

  async loadThreadInteractionStates(): Promise<Record<string, DesktopInteractionState>> {
    const profile = await this.#profile();
    const states = await loadThreadInteractionStates(profile.id, this.#env);
    clearInteractionStateCacheForProfile(this.#threadInteractionStateCache, profile.id);
    clearInteractionStateCacheForProfile(this.#threadInteractionStateDesired, profile.id);
    for (const entry of states) {
      const cacheKey = buildInteractionStateCacheKey(profile.id, entry.threadId);
      this.#threadInteractionStateCache.set(cacheKey, entry.interactionState as DesktopInteractionState);
      this.#threadInteractionStateDesired.set(cacheKey, entry.interactionState as DesktopInteractionState);
    }
    return Object.fromEntries(
      states.map((entry) => [entry.threadId, entry.interactionState as DesktopInteractionState]),
    );
  }

  async rememberThreadInteractionState(threadId: string, interactionState: DesktopInteractionState): Promise<string> {
    const profile = await this.#profile();
    const resolvedThreadId = threadId.trim();
    if (!resolvedThreadId) {
      return profile.id;
    }
    const cacheKey = buildInteractionStateCacheKey(profile.id, resolvedThreadId);
    const previousDesiredState = this.#threadInteractionStateDesired.get(cacheKey);
    if (previousDesiredState === interactionState) {
      return profile.id;
    }

    this.#threadInteractionStateDesired.set(cacheKey, interactionState);
    const previousQueue = this.#threadInteractionStateWriteQueue.get(cacheKey) ?? Promise.resolve();
    const nextQueue = previousQueue
      .catch(() => {})
      .then(async () => {
        const desiredState = this.#threadInteractionStateDesired.get(cacheKey);
        if (!desiredState || this.#threadInteractionStateCache.get(cacheKey) === desiredState) {
          return;
        }

        await rememberThreadInteractionState(profile.id, resolvedThreadId, desiredState, this.#env);
        this.#threadInteractionStateCache.set(cacheKey, desiredState);
      })
      .finally(() => {
        if (this.#threadInteractionStateWriteQueue.get(cacheKey) === nextQueue) {
          this.#threadInteractionStateWriteQueue.delete(cacheKey);
        }
      });
    this.#threadInteractionStateWriteQueue.set(cacheKey, nextQueue);
    await nextQueue;
    return profile.id;
  }

  async forgetThreadInteractionState(threadId: string): Promise<string> {
    const profile = await this.#profile();
    const resolvedThreadId = threadId.trim();
    if (!resolvedThreadId) {
      return profile.id;
    }
    const cacheKey = buildInteractionStateCacheKey(profile.id, resolvedThreadId);
    this.#threadInteractionStateDesired.delete(cacheKey);
    const previousQueue = this.#threadInteractionStateWriteQueue.get(cacheKey) ?? Promise.resolve();
    const nextQueue = previousQueue
      .catch(() => {})
      .then(async () => {
        await forgetThreadInteractionState(profile.id, resolvedThreadId, this.#env);
        this.#threadInteractionStateCache.delete(cacheKey);
      })
      .finally(() => {
        if (this.#threadInteractionStateWriteQueue.get(cacheKey) === nextQueue) {
          this.#threadInteractionStateWriteQueue.delete(cacheKey);
        }
      });
    this.#threadInteractionStateWriteQueue.set(cacheKey, nextQueue);
    await nextQueue;
    return profile.id;
  }

  async forgetThreadWorkspaceRoot(threadId: string): Promise<string> {
    const profile = await this.#profile();
    await forgetThreadWorkspaceRoot(profile.id, threadId, this.#env);
    return profile.id;
  }

  async clearLastSelectedThreadIdIfMatches(threadId: string): Promise<string> {
    const profile = await this.#profile();
    await clearLastSelectedThreadIdIfMatches(profile.id, threadId, this.#env);
    return profile.id;
  }

  async forgetRecentWorkspaceFolder(folderPath: string): Promise<string> {
    const profile = await this.#profile();
    await forgetRecentWorkspaceFolder(profile.id, folderPath, this.#env);
    return profile.id;
  }

  async forgetWorkspaceSidebarRoot(rootPath: string): Promise<string> {
    const profile = await this.#profile();
    await forgetWorkspaceSidebarRoot(profile.id, rootPath, this.#env);
    return profile.id;
  }

  async loadPendingApprovals(): Promise<unknown[]> {
    const profile = await this.#profile();
    return await loadPendingApprovals(profile.id, this.#env);
  }

  async persistPendingApprovals(approvals: unknown[]): Promise<void> {
    const profile = await this.#profile();
    await persistPendingApprovals(profile.id, approvals, this.#env);
  }

  async forgetPendingApprovalsForThread(threadId: string): Promise<string> {
    const profile = await this.#profile();
    await forgetPendingApprovalsForThread(profile.id, threadId, this.#env);
    return profile.id;
  }
}

function isWorkspaceStateServiceOptions(
  value: NodeJS.ProcessEnv | { env?: NodeJS.ProcessEnv; resolveProfile?: () => Promise<{ id: string }> },
): value is { env?: NodeJS.ProcessEnv; resolveProfile?: () => Promise<{ id: string }> } {
  return Boolean(value) && typeof value === "object" && ("env" in value || "resolveProfile" in value);
}

function buildInteractionStateCacheKey(profileId: string, threadId: string): string {
  return `${profileId}:${threadId}`;
}

function clearInteractionStateCacheForProfile(
  cache: Map<string, DesktopInteractionState>,
  profileId: string,
): void {
  const cachePrefix = `${profileId}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(cachePrefix)) {
      cache.delete(key);
    }
  }
}
