import test from "node:test";
import assert from "node:assert/strict";

import { createThreadDeltaBuffer } from "./thread-delta-buffer.js";

test("createThreadDeltaBuffer replays queued plan deltas once the thread becomes known", () => {
  const buffer = createThreadDeltaBuffer();
  const planDelta = {
    kind: "planUpdated",
    threadId: "thread-plan-1",
    planText: "1. Inspect the project\n2. Fix the bug",
    planSteps: ["Inspect the project", "Fix the bug"],
  };
  const stateDelta = {
    kind: "threadStateChanged",
    threadId: "thread-plan-1",
    state: "running",
    updatedAt: "2026-03-26T15:00:00.000Z",
  };

  buffer.queue(planDelta);
  buffer.queue(stateDelta);

  assert.equal(buffer.hasKnownThread("thread-plan-1"), false);
  assert.deepEqual(buffer.drain("thread-plan-1"), [planDelta, stateDelta]);

  buffer.queue(planDelta);
  buffer.rememberKnownThreadIds(["thread-plan-1"]);

  assert.equal(buffer.hasKnownThread("thread-plan-1"), true);
  assert.deepEqual(buffer.drain("thread-plan-1"), [planDelta]);
  assert.deepEqual(buffer.drain("thread-plan-1"), []);
});

test("createThreadDeltaBuffer drops queued deltas when a thread is archived", () => {
  const buffer = createThreadDeltaBuffer();
  const planDelta = {
    kind: "planUpdated",
    threadId: "thread-archive-1",
    planText: "1. Clean up",
    planSteps: ["Clean up"],
  };

  buffer.rememberKnownThreadIds(["thread-archive-1"]);
  buffer.queue(planDelta);
  buffer.dropThread("thread-archive-1");

  assert.equal(buffer.hasKnownThread("thread-archive-1"), false);
  assert.deepEqual(buffer.drain("thread-archive-1"), []);
});
