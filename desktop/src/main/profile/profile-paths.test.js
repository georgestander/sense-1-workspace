import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ensureProfileDirectories,
  resolveRuntimeStateRoot,
  selectPreferredDarwinRuntimeStateRoot,
} from "./profile-paths.js";

test("ensureProfileDirectories syncs missing shared system skills into the profile codex home", async () => {
  const runtimeStateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-runtime-state-"));
  const sharedCodexHome = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-shared-codex-home-"));
  const env = {
    ...process.env,
    CODEX_HOME: sharedCodexHome,
    SENSE1_RUNTIME_STATE_ROOT: runtimeStateRoot,
  };
  const sharedSystemSkillsDir = path.join(sharedCodexHome, "skills", ".system");
  const sharedPluginCreatorDir = path.join(sharedSystemSkillsDir, "plugin-creator");
  const sharedSkillCreatorDir = path.join(sharedSystemSkillsDir, "skill-creator");

  try {
    await fs.mkdir(path.join(sharedPluginCreatorDir, "scripts"), { recursive: true });
    await fs.mkdir(sharedSkillCreatorDir, { recursive: true });
    await fs.writeFile(path.join(sharedSystemSkillsDir, ".codex-system-skills.marker"), "", "utf8");
    await fs.writeFile(path.join(sharedPluginCreatorDir, "SKILL.md"), "# Plugin Creator\n", "utf8");
    await fs.writeFile(path.join(sharedPluginCreatorDir, "scripts", "create_basic_plugin.py"), "print('ok')\n", "utf8");
    await fs.writeFile(path.join(sharedSkillCreatorDir, "SKILL.md"), "# Skill Creator\n", "utf8");

    const { codexHome } = await ensureProfileDirectories("default", env);
    const syncedSkillDir = path.join(codexHome, "skills", ".system", "plugin-creator");
    const skillCreatorPath = path.join(codexHome, "skills", ".system", "skill-creator", "SKILL.md");

    assert.equal(await fs.readFile(path.join(syncedSkillDir, "SKILL.md"), "utf8"), "# Plugin Creator\n");
    assert.equal(
      await fs.readFile(path.join(syncedSkillDir, "scripts", "create_basic_plugin.py"), "utf8"),
      "print('ok')\n",
    );
    assert.match(await fs.readFile(skillCreatorPath, "utf8"), /Sense-1 Workspace Desktop Override/u);
  } finally {
    await fs.rm(runtimeStateRoot, { recursive: true, force: true });
    await fs.rm(sharedCodexHome, { recursive: true, force: true });
  }
});

