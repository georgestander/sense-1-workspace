import test from "node:test";
import assert from "node:assert/strict";

import { getThreadListStatus } from "./thread-list-status.ts";

test("getThreadListStatus prefers running threads", () => {
  assert.equal(
    getThreadListStatus({
      state: "running",
      threadInputState: {
        queuedMessages: [],
        hasUnseenCompletion: true,
        lastCompletionAt: "2026-04-08T12:00:00.000Z",
        lastCompletionStatus: "completed",
      },
    }),
    "running",
  );
});

test("getThreadListStatus does not treat historical active threads as running", () => {
  assert.equal(
    getThreadListStatus({
      state: "active",
      threadInputState: {
        queuedMessages: [],
        hasUnseenCompletion: false,
        lastCompletionAt: null,
        lastCompletionStatus: null,
      },
    }),
    "idle",
  );
});

test("getThreadListStatus shows completed threads when background work finishes unseen", () => {
  assert.equal(
    getThreadListStatus({
      state: "idle",
      threadInputState: {
        queuedMessages: [],
        hasUnseenCompletion: true,
        lastCompletionAt: "2026-04-08T12:00:00.000Z",
        lastCompletionStatus: "completed",
      },
    }),
    "completed",
  );
});

test("getThreadListStatus stays idle for ordinary threads", () => {
  assert.equal(
    getThreadListStatus({
      state: "idle",
      threadInputState: null,
    }),
    "idle",
  );
});
