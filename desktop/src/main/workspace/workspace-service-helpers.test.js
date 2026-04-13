import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

import {
  collectWorkspaceContextPaths,
  detectWorkspaceProjectType,
  isLikelyLegacySenseSessionRoot,
  isSenseGeneratedTempWorkspaceRoot,
  normalizeWorkspaceDirectoryEntries,
} from "./workspace-service-helpers.ts";

test("normalizeWorkspaceDirectoryEntries keeps unique entries inside the first two levels", () => {
  const workspaceRoot = path.join("/tmp", "sense-workspace");
  const packageJsonPath = path.join(workspaceRoot, "package.json");
  const srcDirPath = path.join(workspaceRoot, "src");
  const appPath = path.join(srcDirPath, "app.ts");
  const deepPath = path.join(srcDirPath, "nested", "too-deep.ts");

  const entries = normalizeWorkspaceDirectoryEntries(workspaceRoot, [
    {
      name: "package.json",
      type: "file",
      path: packageJsonPath,
    },
    {
      name: "src",
      type: "directory",
      path: srcDirPath,
      children: [
        {
          name: "app.ts",
          type: "file",
          path: appPath,
        },
        {
          name: "nested",
          type: "directory",
          path: path.join(srcDirPath, "nested"),
          children: [
            {
              name: "too-deep.ts",
              type: "file",
              path: deepPath,
            },
          ],
        },
      ],
    },
    {
      name: "package.json",
      type: "file",
      path: packageJsonPath,
    },
  ]);

  assert.deepEqual(entries, [
    { name: "package.json", path: packageJsonPath, type: "file" },
    { name: "src", path: srcDirPath, type: "directory" },
    { name: "app.ts", path: appPath, type: "file" },
    { name: "nested", path: path.join(srcDirPath, "nested"), type: "directory" },
  ]);
});

test("collectWorkspaceContextPaths keeps recognized top-level context files in key-file order", () => {
  const workspaceRoot = path.join("/tmp", "sense-workspace");
  const entries = [
    { name: "Cargo.toml", path: path.join(workspaceRoot, "Cargo.toml"), type: "file" },
    { name: "README.md", path: path.join(workspaceRoot, "README.md"), type: "file" },
    { name: "package.json", path: path.join(workspaceRoot, "package.json"), type: "file" },
    { name: "ignored.ts", path: path.join(workspaceRoot, "src", "ignored.ts"), type: "file" },
    { name: "config.toml", path: path.join(workspaceRoot, ".codex", "config.toml"), type: "file" },
  ];

  assert.deepEqual(collectWorkspaceContextPaths(workspaceRoot, entries), [
    path.join(workspaceRoot, "README.md"),
    path.join(workspaceRoot, "package.json"),
    path.join(workspaceRoot, ".codex", "config.toml"),
    path.join(workspaceRoot, "Cargo.toml"),
  ]);
  assert.equal(detectWorkspaceProjectType(collectWorkspaceContextPaths(workspaceRoot, entries)), "Node.js");
});

test("isSenseGeneratedTempWorkspaceRoot recognizes sense-owned temp folders", () => {
  assert.equal(isSenseGeneratedTempWorkspaceRoot(path.join(os.tmpdir(), "sense-1-run-123")), true);
  assert.equal(isSenseGeneratedTempWorkspaceRoot(path.join("/tmp", "other-app")), false);
});

test("isLikelyLegacySenseSessionRoot recognizes legacy session folders under the home directory", () => {
  const legacyRoot = path.join(os.homedir(), "Sense-1", "sessions", "sess_1234");
  const normalProjectRoot = path.join(os.homedir(), "projects", "sense-1");

  assert.equal(isLikelyLegacySenseSessionRoot(legacyRoot), true);
  assert.equal(isLikelyLegacySenseSessionRoot(normalProjectRoot), false);
});