test("ensureProfileDirectories exposes the bundled Browser Use plugin in profile config", async () => {
  const runtimeStateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-runtime-state-"));
  const sharedCodexHome = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-shared-codex-home-"));
  const env = {
    ...process.env,
    CODEX_HOME: sharedCodexHome,
    SENSE1_RUNTIME_STATE_ROOT: runtimeStateRoot,
  };
  const bundledMarketplaceRoot = path.join(sharedCodexHome, ".tmp", "bundled-marketplaces", "openai-bundled");
  const bundledBrowserUseRoot = path.join(bundledMarketplaceRoot, "plugins", "browser-use");

  try {
    await fs.mkdir(path.join(bundledMarketplaceRoot, ".agents", "plugins"), { recursive: true });
    await fs.mkdir(path.join(bundledBrowserUseRoot, ".codex-plugin"), { recursive: true });
    await fs.mkdir(path.join(bundledBrowserUseRoot, "scripts"), { recursive: true });
    await fs.mkdir(path.join(bundledBrowserUseRoot, "skills", "browser"), { recursive: true });
    const nodeReplMcpServerSource = path.join(runtimeStateRoot, "node-repl-mcp-server.mjs");
    await fs.writeFile(
      path.join(bundledMarketplaceRoot, ".agents", "plugins", "marketplace.json"),
      JSON.stringify({ name: "OpenAI bundled" }),
      "utf8",
    );
    await fs.writeFile(
      path.join(bundledBrowserUseRoot, ".codex-plugin", "plugin.json"),
      JSON.stringify({
        name: "browser-use",
        version: "0.1.0-alpha1",
        interface: { displayName: "Browser Use" },
      }),
      "utf8",
    );
    await fs.writeFile(path.join(bundledBrowserUseRoot, "skills", "browser", "SKILL.md"), "# Browser Use\n", "utf8");
    await fs.writeFile(
      path.join(bundledBrowserUseRoot, "scripts", "browser-client.mjs"),
      [
        'import iT from"node:path";',
        'function P7(){return"privileged native pipe bridge is not available"}function L7(){let e=import.meta.__codexNativePipe;return e==null||typeof e.createConnection!="function"?null:e}',
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(nodeReplMcpServerSource, "#!/usr/bin/env node\n", "utf8");

    const { codexHome } = await ensureProfileDirectories("browser-use-profile", {
      ...env,
      SENSE1_NODE_REPL_MCP_SERVER_PATH: nodeReplMcpServerSource,
    });
    const profileConfig = await fs.readFile(path.join(codexHome, "config.toml"), "utf8");
    const profilePluginSkill = path.join(
      codexHome,
      "plugins",
      "cache",
      "openai-bundled",
      "browser-use",
      "0.1.0-alpha1",
      "skills",
      "browser",
      "SKILL.md",
    );

    assert.match(profileConfig, /\[marketplaces\.openai-bundled\]/u);
    assert.match(profileConfig, /\[plugins\."browser-use@openai-bundled"\]/u);
    assert.match(profileConfig, /\[mcp_servers\.node_repl\]/u);
    assert.match(profileConfig, /node-repl-mcp-server\.mjs/u);
    assert.match(profileConfig, /enabled = true/u);
    assert.equal(await fs.readFile(profilePluginSkill, "utf8"), "# Browser Use\n");
    assert.match(
      await fs.readFile(path.join(
        codexHome,
        "plugins",
        "cache",
        "openai-bundled",
        "browser-use",
        "0.1.0-alpha1",
        "scripts",
        "browser-client.mjs",
      ), "utf8"),
      /node:net/u,
    );
    assert.equal(
      await fs.readFile(path.join(codexHome, "tools", "node-repl-mcp-server.mjs"), "utf8"),
      "#!/usr/bin/env node\n",
    );
  } finally {
    await fs.rm(runtimeStateRoot, { recursive: true, force: true });
    await fs.rm(sharedCodexHome, { recursive: true, force: true });
  }
});

test("ensureProfileDirectories tolerates a shared system skill entry disappearing mid-sync", async () => {
  const runtimeStateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-runtime-state-"));
  const sharedCodexHome = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-shared-codex-home-"));
  const env = {
    ...process.env,
    CODEX_HOME: sharedCodexHome,
    SENSE1_RUNTIME_STATE_ROOT: runtimeStateRoot,
  };
  const sharedSystemSkillsDir = path.join(sharedCodexHome, "skills", ".system");
  const sharedPluginCreatorDir = path.join(sharedSystemSkillsDir, "plugin-creator");
  const originalCopyFile = fs.copyFile;

  try {
    await fs.mkdir(sharedPluginCreatorDir, { recursive: true });
    await fs.writeFile(path.join(sharedSystemSkillsDir, ".codex-system-skills.marker"), "", "utf8");
    await fs.writeFile(path.join(sharedPluginCreatorDir, "SKILL.md"), "# Plugin Creator\n", "utf8");
    fs.copyFile = async (sourcePath, targetPath, ...rest) => {
      if (String(sourcePath).endsWith(".codex-system-skills.marker")) {
        const error = new Error("marker disappeared during sync");
        error.code = "ENOENT";
        throw error;
      }
      return await originalCopyFile.call(fs, sourcePath, targetPath, ...rest);
    };

    const { codexHome } = await ensureProfileDirectories("default", env);

    assert.equal(
      await fs.readFile(path.join(codexHome, "skills", ".system", "plugin-creator", "SKILL.md"), "utf8"),
      "# Plugin Creator\n",
    );
  } finally {
    fs.copyFile = originalCopyFile;
    await fs.rm(runtimeStateRoot, { recursive: true, force: true });
    await fs.rm(sharedCodexHome, { recursive: true, force: true });
  }
});

test("ensureProfileDirectories reuses the initial profile setup work for repeated calls", async () => {
  const runtimeStateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-runtime-state-"));
  const sharedCodexHome = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-shared-codex-home-"));
  const env = {
    ...process.env,
    CODEX_HOME: sharedCodexHome,
    SENSE1_RUNTIME_STATE_ROOT: runtimeStateRoot,
  };
  const sharedSystemSkillsDir = path.join(sharedCodexHome, "skills", ".system");
  const sharedPluginCreatorDir = path.join(sharedSystemSkillsDir, "plugin-creator");
  const originalCopyFile = fs.copyFile;
  let copyFileCalls = 0;

  try {
    await fs.mkdir(sharedPluginCreatorDir, { recursive: true });
    await fs.writeFile(path.join(sharedSystemSkillsDir, ".codex-system-skills.marker"), "", "utf8");
    await fs.writeFile(path.join(sharedPluginCreatorDir, "SKILL.md"), "# Plugin Creator\n", "utf8");
    fs.copyFile = async (...args) => {
      copyFileCalls += 1;
      return await originalCopyFile.call(fs, ...args);
    };

    await ensureProfileDirectories("default", env);
    const firstCopyFileCalls = copyFileCalls;
    await ensureProfileDirectories("default", env);

    assert.ok(firstCopyFileCalls > 0);
    assert.equal(copyFileCalls, firstCopyFileCalls);
  } finally {
    fs.copyFile = originalCopyFile;
    await fs.rm(runtimeStateRoot, { recursive: true, force: true });
    await fs.rm(sharedCodexHome, { recursive: true, force: true });
  }
});

test("ensureProfileDirectories repairs an invalid profile auth file from the legacy desktop auth store", async () => {
  const runtimeStateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-runtime-state-"));
  const sharedCodexHome = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-shared-codex-home-"));
  const env = {
    ...process.env,
    CODEX_HOME: sharedCodexHome,
    SENSE1_RUNTIME_STATE_ROOT: runtimeStateRoot,
  };
  const legacyAuthPath = path.join(runtimeStateRoot, "codex-home", "auth.json");
  const profileAuthPath = path.join(runtimeStateRoot, "profiles", "default", "codex-home", "auth.json");
  const legacyAuth = {
    auth_mode: "chatgpt",
    tokens: {
      access_token: "legacy-token",
    },
  };

  try {
    await fs.mkdir(path.dirname(legacyAuthPath), { recursive: true });
    await fs.mkdir(path.dirname(profileAuthPath), { recursive: true });
    await fs.writeFile(legacyAuthPath, JSON.stringify(legacyAuth, null, 2), "utf8");
    await fs.writeFile(profileAuthPath, "3337broken", "utf8");

    const { codexHome } = await ensureProfileDirectories("default", env);
    const healedAuth = JSON.parse(await fs.readFile(path.join(codexHome, "auth.json"), "utf8"));

    assert.deepEqual(healedAuth, legacyAuth);
  } finally {
    await fs.rm(runtimeStateRoot, { recursive: true, force: true });
    await fs.rm(sharedCodexHome, { recursive: true, force: true });
  }
});

test("resolveRuntimeStateRoot prefers the branded macOS app-support directory when present", async () => {
  const fakeHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-home-"));
  const brandedRoot = path.join(fakeHomeDir, "Library", "Application Support", "Sense-1");

  try {
    await fs.mkdir(brandedRoot, { recursive: true });
    const originalPlatform = process.platform;
    const originalHome = process.env.HOME;
    Object.defineProperty(process, "platform", { value: "darwin" });
    process.env.HOME = fakeHomeDir;

    try {
      assert.equal(resolveRuntimeStateRoot(process.env), brandedRoot);
    } finally {
      process.env.HOME = originalHome;
      Object.defineProperty(process, "platform", { value: originalPlatform });
    }
  } finally {
    await fs.rm(fakeHomeDir, { recursive: true, force: true });
  }
});

test("resolveRuntimeStateRoot preserves an existing lowercase macOS app-support directory", async () => {
  const fakeHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-home-"));
  const legacyRoot = path.join(fakeHomeDir, "Library", "Application Support", "sense-1");

  try {
    await fs.mkdir(legacyRoot, { recursive: true });
    const originalPlatform = process.platform;
    const originalHome = process.env.HOME;
    Object.defineProperty(process, "platform", { value: "darwin" });
    process.env.HOME = fakeHomeDir;

    try {
      assert.equal(resolveRuntimeStateRoot(process.env), legacyRoot);
    } finally {
      process.env.HOME = originalHome;
      Object.defineProperty(process, "platform", { value: originalPlatform });
    }
  } finally {
    await fs.rm(fakeHomeDir, { recursive: true, force: true });
  }
});

test("resolveRuntimeStateRoot reuses the resolved macOS app-support directory within the same environment", async () => {
  const fakeHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-home-"));
  const brandedRoot = path.join(fakeHomeDir, "Library", "Application Support", "Sense-1");
  const lowercaseRoot = path.join(fakeHomeDir, "Library", "Application Support", "sense-1");

  try {
    await fs.mkdir(brandedRoot, { recursive: true });
    const originalPlatform = process.platform;
    const originalHome = process.env.HOME;
    Object.defineProperty(process, "platform", { value: "darwin" });
    process.env.HOME = fakeHomeDir;

    try {
      const first = resolveRuntimeStateRoot(process.env);
      await fs.rm(brandedRoot, { recursive: true, force: true });
      await fs.mkdir(lowercaseRoot, { recursive: true });

      assert.equal(first, brandedRoot);
      assert.equal(resolveRuntimeStateRoot(process.env), brandedRoot);
    } finally {
      process.env.HOME = originalHome;
      Object.defineProperty(process, "platform", { value: originalPlatform });
    }
  } finally {
    await fs.rm(fakeHomeDir, { recursive: true, force: true });
  }
});

test("selectPreferredDarwinRuntimeStateRoot prefers the legacy macOS runtime root when it holds the active profile state", async () => {
  const candidateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-home-"));
  const brandedRoot = path.join(candidateRoot, "branded", "Sense-1");
  const legacyRoot = path.join(candidateRoot, "legacy", "sense-1");

  try {
    await fs.mkdir(path.join(brandedRoot, "profiles"), { recursive: true });
    await fs.mkdir(path.join(legacyRoot, "profiles", "default"), { recursive: true });
    await fs.writeFile(path.join(legacyRoot, "profiles", "_active.json"), "{\"profile_id\":\"default\"}\n", "utf8");

    assert.equal(selectPreferredDarwinRuntimeStateRoot([brandedRoot, legacyRoot]), legacyRoot);
  } finally {
    await fs.rm(candidateRoot, { recursive: true, force: true });
  }
});

test("selectPreferredDarwinRuntimeStateRoot prefers the branded macOS runtime root when it holds the active profile state", async () => {
  const candidateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-home-"));
  const brandedRoot = path.join(candidateRoot, "branded", "Sense-1");
  const legacyRoot = path.join(candidateRoot, "legacy", "sense-1");

  try {
    await fs.mkdir(path.join(brandedRoot, "profiles", "default"), { recursive: true });
    await fs.mkdir(path.join(legacyRoot, "profiles"), { recursive: true });
    await fs.writeFile(path.join(brandedRoot, "profiles", "_active.json"), "{\"profile_id\":\"default\"}\n", "utf8");

    assert.equal(selectPreferredDarwinRuntimeStateRoot([brandedRoot, legacyRoot]), brandedRoot);
  } finally {
    await fs.rm(candidateRoot, { recursive: true, force: true });
  }
});
