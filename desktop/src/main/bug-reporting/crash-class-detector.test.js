import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyBootstrapSetup,
  classifyRenderProcessGone,
  classifyRuntimeCrash,
  classifyRuntimeErrored,
  isRuntimeStateUsable,
} from "./crash-class-detector.ts";

test("isRuntimeStateUsable accepts only ready or busy", () => {
  assert.equal(isRuntimeStateUsable("ready"), true);
  assert.equal(isRuntimeStateUsable("busy"), true);
  assert.equal(isRuntimeStateUsable("starting"), false);
  assert.equal(isRuntimeStateUsable("crashed"), false);
  assert.equal(isRuntimeStateUsable("errored"), false);
  assert.equal(isRuntimeStateUsable("stopped"), false);
  assert.equal(isRuntimeStateUsable(null), false);
  assert.equal(isRuntimeStateUsable(undefined), false);
});

test("classifyRuntimeCrash captures last error and restart count", () => {
  const signal = classifyRuntimeCrash({ lastError: "sigkill", restartCount: 2 });
  assert.deepEqual(signal, { reason: "runtime-crashed", detail: "sigkill", restartCount: 2 });

  const missing = classifyRuntimeCrash({ lastError: null, restartCount: null });
  assert.deepEqual(missing, { reason: "runtime-crashed", detail: null, restartCount: 0 });

  assert.equal(classifyRuntimeCrash(null), null);
  assert.equal(classifyRuntimeCrash(undefined), null);
});

test("classifyRuntimeErrored coerces detail and restart count into a signal", () => {
  const signal = classifyRuntimeErrored({ lastError: "Restart budget exhausted", restartCount: 5 });
  assert.deepEqual(signal, {
    reason: "runtime-errored",
    detail: "Restart budget exhausted",
    restartCount: 5,
  });

  const blanks = classifyRuntimeErrored({ lastError: "   ", restartCount: -3 });
  assert.deepEqual(blanks, { reason: "runtime-errored", detail: null, restartCount: 0 });
});

test("classifyBootstrapSetup only returns a signal when setup is blocked and coded", () => {
  const blocked = classifyBootstrapSetup({
    blocked: true,
    code: "runtime_unavailable",
    detail: "local codex missing",
  });
  assert.deepEqual(blocked, {
    reason: "bootstrap-blocked",
    setupCode: "runtime_unavailable",
    detail: "local codex missing",
  });

  assert.equal(classifyBootstrapSetup({ blocked: false, code: "runtime_unavailable" }), null);
  assert.equal(classifyBootstrapSetup({ blocked: true, code: null }), null);
  assert.equal(classifyBootstrapSetup(null), null);
  assert.equal(classifyBootstrapSetup(undefined), null);
});

test("classifyRenderProcessGone merges reason and exit code into a readable detail", () => {
  assert.deepEqual(
    classifyRenderProcessGone({ reason: "crashed", exitCode: 1 }),
    { reason: "renderer-gone", detail: "crashed (exit=1)" },
  );

  assert.deepEqual(
    classifyRenderProcessGone({ reason: "killed", exitCode: null }),
    { reason: "renderer-gone", detail: "killed" },
  );

  assert.deepEqual(
    classifyRenderProcessGone({ reason: null, exitCode: 7 }),
    { reason: "renderer-gone", detail: "7" },
  );

  assert.equal(classifyRenderProcessGone(null), null);
});
