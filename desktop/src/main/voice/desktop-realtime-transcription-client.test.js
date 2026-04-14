import test from "node:test";
import assert from "node:assert/strict";

import { DesktopRealtimeTranscriptionClient } from "./desktop-realtime-transcription-client.ts";

class FakeWebSocket {
  constructor(url, init) {
    this.url = url;
    this.init = init;
    this.readyState = 0;
    this.sent = [];
    this.closeCalls = [];
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
    this.onopen = null;
  }

  send(data) {
    this.sent.push(JSON.parse(data));
  }

  close(code, reason) {
    this.closeCalls.push({ code, reason });
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  message(payload) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  fail(message = "voice failed") {
    this.onerror?.({ message });
  }
}

function createClientHarness() {
  const events = [];
  const sockets = [];
  const client = new DesktopRealtimeTranscriptionClient({
    emitEvent: async (event) => {
      events.push(event);
    },
    resolveAccessToken: async () => "signed-in-chatgpt-token",
    webSocketFactory: (url, init) => {
      const socket = new FakeWebSocket(url, init);
      sockets.push(socket);
      return socket;
    },
  });

  return {
    client,
    events,
    sockets,
  };
}

async function waitForSocket(harness) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (harness.sockets.length > 0) {
      return harness.sockets[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error("Timed out waiting for the fake realtime websocket.");
}

test("DesktopRealtimeTranscriptionClient starts a signed-in transcription session with the documented payload", async () => {
  const harness = createClientHarness();
  const { client, events, sockets } = harness;

  const startPromise = client.start({
    prompt: "",
    threadId: "thread-voice-1",
  });
  const socket = await waitForSocket(harness);

  assert.equal(sockets.length, 1);
  assert.equal(
    sockets[0].url,
    "wss://api.openai.com/v1/realtime?intent=transcription",
  );
  assert.equal(
    sockets[0].init.headers.Authorization,
    "Bearer signed-in-chatgpt-token",
  );
  assert.equal(sockets[0].init.headers["OpenAI-Beta"], "realtime=v1");

  socket.open();
  assert.deepEqual(socket.sent, [
    {
      type: "transcription_session.update",
      session: {
        input_audio_format: "pcm16",
        input_audio_noise_reduction: {
          type: "near_field",
        },
        input_audio_transcription: {
          model: "gpt-4o-mini-transcribe",
          language: "en",
          prompt: "",
        },
        turn_detection: null,
      },
    },
  ]);

  socket.message({
    type: "transcription_session.updated",
    session: {
      id: "sess-voice-1",
    },
  });
  await startPromise;

  assert.deepEqual(events, [
    {
      kind: "voiceStateChanged",
      reason: null,
      sessionId: null,
      state: "starting",
      threadId: "thread-voice-1",
    },
    {
      kind: "voiceStateChanged",
      reason: null,
      sessionId: "sess-voice-1",
      state: "active",
      threadId: "thread-voice-1",
    },
  ]);
});

test("DesktopRealtimeTranscriptionClient appends audio, emits transcripts, and commits on stop", async () => {
  const harness = createClientHarness();
  const { client, events, sockets } = harness;

  const startPromise = client.start({
    threadId: "thread-voice-2",
  });
  const socket = await waitForSocket(harness);
  socket.open();
  socket.message({
    type: "transcription_session.updated",
    session: {
      id: "sess-voice-2",
    },
  });
  await startPromise;

  await client.appendAudio({
    audio: {
      data: "AQID",
      numChannels: 1,
      sampleRate: 24_000,
      samplesPerChannel: 480,
    },
    threadId: "thread-voice-2",
  });

  assert.deepEqual(socket.sent[1], {
    type: "input_audio_buffer.append",
    audio: "AQID",
  });

  const stopPromise = client.stop({
    threadId: "thread-voice-2",
  });

  assert.deepEqual(socket.sent[2], {
    type: "input_audio_buffer.commit",
  });

  socket.message({
    type: "conversation.item.input_audio_transcription.delta",
    delta: "Hello",
  });
  socket.message({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "Hello from realtime",
  });
  await stopPromise;

  assert.deepEqual(events.slice(2), [
    {
      kind: "voiceTranscriptUpdated",
      isFinal: false,
      role: "user",
      text: "Hello",
      threadId: "thread-voice-2",
    },
    {
      kind: "voiceTranscriptUpdated",
      isFinal: true,
      role: "user",
      text: "Hello from realtime",
      threadId: "thread-voice-2",
    },
    {
      kind: "voiceStateChanged",
      reason: "voice-stop",
      sessionId: "sess-voice-2",
      state: "stopped",
      threadId: "thread-voice-2",
    },
  ]);
});

test("DesktopRealtimeTranscriptionClient surfaces websocket errors and closes the session", async () => {
  const harness = createClientHarness();
  const { client, events, sockets } = harness;

  const startPromise = client.start({
    threadId: "thread-voice-3",
  });
  const socket = await waitForSocket(harness);
  socket.open();
  socket.message({
    type: "transcription_session.updated",
    session: {
      id: "sess-voice-3",
    },
  });
  await startPromise;

  socket.message({
    type: "error",
    error: {
      message: "Bad realtime payload",
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(events.slice(2), [
    {
      kind: "voiceError",
      message: "Bad realtime payload",
      threadId: "thread-voice-3",
    },
    {
      kind: "voiceStateChanged",
      reason: "voice-error",
      sessionId: "sess-voice-3",
      state: "stopped",
      threadId: "thread-voice-3",
    },
  ]);
  assert.equal(client.hasSession("thread-voice-3"), false);
});
