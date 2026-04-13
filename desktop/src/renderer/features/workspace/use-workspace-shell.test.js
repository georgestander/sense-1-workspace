import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWorkspaceIdByRoot,
  resolveActiveWorkspaceOperatingMode,
  shouldUseDefaultWorkspaceOperatingMode,
} from "./workspace-shell-state.ts";

test("buildWorkspaceIdByRoot merges known and projected workspace ids by root", () => {
  assert.deepEqual(
    buildWorkspaceIdByRoot({
      knownWorkspaces: [
        { id: "known-alpha", root_path: "/tmp/alpha" },
      ],
      projectedWorkspaces: [
        { workspace_id: "projected-beta", root_path: "/tmp/beta" },
      ],
    }),
    {
      "/tmp/alpha": "known-alpha",
      "/tmp/beta": "projected-beta",
    },
  );
});

test("default-mode detection only matches the untouched auto policy shape", () => {
  const defaultPolicy = {
    read_granted: 0,
    read_granted_at: null,
    read_grant_mode: null,
    operating_mode: "auto",
    context_paths: [],
    pinned_paths: [],
    known_structure: [],
    last_hydrated_at: null,
  };

  assert.equal(shouldUseDefaultWorkspaceOperatingMode(defaultPolicy), true);
  assert.equal(
    shouldUseDefaultWorkspaceOperatingMode({
      ...defaultPolicy,
      read_granted: 1,
    }),
    false,
  );
});

test("active workspace operating mode prefers the desktop default only for untouched policies", () => {
  const defaultPolicy = {
    read_granted: 0,
    read_granted_at: null,
    read_grant_mode: null,
    operating_mode: "auto",
    context_paths: [],
    pinned_paths: [],
    known_structure: [],
    last_hydrated_at: null,
  };

  assert.equal(
    resolveActiveWorkspaceOperatingMode({
      defaultOperatingMode: "suggest",
      selectedThreadWorkspaceRoot: "/tmp/alpha",
      workspacePolicy: defaultPolicy,
    }),
    "suggest",
  );
  assert.equal(
    resolveActiveWorkspaceOperatingMode({
      defaultOperatingMode: "auto",
      selectedThreadWorkspaceRoot: "/tmp/alpha",
      workspacePolicy: {
        ...defaultPolicy,
        read_granted: 1,
        operating_mode: "edit",
      },
    }),
    "edit",
  );
  assert.equal(
    resolveActiveWorkspaceOperatingMode({
      defaultOperatingMode: "auto",
      selectedThreadWorkspaceRoot: null,
      workspacePolicy: defaultPolicy,
    }),
    null,
  );
});
