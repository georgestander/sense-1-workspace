import test from "node:test";
import assert from "node:assert/strict";

import { CrashRecoveryTracker } from "./crash-recovery-tracker.ts";

function runtimeSignal(detail = "boom") {
  return { reason: "runtime-crashed", detail, restartCount: 1 };
}

function bootstrapSignal(code = "runtime_unavailable") {
  return { reason: "bootstrap-blocked", setupCode: code, detail: null };
}

function rendererSignal(detail = "crashed") {
  return { reason: "renderer-gone", detail };
}

test("CrashRecoveryTracker does nothing until a signal is recorded", () => {
  const emits = [];
  const tracker = new CrashRecoveryTracker((signal) => emits.push(signal));

  tracker.setRuntimeUsable(true);
  tracker.setBootstrapUsable(true);
  tracker.setWindowOpen(true);

  assert.equal(emits.length, 0);
  assert.equal(tracker.hasPendingSignal(), false);
});

test("CrashRecoveryTracker waits for every usable flag before emitting", () => {
  const emits = [];
  const tracker = new CrashRecoveryTracker((signal) => emits.push(signal));
  tracker.setBootstrapUsable(false);
  tracker.setWindowOpen(false);

  tracker.recordSignal(runtimeSignal());
  assert.equal(emits.length, 0);
  assert.equal(tracker.hasPendingSignal(), true);

  tracker.setRuntimeUsable(true);
  tracker.setBootstrapUsable(true);
  assert.equal(emits.length, 0);

  tracker.setWindowOpen(true);
  assert.equal(emits.length, 1);
  assert.equal(emits[0].reason, "runtime-crashed");
  assert.equal(tracker.hasPendingSignal(), false);
});

test("CrashRecoveryTracker collapses multiple signals into the latest emit", () => {
  const emits = [];
  const tracker = new CrashRecoveryTracker((signal) => emits.push(signal));

  tracker.setRuntimeUsable(false);
  tracker.setBootstrapUsable(false);
  tracker.setWindowOpen(true);

  tracker.recordSignal(runtimeSignal("first"));
  tracker.recordSignal(bootstrapSignal("auth_restore_failed"));
  tracker.recordSignal(rendererSignal("latest"));

  tracker.setRuntimeUsable(true);
  tracker.setBootstrapUsable(true);

  assert.equal(emits.length, 1);
  assert.deepEqual(emits[0], { reason: "renderer-gone", detail: "latest" });
});

test("CrashRecoveryTracker stops re-emitting once the pending signal has been cleared", () => {
  const emits = [];
  const tracker = new CrashRecoveryTracker((signal) => emits.push(signal));
  tracker.setRuntimeUsable(true);
  tracker.setBootstrapUsable(true);
  tracker.setWindowOpen(true);

  tracker.recordSignal(runtimeSignal());
  assert.equal(emits.length, 1);

  tracker.setWindowOpen(false);
  tracker.setWindowOpen(true);
  tracker.setRuntimeUsable(false);
  tracker.setRuntimeUsable(true);
  assert.equal(emits.length, 1);
  assert.equal(tracker.hasPendingSignal(), false);
});

test("CrashRecoveryTracker emits immediately when the app is already usable at signal time", () => {
  const emits = [];
  const tracker = new CrashRecoveryTracker((signal) => emits.push(signal));
  tracker.setRuntimeUsable(true);
  tracker.setBootstrapUsable(true);
  tracker.setWindowOpen(true);

  tracker.recordSignal(bootstrapSignal("recent_threads_restore_failed"));
  assert.equal(emits.length, 1);
  assert.equal(emits[0].reason, "bootstrap-blocked");
});
