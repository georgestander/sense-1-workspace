import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { defaultCodexHomeForProfile } from "./app-server-runtime-paths.js";

test("defaultCodexHomeForProfile follows the branded macOS runtime root when present", async () => {
  const fakeHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-home-"));
  const brandedRoot = path.join(fakeHomeDir, "Library", "Application Support", "Sense-1");

  try {
    await fs.mkdir(brandedRoot, { recursive: true });
    const originalPlatform = process.platform;
    const originalHome = process.env.HOME;
    Object.defineProperty(process, "platform", { value: "darwin" });
    process.env.HOME = fakeHomeDir;

    try {
      assert.equal(
        defaultCodexHomeForProfile("qa-profile", process.platform, process.env),
        path.join(brandedRoot, "profiles", "qa-profile", "codex-home"),
      );
    } finally {
      process.env.HOME = originalHome;
      Object.defineProperty(process, "platform", { value: originalPlatform });
    }
  } finally {
    await fs.rm(fakeHomeDir, { recursive: true, force: true });
  }
});
