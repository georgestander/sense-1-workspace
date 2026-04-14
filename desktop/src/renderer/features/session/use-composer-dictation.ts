import { useEffect, useMemo, useRef, useState } from "react";

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

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function resolveSpeechRecognition(): SpeechRecognitionConstructor | null {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function useComposerDictation({
  enabled,
  value,
  setValue,
}: {
  enabled: boolean;
  value: string;
  setValue: (value: string | ((current: string) => string)) => void;
}) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const dictationMode = useMemo(
    () => resolveComposerDictationMode({
      hasDesktopBridge: typeof window !== "undefined" && Boolean(window.sense1Desktop),
      hasSpeechRecognition: typeof window !== "undefined" && Boolean(resolveSpeechRecognition()),
      platform: typeof navigator !== "undefined" ? navigator.platform : null,
    }),
    [],
  );
  const supported = dictationMode === "webSpeech";
  const hint = enabled ? resolveComposerDictationHint(dictationMode) : null;

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
    if (!enabled || dictationMode !== "webSpeech") {
      setActive(false);
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "m") {
        event.preventDefault();
        if (active) {
          recognitionRef.current?.stop();
          setActive(false);
          return;
        }
        setError(null);
        recognitionRef.current?.start();
        setActive(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, dictationMode, enabled]);

  function toggle() {
    if (dictationMode !== "webSpeech" || !enabled) {
      setError(resolveComposerDictationUnavailableMessage(dictationMode));
      return;
    }
    if (active) {
      recognitionRef.current?.stop();
      setActive(false);
      return;
    }
    setError(null);
    recognitionRef.current?.start();
    setActive(true);
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
