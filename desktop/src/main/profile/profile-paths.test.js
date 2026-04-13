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
