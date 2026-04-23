import test from "node:test";
import assert from "node:assert/strict";

import { RuntimeProgressNarrator } from "./runtime-progress-narrator.ts";

function createHarness() {
  let now = 0;
  const timers = [];
  const emitted = [];
  const narrator = new RuntimeProgressNarrator({
    enabled: true,
    now: () => now,
    setTimer(callback, delayMs) {
      const timer = { callback, dueAt: now + delayMs, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer(timer) {
      timer.cleared = true;
    },
    silenceThresholdMs: 4000,
    cooldownMs: 10000,
  });

  function emit(threadId, entry) {
    emitted.push({ threadId, entry });
  }

  function advance(ms) {
    now += ms;
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const timer of timers) {
        if (timer.cleared || timer.dueAt > now) {
          continue;
        }
        timer.cleared = true;
        progressed = true;
        timer.callback();
      }
    }
  }

  return { advance, emit, emitted, narrator };
}

test("RuntimeProgressNarrator emits one progress entry after tool silence", () => {
  const harness = createHarness();

  harness.narrator.observe({
    method: "turn/started",
    params: { threadId: "thread-1", turn: { id: "turn-1" } },
  }, harness.emit);
  harness.narrator.observe({
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      item: { id: "cmd-1", type: "commandExecution" },
    },
  }, harness.emit);

  harness.advance(3999);
  assert.equal(harness.emitted.length, 0);

  harness.advance(1);
  assert.equal(harness.emitted.length, 1);
  assert.deepEqual(harness.emitted[0], {
    threadId: "thread-1",
    entry: {
      id: "runtime-progress-thread-1-turn-1",
      kind: "assistant",
      title: "Sense-1 progress",
      body: "I'm checking this in the workspace now; once the command finishes I'll use the result and keep going.",
      status: "complete",
      phase: "commentary",
    },
  });
});

test("RuntimeProgressNarrator suppresses fallback when commentary arrives", () => {
  const harness = createHarness();

  harness.narrator.observe({
    method: "turn/started",
    params: { threadId: "thread-1", turn: { id: "turn-1" } },
  }, harness.emit);
  harness.narrator.observe({
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      item: { id: "tool-1", type: "mcpToolCall" },
    },
  }, harness.emit);
  harness.advance(1000);
  harness.narrator.observe({
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      item: {
        id: "commentary-1",
        type: "agentMessage",
        phase: "commentary",
      },
    },
  }, harness.emit);

  harness.advance(10000);
  assert.equal(harness.emitted.length, 0);
});

test("RuntimeProgressNarrator uses the latest user request for natural tool fallback", () => {
  const harness = createHarness();

  harness.narrator.observe({
    method: "turn/started",
    params: { threadId: "thread-1", turn: { id: "turn-1" } },
  }, harness.emit);
  harness.narrator.observe({
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      item: {
        id: "user-1",
        type: "userMessage",
        content: [{ type: "text", text: "Can you compare Stripe and Paddle for my app?" }],
      },
    },
  }, harness.emit);
  harness.narrator.observe({
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      item: { id: "tool-1", type: "webSearch" },
    },
  }, harness.emit);

  harness.advance(4000);

  assert.equal(harness.emitted.length, 1);
  assert.equal(
    harness.emitted[0].entry.body,
    "I'm checking current sources for your Stripe and Paddle comparison so I can answer with fresh context.",
  );
});

test("RuntimeProgressNarrator rate-limits changing fallback messages", () => {
  const harness = createHarness();

  harness.narrator.observe({
    method: "turn/started",
    params: { threadId: "thread-1", turn: { id: "turn-1" } },
  }, harness.emit);
  harness.narrator.observe({
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      item: { id: "cmd-1", type: "commandExecution" },
    },
  }, harness.emit);
  harness.advance(4000);

  harness.narrator.observe({
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      item: { id: "file-1", type: "fileChange" },
    },
  }, harness.emit);
  harness.advance(9999);
  assert.equal(harness.emitted.length, 1);

  harness.advance(1);
  assert.equal(harness.emitted.length, 2);
  assert.equal(
    harness.emitted[1].entry.body,
    "I'm applying the file changes now, then I'll verify the result before wrapping up.",
  );
});

test("RuntimeProgressNarrator clears pending fallback when turn completes", () => {
  const harness = createHarness();

  harness.narrator.observe({
    method: "turn/started",
    params: { threadId: "thread-1", turn: { id: "turn-1" } },
  }, harness.emit);
  harness.narrator.observe({
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      item: { id: "cmd-1", type: "commandExecution" },
    },
  }, harness.emit);
  harness.narrator.observe({
    method: "turn/completed",
    params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } },
  }, harness.emit);

  harness.advance(10000);
  assert.equal(harness.emitted.length, 0);
});
