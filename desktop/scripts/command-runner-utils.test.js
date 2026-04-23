import test from "node:test";
import assert from "node:assert/strict";

import {
  formatCommand,
  formatSpawnFailure,
  resolveScriptCommand,
} from "./command-runner-utils.js";

test("resolveScriptCommand uses the pnpm cmd shim on Windows", () => {
  assert.equal(resolveScriptCommand("pnpm", "win32"), "pnpm.cmd");
  assert.equal(resolveScriptCommand("pnpm", "darwin"), "pnpm");
  assert.equal(resolveScriptCommand("node", "win32"), "node");
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
