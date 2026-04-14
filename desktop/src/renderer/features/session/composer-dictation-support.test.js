import test from "node:test";
import assert from "node:assert/strict";

import {
  appendDictationTranscript,
  resolveNativeRealtimeUserTranscriptUpdate,
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

test("resolveNativeRealtimeUserTranscriptUpdate keeps interim STT in preview until the transcript is final", () => {
  assert.deepEqual(
    resolveNativeRealtimeUserTranscriptUpdate({
      currentComposerValue: "Existing note",
      currentLiveTranscript: "Hello",
      isFinal: false,
      nextTranscript: " from voice",
    }),
    {
      nextComposerValue: "Existing note",
      nextLiveTranscript: "Hello from voice",
    },
  );
});

test("resolveNativeRealtimeUserTranscriptUpdate commits final STT into the composer and clears preview text", () => {
  assert.deepEqual(
    resolveNativeRealtimeUserTranscriptUpdate({
      currentComposerValue: "Existing note",
      currentLiveTranscript: "Hello from voice",
      isFinal: true,
      nextTranscript: "Hello from voice input",
    }),
    {
      nextComposerValue: "Existing note Hello from voice input",
      nextLiveTranscript: "",
    },
  );
});

test("resolveNativeRealtimeUserTranscriptUpdate falls back to the live preview when the final event text is empty", () => {
  assert.deepEqual(
    resolveNativeRealtimeUserTranscriptUpdate({
      currentComposerValue: "",
      currentLiveTranscript: "Hello from preview",
      isFinal: true,
      nextTranscript: "   ",
    }),
    {
      nextComposerValue: "Hello from preview",
      nextLiveTranscript: "",
    },
  );
});
