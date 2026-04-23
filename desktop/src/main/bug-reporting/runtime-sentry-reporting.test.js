import test from "node:test";
import assert from "node:assert/strict";

import { redactRuntimeErrorForSentry } from "./runtime-sentry-redaction.ts";

test("redactRuntimeErrorForSentry strips secrets from replacement error stacks", () => {
  const original = new Error("transport failed OPENAI_API_KEY=sk-secret-123 at C:\\Users\\Alice\\repo");
  original.stack = [
    "Error: transport failed OPENAI_API_KEY=sk-secret-123 at C:\\Users\\Alice\\repo",
    "    at startRuntime (C:\\Users\\Alice\\repo\\desktop\\main.js:10:5)",
  ].join("\n");

  const redacted = redactRuntimeErrorForSentry(original, {
    USERPROFILE: "C:\\Users\\Alice",
  });

  assert.notEqual(redacted, original);
  assert.equal(redacted.message, "transport failed OPENAI_API_KEY=[REDACTED] at ~\\repo");
  assert.doesNotMatch(redacted.stack ?? "", /sk-secret-123/);
  assert.doesNotMatch(redacted.stack ?? "", /C:\\Users\\Alice/);
  assert.match(redacted.stack ?? "", /OPENAI_API_KEY=\[REDACTED\]/);
});

test("redactRuntimeErrorForSentry reuses safe errors without changing stacks", () => {
  const original = new Error("transport closed");

  assert.equal(redactRuntimeErrorForSentry(original, { HOME: "/not-in-stack" }), original);
});
