export type ComposerDictationMode = "webSpeech" | "nativeRealtime" | "unsupported";

function appendRealtimeTranscriptPreview(currentValue: string, fragment: string): string {
  const normalizedFragment = fragment.trim();
  if (!normalizedFragment) {
    return currentValue;
  }
  if (!currentValue) {
    return normalizedFragment;
  }
  if (/^[,.;:!?)]/.test(normalizedFragment)) {
    return `${currentValue}${normalizedFragment}`;
  }
  return `${currentValue} ${normalizedFragment}`;
}

export function appendDictationTranscript(currentValue: string, transcript: string): string {
  const normalizedTranscript = transcript.trim();
  if (!normalizedTranscript) {
    return currentValue;
  }

  const normalizedCurrentValue = currentValue.trim();
  return normalizedCurrentValue ? `${normalizedCurrentValue} ${normalizedTranscript}` : normalizedTranscript;
}

export function resolveNativeRealtimeUserTranscriptUpdate({
  currentComposerValue,
  currentLiveTranscript,
  isFinal,
  nextTranscript,
}: {
  currentComposerValue: string;
  currentLiveTranscript: string;
  isFinal: boolean;
  nextTranscript: string;
}): {
  nextComposerValue: string;
  nextLiveTranscript: string;
} {
  if (isFinal) {
    const finalizedTranscript = nextTranscript.trim() || currentLiveTranscript.trim();
    return {
      nextComposerValue: finalizedTranscript
        ? appendDictationTranscript(currentComposerValue, finalizedTranscript)
        : currentComposerValue,
      nextLiveTranscript: "",
    };
  }

  return {
    nextComposerValue: currentComposerValue,
    nextLiveTranscript: appendRealtimeTranscriptPreview(currentLiveTranscript, nextTranscript),
  };
}

export function resolveComposerDictationMode({
  hasDesktopVoiceBridge,
  hasSpeechRecognition,
}: {
  hasDesktopVoiceBridge: boolean;
  hasSpeechRecognition: boolean;
}): ComposerDictationMode {
  if (hasDesktopVoiceBridge) {
    return "nativeRealtime";
  }

  if (hasSpeechRecognition) {
    return "webSpeech";
  }

  return "unsupported";
}

export function resolveComposerDictationHint(mode: ComposerDictationMode): string | null {
  return null;
}

export function resolveComposerDictationUnavailableMessage(mode: ComposerDictationMode): string {
  return "Voice input is not available in this desktop runtime.";
}
