import test from "node:test";
import assert from "node:assert/strict";

import {
  appendDictationTranscript,
  resolveComposerDictationHint,
  resolveComposerDictationMode,
  resolveComposerDictationUnavailableMessage,
} from "./composer-dictation-support.ts";

test("resolveComposerDictationMode prefers native realtime voice input when the desktop bridge exposes it", () => {
  assert.equal(
    resolveComposerDictationMode({
      hasDesktopVoiceBridge: true,
      hasSpeechRecognition: true,
    }),
    "nativeRealtime",
  );
});

test("resolveComposerDictationMode disables browser speech fallback when desktop voice exists", () => {
  assert.equal(
    resolveComposerDictationMode({
      hasDesktopVoiceBridge: true,
      hasSpeechRecognition: true,
    }),
    "nativeRealtime",
  );
});

test("resolveComposerDictationMode preserves web speech support in supported browser contexts", () => {
  assert.equal(
    resolveComposerDictationMode({
      hasDesktopVoiceBridge: false,
      hasSpeechRecognition: true,
    }),
    "webSpeech",
  );
});

test("resolveComposerDictationHint removes the desktop banner and exposes the updated unavailable message", () => {
  assert.equal(resolveComposerDictationHint("nativeRealtime"), null);
  assert.equal(
    resolveComposerDictationUnavailableMessage("nativeRealtime"),
    "Voice input is not available in this desktop runtime.",
  );
});

test("appendDictationTranscript trims and appends speech fragments cleanly", () => {
  assert.equal(appendDictationTranscript("", "  hello world  "), "hello world");
  assert.equal(appendDictationTranscript("Existing note", "  and more  "), "Existing note and more");
  assert.equal(appendDictationTranscript("Existing note", "   "), "Existing note");
});
