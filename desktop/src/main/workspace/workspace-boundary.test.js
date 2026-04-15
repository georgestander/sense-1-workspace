import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import {
  collectOutOfWorkspacePathsFromRuntimeMessage,
  deriveWorkspaceGrantRoot,
  findPromptPathsOutsideWorkspace,
  isPathWithinRoot,
} from "./workspace-boundary.ts";

test("isPathWithinRoot treats symlinked workspace paths as the same folder", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-workspace-boundary-test-"));
  const realWorkspaceRoot = path.join(tempRoot, "workspace-real");
  const symlinkWorkspaceRoot = path.join(tempRoot, "workspace-link");
  const filePath = path.join(realWorkspaceRoot, "src", "index.ts");

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, "export {};\n", "utf8");
  await fs.symlink(realWorkspaceRoot, symlinkWorkspaceRoot);

  assert.equal(isPathWithinRoot(filePath, symlinkWorkspaceRoot), true);
  assert.equal(isPathWithinRoot(path.join(symlinkWorkspaceRoot, "src", "index.ts"), realWorkspaceRoot), true);
});

test("findPromptPathsOutsideWorkspace only reports absolute paths that escape the selected folder", () => {
  const workspaceRoot = "/tmp/project";
  const outsidePaths = findPromptPathsOutsideWorkspace(
    "Read /tmp/project/src/index.ts and then write /tmp/other/report.md.",
    workspaceRoot,
  );

  assert.deepEqual(outsidePaths, [path.resolve("/tmp/other/report.md")]);
});

test("deriveWorkspaceGrantRoot requests the parent folder for outside file targets", () => {
  assert.equal(
    deriveWorkspaceGrantRoot(["/tmp/outside/report.md"]),
    path.resolve("/tmp/outside"),
  );
});

test("collectOutOfWorkspacePathsFromRuntimeMessage allows extra granted roots", () => {
  const workspaceRoot = "/tmp/project";
  const profileCodexHome = "/tmp/profile/codex-home";

  assert.deepEqual(
    collectOutOfWorkspacePathsFromRuntimeMessage(
      {
        method: "item/completed",
        params: {
          item: {
            type: "fileChange",
            changes: [
              { path: "/tmp/project/notes.txt" },
              { path: "/tmp/profile/codex-home/skills/new-skill/SKILL.md" },
            ],
          },
        },
      },
      workspaceRoot,
      [profileCodexHome],
    ),
    [],
  );
});
