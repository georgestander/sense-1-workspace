import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  APP_SERVER_STATES,
  AppServerProcessManager,
  defaultRuntimePathEntriesForPlatform,
} from "./app-server-process-manager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "..", "test-fixtures", "fake-app-server.js");

function createManager(extraArgs = [], options = {}) {
  const {
    codexHome,
    command,
    env,
  } = options;
  const resolvedCodexHome = codexHome ?? path.join(
    os.tmpdir(),
    `sense1-app-server-home-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
  );
  return new AppServerProcessManager({
    command: command ?? process.execPath,
    args: [fixturePath, ...extraArgs],
    startupTimeoutMs: options.startupTimeoutMs ?? 250,
    requestTimeoutMs: options.requestTimeoutMs ?? 250,
    maxRestarts: options.maxRestarts ?? 1,
    restartDelayMs: options.restartDelayMs ?? 25,
    codexHome: resolvedCodexHome,
    env,
  });
}

function waitForState(manager, expectedState, timeoutMs = 1000) {
  if (manager.state === expectedState) {
    return Promise.resolve(manager.summary);
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for state ${expectedState}. Last state: ${manager.state}`));
    }, timeoutMs);

    const onState = (summary) => {
      if (summary.state !== expectedState) {
        return;
      }

      cleanup();
      resolve(summary);
    };

    const cleanup = () => {
      clearTimeout(timer);
      manager.off("state", onState);
    };

    manager.on("state", onState);
  });
}

test("exports the expected user-facing runtime states", () => {
  assert.deepEqual(APP_SERVER_STATES, [
    "idle",
    "starting",
    "ready",
    "busy",
    "stopped",
    "crashed",
    "errored",
  ]);
});

test("start initializes the child and requests require the post-initialize notification", async () => {
  const manager = createManager();
  const notifications = [];
  manager.on("notification", (message) => notifications.push(message));

  await manager.start();
  assert.equal(manager.state, "ready");

  const result = await manager.request("ping", { value: 7 });
  assert.deepEqual(result, { ok: true, echoed: { value: 7 } });
  assert.deepEqual(notifications, [{ jsonrpc: "2.0", method: "server/status", params: { state: "ready" } }]);

  await manager.stop();
  assert.equal(manager.state, "stopped");
});

test("readDirectory forwards fs/readDirectory through the app-server transport", async () => {
  const manager = createManager();

  try {
    await manager.start();
    const result = await manager.readDirectory("/tmp/sense1-workspace", {
      depth: 1,
      includeHidden: true,
    });

    assert.deepEqual(result, {
      entries: [
        {
          name: "README.md",
          path: "/tmp/sense1-workspace/README.md",
          type: "file",
        },
        {
          name: "src",
          path: "/tmp/sense1-workspace/src",
          type: "directory",
        },
      ],
      params: {
        depth: 1,
        includeHidden: true,
        path: "/tmp/sense1-workspace",
      },
      path: "/tmp/sense1-workspace",
    });
  } finally {
    await manager.stop().catch(() => {});
  }
});

test("requestReview forwards review/start with inline delivery and thread target", async () => {
  const manager = createManager();
  const calls = [];
  manager.request = async (method, params) => {
    calls.push({ method, params });
    return { ok: true };
  };

  await manager.requestReview("  thread-review-1  ");

  assert.deepEqual(calls, [
    {
      method: "review/start",
      params: {
        delivery: "inline",
        target: "thread-review-1",
        threadId: "thread-review-1",
      },
    },
  ]);
});

test("requestReview preserves structured review targets", async () => {
  const manager = createManager();
  const calls = [];
  manager.request = async (method, params) => {
    calls.push({ method, params });
    return { ok: true };
  };

  await manager.requestReview("thread-review-2", {
    delivery: "inline",
    target: { type: "uncommittedChanges" },
  });

  assert.deepEqual(calls, [
    {
      method: "review/start",
      params: {
        delivery: "inline",
        target: { type: "uncommittedChanges" },
        threadId: "thread-review-2",
      },
    },
  ]);
});

test("steerTurn forwards turn/steer with the expected active turn id", async () => {
  const manager = createManager();
  const calls = [];
  const input = [{ type: "text", text: "Tighten the plan." }];
  manager.request = async (method, params) => {
    calls.push({ method, params });
    return { ok: true };
  };

  await manager.steerTurn(" thread-steer-1 ", input, {
    expectedTurnId: " turn-steer-1 ",
  });

  assert.deepEqual(calls, [
    {
      method: "turn/steer",
      params: {
        expectedTurnId: "turn-steer-1",
        input,
        threadId: "thread-steer-1",
      },
    },
  ]);
});

test("startup timeout produces a readable error without entering an endless restart loop", async () => {
  const manager = createManager(["--hang-initialize"], {
    startupTimeoutMs: 75,
    maxRestarts: 1,
  });

  await assert.rejects(manager.start(), /Timed out waiting 75ms/);
  assert.equal(manager.state, "errored");
  assert.match(manager.lastError ?? "", /Timed out waiting 75ms/);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(manager.restartCount, 0);
  assert.equal(manager.state, "errored");
});

