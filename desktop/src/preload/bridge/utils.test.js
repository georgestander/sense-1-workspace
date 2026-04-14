import test from "node:test";
import assert from "node:assert/strict";

import { shouldRefreshSessionSnapshot } from "./utils.ts";

test("shouldRefreshSessionSnapshot ignores voice lifecycle events", () => {
  assert.equal(
    shouldRefreshSessionSnapshot({
      kind: "voiceStateChanged",
      reason: "voice-stop",
      sessionId: "sess-voice-1",
      state: "stopped",
      threadId: "thread-voice-1",
    }),
    false,
  );
});

test("shouldRefreshSessionSnapshot still refreshes approval events", () => {
  assert.equal(
    shouldRefreshSessionSnapshot({
      kind: "approvalResolved",
      requestId: 42,
    }),
    true,
  );
});
