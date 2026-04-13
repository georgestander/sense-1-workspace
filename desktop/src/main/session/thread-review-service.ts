import type { AppServerProcessManager } from "../runtime/app-server-process-manager.js";
import { readDesktopThread as readDesktopThreadDetails } from "../runtime/live-thread-runtime.js";
import { resolveProfileSubstrateDbPath } from "../profile/profile-state.js";
import type { DesktopThreadReadResult } from "../contracts";
import { getPendingQuestionByThreadId } from "../substrate/substrate-reader.js";
import { asRecord, questionsFromMetadata } from "./session-controller-support.ts";
import type { DesktopWorkspaceStateService } from "../workspace/workspace-state-service.ts";
import type { DesktopWorkspaceService } from "../workspace/desktop-workspace-service.ts";

type ThreadReviewServiceOptions = {
  env: NodeJS.ProcessEnv;
  manager: AppServerProcessManager;
  resolveProfile: () => Promise<{ id: string }>;
  workspaceState: DesktopWorkspaceStateService;
  workspaceService: DesktopWorkspaceService;
};

export class ThreadReviewService {
  readonly #env: NodeJS.ProcessEnv;
  readonly #manager: AppServerProcessManager;
  readonly #resolveProfile: () => Promise<{ id: string }>;
  readonly #workspaceState: DesktopWorkspaceStateService;
  readonly #workspaceService: DesktopWorkspaceService;

  constructor({
    env,
    manager,
    resolveProfile,
    workspaceState,
    workspaceService,
  }: ThreadReviewServiceOptions) {
    this.#env = env;
    this.#manager = manager;
    this.#resolveProfile = resolveProfile;
    this.#workspaceState = workspaceState;
    this.#workspaceService = workspaceService;
  }

  async readDesktopThread(threadId: string): Promise<DesktopThreadReadResult> {
    const persistedWorkspaceRoot = await this.#workspaceService.resolveThreadWorkspaceRoot(threadId);
    const interactionStates = await this.#workspaceState.loadThreadInteractionStates();
    const reviewContext = await this.#workspaceService.loadThreadReviewContext(threadId);
    const result = await readDesktopThreadDetails(
      this.#manager,
      threadId,
      persistedWorkspaceRoot,
      interactionStates[threadId] ?? null,
      reviewContext,
    );
    if (!result.thread) {
      return result;
    }

    const profile = await this.#resolveProfile();
    const dbPath = resolveProfileSubstrateDbPath(profile.id, this.#env);
    const pendingQuestion = await getPendingQuestionByThreadId({
      codexThreadId: threadId,
      dbPath,
    });

    return {
      thread: {
        ...result.thread,
        interactionState: result.thread.interactionState,
        inputRequestState: pendingQuestion
          ? {
              requestId: pendingQuestion.request_id,
              prompt: pendingQuestion.prompt,
              threadId,
              questions: questionsFromMetadata(pendingQuestion.metadata),
            }
          : result.thread.inputRequestState ?? null,
      },
    };
  }

  async maybeStartNativeReview(message: unknown): Promise<void> {
    const record = asRecord(message);
    if (firstString(record?.method) !== "turn/completed") {
      return;
    }

    const params = asRecord(record?.params);
    const threadId = firstString(params?.threadId);
    const turn = asRecord(params?.turn);
    const turnStatus = firstString(turn?.status);
    if (!threadId || (turnStatus && turnStatus !== "completed")) {
      return;
    }

    const interactionStates = await this.#workspaceState.loadThreadInteractionStates();
    const previousInteractionState = interactionStates[threadId] ?? null;
    if (previousInteractionState === "review") {
      return;
    }

    const persistedWorkspaceRoot = await this.#workspaceService.resolveThreadWorkspaceRoot(threadId);
    const reviewContext = await this.#workspaceService.loadThreadReviewContext(threadId);
    const result = await readDesktopThreadDetails(
      this.#manager,
      threadId,
      persistedWorkspaceRoot,
      previousInteractionState,
      reviewContext,
    );
    if (result.thread?.interactionState !== "review") {
      return;
    }

    await this.#requestReview(threadId);
    await this.#workspaceService.rememberThreadInteractionState(threadId, "review");
  }

  async #requestReview(threadId: string): Promise<void> {
    const resolvedThreadId = threadId?.trim();
    if (!resolvedThreadId) {
      return;
    }

    const manager = this.#manager as AppServerProcessManager & {
      requestReview?: (threadId: string, options?: { delivery?: string; target?: unknown }) => Promise<unknown>;
    };
    if (typeof manager.requestReview === "function") {
      await manager.requestReview(resolvedThreadId, {
        delivery: "inline",
        target: { type: "uncommittedChanges" },
      });
      return;
    }

    await this.#manager.request("review/start", {
      delivery: "inline",
      target: { type: "uncommittedChanges" },
      threadId: resolvedThreadId,
    });
  }
}

function firstString(...values: unknown[]): string | null {
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