test("unexpected crashes are retried once and then stop with an errored state", async () => {
  const manager = createManager([], {
    maxRestarts: 1,
    restartDelayMs: 25,
  });
  const restartTimeoutMs = 2000;

  await manager.start();
  await assert.rejects(manager.request("crash"), /transport closed before response|session service disconnected|App Server transport closed before response/i);
  await waitForState(manager, "ready", restartTimeoutMs);
  assert.equal(manager.restartCount, 1);

  await assert.rejects(manager.request("crash"), /transport closed before response|session service disconnected|App Server transport closed before response/i);
  await waitForState(manager, "errored", restartTimeoutMs);
  assert.equal(manager.restartCount, 1);
  assert.match(manager.lastError ?? "", /App-server exited unexpectedly/);
});

test("missing codex runtime fails immediately with a readable spawn error", async () => {
  const manager = new AppServerProcessManager({
    command: "__sense1_missing_codex__",
    args: ["app-server", "--listen", "stdio://"],
    codexHome: path.join(os.tmpdir(), `sense1-app-server-home-missing-${process.pid}`),
    startupTimeoutMs: 250,
  });

  await assert.rejects(manager.start(), /spawn __sense1_missing_codex__ ENOENT|not found|No such file/i);
  assert.equal(manager.state, "errored");
  assert.match(manager.lastError ?? "", /__sense1_missing_codex__|ENOENT|not found|No such file/i);
});

test("handleProfileChange does not restart when codex home is unchanged", async () => {
  const manager = createManager();
  await manager.start();
  const originalChild = manager.child;
  const originalRestartCount = manager.restartCount;
  const originalCodexHome = manager.codexHome;

  await manager.handleProfileChange(originalCodexHome);

  assert.equal(manager.child, originalChild);
  assert.equal(manager.restartCount, originalRestartCount);
  assert.equal(manager.state, "ready");

  await manager.stop();
});

test("start runs the app-server inside the isolated codex home path", async () => {
  const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-app-server-home-"));
  const codexHome = path.join(tempBase, "profiles", "test-profile", "codex-home");
  const manager = createManager([], { codexHome });

  try {
    await manager.start();
    const context = await manager.request("runtimeContext");
    const resolvedExpectedCwd = await fs.realpath(codexHome);
    const resolvedActualCwd = await fs.realpath(context.cwd);

    assert.equal(resolvedActualCwd, resolvedExpectedCwd);
    assert.equal(context.codexHome, codexHome);
  } finally {
    await manager.stop().catch(() => {});
    await fs.rm(tempBase, { force: true, recursive: true });
  }
});

