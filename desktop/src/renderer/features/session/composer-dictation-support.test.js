import test from "node:test";
import assert from "node:assert/strict";

import {
  appendDictationTranscript,
  resolveComposerDictationHint,
  resolveComposerDictationMode,
  resolveComposerDictationUnavailableMessage,
} from "./composer-dictation-support.ts";

test("resolveComposerDictationMode prefers native macOS dictation for Electron desktop", () => {
  assert.equal(
    resolveComposerDictationMode({
      hasDesktopBridge: true,
      hasSpeechRecognition: true,
      platform: "MacIntel",
    }),
    "nativeMacos",
  );
});

test("resolveComposerDictationMode preserves web speech support in supported browser contexts", () => {
  assert.equal(
    resolveComposerDictationMode({
      hasDesktopBridge: false,
      hasSpeechRecognition: true,
      platform: "Win32",
    }),
    "webSpeech",
  );
});

test("resolveComposerDictationHint and unavailable message explain the native macOS fallback", () => {
  assert.match(resolveComposerDictationHint("nativeMacos") ?? "", /macOS Dictation/u);
  assert.equal(
    resolveComposerDictationUnavailableMessage("nativeMacos"),
    "Use macOS Dictation while the composer is focused.",
  );
});

test("appendDictationTranscript trims and appends speech fragments cleanly", () => {
  assert.equal(appendDictationTranscript("", "  hello world  "), "hello world");
  assert.equal(appendDictationTranscript("Existing note", "  and more  "), "Existing note and more");
  assert.equal(appendDictationTranscript("Existing note", "   "), "Existing note");
});
