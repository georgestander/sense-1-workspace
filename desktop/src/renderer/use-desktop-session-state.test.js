import test from "node:test";
import assert from "node:assert/strict";

import {
  mergeThreadDetails,
  reconcileThreadSummariesWithBootstrap,
  reconcileRecentFoldersWithBootstrap,
} from "./state/threads/thread-summary-state.ts";
import {
  folderDisplayName,
  runtimeSetupGuidance,
  shouldShowRightRail,
} from "./state/session/session-selectors.ts";

function buildThread(overrides = {}) {
  return {
    id: "thread-1",
    title: "Thread",
    subtitle: "Chat",
    state: "idle",
    interactionState: "conversation",
    updatedAt: "2026-03-31T10:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    cwd: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    reviewSummary: null,
    hasLoadedDetails: false,
    ...overrides,
  };
}

test("bootstrap reconciliation prunes deleted workspace threads when requested", () => {
  const current = [
    {
      id: "thread-alpha",
      title: "Alpha",
      subtitle: "workspace",
      state: "idle",
      interactionState: "conversation",
      updatedAt: "2026-03-31T10:00:00.000Z",
      updatedLabel: "just now",
      workspaceRoot: "/tmp/alpha",
      cwd: null,
      entries: [],
      changeGroups: [],
      progressSummary: null,
      reviewSummary: null,
      hasLoadedDetails: false,
    },
    {
      id: "thread-beta",
      title: "Beta",
      subtitle: "workspace",
      state: "idle",
      interactionState: "conversation",
      updatedAt: "2026-03-31T09:00:00.000Z",
      updatedLabel: "earlier",
      workspaceRoot: "/tmp/beta",
      cwd: null,
      entries: [],
      changeGroups: [],
      progressSummary: null,
      reviewSummary: null,
      hasLoadedDetails: false,
    },
  ];

  const next = reconcileThreadSummariesWithBootstrap(
    current,
    [
      {
        ...current[0],
        updatedAt: "2026-03-31T11:00:00.000Z",
      },
    ],
    { pruneMissing: true },
  );

  assert.deepEqual(next.map((thread) => thread.id), ["thread-alpha"]);
});

test("bootstrap reconciliation keeps locally enriched history when pruning is not requested", () => {
  const current = [
    {
      id: "thread-alpha",
      title: "Alpha",
      subtitle: "workspace",
      state: "idle",
      interactionState: "conversation",
      updatedAt: "2026-03-31T10:00:00.000Z",
      updatedLabel: "just now",
      workspaceRoot: "/tmp/alpha",
      cwd: null,
      entries: [],
      changeGroups: [],
      progressSummary: null,
      reviewSummary: null,
      hasLoadedDetails: false,
    },
    {
      id: "thread-history",
      title: "Historical thread",
      subtitle: "Chat",
      state: "idle",
      interactionState: "conversation",
      updatedAt: "2026-03-31T09:00:00.000Z",
      updatedLabel: "earlier",
      workspaceRoot: null,
      cwd: null,
      entries: [],
      changeGroups: [],
      progressSummary: null,
      reviewSummary: null,
      hasLoadedDetails: false,
    },
  ];

  const next = reconcileThreadSummariesWithBootstrap(
    current,
    [
      {
        ...current[0],
        updatedAt: "2026-03-31T11:00:00.000Z",
      },
    ],
  );

  assert.deepEqual(next.map((thread) => thread.id), ["thread-alpha", "thread-history"]);
});

test("mergeThreadDetails preserves loaded transcript details when bootstrap falls back to a summary-only thread", () => {
  const existing = buildThread({
    hasLoadedDetails: true,
    entries: [{ id: "entry-1", kind: "assistant", title: "Sense-1", body: "Created a file." }],
    changeGroups: [{ id: "change-1", title: "notes.txt", status: "complete", files: ["notes.txt"] }],
    progressSummary: ["1 file change group recorded."],
    reviewSummary: { summary: "Looks good", changedArtifacts: [], updatedAt: null },
    threadInputState: { queuedMessages: [], hasUnseenCompletion: false, lastCompletionAt: null, lastCompletionStatus: null },
  });
  const incoming = buildThread({
    title: "Recovered thread",
    hasLoadedDetails: false,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    reviewSummary: null,
    threadInputState: null,
  });

  const merged = mergeThreadDetails(existing, incoming);

  assert.equal(merged.title, "Recovered thread");
  assert.equal(merged.hasLoadedDetails, true);
  assert.deepEqual(merged.entries, existing.entries);
  assert.deepEqual(merged.changeGroups, existing.changeGroups);
  assert.deepEqual(merged.progressSummary, existing.progressSummary);
  assert.deepEqual(merged.reviewSummary, existing.reviewSummary);
  assert.deepEqual(merged.threadInputState, existing.threadInputState);
});