test("start preserves an existing profile config and keeps runtime behavior pinned to it even when the user global config changes", async () => {
  const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-app-server-config-"));
  const homeRoot = path.join(tempBase, "home");
  const codexHome = path.join(tempBase, "profiles", "test-profile", "codex-home");
  const globalConfigPath = path.join(homeRoot, ".codex", "config.toml");
  const profileConfigPath = path.join(codexHome, "config.toml");
  const expectedProfileConfig = [
    'approval_policy = "never"',
    'sandbox_mode = "danger-full-access"',
    'model = "gpt-5.4-mini"',
    'trust_level = "low"',
    "",
    '[plugins."gmail@openai-curated"]',
    "enabled = true",
  ].join("\n");
  const manager = createManager(["--report-config-context"], {
    codexHome,
    env: {
      HOME: homeRoot,
    },
  });

  try {
    await fs.mkdir(path.dirname(globalConfigPath), { recursive: true });
    await fs.mkdir(path.dirname(profileConfigPath), { recursive: true });
    await fs.writeFile(
      globalConfigPath,
      [
        'source = "global"',
        'approval = "allow"',
        'sandbox = "full"',
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      profileConfigPath,
      expectedProfileConfig,
      "utf8",
    );

    await manager.start();
    assert.equal(await fs.readFile(profileConfigPath, "utf8"), expectedProfileConfig);
    const firstContext = await manager.request("runtimeContext");
    assert.deepEqual(firstContext.configContext, {
      contents: expectedProfileConfig,
      path: profileConfigPath,
      source: "profile",
    });

    await fs.writeFile(
      globalConfigPath,
      [
        'source = "global-updated"',
        'approval = "allow"',
        'sandbox = "full"',
      ].join("\n"),
      "utf8",
    );

    const secondContext = await manager.request("runtimeContext");
    assert.deepEqual(secondContext.configContext, firstContext.configContext);
  } finally {
    await manager.stop().catch(() => {});
    await fs.rm(tempBase, { force: true, recursive: true });
  }
});

test("start seeds a profile config when one does not exist yet", async () => {
  const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-app-server-config-seed-"));
  const codexHome = path.join(tempBase, "profiles", "test-profile", "codex-home");
  const profileConfigPath = path.join(codexHome, "config.toml");
  const expectedProfileConfig = [
    'approval_policy = { granular = { mcp_elicitations = true, rules = true, sandbox_approval = true, request_permissions = true, skill_approval = true } }',
    'sandbox_mode = "read-only"',
    "sandbox_workspace_write.network_access = true",
    'trust_level = "medium"',
    'model = "gpt-5.4-mini"',
    'web_search = "live"',
    'developer_instructions = ""',
    'instructions = ""',
    "",
    "[realtime]",
    'version = "v2"',
    'type = "conversational"',
    "",
    "[features]",
    "realtime_conversation = true",
    "",
    "[tools]",
    "view_image = true",
    "",
  ].join("\n");
  const manager = createManager(["--report-config-context"], { codexHome });

  try {
    await fs.mkdir(path.dirname(profileConfigPath), { recursive: true });

    await manager.start();

    assert.equal(await fs.readFile(profileConfigPath, "utf8"), expectedProfileConfig);
    const context = await manager.request("runtimeContext");
    assert.deepEqual(context.configContext, {
      contents: expectedProfileConfig,
      path: profileConfigPath,
      source: "profile",
    });
  } finally {
    await manager.stop().catch(() => {});
    await fs.rm(tempBase, { force: true, recursive: true });
  }
});

test("start isolates child home, xdg roots, and path away from inherited global Codex locations", async () => {
  const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-app-server-env-"));
  const parentHome = path.join(tempBase, "parent-home");
  const parentXdgConfig = path.join(tempBase, "parent-xdg", "config");
  const parentXdgData = path.join(tempBase, "parent-xdg", "data");
  const parentXdgState = path.join(tempBase, "parent-xdg", "state");
  const parentXdgCache = path.join(tempBase, "parent-xdg", "cache");
  const userBin = path.join(parentHome, ".bun", "bin");
  const codexHome = path.join(tempBase, "profiles", "test-profile", "codex-home");
  const profileRoot = path.join(tempBase, "profiles", "test-profile");
  const manager = createManager(["--report-env-context"], {
    codexHome,
    env: {
      HOME: parentHome,
      OPENAI_API_KEY: "sk-test-should-not-pass-through",
      PATH: [userBin, "/usr/bin"].join(path.delimiter),
      XDG_CACHE_HOME: parentXdgCache,
      XDG_CONFIG_HOME: parentXdgConfig,
      XDG_DATA_HOME: parentXdgData,
      XDG_STATE_HOME: parentXdgState,
    },
  });

  try {
    await fs.mkdir(userBin, { recursive: true });
    await manager.start();
    const context = await manager.request("runtimeContext");

    assert.deepEqual(context.environmentContext, {
      home: path.join(profileRoot, "runtime-home"),
      openaiApiKeyPresent: false,
      pathEntries: context.environmentContext.pathEntries,
      xdgCacheHome: path.join(profileRoot, "xdg", "cache"),
      xdgConfigHome: path.join(profileRoot, "xdg", "config"),
      xdgDataHome: path.join(profileRoot, "xdg", "data"),
      xdgStateHome: path.join(profileRoot, "xdg", "state"),
    });
    assert.equal(context.environmentContext.pathEntries.includes(userBin), false);
    assert.equal(context.environmentContext.pathEntries.includes("/usr/bin"), true);
  } finally {
    await manager.stop().catch(() => {});
    await fs.rm(tempBase, { force: true, recursive: true });
  }
});

test("start injects the signed-in ChatGPT access token into the child realtime env", async () => {
  const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-app-server-auth-"));
  const codexHome = path.join(tempBase, "profiles", "test-profile", "codex-home");
  const manager = createManager(["--report-env-context"], {
    codexHome,
  });

  try {
    await fs.mkdir(codexHome, { recursive: true });
    await fs.writeFile(
      path.join(codexHome, "auth.json"),
      JSON.stringify({
        auth_mode: "chatgpt",
        tokens: {
          access_token: "chatgpt-access-token",
        },
      }, null, 2),
      "utf8",
    );

    await manager.start();
    const context = await manager.request("runtimeContext");

    assert.equal(context.environmentContext.openaiApiKeyPresent, true);
  } finally {
    await manager.stop().catch(() => {});
    await fs.rm(tempBase, { force: true, recursive: true });
  }
});

test("start ignores parent SENSE1_CODEX_PATH when choosing the runtime command", async () => {
  const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-ignore-codex-path-"));
  const codexHome = path.join(tempBase, "profiles", "ignore-codex-path-profile", "codex-home");
  const manager = createManager([], {
    codexHome,
    command: "__sense1_missing_codex__",
    env: {
      SENSE1_CODEX_PATH: process.execPath,
    },
  });

  try {
    await assert.rejects(manager.start(), /__sense1_missing_codex__|ENOENT|not found|No such file/i);
  } finally {
    await manager.stop().catch(() => {});
    await fs.rm(tempBase, { force: true, recursive: true });
  }
});

test("defaultRuntimePathEntriesForPlatform omits LOCALAPPDATA WindowsApps from the isolated Windows PATH", () => {
  const entries = defaultRuntimePathEntriesForPlatform("win32", {
    LOCALAPPDATA: "C:\\Users\\Example\\AppData\\Local",
    ProgramFiles: "C:\\Program Files",
    SystemRoot: "C:\\Windows",
  });

  assert.deepEqual(entries, ["C:\\Program Files/nodejs", "C:\\Windows/System32"]);
});
