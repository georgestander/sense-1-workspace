import test from "node:test";
import assert from "node:assert/strict";

import { resolveFileChangeTarget } from "./thread-view-utils.ts";

test("resolveFileChangeTarget makes workspace-relative file changes openable", () => {
  assert.deepEqual(resolveFileChangeTarget("src/App.tsx", "/tmp/project"), {
    name: "App.tsx",
    relativePath: "src/App.tsx",
    openPath: "/tmp/project/src/App.tsx",
  });
});

test("resolveFileChangeTarget keeps untrusted relative file changes visible but inert", () => {
  assert.deepEqual(resolveFileChangeTarget("src/App.tsx", null), {
    name: "App.tsx",
    relativePath: "src/App.tsx",
    openPath: null,
  });
});
