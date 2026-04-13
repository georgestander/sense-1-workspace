import test from "node:test";
import assert from "node:assert/strict";

import { resolveThreadIndicatorState } from "./thread-status.ts";

test("resolveThreadIndicatorState prefers the running state and shows queued count when present", () => {
  assert.deepEqual(
    resolveThreadIndicatorState({
      state: "running",
      threadInputState: {
        queuedMessages: [{ id: "queued-1", text: "Next", enqueuedAt: "2026-04-08T10:00:00.000Z" }],
        hasUnseenCompletion: false,
        lastCompletionAt: null,
        lastCompletionStatus: null,
      },
    }),
    {
      tone: "running",
      queuedMessageCount: 1,
      statusLabel: "1 queued",
    },
  );
});

test("resolveThreadIndicatorState surfaces unseen completions before queued state", () => {
  assert.deepEqual(
    resolveThreadIndicatorState({
      state: "idle",
      threadInputState: {
        queuedMessages: [],
        hasUnseenCompletion: true,
        lastCompletionAt: "2026-04-08T10:00:00.000Z",
        lastCompletionStatus: "completed",
      },
    }),
    {
      tone: "completed",
      queuedMessageCount: 0,
      statusLabel: "Completed",
    },
  );
});

test("resolveThreadIndicatorState falls back to queued then idle states", () => {
  assert.deepEqual(
    resolveThreadIndicatorState({
      state: "idle",
      threadInputState: {
        queuedMessages: [{ id: "queued-1", text: "Next", enqueuedAt: "2026-04-08T10:00:00.000Z" }],
        hasUnseenCompletion: false,
        lastCompletionAt: null,
        lastCompletionStatus: null,
      },
    }),
    {
      tone: "queued",
      queuedMessageCount: 1,
      statusLabel: "1 queued",
    },
  );

  assert.deepEqual(
    resolveThreadIndicatorState({
      state: "idle",
      threadInputState: null,
    }),
    {
      tone: "idle",
      queuedMessageCount: 0,
      statusLabel: null,
    },
  );
});
