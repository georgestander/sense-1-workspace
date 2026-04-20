import test from "node:test";
import assert from "node:assert/strict";

import {
  buildExhaustedCreditsEntry,
  detectExhaustedCreditsFailure,
  isApiKeyAccountType,
} from "./api-key-credits-notification.ts";

test("detectExhaustedCreditsFailure matches the UsageLimitExceeded codex error code", () => {
  const result = detectExhaustedCreditsFailure({
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        status: "failed",
        error: {
          code: "UsageLimitExceeded",
          message: "Your organisation has exceeded its allowed usage.",
        },
      },
    },
  });

  assert.deepEqual(result, { matched: true, reason: "usage-limit" });
});

test("detectExhaustedCreditsFailure accepts camelCase errorCode on the top-level error payload", () => {
  const result = detectExhaustedCreditsFailure({
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      status: "failed",
      error: {
        errorCode: "UsageLimitExceeded",
        errorMessage: "Usage exceeded.",
      },
    },
  });

  assert.deepEqual(result, { matched: true, reason: "usage-limit" });
});

test("detectExhaustedCreditsFailure matches quota language from the raw error message", () => {
  const result = detectExhaustedCreditsFailure({
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        status: "failed",
        error: {
          code: "BadRequest",
          message:
            "You exceeded your current quota, please check your plan and billing details.",
        },
      },
    },
  });

  assert.equal(result.matched, true);
  assert.equal(result.matched ? result.reason : null, "quota");
});

test("detectExhaustedCreditsFailure matches an out-of-credits phrasing", () => {
  const result = detectExhaustedCreditsFailure({
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: { status: "failed", error: { message: "You are out of credits on this API key." } },
    },
  });

  assert.deepEqual(result, { matched: true, reason: "insufficient-balance" });
});

test("detectExhaustedCreditsFailure tolerates the hypothetical turn/failed method shape", () => {
  const result = detectExhaustedCreditsFailure({
    method: "turn/failed",
    params: {
      threadId: "thread-1",
      error: { code: "UsageLimitExceeded", message: "Usage exceeded." },
    },
  });

  assert.deepEqual(result, { matched: true, reason: "usage-limit" });
});

test("detectExhaustedCreditsFailure ignores non-credit failure codes", () => {
  const sandboxFailure = detectExhaustedCreditsFailure({
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: { status: "failed", error: { code: "SandboxError", message: "Sandbox write denied." } },
    },
  });
  assert.deepEqual(sandboxFailure, { matched: false });

  const contextWindow = detectExhaustedCreditsFailure({
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        status: "failed",
        error: { code: "ContextWindowExceeded", message: "Prompt too long." },
      },
    },
  });
  assert.deepEqual(contextWindow, { matched: false });
});

test("detectExhaustedCreditsFailure ignores non-failure completions even when carrying quota text", () => {
  const result = detectExhaustedCreditsFailure({
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        status: "completed",
        note: "you have plenty of quota remaining",
      },
    },
  });

  assert.deepEqual(result, { matched: false });
});

test("detectExhaustedCreditsFailure ignores messages from unrelated methods", () => {
  const started = detectExhaustedCreditsFailure({
    method: "turn/started",
    params: { threadId: "thread-1" },
  });
  assert.deepEqual(started, { matched: false });

  const itemCompleted = detectExhaustedCreditsFailure({
    method: "item/completed",
    params: { threadId: "thread-1", item: { id: "x", type: "agentMessage" } },
  });
  assert.deepEqual(itemCompleted, { matched: false });
});

test("detectExhaustedCreditsFailure returns no match when no error payload is present", () => {
  const result = detectExhaustedCreditsFailure({
    method: "turn/completed",
    params: { threadId: "thread-1", turn: { status: "failed" } },
  });

  assert.deepEqual(result, { matched: false });
});

test("buildExhaustedCreditsEntry renders a product-shaped synthetic entry", () => {
  const entry = buildExhaustedCreditsEntry({
    threadId: "thread-1",
    reason: "quota",
    now: 1_700_000_000_000,
  });

  assert.equal(entry.id, "api-key-credits-thread-1-1700000000000");
  assert.equal(entry.kind, "activity");
  assert.equal(entry.status, "blocked");
  assert.equal(entry.title, "API credits ran out");
  assert.match(entry.body, /out of quota/i);
  assert.match(entry.body, /platform\.openai\.com\/account\/billing/);
  assert.match(entry.body, /ChatGPT sign-in/i);
});

test("buildExhaustedCreditsEntry varies the copy by reason without losing the next step", () => {
  const usage = buildExhaustedCreditsEntry({ threadId: "thread-x", reason: "usage-limit", now: 1 });
  const balance = buildExhaustedCreditsEntry({
    threadId: "thread-x",
    reason: "insufficient-balance",
    now: 2,
  });

  assert.match(usage.body, /usage limit/i);
  assert.match(balance.body, /out of credits/i);
  assert.notEqual(usage.id, balance.id);
  for (const candidate of [usage, balance]) {
    assert.match(candidate.body, /platform\.openai\.com\/account\/billing/);
    assert.match(candidate.body, /ChatGPT sign-in/i);
  }
});

test("isApiKeyAccountType accepts canonical and lowercased api-key spellings", () => {
  assert.equal(isApiKeyAccountType("apiKey"), true);
  assert.equal(isApiKeyAccountType("apikey"), true);
  assert.equal(isApiKeyAccountType("  APIKEY "), true);
  assert.equal(isApiKeyAccountType("chatgpt"), false);
  assert.equal(isApiKeyAccountType(null), false);
  assert.equal(isApiKeyAccountType(undefined), false);
  assert.equal(isApiKeyAccountType(""), false);
});
