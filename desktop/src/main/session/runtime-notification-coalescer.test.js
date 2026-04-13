import test from "node:test";
import assert from "node:assert/strict";

import { coalesceRuntimeNotifications } from "./runtime-notification-coalescer.ts";

test("coalesceRuntimeNotifications merges adjacent agent message deltas for the same thread entry", () => {
  assert.deepEqual(
    coalesceRuntimeNotifications([
      {
        method: "item/agentMessage/delta",
        params: { threadId: "thread-1", itemId: "item-1", delta: "Hel" },
      },
      {
        method: "item/agentMessage/delta",
        params: { threadId: "thread-1", itemId: "item-1", delta: "lo" },
      },
      {
        method: "item/agentMessage/delta",
        params: { threadId: "thread-1", itemId: "item-2", delta: "World" },
      },
    ]),
    [
      {
        method: "item/agentMessage/delta",
        params: { threadId: "thread-1", itemId: "item-1", delta: "Hello" },
      },
      {
        method: "item/agentMessage/delta",
        params: { threadId: "thread-1", itemId: "item-2", delta: "World" },
      },
    ],
  );
});

test("coalesceRuntimeNotifications keeps ordering barriers created by non-delta notifications", () => {
  assert.deepEqual(
    coalesceRuntimeNotifications([
      {
        method: "item/agentMessage/delta",
        params: { threadId: "thread-1", itemId: "item-1", delta: "Hel" },
      },
      {
        method: "item/completed",
        params: { threadId: "thread-1", item: { id: "item-1" } },
      },
      {
        method: "item/agentMessage/delta",
        params: { threadId: "thread-1", itemId: "item-1", delta: "lo" },
      },
    ]),
    [
      {
        method: "item/agentMessage/delta",
        params: { threadId: "thread-1", itemId: "item-1", delta: "Hel" },
      },
      {
        method: "item/completed",
        params: { threadId: "thread-1", item: { id: "item-1" } },
      },
      {
        method: "item/agentMessage/delta",
        params: { threadId: "thread-1", itemId: "item-1", delta: "lo" },
      },
    ],
  );
});

test("coalesceRuntimeNotifications keeps different threads independent", () => {
  assert.deepEqual(
    coalesceRuntimeNotifications([
      {
        method: "item/agentMessage/delta",
        params: { threadId: "thread-1", itemId: "item-1", delta: "Hel" },
      },
      {
        method: "item/agentMessage/delta",
        params: { threadId: "thread-2", itemId: "item-1", delta: "lo" },
      },
    ]),
    [
      {
        method: "item/agentMessage/delta",
        params: { threadId: "thread-1", itemId: "item-1", delta: "Hel" },
      },
      {
        method: "item/agentMessage/delta",
        params: { threadId: "thread-2", itemId: "item-1", delta: "lo" },
      },
    ],
  );
});
