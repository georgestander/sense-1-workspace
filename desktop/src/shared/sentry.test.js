import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveSentryDsn,
  resolveSentryEnvironment,
  resolveSentryRelease,
  shouldEnableSentryDebug,
} from "./sentry.ts";

test("resolveSentryDsn falls back to the shipped desktop DSN", () => {
  const dsn = resolveSentryDsn();

  assert.match(dsn, /^https:\/\/.+@o\d+\.ingest\.[^/]+\.sentry\.io\/\d+$/);
});

test("resolveSentryDsn prefers an explicit environment override", () => {
  assert.equal(
    resolveSentryDsn({
      SENSE1_SENTRY_DSN: "https://override@example.ingest.sentry.io/123",
    }),
    "https://override@example.ingest.sentry.io/123",
  );
});

test("resolveSentryEnvironment defaults to development", () => {
  assert.equal(resolveSentryEnvironment(), "development");
  assert.equal(resolveSentryEnvironment({ NODE_ENV: "production" }), "production");
});

test("resolveSentryRelease prefixes the desktop app version", () => {
  assert.equal(resolveSentryRelease("0.11.0"), "sense-1-workspace@0.11.0");
  assert.equal(resolveSentryRelease(""), "sense-1-workspace@unknown");
});

test("shouldEnableSentryDebug only enables debug logging for the explicit opt-in flag", () => {
  assert.equal(shouldEnableSentryDebug(), false);
  assert.equal(shouldEnableSentryDebug({ SENSE1_SENTRY_DEBUG: "1" }), true);
});
