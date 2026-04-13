import test from "node:test";
import assert from "node:assert/strict";

import { createSessionRunActions } from "./session-run-actions.ts";

function createDeps({ runResult }) {
  let pendingPermission = null;

  return {
    getPendingPermission: () => pendingPermission,
    getRunContext: () => null,
    getSelectedThreadId: () => null,
    getActiveTurnIdsByThread: () => ({}),
    model: "",
    reasoningEffort: "",
    flushPendingThreadDeltas: () => {},
    rememberKnownThreadIds: () => {},
    refreshBootstrap: async () => null,
    requireDesktopBridge: () => ({
      approvals: { respond: async () => {} },
      threads: { rememberLastSelected: async () => {} },
      turns: {
        interrupt: async () => {},
        queue: async () => {},
        run: async () => runResult,
        steer: async () => {},
      },
      workspace: { rememberThreadRoot: async () => {} },
    }),
    selectedThreadIdRef: { current: null },
    setActiveTurnIdsByThread: () => {},
    setPendingPermission: (value) => {
      pendingPermission = typeof value === "function" ? value(pendingPermission) : value;
    },
    setPerThreadSidebar: () => {},
    setProcessingApprovalIds: () => {},
    setSelectedThreadId: () => {},
    setTaskError: () => {},
    setTaskPending: () => {},
    setThreads: () => {},
  };
}

test("runTask rewrites permission retry requests to the granted workspace root", async () => {
  const deps = createDeps({
    runResult: {
      status: "permissionRequired",
      cwd: "/tmp",
      workspaceRoot: "/tmp",
      runContext: null,
      permissionRequest: {
        displayName: "tmp",
        rootPath: "/tmp",
      },
      thread: null,
      threadId: null,
      turnId: null,
    },
  });
  const actions = createSessionRunActions(deps);

  await actions.runTask({
    prompt: "Write a file to /tmp/outside.txt",
    threadId: "thread-1",
    workspaceRoot: "/Users/george/project",
  });

  assert.deepEqual(deps.getPendingPermission(), {
    rootPath: "/tmp",
    displayName: "tmp",
    originalRequest: {
      prompt: "Write a file to /tmp/outside.txt",
      threadId: "thread-1",
      workspaceRoot: "/tmp",
    },
  });
});
