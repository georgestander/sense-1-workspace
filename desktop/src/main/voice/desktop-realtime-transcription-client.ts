import type {
  DesktopRuntimeEvent,
  DesktopVoiceAppendAudioRequest,
  DesktopVoiceAudioChunk,
  DesktopVoiceState,
  DesktopVoiceStopRequest,
} from "../contracts.ts";

const REALTIME_TRANSCRIPTION_URL = "wss://api.openai.com/v1/realtime?intent=transcription";
const REALTIME_BETA_HEADER = "realtime=v1";
const REALTIME_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const REALTIME_TRANSCRIPTION_LANGUAGE = "en";
const REALTIME_OPEN_STATE = 1;
const REALTIME_CLOSE_TIMEOUT_MS = 4_000;
const REALTIME_START_TIMEOUT_MS = 10_000;
const REALTIME_STOP_TIMEOUT_MS = 4_000;

type DesktopRealtimeWebSocket = {
  readyState: number;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  onerror: ((event: { message?: string; type?: string }) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onopen: (() => void) | null;
  close(code?: number, reason?: string): void;
  send(data: string): void;
};

type DesktopRealtimeWebSocketFactory = (
  url: string,
  init: {
    headers: Record<string, string>;
  },
) => DesktopRealtimeWebSocket;

type DesktopRealtimeTranscriptionClientOptions = {
  emitEvent: (event: DesktopRuntimeEvent) => void | Promise<void>;
  resolveAccessToken: () => Promise<string | null>;
  webSocketFactory?: DesktopRealtimeWebSocketFactory;
};

type DesktopRealtimeTranscriptionSessionOptions = {
  emitEvent: (event: DesktopRuntimeEvent) => void | Promise<void>;
  onClosed: (threadId: string) => void;
  prompt?: string | null;
  threadId: string;
  token: string;
  webSocketFactory: DesktopRealtimeWebSocketFactory;
};

type Deferred<T> = {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return {
    promise,
    reject,
    resolve,
  };
}

function firstString(...values: Array<unknown>): string | null {
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

function normalizeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}

async function resolveMessageText(data: unknown): Promise<string> {
  if (typeof data === "string") {
    return data;
  }

  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return await data.text();
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }

  return String(data);
}

function buildRealtimeTranscriptionSession(prompt?: string | null): Record<string, unknown> {
  const transcription: Record<string, unknown> = {
    language: REALTIME_TRANSCRIPTION_LANGUAGE,
    model: REALTIME_TRANSCRIPTION_MODEL,
  };
  if (typeof prompt === "string") {
    transcription.prompt = prompt;
  }

  return {
    input_audio_format: "pcm16",
    input_audio_noise_reduction: {
      type: "near_field",
    },
    input_audio_transcription: transcription,
    turn_detection: null,
  };
}

function createDefaultWebSocket(
  url: string,
  init: {
    headers: Record<string, string>;
  },
): DesktopRealtimeWebSocket {
  const WebSocketCtor = WebSocket as unknown as {
    new(url: string, init: WebSocketInit): DesktopRealtimeWebSocket;
  };
  return new WebSocketCtor(url, init as WebSocketInit);
}

class DesktopRealtimeTranscriptionSession {
  readonly #emitEvent: DesktopRealtimeTranscriptionSessionOptions["emitEvent"];
  readonly #finalTranscriptReady = createDeferred<void>();
  readonly #onClosed: DesktopRealtimeTranscriptionSessionOptions["onClosed"];
  readonly #prompt: string | null;
  readonly #threadId: string;
  readonly #token: string;
  readonly #webSocketFactory: DesktopRealtimeWebSocketFactory;
  readonly #wsClosed = createDeferred<void>();
  #audioAppended = false;
  #closed = false;
  #messageQueue = Promise.resolve();
  #sessionId: string | null = null;
  #stopRequested = false;
  #webSocket: DesktopRealtimeWebSocket | null = null;

  constructor(options: DesktopRealtimeTranscriptionSessionOptions) {
    this.#emitEvent = options.emitEvent;
    this.#onClosed = options.onClosed;
    this.#prompt = typeof options.prompt === "string" ? options.prompt : null;
    this.#threadId = options.threadId;
    this.#token = options.token;
    this.#webSocketFactory = options.webSocketFactory;
  }

