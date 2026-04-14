import { useEffect, useMemo, useRef, useState } from "react";

import type { DesktopRuntimeEvent, DesktopVoiceAudioChunk } from "../../../main/contracts";
import {
  appendDictationTranscript,
  createVoiceRecordingLevels,
  formatVoiceRecordingElapsed,
  pushVoiceRecordingLevel,
  resolveNativeRealtimeUserTranscriptUpdate,
  resolveComposerDictationHint,
  resolveComposerDictationMode,
  resolveComposerDictationUnavailableMessage,
} from "./composer-dictation-support.js";
import {
  analyzeAudioFrame,
  appendVoiceTranscriptFragment,
  type AudioFrameLike,
} from "./native-realtime-audio.js";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null;
  start(): void;
  stop(): void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type DesktopVoiceBridge = NonNullable<Window["sense1Desktop"]>["voice"];
type MediaStreamTrackProcessorLike = {
  readable: ReadableStream<AudioFrameLike>;
};
type MediaStreamTrackProcessorConstructor = new (
  options: { track: MediaStreamTrack },
) => MediaStreamTrackProcessorLike;

type NativeRealtimeSession = {
  assistantTranscript: string;
  queuedAudio: Promise<void>;
  startAccepted: boolean;
  stopping: boolean;
  stopCapture: () => Promise<void>;
  threadId: string;
  userTranscript: string;
};

declare global {
  interface Window {
    MediaStreamTrackProcessor?: MediaStreamTrackProcessorConstructor;
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function resolveSpeechRecognition(): SpeechRecognitionConstructor | null {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function resolveDesktopVoiceBridge(): DesktopVoiceBridge | null {
  const voiceBridge = window.sense1Desktop?.voice;
  if (
    typeof voiceBridge?.start !== "function" ||
    typeof voiceBridge?.appendAudio !== "function" ||
    typeof voiceBridge?.stop !== "function"
  ) {
    return null;
  }

  return voiceBridge;
}

function resolveMediaStreamTrackProcessor(): MediaStreamTrackProcessorConstructor | null {
  return window.MediaStreamTrackProcessor ?? null;
}

function normalizeDictationError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}

async function createNativeRealtimeCapture(
  {
    onChunk,
    onError,
    onLevel,
  }: {
    onChunk: (audio: DesktopVoiceAudioChunk) => void;
    onError: (error: unknown) => void;
    onLevel: (level: number) => void;
  },
): Promise<() => Promise<void>> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone capture is not available in this renderer.");
  }
  const MediaStreamTrackProcessor = resolveMediaStreamTrackProcessor();
  if (!MediaStreamTrackProcessor) {
    throw new Error("MediaStreamTrackProcessor is not available in this renderer.");
  }

  const mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      autoGainControl: true,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    },
    video: false,
  });
  const track = mediaStream.getAudioTracks()[0] ?? null;
  if (!track) {
    for (const currentTrack of mediaStream.getTracks()) {
      currentTrack.stop();
    }
    throw new Error("No microphone audio track was available.");
  }

  const processor = new MediaStreamTrackProcessor({ track });
  const reader = processor.readable.getReader();
  let closed = false;

  void (async () => {
    try {
      while (!closed) {
        const { done, value } = await reader.read();
        if (done || closed || !value) {
          break;
        }

        try {
          const analysis = analyzeAudioFrame(value);
          onLevel(analysis.level);
          if (analysis.audio) {
            onChunk(analysis.audio);
          }
        } finally {
          value.close();
        }
      }
    } catch (error) {
      if (!closed) {
        onError(error);
      }
    }
  })();

  return async () => {
    closed = true;
    await reader.cancel().catch(() => {});
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
  };
}