test("mergeThreadDetails preserves running state when bootstrap falls back to a summary-only thread", () => {
  const existing = buildThread({
    state: "running",
    hasLoadedDetails: true,
    entries: [{ id: "entry-1", kind: "assistant", title: "Sense-1", body: "Still working." }],
    changeGroups: [{ id: "change-1", title: "notes.txt", status: "running", files: ["notes.txt"] }],
    progressSummary: ["1 change group still running."],
  });
  const incoming = buildThread({
    state: "idle",
    hasLoadedDetails: false,
    entries: [],
    changeGroups: [],
    progressSummary: [],
  });

  const merged = mergeThreadDetails(existing, incoming);

  assert.equal(merged.state, "running");
  assert.deepEqual(merged.entries, existing.entries);
  assert.deepEqual(merged.changeGroups, existing.changeGroups);
  assert.deepEqual(merged.progressSummary, existing.progressSummary);
});

test("bootstrap reconciliation prunes deleted recent folders when requested", () => {
  const current = [
    { name: "alpha", path: "/tmp/alpha" },
    { name: "beta", path: "/tmp/beta" },
  ];

  const next = reconcileRecentFoldersWithBootstrap(
    current,
    [{ name: "alpha", path: "/tmp/alpha" }],
    { pruneMissing: true },
  );

  assert.deepEqual(next, [{ name: "alpha", path: "/tmp/alpha" }]);
});

test("mergeThreadDetails preserves loaded entries when bootstrap refresh only brings summary data", () => {
  const existing = buildThread({
    id: "thread-loaded",
    state: "idle",
    hasLoadedDetails: true,
    entries: [
      {
        id: "entry-1",
        kind: "assistant",
        title: "Sense-1",
        body: "Loaded detail",
        status: "complete",
      },
    ],
    changeGroups: [{ title: "Changed Files", items: [] }],
    progressSummary: [{ label: "Files changed", value: "1" }],
  });
  const merged = mergeThreadDetails(existing, buildThread({
    id: "thread-loaded",
    state: "idle",
    hasLoadedDetails: false,
    entries: [],
    changeGroups: [],
    progressSummary: [],
  }));

  assert.equal(merged.hasLoadedDetails, true);
  assert.equal(merged.entries.length, 1);
  assert.equal(merged.entries[0]?.body, "Loaded detail");
  assert.equal(merged.progressSummary.length, 1);
});

test("folder display name prefers the leaf folder", () => {
  assert.equal(folderDisplayName("/tmp/project"), "project");
  assert.equal(folderDisplayName("project"), "project");
});

test("runtime setup guidance matches the known blocker codes", () => {
  assert.equal(runtimeSetupGuidance(null), "");
  assert.equal(
    runtimeSetupGuidance({
      blocked: true,
      code: "missing_codex_runtime",
      title: "Missing runtime",
      message: "Install Codex",
      detail: null,
    }),
    "Install or restore Codex on this Mac, then reopen Sense-1 or retry the runtime check.",
  );
});

test("right rail stays visible for threads with an active turn even before entries arrive", () => {
  const visible = shouldShowRightRail({
    selectedThread: buildThread({ state: "active" }),
    selectedThreadApprovals: [],
    selectedThreadFolderRoot: null,
    threadInputRequest: null,
    threadPlanState: null,
    threadDiffState: null,
    taskPending: false,
    activeTurnId: "turn-1",
  });

  assert.equal(visible, true);
});

test("right rail still hides for empty restored active sessions without a live turn", () => {
  const visible = shouldShowRightRail({
    selectedThread: buildThread({ state: "active" }),
    selectedThreadApprovals: [],
    selectedThreadFolderRoot: null,
    threadInputRequest: null,
    threadPlanState: null,
    threadDiffState: null,
    taskPending: false,
    activeTurnId: null,
  });

  assert.equal(visible, false);
});

test("right rail stays visible when live sidebar state exists", () => {
  const visible = shouldShowRightRail({
    selectedThread: buildThread(),
    selectedThreadApprovals: [],
    selectedThreadFolderRoot: null,
    threadInputRequest: null,
    threadPlanState: {
      explanation: null,
      text: null,
      steps: [],
      planSteps: [],
      scopeSummary: null,
      expectedOutputSummary: null,
    },
    threadDiffState: null,
    taskPending: false,
    activeTurnId: null,
  });

  assert.equal(visible, true);
});

test("right rail still hides for empty idle chat threads", () => {
  const visible = shouldShowRightRail({
    selectedThread: buildThread(),
    selectedThreadApprovals: [],
    selectedThreadFolderRoot: null,
    threadInputRequest: null,
    threadPlanState: null,
    threadDiffState: null,
    taskPending: false,
    activeTurnId: null,
  });

  assert.equal(visible, false);
});