  async start(): Promise<void> {
    await this.#emitStateChanged("starting");
    const startReady = createDeferred<void>();
    const startTimeout = setTimeout(() => {
      startReady.reject(new Error("Timed out while starting voice input."));
    }, REALTIME_START_TIMEOUT_MS);

    const webSocket = this.#webSocketFactory(REALTIME_TRANSCRIPTION_URL, {
      headers: {
        Authorization: `Bearer ${this.#token}`,
        "OpenAI-Beta": REALTIME_BETA_HEADER,
      },
    });
    this.#webSocket = webSocket;

    webSocket.onopen = () => {
      try {
        this.#send({
          session: buildRealtimeTranscriptionSession(this.#prompt),
          type: "transcription_session.update",
        });
      } catch (error) {
        startReady.reject(error);
      }
    };

    webSocket.onmessage = (event) => {
      this.#messageQueue = this.#messageQueue.then(async () => {
        const raw = await resolveMessageText(event.data);
        const message = JSON.parse(raw);
        const type = firstString(message?.type);
        if (!type) {
          return;
        }

        if (type === "transcription_session.created" || type === "transcription_session.updated") {
          const sessionRecord =
            message?.session && typeof message.session === "object"
              ? message.session as { id?: unknown }
              : message as { id?: unknown };
          this.#sessionId = firstString(sessionRecord?.id);
          if (type === "transcription_session.updated") {
            startReady.resolve();
            await this.#emitStateChanged("active");
          }
          return;
        }

        if (type === "conversation.item.input_audio_transcription.delta") {
          await this.#emitEvent({
            isFinal: false,
            kind: "voiceTranscriptUpdated",
            role: "user",
            text: firstString(message?.delta) ?? "",
            threadId: this.#threadId,
          });
          return;
        }

        if (type === "conversation.item.input_audio_transcription.completed") {
          await this.#emitEvent({
            isFinal: true,
            kind: "voiceTranscriptUpdated",
            role: "user",
            text: firstString(message?.transcript) ?? "",
            threadId: this.#threadId,
          });
          this.#finalTranscriptReady.resolve();
          return;
        }

        if (type === "error") {
          const payload =
            message?.error && typeof message.error === "object"
              ? message.error as { message?: unknown }
              : null;
          const messageText = firstString(payload?.message) ?? "Voice input failed.";
          startReady.reject(new Error(messageText));
          this.#finalTranscriptReady.resolve();
          await this.#emitEvent({
            kind: "voiceError",
            message: messageText,
            threadId: this.#threadId,
          });
          this.#closeSocket("voice-error");
        }
      }).catch((error) => {
        startReady.reject(error);
        this.#finalTranscriptReady.resolve();
        void this.#emitEvent({
          kind: "voiceError",
          message: normalizeErrorMessage(error, "Voice input failed."),
          threadId: this.#threadId,
        });
        this.#closeSocket("voice-error");
      });
    };

    webSocket.onerror = (event) => {
      const message = firstString(event?.message) ?? "Voice input failed.";
      startReady.reject(new Error(message));
      this.#finalTranscriptReady.resolve();
      void this.#emitEvent({
        kind: "voiceError",
        message,
        threadId: this.#threadId,
      });
    };

    webSocket.onclose = (event) => {
      this.#finalTranscriptReady.resolve();
      this.#handleClosed(event).catch(() => {});
    };

    try {
      await startReady.promise;
    } catch (error) {
      this.#closeSocket("voice-start-failed");
      throw error;
    } finally {
      clearTimeout(startTimeout);
    }
  }

  async appendAudio(audio: DesktopVoiceAudioChunk): Promise<void> {
    this.#audioAppended = true;
    this.#send({
      audio: audio.data,
      type: "input_audio_buffer.append",
    });
  }

  async stop(): Promise<void> {
    if (this.#closed) {
      await this.#wsClosed.promise;
      return;
    }
    if (!this.#stopRequested) {
      this.#stopRequested = true;
      if (this.#audioAppended) {
        this.#send({
          type: "input_audio_buffer.commit",
        });
        await Promise.race([
          this.#finalTranscriptReady.promise,
          new Promise<void>((resolve) => setTimeout(resolve, REALTIME_STOP_TIMEOUT_MS)),
        ]);
      }
      this.#closeSocket("voice-stop");
    }

    await Promise.race([
      this.#wsClosed.promise,
      new Promise<void>((resolve) => setTimeout(resolve, REALTIME_CLOSE_TIMEOUT_MS)),
    ]);
  }

  async dispose(): Promise<void> {
    this.#finalTranscriptReady.resolve();
    this.#closeSocket("voice-dispose");
    await Promise.race([
      this.#wsClosed.promise,
      new Promise<void>((resolve) => setTimeout(resolve, REALTIME_CLOSE_TIMEOUT_MS)),
    ]);
  }

  #closeSocket(reason: string): void {
    const webSocket = this.#webSocket;
    if (!webSocket) {
      this.#handleClosed({ reason }).catch(() => {});
      return;
    }
    if (webSocket.readyState >= 2) {
      return;
    }
    try {
      webSocket.close(1000, reason);
    } catch {
      this.#handleClosed({ reason }).catch(() => {});
    }
  }

  async #emitStateChanged(state: DesktopVoiceState, reason: string | null = null): Promise<void> {
    await this.#emitEvent({
      kind: "voiceStateChanged",
      reason,
      sessionId: this.#sessionId,
      state,
      threadId: this.#threadId,
    });
  }

  async #handleClosed(event: { reason?: string }): Promise<void> {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    this.#webSocket = null;
    await this.#emitStateChanged("stopped", firstString(event?.reason));
    this.#onClosed(this.#threadId);
    this.#wsClosed.resolve();
  }

  #send(payload: Record<string, unknown>): void {
    const webSocket = this.#webSocket;
    if (!webSocket || webSocket.readyState !== REALTIME_OPEN_STATE) {
      throw new Error("Voice input is not connected.");
    }
    webSocket.send(JSON.stringify(payload));
  }
}

