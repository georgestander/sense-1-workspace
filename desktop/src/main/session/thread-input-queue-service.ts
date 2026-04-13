import type { DesktopQueuedThreadInput, DesktopThreadInputState } from "../../shared/contracts/thread-input.js";

type ThreadCompletionStatus = DesktopThreadInputState["lastCompletionStatus"];

type ThreadQueueState = {
  queuedMessages: DesktopQueuedThreadInput[];
  hasUnseenCompletion: boolean;
  lastCompletionAt: string | null;
  lastCompletionStatus: ThreadCompletionStatus;
};

type TurnCompletionResult = {
  nextQueuedMessage: DesktopQueuedThreadInput | null;
  shouldNotify: boolean;
  threadInputState: DesktopThreadInputState | null;
};

export class ThreadInputQueueService {
  readonly #stateByThreadId = new Map<string, ThreadQueueState>();
  #nextMessageId = 1;

  clear(): void {
    this.#stateByThreadId.clear();
    this.#nextMessageId = 1;
  }

  getThreadInputState(threadId: string | null | undefined): DesktopThreadInputState | null {
    const resolvedThreadId = threadId?.trim();
    if (!resolvedThreadId) {
      return null;
    }

    return cloneThreadInputState(this.#stateByThreadId.get(resolvedThreadId) ?? null);
  }

  queueInput(threadId: string, input: string): DesktopThreadInputState | null {
    const resolvedThreadId = threadId.trim();
    const resolvedInput = input.trim();
    if (!resolvedThreadId) {
      throw new Error("Choose a thread before queueing a follow-up.");
    }
    if (!resolvedInput) {
      throw new Error("Add follow-up guidance before queueing.");
    }

    const state = this.#getOrCreateState(resolvedThreadId);
    const nextMessageId = this.#nextMessageId;
    this.#nextMessageId += 1;
    state.queuedMessages.push({
      id: `queued-${nextMessageId}`,
      text: resolvedInput,
      enqueuedAt: new Date().toISOString(),
    });
    return cloneThreadInputState(state);
  }

  restoreQueuedMessage(threadId: string, message: DesktopQueuedThreadInput): DesktopThreadInputState | null {
    const resolvedThreadId = threadId.trim();
    if (!resolvedThreadId) {
      return null;
    }

    const state = this.#getOrCreateState(resolvedThreadId);
    state.queuedMessages.unshift({ ...message });
    return cloneThreadInputState(state);
  }

  markThreadStarted(threadId: string): DesktopThreadInputState | null {
    const resolvedThreadId = threadId.trim();
    if (!resolvedThreadId) {
      return null;
    }

    const state = this.#stateByThreadId.get(resolvedThreadId);
    if (!state) {
      return null;
    }

    state.hasUnseenCompletion = false;
    state.lastCompletionAt = null;
    state.lastCompletionStatus = null;
    return cloneThreadInputState(state);
  }

  markThreadViewed(threadId: string | null | undefined): DesktopThreadInputState | null {
    const resolvedThreadId = threadId?.trim();
    if (!resolvedThreadId) {
      return null;
    }

    const state = this.#stateByThreadId.get(resolvedThreadId);
    if (!state || !state.hasUnseenCompletion) {
      return cloneThreadInputState(state ?? null);
    }

    state.hasUnseenCompletion = false;
    return cloneThreadInputState(state);
  }

  dropThread(threadId: string | null | undefined): void {
    const resolvedThreadId = threadId?.trim();
    if (!resolvedThreadId) {
      return;
    }

    this.#stateByThreadId.delete(resolvedThreadId);
  }

  handleTurnCompleted({
    threadId,
    visibleThreadId,
    windowFocused,
    status = "completed",
  }: {
    threadId: string;
    visibleThreadId: string | null;
    windowFocused: boolean;
    status?: ThreadCompletionStatus;
  }): TurnCompletionResult {
    const resolvedThreadId = threadId.trim();
    if (!resolvedThreadId) {
      return {
        nextQueuedMessage: null,
        shouldNotify: false,
        threadInputState: null,
      };
    }

    const state = this.#getOrCreateState(resolvedThreadId);
    const nextQueuedMessage =
      status === "completed"
        ? (state.queuedMessages.shift() ?? null)
        : null;
    if (nextQueuedMessage) {
      state.hasUnseenCompletion = false;
      state.lastCompletionAt = null;
      state.lastCompletionStatus = null;
      return {
        nextQueuedMessage,
        shouldNotify: false,
        threadInputState: cloneThreadInputState(state),
      };
    }

    const completedOffscreen = resolvedThreadId !== (visibleThreadId?.trim() || null);
    state.lastCompletionAt = new Date().toISOString();
    state.lastCompletionStatus = status;
    state.hasUnseenCompletion = completedOffscreen;

    return {
      nextQueuedMessage: null,
      shouldNotify: !windowFocused || completedOffscreen,
      threadInputState: cloneThreadInputState(state),
    };
  }

  #getOrCreateState(threadId: string): ThreadQueueState {
    let state = this.#stateByThreadId.get(threadId);
    if (!state) {
      state = {
        queuedMessages: [],
        hasUnseenCompletion: false,
        lastCompletionAt: null,
        lastCompletionStatus: null,
      };
      this.#stateByThreadId.set(threadId, state);
    }

    return state;
  }
}

function cloneThreadInputState(state: ThreadQueueState | null): DesktopThreadInputState | null {
  if (!state) {
    return null;
  }

  const hasMeaningfulState =
    state.queuedMessages.length > 0
    || state.hasUnseenCompletion
    || state.lastCompletionAt !== null
    || state.lastCompletionStatus !== null;
  if (!hasMeaningfulState) {
    return null;
  }

  return {
    queuedMessages: state.queuedMessages.map((message) => ({ ...message })),
    hasUnseenCompletion: state.hasUnseenCompletion,
    lastCompletionAt: state.lastCompletionAt,
    lastCompletionStatus: state.lastCompletionStatus,
  };
}
