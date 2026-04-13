import { useEffect, useMemo, useRef, useState } from "react";

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
  const supported = useMemo(() => typeof window !== "undefined" && Boolean(resolveSpeechRecognition()), []);

  useEffect(() => {
    if (!supported || !enabled) {
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
      setValue((current) => current.trim() ? `${current.trim()} ${transcript}` : transcript);
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
  }, [enabled, setValue, supported]);

  useEffect(() => {
    if (!enabled || !supported) {
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
  }, [active, enabled, supported]);

  function toggle() {
    if (!supported || !enabled) {
      setError("Voice dictation is not available in this desktop runtime.");
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
    supported,
    toggle,
    value,
  };
}
