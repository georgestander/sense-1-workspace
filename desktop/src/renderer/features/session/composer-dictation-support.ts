export type ComposerDictationMode = "webSpeech" | "nativeRealtime" | "unsupported";
export const VOICE_RECORDING_LEVEL_COUNT = 18;

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

export function createVoiceRecordingLevels(levelCount = VOICE_RECORDING_LEVEL_COUNT): number[] {
  return Array.from({ length: levelCount }, () => 0);
}

export function pushVoiceRecordingLevel(
  currentLevels: readonly number[],
  nextLevel: number,
  levelCount = VOICE_RECORDING_LEVEL_COUNT,
): number[] {
  const clampedLevel = Math.max(0, Math.min(1, nextLevel));
  const preservedLevels = currentLevels.slice(-(levelCount - 1));
  const paddedLevels =
    preservedLevels.length >= levelCount - 1
      ? preservedLevels
      : [
          ...Array.from({ length: (levelCount - 1) - preservedLevels.length }, () => 0),
          ...preservedLevels,
        ];
  return [...paddedLevels, clampedLevel];
}

export function formatVoiceRecordingElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
