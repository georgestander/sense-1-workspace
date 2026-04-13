import test from "node:test";
import assert from "node:assert/strict";

import { RuntimeFileChangeTracker } from "./runtime-file-change-tracker.ts";

test("requires fallback persistence when a turn completes without runtime file signals", () => {
  const tracker = new RuntimeFileChangeTracker();

  tracker.observe({
    method: "turn/started",
    params: { threadId: "thread-1" },
  });

  assert.equal(tracker.consumeFallbackRequirement("thread-1"), true);
});

test("skips fallback persistence when the runtime already emitted turn diffs", () => {
  const tracker = new RuntimeFileChangeTracker();

  tracker.observe({
    method: "turn/started",
    params: { threadId: "thread-1" },
  });
  tracker.observe({
    method: "turn/diff/updated",
    params: {
      threadId: "thread-1",
      diffs: [{ path: "/tmp/example.txt", hunks: [] }],
    },
  });

  assert.equal(tracker.consumeFallbackRequirement("thread-1"), false);
});

test("skips fallback persistence when the runtime completed a fileChange item", () => {
  const tracker = new RuntimeFileChangeTracker();

  tracker.observe({
    method: "turn/started",
    params: { threadId: "thread-1" },
  });
  tracker.observe({
    method: "item/completed",
    params: {
      threadId: "thread-1",
      item: {
        id: "item-1",
        type: "fileChange",
        changes: [{ kind: "created", path: "/tmp/example.txt" }],
      },
    },
  });

  assert.equal(tracker.consumeFallbackRequirement("thread-1"), false);
});
