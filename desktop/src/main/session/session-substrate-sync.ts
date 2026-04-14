import {
  resolveProfileArtifactRoot,
  resolveProfileSubstrateDbPath,
} from "../profile/profile-state.js";
import { getSession as querySession } from "../substrate/substrate-reader.js";
import { writeRuntimeMessageToSubstrate as persistRuntimeMessageToSubstrate } from "../substrate/substrate-writer.js";
import { updateSessionRecordPathsWritten } from "./session-record.ts";
import { formatError } from "./session-controller-support.ts";

const MAX_DEFERRED_SUBSTRATE_MESSAGES_PER_THREAD = 25;

type DeferredSubstrateMessage = {
  message: unknown;
  receivedAt: string;
};

type RuntimeSessionContext = {
  id: string;
  profile_id: string;
  scope_id: string;
  actor_id: string;
  codex_thread_id: string | null;
  workspace_id: string | null;
};

type SessionSubstrateSyncOptions = {
  env: NodeJS.ProcessEnv;
  onThreadTitleSuggested?: ((threadId: string, title: string) => Promise<void>) | null;
  resolveProfile: () => Promise<{ id: string }>;
  resolveSessionContextByThreadId: (threadId: string) => Promise<RuntimeSessionContext | null>;
};

export class SessionSubstrateSync {
  readonly #env: NodeJS.ProcessEnv;
  readonly #onThreadTitleSuggested: ((threadId: string, title: string) => Promise<void>) | null;
  readonly #resolveProfile: () => Promise<{ id: string }>;
  readonly #resolveSessionContextByThreadId: (
    threadId: string,
  ) => Promise<RuntimeSessionContext | null>;
  readonly #deferredSubstrateMessagesByThreadId = new Map<string, DeferredSubstrateMessage[]>();
  #substrateWriteQueue: Promise<void> = Promise.resolve();

  constructor({ env, onThreadTitleSuggested, resolveProfile, resolveSessionContextByThreadId }: SessionSubstrateSyncOptions) {
    this.#env = env;
    this.#onThreadTitleSuggested = onThreadTitleSuggested ?? null;
    this.#resolveProfile = resolveProfile;
    this.#resolveSessionContextByThreadId = resolveSessionContextByThreadId;
  }

  enqueueWrite(task: () => Promise<void>): Promise<void> {
    const next = this.#substrateWriteQueue.then(task);
    this.#substrateWriteQueue = next.catch((error) => {
      console.warn(`[desktop:substrate] Failed to write substrate event: ${formatError(error)}`);
    });
    return next.catch(() => {});
  }

  async waitForIdle(): Promise<void> {
    await this.#substrateWriteQueue;
  }

  clearDeferredMessages(): void {
    this.#deferredSubstrateMessagesByThreadId.clear();
  }

  #deferSubstrateMessage(threadId: string, message: unknown, receivedAt: string): void {
    const resolvedThreadId = threadId?.trim();
    if (!resolvedThreadId) {
      return;
    }

    const queue = this.#deferredSubstrateMessagesByThreadId.get(resolvedThreadId) ?? [];
    queue.push({ message, receivedAt });
    if (queue.length > MAX_DEFERRED_SUBSTRATE_MESSAGES_PER_THREAD) {
      queue.splice(0, queue.length - MAX_DEFERRED_SUBSTRATE_MESSAGES_PER_THREAD);
    }
    this.#deferredSubstrateMessagesByThreadId.set(resolvedThreadId, queue);
  }

  async writeRuntimeMessage({
    dbPath,
    message,
    receivedAt = null,
  }: {
    dbPath: string;
    message: unknown;
    receivedAt?: string | null;
  }): Promise<void> {
    const outcome = await persistRuntimeMessageToSubstrate({
      dbPath,
      message,
      receivedAt,
      onSessionRecordUpdate: async (update) => {
        const session = await querySession({
          dbPath,
          sessionId: update.sessionId,
        });
        if (!session?.profile_id) {
          return;
        }

        const artifactRoot = await resolveProfileArtifactRoot(session.profile_id, this.#env);
        for (const writtenPath of update.pathsWritten) {
          await updateSessionRecordPathsWritten({
            artifactRoot,
            path: writtenPath,
            sessionId: update.sessionId,
            ts: update.logCursor.toTs,
          });
        }
      },
      resolveSessionContextByThreadId: async (threadId: string) =>
        await this.#resolveSessionContextByThreadId(threadId),
    });
    if (outcome.status === "deferred" && outcome.threadId) {
      const deferredAt =
        typeof receivedAt === "string" && receivedAt.trim()
          ? receivedAt.trim()
          : new Date().toISOString();
      this.#deferSubstrateMessage(outcome.threadId, message, deferredAt);
      return;
    }

    if (
      this.#onThreadTitleSuggested
      && outcome.threadId
      && typeof outcome.suggestedThreadTitle === "string"
      && outcome.suggestedThreadTitle.trim()
    ) {
      try {
        await this.#onThreadTitleSuggested(outcome.threadId, outcome.suggestedThreadTitle);
      } catch (error) {
        console.warn(`[desktop:substrate] Failed to sync suggested thread title: ${formatError(error)}`);
      }
    }
  }

  async writeRuntimeMessageForCurrentProfile(message: unknown): Promise<void> {
    const profile = await this.#resolveProfile();
    await this.writeRuntimeMessage({
      dbPath: resolveProfileSubstrateDbPath(profile.id, this.#env),
      message,
    });
  }

  async flushDeferredMessages(threadId: string, dbPath: string): Promise<void> {
    const resolvedThreadId = threadId?.trim();
    if (!resolvedThreadId) {
      return;
    }

    await this.enqueueWrite(async () => {
      const deferredMessages = this.#deferredSubstrateMessagesByThreadId.get(resolvedThreadId);
      if (!deferredMessages?.length) {
        return;
      }

      this.#deferredSubstrateMessagesByThreadId.delete(resolvedThreadId);
      for (const deferred of deferredMessages) {
        await this.writeRuntimeMessage({
          dbPath,
          message: deferred.message,
          receivedAt: deferred.receivedAt,
        });
      }
    });
  }
}
