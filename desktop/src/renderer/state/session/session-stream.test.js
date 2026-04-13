import test from "node:test";
import assert from "node:assert/strict";

import { coalesceThreadDeltas } from "./session-stream-coalescer.ts";

test("coalesceThreadDeltas merges adjacent entry deltas for the same entry", () => {
  const deltas = coalesceThreadDeltas([
    {
      kind: "entryDelta",
      threadId: "thread-1",
      entryId: "entry-1",
      field: "body",
      append: "Hel",
    },
    {
      kind: "entryDelta",
      threadId: "thread-1",
      entryId: "entry-1",
      field: "body",
      append: "lo",
    },
    {
      kind: "entryDelta",
      threadId: "thread-1",
      entryId: "entry-1",
      field: "body",
      append: " world",
    },
  ]);

  assert.deepEqual(deltas, [
    {
      kind: "entryDelta",
      threadId: "thread-1",
      entryId: "entry-1",
      field: "body",
      append: "Hello world",
    },
  ]);
});

test("coalesceThreadDeltas preserves ordering barriers around non-entry deltas", () => {
  const deltas = coalesceThreadDeltas([
    {
      kind: "entryDelta",
      threadId: "thread-1",
      entryId: "entry-1",
      field: "body",
      append: "Hel",
    },
    {
      kind: "interactionStateChanged",
      threadId: "thread-1",
      interactionState: "awaitingInput",
      updatedAt: "2026-04-13T17:00:00.000Z",
    },
    {
      kind: "entryDelta",
      threadId: "thread-1",
      entryId: "entry-1",
      field: "body",
      append: "lo",
    },
  ]);

  assert.deepEqual(deltas, [
    {
      kind: "entryDelta",
      threadId: "thread-1",
      entryId: "entry-1",
      field: "body",
      append: "Hel",
    },
    {
      kind: "interactionStateChanged",
      threadId: "thread-1",
      interactionState: "awaitingInput",
      updatedAt: "2026-04-13T17:00:00.000Z",
    },
    {
      kind: "entryDelta",
      threadId: "thread-1",
      entryId: "entry-1",
      field: "body",
      append: "lo",
    },
  ]);
});
