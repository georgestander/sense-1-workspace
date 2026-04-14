import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

import { DesktopSessionController } from "./session-controller.ts";

function createTestEnv(runtimeRoot) {
  return {
    ...process.env,
    SENSE1_ARTIFACT_ROOT: path.join(runtimeRoot, "visible-artifacts"),
    SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
  };
}

function createDesktopVoiceClientStub() {
  const activeThreadIds = new Set();
  const calls = {
    appendAudio: [],
    dispose: 0,
    start: [],
    stop: [],
  };

  return {
    activeThreadIds,
    calls,
    hasSession(threadId) {
      return activeThreadIds.has(threadId);
    },
    async start(request) {
      calls.start.push(request);
      activeThreadIds.add(request.threadId);
    },
    async appendAudio(request) {
      calls.appendAudio.push(request);
    },
    async stop(request) {
      calls.stop.push(request);
      activeThreadIds.delete(request.threadId);
    },
    async dispose() {
      calls.dispose += 1;
      activeThreadIds.clear();
    },
  };
}

function createController({
  manager,
  runtimeRoot,
  voiceClient,
}) {
  return new DesktopSessionController(manager, {
    appStartedAt: "2026-04-14T08:00:00.000Z",
    desktopVoiceClient: voiceClient,
    env: createTestEnv(runtimeRoot),
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.8.0",
      electronVersion: process.versions.electron ?? "test-electron",
      platform: process.platform,
      startedAt: "2026-04-14T08:00:00.000Z",
    },
  });
}

