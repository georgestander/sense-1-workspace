import test from "node:test";
import assert from "node:assert/strict";

import { createSessionThreadActions } from "./session-thread-actions.ts";

function createDeps() {
  const remembered = [];
  const refreshed = [];
  const selected = [];
  const persistedRoots = [];

  return {
    deps: {
      getIsSignedIn: () => true,
      hasRestoredInitialSelectionRef: { current: true },
      refreshBootstrap: async (options) => {
        refreshed.push(options ?? null);
        return null;
      },
      removeThreadFromLocalState: async () => {},
      rememberKnownThreadIds: () => {},
      requireDesktopBridge: () => ({
        threads: {
          archive: async () => {},
          delete: async () => {},
          rememberLastSelected: async ({ threadId }) => {
            remembered.push(threadId ?? null);
          },
          rename: async () => {},
          restore: async () => {},
        },
        workspace: {
          rememberThreadRoot: async ({ threadId, workspaceRoot }) => {
            persistedRoots.push({ threadId, workspaceRoot });
          },
        },
      }),
      selectedThreadIdRef: { current: null },
      setSelectedThreadId: (threadId) => {
        selected.push(threadId);
      },
      setTaskError: () => {},
      setThreads: () => {},
    },
    persistedRoots,
    remembered,
    refreshed,
    selected,
  };
}

test("selectThread changes selection and persists it without interrupting the current run", async () => {
  const { deps, persistedRoots, remembered, refreshed, selected } = createDeps();
  const actions = createSessionThreadActions(deps);

  await actions.selectThread("thread-2", { workspaceRoot: "/tmp/project" });

  assert.deepEqual(selected, ["thread-2"]);
  assert.deepEqual(remembered, ["thread-2"]);
  assert.deepEqual(refreshed, [{ restoreSelection: true }]);
  assert.deepEqual(persistedRoots, [{ threadId: "thread-2", workspaceRoot: "/tmp/project" }]);
});

test("clearSelectedThread returns to the start surface without interrupt side effects", async () => {
  const { deps, remembered, selected } = createDeps();
  const actions = createSessionThreadActions(deps);

  await actions.clearSelectedThread();

  assert.deepEqual(selected, [null]);
  assert.deepEqual(remembered, [null]);
});
