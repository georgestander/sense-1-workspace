type RuntimeProgressEntry = {
  readonly id: string;
  readonly kind: "assistant";
  readonly title: string;
  readonly body: string;
  readonly status: string;
  readonly phase: string;
};

type RuntimeProgressEmitter = (threadId: string, entry: RuntimeProgressEntry) => void;

type TimerHandle = ReturnType<typeof setTimeout>;

type RuntimeProgressNarratorOptions = {
  readonly enabled?: boolean;
  readonly now?: () => number;
  readonly setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  readonly clearTimer?: (timer: TimerHandle) => void;
  readonly silenceThresholdMs?: number;
  readonly cooldownMs?: number;
};

type TurnProgressState = {
  readonly threadId: string;
  readonly turnId: string;
  lastVisibleAt: number;
  lastEmitAt: number;
  lastBody: string | null;
  pendingBody: string | null;
  timer: TimerHandle | null;
};

type RuntimeNotification = {
  readonly method?: unknown;
  readonly params?: Record<string, unknown> | null;
};

const DEFAULT_SILENCE_THRESHOLD_MS = 4000;
const DEFAULT_COOLDOWN_MS = 10000;

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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function isEnabledByEnv(): boolean {
  return process.env.SENSE1_PROGRESS_NARRATION !== "0";
}

function resolveTurnId(params: Record<string, unknown> | null): string | null {
  const turn = asRecord(params?.turn);
  return firstString(params?.turnId, turn?.id);
}

function bodyForItem(item: Record<string, unknown>): string | null {
  const type = firstString(item.type);
  if (!type) {
    return null;
  }

  if (type === "commandExecution") {
    return "Sense-1 is running a command and will continue once it finishes.";
  }
  if (type === "fileChange") {
    return "Sense-1 is applying file changes, then it will verify the result.";
  }
  if (type === "webSearch") {
    return "Sense-1 is searching and will continue once results return.";
  }
  if (type === "mcpToolCall" || type === "dynamicToolCall" || type === "collabToolCall") {
    return "Sense-1 is using a connected tool and will continue once it returns.";
  }
  if (type === "imageView") {
    return "Sense-1 is checking the image before continuing.";
  }
  if (type === "contextCompaction") {
    return "Sense-1 is refreshing context so the run can stay focused.";
  }

  return null;
}

export class RuntimeProgressNarrator {
  readonly #enabled: boolean;
  readonly #now: () => number;
  readonly #setTimer: (callback: () => void, delayMs: number) => TimerHandle;
  readonly #clearTimer: (timer: TimerHandle) => void;
  readonly #silenceThresholdMs: number;
  readonly #cooldownMs: number;
  readonly #turns = new Map<string, TurnProgressState>();