test("startDesktopVoice routes default text voice sessions through the signed-in desktop voice client", async () => {
  const requestCalls = [];
  const manager = {
    async request(method, params) {
      requestCalls.push({ method, params });
      return {};
    },
    respond() {},
  };
  const voiceClient = createDesktopVoiceClientStub();
  const runtimeRoot = path.join(
    os.tmpdir(),
    `sc-voice-test-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const controller = createController({
    manager,
    runtimeRoot,
    voiceClient,
  });

  await controller.startDesktopVoice({
    prompt: null,
    sessionId: null,
    threadId: "thread-voice-1",
  });

  assert.deepEqual(voiceClient.calls.start, [
    {
      prompt: null,
      threadId: "thread-voice-1",
    },
  ]);
  assert.deepEqual(requestCalls, []);
});

test("startDesktopVoice preserves an explicit transcription prompt override for the desktop voice client", async () => {
  const manager = {
    async request() {
      return {};
    },
    respond() {},
  };
  const voiceClient = createDesktopVoiceClientStub();
  const runtimeRoot = path.join(
    os.tmpdir(),
    `sc-voice-test-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const controller = createController({
    manager,
    runtimeRoot,
    voiceClient,
  });

  await controller.startDesktopVoice({
    prompt: "",
    threadId: "thread-voice-override",
  });

  assert.deepEqual(voiceClient.calls.start, [
    {
      prompt: "",
      threadId: "thread-voice-override",
    },
  ]);
});

test("appendDesktopVoiceAudio and stopDesktopVoice reuse the active desktop voice client session", async () => {
  const requestCalls = [];
  const manager = {
    async request(method, params) {
      requestCalls.push({ method, params });
      return {};
    },
    respond() {},
  };
  const voiceClient = createDesktopVoiceClientStub();
  const runtimeRoot = path.join(
    os.tmpdir(),
    `sc-voice-test-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const controller = createController({
    manager,
    runtimeRoot,
    voiceClient,
  });

  voiceClient.activeThreadIds.add("thread-voice-append");

  await controller.appendDesktopVoiceAudio({
    audio: {
      data: "AQID",
      numChannels: 1,
      sampleRate: 24_000,
      samplesPerChannel: 480,
    },
    threadId: "thread-voice-append",
  });
  await controller.stopDesktopVoice({
    threadId: "thread-voice-append",
  });

  assert.deepEqual(voiceClient.calls.appendAudio, [
    {
      audio: {
        data: "AQID",
        itemId: null,
        numChannels: 1,
        sampleRate: 24_000,
        samplesPerChannel: 480,
      },
      threadId: "thread-voice-append",
    },
  ]);
  assert.deepEqual(voiceClient.calls.stop, [
    {
      threadId: "thread-voice-append",
    },
  ]);
  assert.deepEqual(requestCalls, []);
});

test("startDesktopVoice preserves legacy app-server routing for audio output sessions", async () => {
  const requestCalls = [];
  const manager = {
    async request(method, params) {
      requestCalls.push({ method, params });
      return {};
    },
    respond() {},
  };
  const voiceClient = createDesktopVoiceClientStub();
  const runtimeRoot = path.join(
    os.tmpdir(),
    `sc-voice-test-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const controller = createController({
    manager,
    runtimeRoot,
    voiceClient,
  });

  await controller.startDesktopVoice({
    outputModality: "audio",
    prompt: "",
    sessionId: "session-voice-audio",
    threadId: "thread-voice-audio",
  });

  assert.deepEqual(requestCalls, [
    {
      method: "thread/realtime/start",
      params: {
        outputModality: "audio",
        prompt: "",
        sessionId: "session-voice-audio",
        threadId: "thread-voice-audio",
      },
    },
  ]);
  assert.deepEqual(voiceClient.calls.start, []);
});

test("startDesktopVoice retries after resuming runtime threads that are not yet loaded for legacy realtime sessions", async () => {
  const requestCalls = [];
  const manager = {
    async request(method, params) {
      requestCalls.push({ method, params });
      if (method === "thread/realtime/start" && requestCalls.filter((entry) => entry.method === "thread/realtime/start").length === 1) {
        throw new Error("thread not found: thread-voice-2");
      }
      if (method === "thread/resume") {
        return {
          thread: {
            id: "thread-voice-2",
          },
        };
      }
      return {};
    },
    respond() {},
  };
  const voiceClient = createDesktopVoiceClientStub();
  const runtimeRoot = path.join(
    os.tmpdir(),
    `sc-voice-test-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const controller = createController({
    manager,
    runtimeRoot,
    voiceClient,
  });

  await controller.startDesktopVoice({
    outputModality: "audio",
    prompt: "draft text",
    sessionId: null,
    threadId: "thread-voice-2",
  });

  assert.deepEqual(requestCalls, [
    {
      method: "thread/realtime/start",
      params: {
        outputModality: "audio",
        prompt: "draft text",
        threadId: "thread-voice-2",
      },
    },
    {
      method: "thread/resume",
      params: {
        threadId: "thread-voice-2",
      },
    },
    {
      method: "thread/realtime/start",
      params: {
        outputModality: "audio",
        prompt: "draft text",
        threadId: "thread-voice-2",
      },
    },
  ]);
});

test("startDesktopVoice forwards a WebRTC offer when the renderer owns transport setup", async () => {
  const requestCalls = [];
  const manager = {
    async request(method, params) {
      requestCalls.push({ method, params });
      return {};
    },
    respond() {},
  };
  const voiceClient = createDesktopVoiceClientStub();
  const runtimeRoot = path.join(
    os.tmpdir(),
    `sc-voice-test-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const controller = createController({
    manager,
    runtimeRoot,
    voiceClient,
  });

  await controller.startDesktopVoice({
    outputModality: "text",
    prompt: "",
    sessionId: null,
    threadId: "thread-voice-chatgpt",
    transport: {
      type: "webrtc",
      sdp: "v=0\r\no=test",
    },
  });

  assert.deepEqual(requestCalls, [
    {
      method: "thread/realtime/start",
      params: {
        outputModality: "text",
        prompt: "",
        threadId: "thread-voice-chatgpt",
        transport: {
          type: "webrtc",
          sdp: "v=0\r\no=test",
        },
      },
    },
  ]);
  assert.deepEqual(voiceClient.calls.start, []);
});
