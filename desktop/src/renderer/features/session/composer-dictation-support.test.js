import test from "node:test";
import assert from "node:assert/strict";

import {
  appendDictationTranscript,
  resolveComposerDictationHint,
  resolveComposerDictationMode,
  resolveComposerDictationUnavailableMessage,
} from "./composer-dictation-support.ts";

test("resolveComposerDictationMode prefers native realtime dictation when the desktop bridge exposes it", () => {
  assert.equal(
    resolveComposerDictationMode({
      hasNativeRealtimeVoice: true,
      hasSpeechRecognition: true,
    }),
    "nativeRealtime",
  );
});

test("resolveComposerDictationMode preserves web speech support in supported browser contexts", () => {
  assert.equal(
    resolveComposerDictationMode({
      hasNativeRealtimeVoice: false,
      hasSpeechRecognition: true,
    }),
    "webSpeech",
  );
});

test("resolveComposerDictationHint removes the desktop dictation fallback banner", () => {
  assert.equal(resolveComposerDictationHint("nativeRealtime"), null);
  assert.equal(
    resolveComposerDictationUnavailableMessage("nativeRealtime"),
    "Voice dictation is not available in this desktop runtime.",
  );
});

test("appendDictationTranscript trims and appends speech fragments cleanly", () => {
  assert.equal(appendDictationTranscript("", "  hello world  "), "hello world");
  assert.equal(appendDictationTranscript("Existing note", "  and more  "), "Existing note and more");
  assert.equal(appendDictationTranscript("Existing note", "   "), "Existing note");
});