  constructor(options: RuntimeProgressNarratorOptions = {}) {
    this.#enabled = options.enabled ?? isEnabledByEnv();
    this.#now = options.now ?? (() => Date.now());
    this.#setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.#clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
    this.#silenceThresholdMs = options.silenceThresholdMs ?? DEFAULT_SILENCE_THRESHOLD_MS;
    this.#cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  }

  observe(message: RuntimeNotification, emit: RuntimeProgressEmitter): void {
    if (!this.#enabled) {
      return;
    }

    const method = firstString(message?.method);
    const params = asRecord(message?.params);
    const threadId = firstString(params?.threadId);
    if (!method || !threadId) {
      return;
    }

    const turnId = resolveTurnId(params) ?? this.#latestTurnIdForThread(threadId);

    if (method === "turn/completed" || method === "turn/failed") {
      this.#clearTurn(threadId, turnId);
      return;
    }

    if (method === "turn/started") {
      const startedTurnId = resolveTurnId(params);
      if (startedTurnId) {
        this.#getTurn(threadId, startedTurnId).lastVisibleAt = this.#now();
      }
      return;
    }

    if (!turnId) {
      return;
    }

    if (method === "item/agentMessage/delta") {
      this.#markVisible(threadId, turnId);
      return;
    }

    const item = asRecord(params?.item);
    if ((method === "item/started" || method === "item/completed") && item?.type === "agentMessage") {
      const phase = firstString(item.phase);
      if (phase === "commentary" || phase === "final_answer") {
        this.#markVisible(threadId, turnId);
      }
      return;
    }

    if (method !== "item/started" || !item) {
      return;
    }

    const body = bodyForItem(item);
    if (!body) {
      return;
    }

    const state = this.#getTurn(threadId, turnId);
    state.pendingBody = body;
    this.#schedule(state, emit);
  }

  clear(): void {
    for (const state of this.#turns.values()) {
      this.#clearScheduledTimer(state);
    }
    this.#turns.clear();
  }

  #getTurn(threadId: string, turnId: string): TurnProgressState {
    const key = this.#turnKey(threadId, turnId);
    const existing = this.#turns.get(key);
    if (existing) {
      return existing;
    }

    const state: TurnProgressState = {
      threadId,
      turnId,
      lastVisibleAt: this.#now(),
      lastEmitAt: 0,
      lastBody: null,
      pendingBody: null,
      timer: null,
    };
    this.#turns.set(key, state);
    return state;
  }

  #markVisible(threadId: string, turnId: string): void {
    const state = this.#getTurn(threadId, turnId);
    state.lastVisibleAt = this.#now();
    state.pendingBody = null;
    this.#clearScheduledTimer(state);
  }

  #schedule(state: TurnProgressState, emit: RuntimeProgressEmitter, delayMs: number | null = null): void {
    if (state.timer) {
      return;
    }

    const waitMs = Math.max(1, delayMs ?? this.#silenceThresholdMs - (this.#now() - state.lastVisibleAt));
    state.timer = this.#setTimer(() => {
      state.timer = null;
      this.#emitIfDue(state, emit);
    }, waitMs);
  }

  #emitIfDue(state: TurnProgressState, emit: RuntimeProgressEmitter): void {
    const body = state.pendingBody;
    if (!body) {
      return;
    }

    const now = this.#now();
    if (now - state.lastVisibleAt < this.#silenceThresholdMs) {
      this.#schedule(state, emit);
      return;
    }
    if (state.lastEmitAt > 0 && now - state.lastEmitAt < this.#cooldownMs) {
      this.#schedule(state, emit, this.#cooldownMs - (now - state.lastEmitAt));
      return;
    }
    if (state.lastBody === body) {
      return;
    }

    state.lastEmitAt = now;
    state.lastBody = body;
    emit(state.threadId, {
      id: `runtime-progress-${state.threadId}-${state.turnId}`,
      kind: "assistant",
      title: "Sense-1 progress",
      body,
      status: "complete",
      phase: "commentary",
    });
  }

  #clearTurn(threadId: string, turnId: string | null): void {
    if (turnId) {
      const key = this.#turnKey(threadId, turnId);
      const state = this.#turns.get(key);
      if (state) {
        this.#clearScheduledTimer(state);
        this.#turns.delete(key);
      }
      return;
    }

    for (const [key, state] of this.#turns.entries()) {
      if (state.threadId !== threadId) {
        continue;
      }
      this.#clearScheduledTimer(state);
      this.#turns.delete(key);
    }
  }

  #clearScheduledTimer(state: TurnProgressState): void {
    if (!state.timer) {
      return;
    }
    this.#clearTimer(state.timer);
    state.timer = null;
  }

  #latestTurnIdForThread(threadId: string): string | null {
    let latest: TurnProgressState | null = null;
    for (const state of this.#turns.values()) {
      if (state.threadId !== threadId) {
        continue;
      }
      if (!latest || state.lastVisibleAt > latest.lastVisibleAt) {
        latest = state;
      }
    }
    return latest?.turnId ?? null;
  }

  #turnKey(threadId: string, turnId: string): string {
    return `${threadId}:${turnId}`;
  }
}
