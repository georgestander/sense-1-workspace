import test from "node:test";
import assert from "node:assert/strict";

import { redactLogEntries, redactSensitivePath, redactSensitiveText, resolveRedactionHomeDir } from "./redaction.ts";

test("redactSensitiveText strips common secret patterns", () => {
  assert.equal(
    redactSensitiveText("Authorization: Bearer secret-token OPENAI_API_KEY=abc123 sk-test-secret"),
    "Authorization: Bearer [REDACTED] OPENAI_API_KEY=[REDACTED] sk-[REDACTED]",
  );
});

test("redactSensitivePath shortens home-scoped paths", () => {
  assert.equal(
    redactSensitivePath("/Users/george/projects/sense-1", "/Users/george"),
    "~/projects/sense-1",
  );
});

test("redactLogEntries applies text and path redaction together", () => {
  const entries = redactLogEntries([
    {
      level: "error",
      message: "OPENAI_API_KEY=abc123 /Users/george/project",
      timestamp: "2026-04-20T00:00:00.000Z",
    },
  ], "/Users/george");

  assert.deepEqual(entries, [
    {
      level: "error",
      message: "OPENAI_API_KEY=[REDACTED] ~/project",
      timestamp: "2026-04-20T00:00:00.000Z",
    },
  ]);
});

test("resolveRedactionHomeDir falls back to USERPROFILE on Windows-like environments", () => {
  assert.equal(
    resolveRedactionHomeDir({
      USERPROFILE: "C:\\Users\\George",
    }),
    "C:\\Users\\George",
  );
});
