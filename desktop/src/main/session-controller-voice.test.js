import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

import { DesktopSessionController } from "./session-controller.ts";

function createTestEnv(runtimeRoot) {
  return {
    ...process.env,
    SENSE1_ARTIFACT_ROOT: path.join(runtimeRoot, "visible-artifacts"),
    SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
  };
}

test("startDesktopVoice omits nullable realtime fields instead of sending null", async () => {
  const requestCalls = [];
  const manager = {
    async request(method, params) {
      requestCalls.push({ method, params });
      return {};
    },
    respond() {},
  };
  const runtimeRoot = path.join(
    os.tmpdir(),
    `sc-voice-test-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-04-14T08:00:00.000Z",
    env: createTestEnv(runtimeRoot),
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.8.0",
      electronVersion: process.versions.electron ?? "test-electron",
      platform: process.platform,
      startedAt: "2026-04-14T08:00:00.000Z",
    },
  });

  await controller.startDesktopVoice({
    prompt: null,
    sessionId: null,
    threadId: "thread-voice-1",
  });

  assert.deepEqual(requestCalls, [
    {
      method: "thread/realtime/start",
      params: {
        threadId: "thread-voice-1",
      },
    },
  ]);
});
