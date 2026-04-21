import test from "node:test";
import assert from "node:assert/strict";

import { CrashReportSuggestionStore } from "./crash-report-suggestion-store.ts";

function fixedClock(values) {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    return value;
  };
}

test("record turns a runtime-crashed signal into a suggestion carrying restart count", () => {
  const store = new CrashReportSuggestionStore(() => "2026-04-20T17:00:00.000Z");
  const suggestion = store.record({
    reason: "runtime-crashed",
    detail: "sigkill",
    restartCount: 2,
  });

  assert.deepEqual(suggestion, {
    reason: "runtime-crashed",
    detail: "sigkill",
    setupCode: null,
    restartCount: 2,
    occurredAt: "2026-04-20T17:00:00.000Z",
  });
  assert.deepEqual(store.get(), suggestion);
});

test("record maps a bootstrap-blocked signal to a suggestion with setupCode", () => {
  const store = new CrashReportSuggestionStore(() => "2026-04-20T17:05:00.000Z");
  const suggestion = store.record({
    reason: "bootstrap-blocked",
    setupCode: "runtime_unavailable",
    detail: "codex missing",
  });

  assert.deepEqual(suggestion, {
    reason: "bootstrap-blocked",
    detail: "codex missing",
    setupCode: "runtime_unavailable",
    restartCount: null,
    occurredAt: "2026-04-20T17:05:00.000Z",
  });
});

test("record replaces the previously stored suggestion with the latest signal", () => {
  const store = new CrashReportSuggestionStore(fixedClock(["t1", "t2"]));
  store.record({ reason: "runtime-crashed", detail: null, restartCount: 0 });
  const second = store.record({ reason: "renderer-gone", detail: "crashed (exit=1)" });

  assert.equal(store.get(), second);
  assert.equal(store.get()?.occurredAt, "t2");
});

test("acknowledge clears the suggestion only when occurredAt matches", () => {
  const store = new CrashReportSuggestionStore(() => "t");
  store.record({ reason: "renderer-gone", detail: "crashed" });

  assert.equal(store.acknowledge("wrong"), false);
  assert.notEqual(store.get(), null);
  assert.equal(store.acknowledge("t"), true);
  assert.equal(store.get(), null);
  assert.equal(store.acknowledge("t"), false);
});
