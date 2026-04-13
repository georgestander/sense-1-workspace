import test from "node:test";
import assert from "node:assert/strict";

import { shouldEnqueueRuntimeMessageForSubstrate } from "./session-controller-runtime-hooks.ts";

test("shouldEnqueueRuntimeMessageForSubstrate keeps tracked runtime methods", () => {
  assert.equal(
    shouldEnqueueRuntimeMessageForSubstrate({
      method: "item/completed",
      params: { threadId: "thread-1" },
    }),
    true,
  );
});

test("shouldEnqueueRuntimeMessageForSubstrate drops streaming deltas that substrate already ignores", () => {
  assert.equal(
    shouldEnqueueRuntimeMessageForSubstrate({
      method: "item/agentMessage/delta",
      params: { threadId: "thread-1", itemId: "item-1", delta: "Hello" },
    }),
    false,
  );
});

test("shouldEnqueueRuntimeMessageForSubstrate drops token and rate-limit noise", () => {
  assert.equal(
    shouldEnqueueRuntimeMessageForSubstrate({
      method: "thread/tokenUsage/updated",
      params: { threadId: "thread-1" },
    }),
    false,
  );
  assert.equal(
    shouldEnqueueRuntimeMessageForSubstrate({
      method: "account/rateLimits/updated",
      params: {},
    }),
    false,
  );
});
