import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeAudioFrame,
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

test("analyzeAudioFrame reports a normalized level from real frame amplitude", () => {
  const frame = {
    format: "f32-planar",
    numberOfChannels: 1,
    numberOfFrames: 4,
    sampleRate: 24_000,
    copyTo(destination) {
      destination.set(new Float32Array([0.5, -0.5, 0.25, -0.25]));
    },
    close() {},
  };

  const analysis = analyzeAudioFrame(frame);

  assert.equal(analysis.audio?.sampleRate, 24_000);
  assert.equal(analysis.audio?.samplesPerChannel, 4);
  assert.ok(analysis.level > 0.9);
  assert.ok(analysis.level <= 1);
});
