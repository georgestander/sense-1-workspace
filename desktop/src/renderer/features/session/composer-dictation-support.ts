export type ComposerDictationMode = "webSpeech" | "nativeMacos" | "unsupported";

export function appendDictationTranscript(currentValue: string, transcript: string): string {
  const normalizedTranscript = transcript.trim();
  if (!normalizedTranscript) {
    return currentValue;
  }

  const normalizedCurrentValue = currentValue.trim();
  return normalizedCurrentValue ? `${normalizedCurrentValue} ${normalizedTranscript}` : normalizedTranscript;
}

export function resolveComposerDictationMode({
  hasDesktopBridge,
  hasSpeechRecognition,
  platform,
}: {
  hasDesktopBridge: boolean;
  hasSpeechRecognition: boolean;
  platform: string | null;
}): ComposerDictationMode {
  const normalizedPlatform = platform?.trim().toLowerCase() ?? "";
  if (hasDesktopBridge && (normalizedPlatform === "macintel" || normalizedPlatform === "darwin" || normalizedPlatform === "macos")) {
    return "nativeMacos";
  }

  if (hasSpeechRecognition) {
    return "webSpeech";
  }

  return "unsupported";
}

export function resolveComposerDictationHint(mode: ComposerDictationMode): string | null {
  if (mode !== "nativeMacos") {
    return null;
  }

  return "Use macOS Dictation while the composer is focused. The built-in mic button is hidden on desktop because Electron's speech-recognition path is unreliable on macOS.";
}

export function resolveComposerDictationUnavailableMessage(mode: ComposerDictationMode): string {
  if (mode === "nativeMacos") {
    return "Use macOS Dictation while the composer is focused.";
  }

  return "Voice dictation is not available in this desktop runtime.";
}
