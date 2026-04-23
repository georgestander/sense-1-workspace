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
  latestUserText: string | null;
  pendingBody: string | null;
  sawCommentary: boolean;
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

function textFromUserMessage(item: Record<string, unknown>): string | null {
  const content = Array.isArray(item.content) ? item.content : [];
  const text = content
    .map((entry) => asRecord(entry))
    .filter((entry) => entry?.type === "text")
    .map((entry) => firstString(entry?.text))
    .filter(Boolean)
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function normalizeTopic(value: string): string {
  return value
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.:;,\s]+$/g, "")
    .trim();
}

function describeUserRequest(text: string | null): string | null {
  if (!text) {
    return null;
  }

  const cleaned = text.replace(/\s+/g, " ").trim();
  const comparison = cleaned.match(/\b(?:choosing between|compare|comparing)\s+(.{4,120}?)(?:\s+for\b|[.?!]|$)/i);
  if (comparison?.[1]) {
    const topic = normalizeTopic(comparison[1]);
    if (topic) {
      return `your ${topic} comparison`;
    }
  }

  const about = cleaned.match(/\babout\s+(.{4,100}?)(?:[.?!]|$)/i);
  if (about?.[1]) {
    const topic = normalizeTopic(about[1]);
    if (topic) {
      return `your question about ${topic}`;
    }
  }

  const firstSentence = normalizeTopic(cleaned.split(/[.?!]/)[0] ?? "");
  if (!firstSentence) {
    return null;
  }
  if (firstSentence.length <= 80) {
    return `your request: ${firstSentence}`;
  }
  return "your request";
}

function bodyForItem(item: Record<string, unknown>, latestUserText: string | null): string | null {
  const type = firstString(item.type);
  if (!type) {
    return null;
  }

  const requestDescription = describeUserRequest(latestUserText);

  if (type === "commandExecution") {
    return "I'm checking this in the workspace now; once the command finishes I'll use the result and keep going.";
  }
  if (type === "fileChange") {
    return "I'm applying the file changes now, then I'll verify the result before wrapping up.";
  }
  if (type === "webSearch") {
    if (requestDescription) {
      return `I'm checking current sources for ${requestDescription} so I can answer with fresh context.`;
    }
    return "I'm checking sources now; once the results return I'll fold them into the answer.";
  }
  if (type === "mcpToolCall" || type === "dynamicToolCall" || type === "collabToolCall") {
    if (requestDescription) {
      return `I'm using a connected tool for ${requestDescription}, then I'll fold the result back into the answer.`;
    }
    return "I'm using a connected tool now, and I'll continue as soon as it returns.";
  }
  if (type === "imageView") {
    return "I'm checking the image now so I can continue from what's actually on screen.";
  }
  if (type === "contextCompaction") {
    return "I'm refreshing context so the rest of this run stays focused and responsive.";
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
    if ((method === "item/started" || method === "item/completed") && item?.type === "userMessage") {
      const state = this.#getTurn(threadId, turnId);
      const text = textFromUserMessage(item);
      if (text) {
        state.latestUserText = text;
      }
      state.lastVisibleAt = this.#now();
      return;
    }

    if ((method === "item/started" || method === "item/completed") && item?.type === "agentMessage") {
      const phase = firstString(item.phase);
      if (phase === "commentary" || phase === "final_answer") {
        this.#markVisible(threadId, turnId, phase === "commentary");
      }
      return;
    }

    if (method !== "item/started" || !item) {
      return;
    }

    const state = this.#getTurn(threadId, turnId);
    if (state.sawCommentary) {
      return;
    }

    const body = bodyForItem(item, state.latestUserText);
    if (!body) {
      return;
    }

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
      latestUserText: null,
      pendingBody: null,
      sawCommentary: false,
      timer: null,
    };
    this.#turns.set(key, state);
    return state;
  }

  #markVisible(threadId: string, turnId: string, isCommentary = false): void {
    const state = this.#getTurn(threadId, turnId);
    if (isCommentary) {
      state.sawCommentary = true;
    }
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
