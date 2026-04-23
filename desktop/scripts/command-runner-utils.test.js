import test from "node:test";
import assert from "node:assert/strict";

import {
  formatCommand,
  formatSpawnFailure,
  resolveScriptCommand,
  resolveScriptSpawnOptions,
} from "./command-runner-utils.js";

test("resolveScriptCommand keeps command labels stable across platforms", () => {
  assert.equal(resolveScriptCommand("pnpm", "win32"), "pnpm");
  assert.equal(resolveScriptCommand("pnpm", "darwin"), "pnpm");
  assert.equal(resolveScriptCommand("node", "win32"), "node");
});

test("resolveScriptSpawnOptions runs pnpm through the Windows shell", () => {
  assert.deepEqual(resolveScriptSpawnOptions("pnpm", "win32"), { shell: true });
  assert.deepEqual(resolveScriptSpawnOptions("pnpm", "darwin"), {});
  assert.deepEqual(resolveScriptSpawnOptions("node", "win32"), {});
});

test("formatCommand keeps logged commands shell-friendly", () => {
  assert.equal(formatCommand("pnpm", ["exec", "electron-vite", "build"]), "pnpm exec electron-vite build");
});

test("formatSpawnFailure includes spawn errors when the process never starts", () => {
  const error = new Error("spawnSync pnpm ENOENT");

  assert.equal(
    formatSpawnFailure("pnpm", ["exec", "electron-vite", "build"], {
      error,
      signal: null,
      status: null,
    }),
    "Command failed (pnpm exec electron-vite build): spawnSync pnpm ENOENT",
  );
});
