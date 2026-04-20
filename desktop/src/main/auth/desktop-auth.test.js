import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { logoutDesktopAuth, startDesktopAuthLogin } from "./desktop-auth.ts";
import { getDesktopBootstrap, selectDesktopProfile } from "../bootstrap/desktop-bootstrap.js";
import { DEFAULT_PROFILE_ID } from "../profile/profile-state.js";

function createManager(overrides = {}) {
  return {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: null,
            type: "chatgpt",
          },
          requiresOpenaiAuth: true,
        };
      }

      if (method === "thread/list") {
        return {
          data: [],
        };
      }

      if (method === "account/login/start") {
        return {
          authUrl: "https://example.com/login",
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    ...overrides,
  };
}

test("startDesktopAuthLogin uses runtime-provided authUrl when available", async () => {
  const opened = [];
  const result = await startDesktopAuthLogin(createManager(), {
    request: { method: "chatgpt" },
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
    openExternal: async (url) => {
      opened.push(url);
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.method, "chatgpt");
  assert.equal(result.url, "https://example.com/login");
  assert.deepEqual(opened, ["https://example.com/login"]);
});

test("startDesktopAuthLogin falls back to the direct ChatGPT login URL when login/start fails", async () => {
  const opened = [];
  const result = await startDesktopAuthLogin(
    createManager({
      request: async (method) => {
        if (method === "account/read") {
          return {
            account: {
              email: null,
              type: "chatgpt",
            },
            requiresOpenaiAuth: true,
          };
        }

        if (method === "thread/list") {
          return {
            data: [],
          };
        }

        if (method === "account/login/start") {
          throw new Error("login start unavailable");
        }

        throw new Error(`Unexpected method: ${method}`);
      },
    }),
    {
      request: { method: "chatgpt" },
      env: {
        ...process.env,
        SENSE1_CHATGPT_SIGNIN_URL: "https://chatgpt.com/auth/login",
      },
      openExternal: async (url) => {
        opened.push(url);
      },
    },
  );

  assert.equal(result.success, true);
  assert.equal(result.method, "chatgpt");
  assert.equal(result.url, "https://chatgpt.com/auth/login");
  assert.match(result.reason ?? "", /Fell back to direct ChatGPT login/);
  assert.deepEqual(opened, ["https://chatgpt.com/auth/login"]);
});

test("startDesktopAuthLogin completes immediately in the e2e auth fixture for the selected profile", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-desktop-auth-"));
  const env = {
    ...process.env,
    NODE_ENV: "test",
    SENSE1_E2E_AUTH_EMAIL: "fixture-user@example.com",
    SENSE1_E2E_AUTH_FIXTURE: "1",
    SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
  };

  const result = await startDesktopAuthLogin(createManager(), {
    request: { method: "chatgpt" },
    env,
    openExternal: async () => {
      throw new Error("fixture sign-in should not open an external browser");
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.method, "chatgpt");
  assert.equal(result.completed, true);

  const bootstrap = await getDesktopBootstrap(createManager(), {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.equal(bootstrap.isSignedIn, true);
  assert.equal(bootstrap.accountEmail, "fixture-user@example.com");
  assert.equal(bootstrap.profileId, DEFAULT_PROFILE_ID);
});

test("startDesktopAuthLogin submits apiKey logins directly to app-server", async () => {
  const calls = [];
  const result = await startDesktopAuthLogin(
    createManager({
      request: async (method, params) => {
        calls.push([method, params]);
        if (method === "account/read") {
          return {
            account: {
              email: null,
              type: "chatgpt",
            },
            requiresOpenaiAuth: true,
          };
        }

        if (method === "thread/list") {
          return {
            data: [],
          };
        }

        if (method === "account/login/start") {
          return {
            type: "apiKey",
          };
        }

        throw new Error(`Unexpected method: ${method}`);
      },
    }),
    {
      request: { method: "apiKey", apiKey: "sk-test-123" },
      openExternal: async () => {
        throw new Error("apiKey sign-in should not open an external browser");
      },
    },
  );

  assert.equal(result.success, true);
  assert.equal(result.method, "apiKey");
  assert.equal(result.completed, true);
  assert.equal(result.url, null);
  assert.deepEqual(
    calls.find(([method]) => method === "account/login/start"),
    ["account/login/start", { type: "apiKey", apiKey: "sk-test-123" }],
  );
});

test("startDesktopAuthLogin rejects empty apiKey requests before calling app-server", async () => {
  const result = await startDesktopAuthLogin(createManager(), {
    request: { method: "apiKey", apiKey: "   " },
    openExternal: async () => {
      throw new Error("empty apiKey sign-in should not open an external browser");
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.method, "apiKey");
  assert.equal(result.url, null);
  assert.match(result.reason ?? "", /OpenAI API key/i);
});

test("logoutDesktopAuth clears the e2e auth fixture for the active profile", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-desktop-auth-"));
  const env = {
    ...process.env,
    NODE_ENV: "test",
    SENSE1_E2E_AUTH_EMAIL: "fixture-user@example.com",
    SENSE1_E2E_AUTH_FIXTURE: "1",
    SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
  };

  await selectDesktopProfile("qa-logout", env);
  await startDesktopAuthLogin(createManager(), {
    request: { method: "chatgpt" },
    env,
    openExternal: async () => {},
  });

  const result = await logoutDesktopAuth(createManager(), { env });
  assert.equal(result.success, true);

  const bootstrap = await getDesktopBootstrap(createManager(), {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.equal(bootstrap.isSignedIn, false);
  assert.equal(bootstrap.profileId, DEFAULT_PROFILE_ID);
});
