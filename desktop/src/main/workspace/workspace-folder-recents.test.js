import test from "node:test";
import assert from "node:assert/strict";

import { rememberWorkspaceFolderSelection } from "./workspace-folder-recents.ts";

test("rememberWorkspaceFolderSelection saves the chosen folder when persistence succeeds", async () => {
  const calls = [];

  await rememberWorkspaceFolderSelection("/tmp/alpha-project", async (folderPath) => {
    calls.push(folderPath);
  });

  assert.deepEqual(calls, ["/tmp/alpha-project"]);
});

test("rememberWorkspaceFolderSelection does not fail folder choice when persistence throws", async () => {
  const warnings = [];

  await assert.doesNotReject(async () => {
    await rememberWorkspaceFolderSelection(
      "/tmp/alpha-project",
      async () => {
        throw new Error("disk full");
      },
      {
        warn(message) {
          warnings.push(message);
        },
      },
    );
  });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Failed to save recent folder/);
  assert.match(warnings[0], /disk full/);
});
