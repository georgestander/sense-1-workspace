import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
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

test("startAuthLogin opens ChatGPT auth with the dedicated auth window opener", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-session-auth-"));
  const openedAuthUrls = [];
  const externalUrls = [];
  const manager = {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-05-07T07:00:00.000Z",
    async handleProfileChange() {},
    async start() {},
    async request(method) {
      if (method === "account/read") {
        return {
          account: {
            email: null,
            type: "chatgpt",
          },
          requiresOpenaiAuth: true,
        };
      }

      if (method === "account/login/start") {
        return {
          authUrl: "https://auth.openai.com/oauth/authorize?client_id=codex",
        };
      }

      if (method === "thread/list") {
        return {
          data: [],
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };
  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-05-07T07:00:00.000Z",
    env: createTestEnv(runtimeRoot),
    openAuth: async (url) => {
      openedAuthUrls.push(url);
    },
    openExternal: async (url) => {
      externalUrls.push(url);
    },
    runtimeInfo: {
      appVersion: "0.14.1",
      electronVersion: process.versions.electron ?? "test-electron",
      platform: process.platform,
      startedAt: "2026-05-07T07:00:00.000Z",
    },
  });

  try {
    const result = await controller.startAuthLogin({ method: "chatgpt" });

    assert.equal(result.success, true);
    assert.deepEqual(openedAuthUrls, ["https://auth.openai.com/oauth/authorize?client_id=codex"]);
    assert.deepEqual(externalUrls, []);
  } finally {
    await fs.rm(runtimeRoot, { recursive: true, force: true });
  }
});
