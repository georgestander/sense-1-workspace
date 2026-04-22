import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWorkspaceSidebarGroups,
  getWorkspaceMoveState,
  isWorkspaceSidebarGroupExpanded,
  mergeWorkspaceOrder,
  moveWorkspaceOrder,
  resolveWorkspaceBaseOrder,
  resolveWorkspaceDisplayOrder,
  resolveVisibleStandaloneSidebarThreads,
  resolveVisibleWorkspaceSidebarGroups,
  shouldHideWorkspaceSidebarGroups,
  toWorkspaceSidebarThreadSummary,
} from "./workspace-sidebar.ts";

test("manual order is the base order and active workspace floats to the top", () => {
  const visibleRoots = ["/tmp/alpha", "/tmp/beta", "/tmp/gamma"];
  const baseOrder = resolveWorkspaceBaseOrder(visibleRoots, ["/tmp/gamma", "/tmp/alpha"]);

  assert.deepEqual(baseOrder, ["/tmp/gamma", "/tmp/alpha", "/tmp/beta"]);
  assert.deepEqual(resolveWorkspaceDisplayOrder(baseOrder, "/tmp/alpha"), [
    "/tmp/alpha",
    "/tmp/gamma",
    "/tmp/beta",
  ]);
});

test("active workspace is added even when it has no thread yet", () => {
  const result = buildWorkspaceSidebarGroups({
    threads: [
      { id: "thread-1", title: "Alpha", updatedAt: "2026-03-26T10:00:00.000Z", workspaceRoot: "/tmp/alpha" },
    ],
    savedOrder: [],
    activeWorkspaceRoot: "/tmp/beta",
  });

  assert.deepEqual(
    result.workspaces.map((group) => ({ root: group.root, count: group.threads.length, isActive: group.isActive })),
    [
      { root: "/tmp/beta", count: 0, isActive: true },
      { root: "/tmp/alpha", count: 1, isActive: false },
    ],
  );
});

test("home view keeps workspace groups visible but collapsed by default", () => {
  const result = buildWorkspaceSidebarGroups({
    threads: [
      { id: "thread-1", title: "Alpha", updatedAt: "2026-03-26T10:00:00.000Z", workspaceRoot: "/tmp/alpha" },
      { id: "thread-2", title: "Beta", updatedAt: "2026-03-26T10:05:00.000Z", workspaceRoot: "/tmp/beta" },
    ],
    savedOrder: [],
    activeWorkspaceRoot: null,
  });

  assert.deepEqual(
    resolveVisibleWorkspaceSidebarGroups(result.workspaces, null).map((group) => group.root),
    ["/tmp/alpha", "/tmp/beta"],
  );
  assert.equal(
    isWorkspaceSidebarGroupExpanded({
      expandedWorkspaces: {},
      root: "/tmp/alpha",
      activeWorkspaceRoot: null,
    }),
    false,
  );
});

test("session artifact roots stay in standalone threads instead of forming fake workspace groups", () => {
  const result = buildWorkspaceSidebarGroups({
    threads: [
      {
        id: "thread-chat",
        title: "Chat only",
        updatedAt: "2026-03-26T10:00:00.000Z",
        workspaceRoot: "/Users/george/Sense-1 Workspace/sessions/sess_chat_only",
      },
    ],
    savedOrder: [],
    activeWorkspaceRoot: null,
  });

  assert.deepEqual(result.workspaces, []);
  assert.deepEqual(result.standalone.map((thread) => thread.id), ["thread-chat"]);
});

test("workspace view keeps full workspace history visible while expanding the active workspace", () => {
  const result = buildWorkspaceSidebarGroups({
    threads: [
      { id: "thread-1", title: "Alpha", updatedAt: "2026-03-26T10:00:00.000Z", workspaceRoot: "/tmp/alpha" },
      { id: "thread-2", title: "Beta", updatedAt: "2026-03-26T10:05:00.000Z", workspaceRoot: "/tmp/beta" },
    ],
    savedOrder: [],
    activeWorkspaceRoot: "/tmp/beta",
  });

  assert.deepEqual(
    resolveVisibleWorkspaceSidebarGroups(result.workspaces, "/tmp/beta").map((group) => group.root),
    ["/tmp/beta", "/tmp/alpha"],
  );
  assert.equal(
    isWorkspaceSidebarGroupExpanded({
      expandedWorkspaces: {},
      root: "/tmp/beta",
      activeWorkspaceRoot: "/tmp/beta",
    }),
    true,
  );
});

test("normal chat mode hides workspace groups", () => {
  assert.equal(shouldHideWorkspaceSidebarGroups("thread-2", null), true);
  assert.equal(shouldHideWorkspaceSidebarGroups("thread-2", "/tmp/alpha"), false);
  assert.equal(shouldHideWorkspaceSidebarGroups(null, null), false);
});

