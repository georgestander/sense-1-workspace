import test from "node:test";
import assert from "node:assert/strict";

import {
  appendVoiceTranscriptFragment,
  convertAudioFrameToModelAudioChunk,
} from "./native-realtime-audio.ts";

test("appendVoiceTranscriptFragment keeps punctuation tight while joining transcript chunks", () => {
  assert.equal(appendVoiceTranscriptFragment("", "Sure"), "Sure");
  assert.equal(appendVoiceTranscriptFragment("Sure", " thing"), "Sure thing");
  assert.equal(appendVoiceTranscriptFragment("Sure thing", ","), "Sure thing,");
  assert.equal(appendVoiceTranscriptFragment("Sure thing,", " hello"), "Sure thing, hello");
});

test("convertAudioFrameToModelAudioChunk downmixes planar float audio to 24k mono PCM16", () => {
  const channelFrames = [
    new Float32Array([1, -1]),
    new Float32Array([0, 0]),
  ];
  const closedFrames = [];
  const frame = {
    format: "f32-planar",
    numberOfChannels: 2,
    numberOfFrames: 2,
    sampleRate: 24_000,
    copyTo(destination, options = {}) {
      destination.set(channelFrames[options.planeIndex ?? 0]);
    },
    close() {
      closedFrames.push(true);
    },
  };

  const chunk = convertAudioFrameToModelAudioChunk(frame);

  assert.deepEqual(chunk, {
    data: "AEAAwA==",
    itemId: null,
    numChannels: 1,
    sampleRate: 24_000,
    samplesPerChannel: 2,
  });
  assert.equal(closedFrames.length, 0);
});