export interface DesktopVoiceClient {
  appendAudio(request: DesktopVoiceAppendAudioRequest): Promise<void>;
  dispose(): Promise<void>;
  hasSession(threadId: string): boolean;
  start(request: {
    prompt?: string | null;
    threadId: string;
  }): Promise<void>;
  stop(request: DesktopVoiceStopRequest): Promise<void>;
}

export class DesktopRealtimeTranscriptionClient implements DesktopVoiceClient {
  readonly #emitEvent: DesktopRealtimeTranscriptionClientOptions["emitEvent"];
  readonly #resolveAccessToken: DesktopRealtimeTranscriptionClientOptions["resolveAccessToken"];
  readonly #sessions = new Map<string, DesktopRealtimeTranscriptionSession>();
  readonly #webSocketFactory: DesktopRealtimeWebSocketFactory;

  constructor(options: DesktopRealtimeTranscriptionClientOptions) {
    this.#emitEvent = options.emitEvent;
    this.#resolveAccessToken = options.resolveAccessToken;
    this.#webSocketFactory = options.webSocketFactory ?? createDefaultWebSocket;
  }

  hasSession(threadId: string): boolean {
    return this.#sessions.has(threadId.trim());
  }

  async start({
    prompt,
    threadId,
  }: {
    prompt?: string | null;
    threadId: string;
  }): Promise<void> {
    const resolvedThreadId = threadId.trim();
    if (!resolvedThreadId) {
      throw new Error("Choose a thread before starting voice input.");
    }

    const existing = this.#sessions.get(resolvedThreadId);
    if (existing) {
      await existing.dispose();
    }

    const token = firstString(await this.#resolveAccessToken());
    if (!token) {
      throw new Error("Sign in with ChatGPT before using voice input.");
    }

    const session = new DesktopRealtimeTranscriptionSession({
      emitEvent: this.#emitEvent,
      onClosed: (closedThreadId) => {
        this.#sessions.delete(closedThreadId);
      },
      prompt,
      threadId: resolvedThreadId,
      token,
      webSocketFactory: this.#webSocketFactory,
    });
    this.#sessions.set(resolvedThreadId, session);

    try {
      await session.start();
    } catch (error) {
      this.#sessions.delete(resolvedThreadId);
      throw error;
    }
  }

  async appendAudio({
    audio,
    threadId,
  }: DesktopVoiceAppendAudioRequest): Promise<void> {
    const session = this.#sessions.get(threadId.trim());
    if (!session) {
      throw new Error("Voice input is not active for this thread.");
    }

    await session.appendAudio(audio);
  }

  async stop({ threadId }: DesktopVoiceStopRequest): Promise<void> {
    const session = this.#sessions.get(threadId.trim());
    if (!session) {
      return;
    }

    await session.stop();
  }

  async dispose(): Promise<void> {
    const sessions = [...this.#sessions.values()];
    this.#sessions.clear();
    await Promise.allSettled(sessions.map(async (session) => await session.dispose()));
  }
}