test("normal chat mode pins the selected standalone thread to the top", () => {
  const standalone = [
    { id: "thread-older", title: "Older", updatedAt: "2026-03-26T10:00:00.000Z", workspaceRoot: null },
    { id: "thread-active", title: "Active", updatedAt: "2026-03-26T09:00:00.000Z", workspaceRoot: null },
    { id: "thread-newer", title: "Newer", updatedAt: "2026-03-26T11:00:00.000Z", workspaceRoot: null },
  ];

  assert.deepEqual(
    resolveVisibleStandaloneSidebarThreads(standalone, "thread-active", null).map((thread) => thread.id),
    ["thread-active", "thread-older", "thread-newer"],
  );
});

test("moving a non-active workspace updates only the base ranking", () => {
  const nextOrder = moveWorkspaceOrder({
    savedOrder: ["/tmp/gamma", "/tmp/alpha", "/tmp/beta"],
    visibleRoots: ["/tmp/alpha", "/tmp/beta", "/tmp/gamma"],
    activeWorkspaceRoot: "/tmp/alpha",
    targetRoot: "/tmp/gamma",
    direction: "down",
  });

  assert.deepEqual(nextOrder, ["/tmp/beta", "/tmp/alpha", "/tmp/gamma"]);
});

test("active workspace move controls stay disabled while pinned", () => {
  const baseOrder = ["/tmp/gamma", "/tmp/alpha", "/tmp/beta"];

  assert.deepEqual(getWorkspaceMoveState(baseOrder, "/tmp/alpha", "/tmp/alpha"), {
    canMoveUp: false,
    canMoveDown: false,
  });
  assert.deepEqual(getWorkspaceMoveState(baseOrder, "/tmp/alpha", "/tmp/gamma"), {
    canMoveUp: false,
    canMoveDown: true,
  });
  assert.deepEqual(getWorkspaceMoveState(baseOrder, "/tmp/alpha", "/tmp/beta"), {
    canMoveUp: true,
    canMoveDown: false,
  });
});

test("merging a visible reorder preserves hidden saved roots", () => {
  assert.deepEqual(
    mergeWorkspaceOrder(
      ["/tmp/hidden-top", "/tmp/gamma", "/tmp/alpha", "/tmp/hidden-bottom"],
      ["/tmp/alpha", "/tmp/gamma"],
      ["/tmp/alpha", "/tmp/gamma"],
    ),
    ["/tmp/hidden-top", "/tmp/alpha", "/tmp/gamma", "/tmp/hidden-bottom"],
  );
});

test("toWorkspaceSidebarThreadSummary keeps only the fields the shell needs", () => {
  const summary = toWorkspaceSidebarThreadSummary({
    id: "thread-1",
    title: "Alpha",
    updatedAt: "2026-03-26T10:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: "/tmp/alpha",
    state: "running",
    threadInputState: {
      queuedMessages: [],
      hasUnseenCompletion: true,
      lastCompletionAt: null,
      lastCompletionStatus: null,
    },
    entries: [
      { id: "entry-1", kind: "assistant", title: "ignored", body: "ignored", status: "completed" },
    ],
    reviewSummary: { summary: "ignored", outputArtifacts: [], createdFiles: [], modifiedFiles: [], changedArtifacts: [], updatedAt: null },
  });

  assert.deepEqual(summary, {
    id: "thread-1",
    title: "Alpha",
    updatedAt: "2026-03-26T10:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: "/tmp/alpha",
    state: "running",
    threadInputState: {
      queuedMessages: [],
      hasUnseenCompletion: true,
      lastCompletionAt: null,
      lastCompletionStatus: null,
    },
  });
  assert.equal("entries" in summary, false);
  assert.equal("reviewSummary" in summary, false);
});

test("toWorkspaceSidebarThreadSummary reuses the previous summary when list-facing fields are unchanged", () => {
  const previousSummary = toWorkspaceSidebarThreadSummary({
    id: "thread-1",
    title: "Alpha",
    updatedAt: "2026-03-26T10:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: "/tmp/alpha",
    state: "running",
    threadInputState: null,
  });

  const nextSummary = toWorkspaceSidebarThreadSummary(
    {
      id: "thread-1",
      title: "Alpha",
      updatedAt: "2026-03-26T10:00:00.000Z",
      updatedLabel: "just now",
      workspaceRoot: "/tmp/alpha",
      state: "running",
      threadInputState: null,
    },
    previousSummary,
  );

  assert.equal(nextSummary, previousSummary);
});

test("toWorkspaceSidebarThreadSummary returns a new summary when list-facing fields change", () => {
  const previousSummary = toWorkspaceSidebarThreadSummary({
    id: "thread-1",
    title: "Alpha",
    updatedAt: "2026-03-26T10:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: "/tmp/alpha",
    state: "running",
    threadInputState: null,
  });

  const nextSummary = toWorkspaceSidebarThreadSummary(
    {
      id: "thread-1",
      title: "Alpha renamed",
      updatedAt: "2026-03-26T10:00:00.000Z",
      updatedLabel: "just now",
      workspaceRoot: "/tmp/alpha",
      state: "running",
      threadInputState: null,
    },
    previousSummary,
  );

  assert.notEqual(nextSummary, previousSummary);
  assert.equal(nextSummary.title, "Alpha renamed");
});
