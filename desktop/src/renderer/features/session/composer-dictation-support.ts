export type ComposerDictationMode = "webSpeech" | "nativeRealtime" | "unsupported";

export function appendDictationTranscript(currentValue: string, transcript: string): string {
  const normalizedTranscript = transcript.trim();
  if (!normalizedTranscript) {
    return currentValue;
  }

  const normalizedCurrentValue = currentValue.trim();
  return normalizedCurrentValue ? `${normalizedCurrentValue} ${normalizedTranscript}` : normalizedTranscript;
}

export function resolveComposerDictationMode({
  hasNativeRealtimeVoice,
  hasSpeechRecognition,
}: {
  hasNativeRealtimeVoice: boolean;
  hasSpeechRecognition: boolean;
}): ComposerDictationMode {
  if (hasNativeRealtimeVoice) {
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
  return "Voice dictation is not available in this desktop runtime.";
}
