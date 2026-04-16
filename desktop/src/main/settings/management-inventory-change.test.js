import test from "node:test";
import assert from "node:assert/strict";

import {
  collectManagementInventoryPathsFromRuntimeMessage,
  filterProfileCodexHomeRoots,
  isManagementInventoryPath,
  latestUserEntryRequestsManagedInventoryInstall,
  ManagementInventoryChangeTracker,
} from "./management-inventory-change.ts";

const profileCodexHome = "/tmp/profile/codex-home";
const workspaceRoot = "/tmp/project";

test("filterProfileCodexHomeRoots keeps only profile codex-home grants", () => {
  assert.deepEqual(
    filterProfileCodexHomeRoots([
      workspaceRoot,
      profileCodexHome,
      `${workspaceRoot}/nested/codex-home`,
      profileCodexHome,
      null,
    ]),
    [
      profileCodexHome,
      `${workspaceRoot}/nested/codex-home`,
    ],
  );
});

test("isManagementInventoryPath recognizes skills, plugins, marketplace, temp plugins, and config", () => {
  assert.equal(isManagementInventoryPath(`${profileCodexHome}/skills/my-skill/SKILL.md`, [profileCodexHome]), true);
  assert.equal(isManagementInventoryPath(`${profileCodexHome}/plugins/my-plugin/.codex-plugin/plugin.json`, [profileCodexHome]), true);
  assert.equal(isManagementInventoryPath(`${profileCodexHome}/.agents/plugins/marketplace.json`, [profileCodexHome]), true);
  assert.equal(isManagementInventoryPath(`${profileCodexHome}/.tmp/plugins/plugins/my-plugin/.app.json`, [profileCodexHome]), true);
  assert.equal(isManagementInventoryPath(`${profileCodexHome}/config.toml`, [profileCodexHome]), true);
  assert.equal(isManagementInventoryPath("/tmp/project/skills/not-a-profile-skill/SKILL.md", [profileCodexHome]), false);
});

test("collectManagementInventoryPathsFromRuntimeMessage filters runtime changes to profile-managed inventory", () => {
  const paths = collectManagementInventoryPathsFromRuntimeMessage({
    method: "item/completed",
    params: {
      threadId: "thread-1",
      item: {
        type: "fileChange",
        changes: [
          { path: `${profileCodexHome}/skills/my-skill/SKILL.md` },
          { path: `${profileCodexHome}/config.toml` },
          { path: "/tmp/project/src/index.ts" },
        ],
      },
    },
  }, [profileCodexHome]);

  assert.deepEqual(paths, [
    `${profileCodexHome}/skills/my-skill/SKILL.md`,
    `${profileCodexHome}/config.toml`,
  ]);
});

test("collectManagementInventoryPathsFromRuntimeMessage ignores workspace-local inventory lookalikes", () => {
  const paths = collectManagementInventoryPathsFromRuntimeMessage({
    method: "item/completed",
    params: {
      threadId: "thread-1",
      item: {
        type: "fileChange",
        changes: [
          { path: `${workspaceRoot}/skills/workspace-draft/SKILL.md` },
          { path: `${workspaceRoot}/plugins/workspace-plugin/.codex-plugin/plugin.json` },
          { path: `${workspaceRoot}/config.toml` },
        ],
      },
    },
  }, [workspaceRoot]);

  assert.deepEqual(paths, []);
});

test("ManagementInventoryChangeTracker records runtime inventory changes once per turn", () => {
  const tracker = new ManagementInventoryChangeTracker();

  tracker.observe({
    method: "turn/started",
    params: { threadId: "thread-1" },
  }, [profileCodexHome]);
  tracker.observe({
    method: "turn/diff/updated",
    params: {
      threadId: "thread-1",
      diffs: [
        { path: `${profileCodexHome}/plugins/my-plugin/.codex-plugin/plugin.json` },
      ],
    },
  }, [profileCodexHome]);

  assert.equal(tracker.consume("thread-1"), true);
  assert.equal(tracker.consume("thread-1"), false);
});

test("latestUserEntryRequestsManagedInventoryInstall only matches the latest user turn shortcuts", () => {
  assert.equal(
    latestUserEntryRequestsManagedInventoryInstall({
      entries: [
        {
          kind: "user",
          promptShortcuts: [{ token: "skill-creator" }],
        },
        {
          kind: "assistant",
        },
        {
          kind: "user",
          promptShortcuts: [{ token: "gmail:gmail" }],
        },
      ],
    }),
    false,
  );

  assert.equal(
    latestUserEntryRequestsManagedInventoryInstall({
      entries: [
        {
          kind: "user",
          promptShortcuts: [{ token: "gmail:gmail" }],
        },
        {
          kind: "assistant",
        },
        {
          kind: "user",
          promptShortcuts: [{ token: "plugin-creator" }, { token: "skill-installer" }],
        },
      ],
    }),
    true,
  );
});