export function useComposerDictation({
  enabled,
  threadId,
  value,
  setValue,
}: {
  enabled: boolean;
  threadId: string;
  value: string;
  setValue: (value: string | ((current: string) => string)) => void;
}) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nativeTranscript, setNativeTranscript] = useState({
    assistant: "",
    user: "",
  });
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [recordingLevels, setRecordingLevels] = useState(() => createVoiceRecordingLevels());
  const recordingStartedAtRef = useRef<number | null>(null);
  const lastLevelFrameAtRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const nativeSessionRef = useRef<NativeRealtimeSession | null>(null);
  const dictationMode = useMemo(
    () => {
      const hasDesktopVoiceBridge =
        typeof window !== "undefined" &&
        Boolean(resolveDesktopVoiceBridge());
      return resolveComposerDictationMode({
        hasDesktopVoiceBridge,
        hasSpeechRecognition: typeof window !== "undefined" && Boolean(resolveSpeechRecognition()),
      });
    },
    [threadId],
  );
  const supported = dictationMode !== "unsupported";
  const hint = enabled ? resolveComposerDictationHint(dictationMode) : null;

  function resetRecordingHud(): void {
    recordingStartedAtRef.current = null;
    lastLevelFrameAtRef.current = 0;
    setRecordingElapsedMs(0);
    setRecordingLevels(createVoiceRecordingLevels());
  }

  async function releaseNativeRealtimeSession({ requestStop }: { requestStop: boolean }): Promise<void> {
    const session = nativeSessionRef.current;
    if (!session) {
      setActive(false);
      return;
    }

    if (requestStop) {
      if (session.stopping) {
        return;
      }
      session.stopping = true;
      setActive(false);

      await Promise.allSettled([
        session.stopCapture(),
        session.queuedAudio.catch(() => {}),
      ]);

      if (!session.startAccepted) {
        nativeSessionRef.current = null;
      }

      const voiceBridge = resolveDesktopVoiceBridge();
      if (!voiceBridge || !session.startAccepted) {
        return;
      }

      await voiceBridge.stop({
        threadId: session.threadId,
      }).catch(() => {});
      return;
    }

    nativeSessionRef.current = null;
    setActive(false);
    resetRecordingHud();

    await Promise.allSettled([
      session.stopCapture(),
      session.queuedAudio.catch(() => {}),
    ]);
  }

  function queueNativeRealtimeAudio(
    session: NativeRealtimeSession,
    audio: DesktopVoiceAudioChunk,
  ): void {
    const voiceBridge = resolveDesktopVoiceBridge();
    if (!voiceBridge || nativeSessionRef.current !== session || session.stopping) {
      return;
    }

    session.queuedAudio = session.queuedAudio.then(async () => {
      if (nativeSessionRef.current !== session) {
        return;
      }

      await voiceBridge.appendAudio({
        audio,
        threadId: session.threadId,
      });
    });

    void session.queuedAudio.catch((nextError) => {
      if (nativeSessionRef.current !== session) {
        return;
      }

      setError(normalizeDictationError(nextError, "Voice input failed while streaming audio."));
      void releaseNativeRealtimeSession({ requestStop: false });
    });
  }

  async function startNativeRealtime(): Promise<void> {
    const resolvedThreadId = threadId.trim();
    const voiceBridge = resolveDesktopVoiceBridge();
    if (!resolvedThreadId) {
      setError("Choose a thread before starting voice input.");
      return;
    }
    if (!voiceBridge) {
      setError(resolveComposerDictationUnavailableMessage(dictationMode));
      return;
    }

    setError(null);
    setActive(true);
    recordingStartedAtRef.current = Date.now();
    lastLevelFrameAtRef.current = 0;
    setRecordingElapsedMs(0);
    setRecordingLevels(createVoiceRecordingLevels());
    const nextSession: NativeRealtimeSession = {
      assistantTranscript: "",
      queuedAudio: Promise.resolve(),
      startAccepted: false,
      stopping: false,
      stopCapture: async () => {},
      threadId: resolvedThreadId,
      userTranscript: "",
    };
    nativeSessionRef.current = nextSession;
    setNativeTranscript({
      assistant: "",
      user: "",
    });

    try {
      await voiceBridge.start({
        outputModality: "text",
        threadId: resolvedThreadId,
      });

      if (nativeSessionRef.current !== nextSession) {
        await voiceBridge.stop({
          threadId: resolvedThreadId,
        }).catch(() => {});
        return;
      }

      nextSession.startAccepted = true;
      const stopCapture = await createNativeRealtimeCapture({
        onChunk: (audio) => {
          queueNativeRealtimeAudio(nextSession, audio);
        },
        onError: (captureError) => {
          if (nativeSessionRef.current !== nextSession) {
            return;
          }
          setError(normalizeDictationError(captureError, "Voice input failed while capturing audio."));
          void releaseNativeRealtimeSession({ requestStop: true });
        },
        onLevel: (level) => {
          const now = performance.now();
          if (now - lastLevelFrameAtRef.current < 64) {
            return;
          }
          lastLevelFrameAtRef.current = now;
          setRecordingLevels((current) => pushVoiceRecordingLevel(current, level));
        },
      });
      if (nativeSessionRef.current !== nextSession) {
        await stopCapture();
        await voiceBridge.stop({
          threadId: resolvedThreadId,
        }).catch(() => {});
        return;
      }
      nextSession.stopCapture = stopCapture;
    } catch (nextError) {
      setError(normalizeDictationError(nextError, "Could not start voice input."));
      await releaseNativeRealtimeSession({ requestStop: true });
    }
  }

  async function stopNativeRealtime(): Promise<void> {
    await releaseNativeRealtimeSession({ requestStop: true });
  }

  useEffect(() => {
    if (dictationMode !== "webSpeech" || !enabled) {
      return;
    }
    const SpeechRecognition = resolveSpeechRecognition();
    if (!SpeechRecognition) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .flatMap((result) => Array.from(result))
        .map((entry) => entry?.transcript?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
      if (!transcript) {
        return;
      }
      setValue((current) => appendDictationTranscript(current, transcript));
    };
    recognition.onend = () => {
      setActive(false);
    };
    recognition.onerror = (event) => {
      setActive(false);
      setError(event.error ?? "Voice input failed.");
    };
    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [dictationMode, enabled, setValue]);

  useEffect(() => {
    if (dictationMode !== "nativeRealtime" || !active) {
      return;
    }

    const updateElapsed = () => {
      const startedAt = recordingStartedAtRef.current;
      if (startedAt == null) {
        return;
      }
      setRecordingElapsedMs(Date.now() - startedAt);
    };

    updateElapsed();
    const timerId = window.setInterval(updateElapsed, 200);
    return () => window.clearInterval(timerId);
  }, [active, dictationMode]);

  useEffect(() => {
    if (dictationMode !== "nativeRealtime" || !enabled) {
      return;
    }

    const unsubscribe = window.sense1Desktop.session.onRuntimeEvent((event: DesktopRuntimeEvent) => {
      const session = nativeSessionRef.current;
      if (
        !session ||
        (
          event.kind !== "voiceTranscriptUpdated" &&
          event.kind !== "voiceError" &&
          event.kind !== "voiceStateChanged"
        ) ||
        event.threadId !== session.threadId
      ) {
        return;
      }

      if (event.kind === "voiceTranscriptUpdated") {
        const normalizedRole = event.role.toLowerCase();
        if (normalizedRole === "assistant") {
          session.assistantTranscript = event.isFinal
            ? event.text.trim()
            : appendVoiceTranscriptFragment(
                session.assistantTranscript,
                event.text,
              );
        } else if (normalizedRole === "user") {
          const currentUserTranscript = session.userTranscript;
          const previewUpdate = resolveNativeRealtimeUserTranscriptUpdate({
            currentComposerValue: "",
            currentLiveTranscript: currentUserTranscript,
            isFinal: event.isFinal,
            nextTranscript: event.text,
          });
          session.userTranscript = previewUpdate.nextLiveTranscript;
          if (event.isFinal) {
            setValue((currentValue) =>
              resolveNativeRealtimeUserTranscriptUpdate({
                currentComposerValue: currentValue,
                currentLiveTranscript: currentUserTranscript,
                isFinal: true,
                nextTranscript: event.text,
              }).nextComposerValue
            );
          }
        } else {
          return;
        }

        setNativeTranscript({
          assistant: session.assistantTranscript,
          user: session.userTranscript,
        });
        return;
      }

      if (event.kind === "voiceError") {
        setError(event.message);
        void releaseNativeRealtimeSession({ requestStop: false });
        return;
      }

      if (event.kind === "voiceStateChanged") {
        setActive(event.state === "active" || event.state === "starting");
        if (event.state === "stopped") {
          void releaseNativeRealtimeSession({ requestStop: false });
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [dictationMode, enabled, setValue]);

  useEffect(() => {
    return () => {
      void releaseNativeRealtimeSession({ requestStop: true });
    };
  }, [dictationMode, enabled, threadId]);

  useEffect(() => {
    if (!enabled || supported === false) {
      setActive(false);
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "m") {
        event.preventDefault();
        void toggle();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, enabled, supported]);

  async function toggle(): Promise<void> {
    if (!enabled) {
      setError(resolveComposerDictationUnavailableMessage(dictationMode));
      return;
    }

    if (dictationMode === "webSpeech") {
      if (active) {
        recognitionRef.current?.stop();
        setActive(false);
        return;
      }
      setError(null);
      recognitionRef.current?.start();
      setActive(true);
      return;
    }

    if (dictationMode === "nativeRealtime") {
      if (nativeSessionRef.current) {
        await stopNativeRealtime();
        return;
      }

      await startNativeRealtime();
      return;
    }

    setError(resolveComposerDictationUnavailableMessage(dictationMode));
  }

  async function stop(): Promise<void> {
    if (!active) {
      return;
    }

    if (dictationMode === "webSpeech") {
      recognitionRef.current?.stop();
      setActive(false);
      return;
    }

    if (dictationMode === "nativeRealtime") {
      await stopNativeRealtime();
    }
  }

  return {
    active,
    error,
    hint,
    liveTranscript: nativeTranscript.assistant
      ? {
          assistant: nativeTranscript.assistant,
          user: "",
        }
      : null,
    recordingIndicator:
      dictationMode === "nativeRealtime" && active
        ? {
            elapsedLabel: formatVoiceRecordingElapsed(recordingElapsedMs),
            levels: recordingLevels,
          }
        : null,
    statusText:
      dictationMode === "webSpeech" && active ? "Listening..." : null,
    stop,
    supported,
    toggle,
    value,
  };
}
