import { useEffect, useMemo, useRef, useState } from "react";

import type { DesktopRuntimeEvent, DesktopVoiceAudioChunk } from "../../../main/contracts";
import {
  appendDictationTranscript,
  resolveComposerDictationHint,
  resolveComposerDictationMode,
  resolveComposerDictationUnavailableMessage,
} from "./composer-dictation-support.js";

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

type NativeRealtimeSession = {
  baselineValue: string;
  queuedAudio: Promise<void>;
  stopCapture: () => Promise<void>;
  threadId: string;
};

declare global {
  interface Window {
    AudioContext?: typeof AudioContext;
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitAudioContext?: typeof AudioContext;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function resolveSpeechRecognition(): SpeechRecognitionConstructor | null {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function resolveDesktopVoiceBridge(): DesktopVoiceBridge | null {
  const voiceBridge = window.sense1Desktop?.voice;
  if (
    typeof voiceBridge?.start !== "function"
    || typeof voiceBridge?.appendAudio !== "function"
    || typeof voiceBridge?.stop !== "function"
  ) {
    return null;
  }

  return voiceBridge;
}

function resolveAudioContextConstructor(): typeof AudioContext | null {
  return window.AudioContext ?? window.webkitAudioContext ?? null;
}

function encodePcm16Base64(samples: Float32Array): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function createNativeRealtimeCapture(
  onChunk: (audio: DesktopVoiceAudioChunk) => void,
): Promise<() => Promise<void>> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone capture is not available in this renderer.");
  }

  const AudioContextConstructor = resolveAudioContextConstructor();
  if (!AudioContextConstructor) {
    throw new Error("AudioContext is not available in this renderer.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      autoGainControl: true,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    },
    video: false,
  });

  const audioContext = new AudioContextConstructor();
  await audioContext.resume();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const muteGain = audioContext.createGain();
  muteGain.gain.value = 0;

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    if (!input || input.length === 0) {
      return;
    }

    onChunk({
      data: encodePcm16Base64(input),
      itemId: null,
      numChannels: 1,
      sampleRate: event.inputBuffer.sampleRate,
      samplesPerChannel: input.length,
    });
  };

  source.connect(processor);
  processor.connect(muteGain);
  muteGain.connect(audioContext.destination);

  return async () => {
    processor.onaudioprocess = null;
    source.disconnect();
    processor.disconnect();
    muteGain.disconnect();
    for (const track of stream.getTracks()) {
      track.stop();
    }
    if (audioContext.state !== "closed") {
      await audioContext.close();
    }
  };
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
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const nativeSessionRef = useRef<NativeRealtimeSession | null>(null);
  const dictationMode = useMemo(
    () => resolveComposerDictationMode({
      hasNativeRealtimeVoice:
        typeof window !== "undefined"
        && threadId.trim().length > 0
        && Boolean(resolveDesktopVoiceBridge()),
      hasSpeechRecognition: typeof window !== "undefined" && Boolean(resolveSpeechRecognition()),
    }),
    [threadId],
  );
  const supported = dictationMode !== "unsupported";
  const hint = enabled ? resolveComposerDictationHint(dictationMode) : null;

  async function releaseNativeRealtimeSession({ requestStop }: { requestStop: boolean }): Promise<void> {
    const session = nativeSessionRef.current;
    if (!session) {
      setActive(false);
      return;
    }

    nativeSessionRef.current = null;
    setActive(false);

    await session.queuedAudio.catch(() => {});
    const operations = [session.stopCapture()];
    if (requestStop) {
      const voiceBridge = resolveDesktopVoiceBridge();
      if (voiceBridge) {
        operations.push(
          voiceBridge.stop({
            threadId: session.threadId,
          }),
        );
      }
    }
    await Promise.allSettled(operations);
  }

  function queueNativeRealtimeAudio(audio: DesktopVoiceAudioChunk): void {
    const session = nativeSessionRef.current;
    if (!session) {
      return;
    }

    const voiceBridge = resolveDesktopVoiceBridge();
    if (!voiceBridge) {
      setError("Voice dictation is not available in this desktop runtime.");
      void releaseNativeRealtimeSession({ requestStop: false });
      return;
    }

    session.queuedAudio = session.queuedAudio
      .then(async () => {
        await voiceBridge.appendAudio({
          audio,
          threadId: session.threadId,
        });
      });

    void session.queuedAudio.catch((nextError) => {
      setError(normalizeDictationError(nextError, "Voice dictation failed while streaming audio."));
      void releaseNativeRealtimeSession({ requestStop: false });
    });
  }

  async function startNativeRealtime(): Promise<void> {
    const resolvedThreadId = threadId.trim();
    const voiceBridge = resolveDesktopVoiceBridge();
    if (!resolvedThreadId) {
      setError("Choose a thread before dictating.");
      return;
    }
    if (!voiceBridge) {
      setError("Voice dictation is not available in this desktop runtime.");
      return;
    }

    setError(null);
    setActive(true);
    nativeSessionRef.current = {
      baselineValue: value,
      queuedAudio: Promise.resolve(),
      stopCapture: async () => {},
      threadId: resolvedThreadId,
    };

    try {
      await voiceBridge.start({
        threadId: resolvedThreadId,
      });
      const stopCapture = await createNativeRealtimeCapture((audio) => {
        queueNativeRealtimeAudio(audio);
      });
      if (nativeSessionRef.current?.threadId !== resolvedThreadId) {
        await stopCapture();
        return;
      }
      nativeSessionRef.current.stopCapture = stopCapture;
    } catch (nextError) {
      setError(normalizeDictationError(nextError, "Could not start voice dictation."));
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
      setError(event.error ?? "Dictation failed.");
    };
    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [dictationMode, enabled, setValue]);

  useEffect(() => {
    if (dictationMode !== "nativeRealtime" || !enabled) {
      return;
    }

    const unsubscribe = window.sense1Desktop.session.onRuntimeEvent((event: DesktopRuntimeEvent) => {
      const session = nativeSessionRef.current;
      if (!session) {
        return;
      }

      if (event.kind === "voiceTranscriptUpdated") {
        if (event.threadId !== session.threadId) {
          return;
        }
        if (event.role.toLowerCase() !== "user") {
          return;
        }
        setValue(appendDictationTranscript(session.baselineValue, event.text));
        return;
      }

      if (event.kind === "voiceError") {
        if (event.threadId !== session.threadId) {
          return;
        }
        setError(event.message);
        void releaseNativeRealtimeSession({ requestStop: false });
        return;
      }

      if (event.kind === "voiceStateChanged") {
        if (event.threadId !== session.threadId) {
          return;
        }
        setActive(event.state === "active");
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

  return {
    active,
    error,
    hint,
    supported,
    toggle,
    value,
  };
}
