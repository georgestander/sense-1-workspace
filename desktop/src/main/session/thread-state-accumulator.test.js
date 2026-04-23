import test from "node:test";
import assert from "node:assert/strict";

import { ThreadStateAccumulator, mapItemToEntry } from "./thread-state-accumulator.js";

function buildExpectedPlanState({
  expectedOutputSummary,
  explanation = null,
  scopeSummary,
  steps,
  statuses = [],
  text,
}) {
  return {
    explanation,
    text,
    steps,
    planSteps: steps.map((step, index) => ({
      step,
      status: statuses[index] ?? "pending",
    })),
    scopeSummary,
    expectedOutputSummary,
  };
}

// --- mapItemToEntry ---

test("mapItemToEntry maps a userMessage item into a user entry", () => {
  const entry = mapItemToEntry({
    id: "user-1",
    type: "userMessage",
    content: [{ type: "text", text: "Hello" }],
  });

  assert.deepEqual(entry, {
    id: "user-1",
    kind: "user",
    title: "You",
    body: "Hello",
  });
});

test("mapItemToEntry counts non-shortcut mention attachments as files", () => {
  const entry = mapItemToEntry({
    id: "user-file-1",
    type: "userMessage",
    content: [{ type: "mention", name: "brief.md", path: "/tmp/session/brief.md" }],
  });

  assert.deepEqual(entry, {
    id: "user-file-1",
    kind: "user",
    title: "You",
    body: "Attached 1 file.",
    attachments: [
      {
        kind: "file",
        label: "brief.md",
        path: "/tmp/session/brief.md",
      },
    ],
  });
});

test("mapItemToEntry strips the synthetic attachment context note from visible user text", () => {
  const entry = mapItemToEntry({
    id: "user-file-2",
    type: "userMessage",
    content: [
      { type: "mention", name: "brief.md", path: "/tmp/session/brief.md" },
      {
        type: "text",
        text: [
          "<sense1-attachment-context>",
          "The user attached these files for this request. Treat them as part of the task even when they live outside the current workspace.",
          "- brief.md :: /tmp/session/brief.md",
          "</sense1-attachment-context>",
          "Please use the attached brief.",
        ].join("\n"),
      },
    ],
  });

  assert.deepEqual(entry, {
    id: "user-file-2",
    kind: "user",
    title: "You",
    body: "Please use the attached brief.",
    attachments: [
      {
        kind: "file",
        label: "brief.md",
        path: "/tmp/session/brief.md",
      },
    ],
  });
});

test("mapItemToEntry maps an agentMessage item into an assistant entry", () => {
  const entry = mapItemToEntry({
    id: "agent-1",
    type: "agentMessage",
    text: "Sure, I can help.",
    phase: "final_answer",
  });

  assert.deepEqual(entry, {
    id: "agent-1",
    kind: "assistant",
    title: "Sense-1",
    body: "Sure, I can help.",
    status: "complete",
    phase: "final_answer",
  });
});

test("mapItemToEntry maps a streaming agentMessage without final_answer phase", () => {
  const entry = mapItemToEntry({
    id: "agent-2",
    type: "agentMessage",
    text: "Working on it...",
    phase: "thinking",
  });

  assert.deepEqual(entry, {
    id: "agent-2",
    kind: "assistant",
    title: "Sense-1 activity",
    body: "Working on it...",
    status: "streaming",
    phase: "thinking",
  });
});

test("mapItemToEntry maps commentary agentMessage as completed progress", () => {
  const entry = mapItemToEntry({
    id: "agent-commentary-1",
    type: "agentMessage",
    text: "I am checking the code path now.",
    phase: "commentary",
  });

  assert.deepEqual(entry, {
    id: "agent-commentary-1",
    kind: "assistant",
    title: "Sense-1 progress",
    body: "I am checking the code path now.",
    status: "complete",
    phase: "commentary",
  });
});

test("mapItemToEntry maps a commandExecution item", () => {
  const entry = mapItemToEntry({
    id: "cmd-1",
    type: "commandExecution",
    command: ["git", "status"],
    cwd: "/tmp/project",
    status: "completed",
    exitCode: 0,
    durationMs: 500,
    aggregatedOutput: "nothing to commit",
  });

  assert.equal(entry.kind, "command");
  assert.equal(entry.command, "git status");
  assert.equal(entry.exitCode, 0);
});

test("mapItemToEntry coerces non-string command payloads into safe text", () => {
  const entry = mapItemToEntry({
    id: "cmd-2",
    type: "commandExecution",
    command: ["git", "status"],
    aggregatedOutput: { changed: ["App.tsx"] },
    status: "completed",
  });

  assert.equal(entry.kind, "command");
  assert.equal(entry.body, JSON.stringify({ changed: ["App.tsx"] }));
});

test("mapItemToEntry returns null for unknown items", () => {
  assert.equal(mapItemToEntry({ id: "x-1", type: "unknownThing" }), null);
});

test("mapItemToEntry returns null for items without id", () => {
  assert.equal(mapItemToEntry({ type: "agentMessage", text: "no id" }), null);
});

// --- ThreadStateAccumulator: snapshot loading ---

test("loadSnapshot populates entries and returns a full-snapshot delta", () => {
  const acc = new ThreadStateAccumulator();
  const delta = acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Test thread",
    subtitle: "A test",
    state: "idle",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: "/tmp/project",
    cwd: "/tmp/project",
    entries: [
      { id: "user-1", kind: "user", title: "You", body: "Hello" },
      { id: "agent-1", kind: "assistant", title: "Sense-1", body: "Hi!", status: "complete" },
    ],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  assert.equal(delta.kind, "snapshot");
  assert.equal(delta.threadId, "thread-1");
  assert.equal(delta.entries.length, 2);
  assert.equal(delta.state, "idle");
  assert.equal(delta.interactionState, "conversation");
  assert.equal(delta.title, "Test thread");
  assert.equal(delta.workspaceRoot, "/tmp/project");
  assert.equal(delta.cwd, "/tmp/project");
  assert.equal(delta.reviewSummary, null);
});

test("loadSnapshot replaces previous entries on reload", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "First load",
    subtitle: "",
    state: "idle",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [
      { id: "old-1", kind: "user", title: "You", body: "Old message" },
    ],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  const delta = acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Second load",
    subtitle: "",
    state: "running",
    updatedAt: "2026-03-23T01:00:00.000Z",
    updatedLabel: "1 hr ago",
    workspaceRoot: null,
    entries: [
      { id: "new-1", kind: "user", title: "You", body: "New message" },
    ],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  assert.equal(delta.entries.length, 1);
  assert.equal(delta.entries[0].id, "new-1");
  assert.equal(delta.title, "Second load");
});

// --- ThreadStateAccumulator: delta application ---

test("applyNotification handles item/agentMessage/delta", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Test",
    subtitle: "",
    state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  const deltas1 = acc.applyNotification({
    method: "item/agentMessage/delta",
    params: {
      threadId: "thread-1",
      itemId: "msg-1",
      delta: "Hello ",
    },
  });

  assert.equal(deltas1.length, 1);
  assert.equal(deltas1[0].kind, "entryDelta");
  assert.equal(deltas1[0].entryId, "msg-1");
  assert.equal(deltas1[0].append, "Hello ");

  // Second delta for the same item appends.
  const deltas2 = acc.applyNotification({
    method: "item/agentMessage/delta",
    params: {
      threadId: "thread-1",
      itemId: "msg-1",
      delta: "world!",
    },
  });

  assert.equal(deltas2.length, 1);
  assert.equal(deltas2[0].append, "world!");

  // The buffer should have accumulated the full text.
  const state = acc.getThreadState("thread-1");
  const entry = state.entries.find((e) => e.id === "msg-1");
  assert.equal(entry.body, "Hello world!");
  assert.equal(entry.status, "streaming");
});

test("item/started keeps commentary agentMessage streaming until completion", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-commentary-start", {
    id: "thread-commentary-start",
    title: "Commentary",
    subtitle: "",
    state: "running",
    interactionState: "conversation",
    updatedAt: "2026-04-23T00:00:00.000Z",
    updatedLabel: "now",
    workspaceRoot: "/tmp/project",
    cwd: "/tmp/project",
    entries: [],
    changeGroups: [],
    progressSummary: [],
    reviewSummary: null,
    hasLoadedDetails: true,
  });

  const started = acc.applyNotification({
    method: "item/started",
    params: {
      threadId: "thread-commentary-start",
      item: {
        id: "commentary-1",
        type: "agentMessage",
        text: "I am checking the runtime now.",
        phase: "commentary",
      },
    },
  });

  assert.equal(started[0].kind, "entryStarted");
  assert.equal(started[0].entry.phase, "commentary");
  assert.equal(started[0].entry.status, "streaming");

  const completed = acc.applyNotification({
    method: "item/completed",
    params: {
      threadId: "thread-commentary-start",
      item: {
        id: "commentary-1",
        type: "agentMessage",
        text: "I am checking the runtime now.",
        phase: "commentary",
      },
    },
  });

  assert.equal(completed[0].kind, "entryCompleted");
  assert.equal(completed[0].entry.phase, "commentary");
  assert.equal(completed[0].entry.status, "complete");
});

test("item/completed normalizes tool entries without explicit status to completed", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-tool-complete", {
    id: "thread-tool-complete",
    title: "Tool completion",
    subtitle: "",
    state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  acc.applyNotification({
    method: "item/started",
    params: {
      threadId: "thread-tool-complete",
      item: {
        id: "tool-1",
        type: "webSearch",
        query: "current payments platforms",
        status: "running",
      },
    },
  });

  const completed = acc.applyNotification({
    method: "item/completed",
    params: {
      threadId: "thread-tool-complete",
      item: {
        id: "tool-1",
        type: "webSearch",
        query: "current payments platforms",
      },
    },
  });

  assert.equal(completed[0].kind, "entryCompleted");
  assert.equal(completed[0].entry.kind, "tool");
  assert.equal(completed[0].entry.status, "completed");
});

test("applyNotification returns empty array for unknown methods", () => {
  const acc = new ThreadStateAccumulator();
  const deltas = acc.applyNotification({
    method: "server/status",
    params: { state: "ready" },
  });
  assert.deepEqual(deltas, []);
});

test("applyNotification returns empty array for unbuffered thread", () => {
  const acc = new ThreadStateAccumulator();
  const deltas = acc.applyNotification({
    method: "item/agentMessage/delta",
    params: {
      threadId: "thread-999",
      itemId: "msg-1",
      delta: "Ignored",
    },
  });
  assert.deepEqual(deltas, []);
});

test("hasBlockingWork returns true when any buffered thread is running", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Test",
    subtitle: "",
    state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  assert.equal(acc.hasBlockingWork(), true);
});

test("hasBlockingWork returns true when approval is pending", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Test",
    subtitle: "",
    state: "idle",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  acc.applyNotification({
    id: 101,
    method: "item/commandExecution/requestApproval",
    params: { threadId: "thread-1" },
  });

  assert.equal(acc.hasBlockingWork(), true);
});

test("hasBlockingWork returns true when input is pending and false again when the request is cleared", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Test",
    subtitle: "",
    state: "idle",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  acc.setInputRequestState("thread-1", 55, "Need your input");
  assert.equal(acc.hasBlockingWork(), true);

  acc.applyNotification({
    method: "turn/completed",
    params: {
      threadId: "thread-1",
    },
  });

  assert.equal(acc.hasBlockingWork(), false);
});

test("applyNotification handles item/started for a new entry", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Test",
    subtitle: "",
    state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  const deltas = acc.applyNotification({
    method: "item/started",
    params: {
      threadId: "thread-1",
      item: {
        id: "cmd-1",
        type: "commandExecution",
        command: ["ls", "-la"],
        cwd: "/tmp",
        status: "running",
      },
    },
  });

  assert.equal(deltas.length, 2);
  assert.equal(deltas[0].kind, "entryStarted");
  assert.equal(deltas[0].entry.kind, "command");
  assert.equal(deltas[0].entry.command, "ls -la");
  assert.equal(deltas[1].kind, "interactionStateChanged");
  assert.equal(deltas[1].interactionState, "executing");
});

test("applyNotification handles item/completed and finalizes an entry", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Test",
    subtitle: "",
    state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  // Start streaming.
  acc.applyNotification({
    method: "item/agentMessage/delta",
    params: { threadId: "thread-1", itemId: "msg-1", delta: "Working..." },
  });

  // Complete the item.
  const deltas = acc.applyNotification({
    method: "item/completed",
    params: {
      threadId: "thread-1",
      item: {
        id: "msg-1",
        type: "agentMessage",
        text: "Working... done!",
        phase: "final_answer",
      },
    },
  });

  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].kind, "entryCompleted");
  assert.equal(deltas[0].entry.body, "Working... done!");
  assert.equal(deltas[0].entry.status, "complete");

  // Streaming state should be cleared.
  const buffer = acc.getBuffer("thread-1");
  assert.equal(buffer.activeStreamingItemId, null);
});

test("applyNotification publishes a structured review summary when review mode exits", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Review test",
    subtitle: "",
    state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: "/tmp/project",
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  acc.applyNotification({
    method: "turn/diff/updated",
    params: {
      threadId: "thread-1",
      diffs: [{ path: "src/App.tsx", hunks: ["+const next = true"] }],
    },
  });

  const deltas = acc.applyNotification({
    method: "item/completed",
    params: {
      threadId: "thread-1",
      item: {
        id: "review-1",
        type: "exitedReviewMode",
        review: {
          text: "Ready to ship",
        },
      },
    },
  });

  assert.equal(deltas.length, 2);
  assert.equal(deltas[0].kind, "entryCompleted");
  assert.equal(deltas[1].kind, "reviewSummaryUpdated");
  assert.equal(deltas[1].reviewSummary?.summary, "Ready to ship");
  assert.equal(deltas[1].reviewSummary?.changedArtifacts.length, 1);
  assert.equal(deltas[1].reviewSummary?.changedArtifacts[0].path, "src/App.tsx");

  const state = acc.getThreadState("thread-1");
  assert.equal(state.reviewSummary?.summary, "Ready to ship");
  assert.equal(state.reviewSummary?.changedArtifacts[0].action, "modified");
});

test("applyNotification structures created files, modified files, and output artifacts when review mode exits", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-2", {
    id: "thread-2",
    title: "Review outputs",
    subtitle: "",
    state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: "/tmp/project",
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  acc.applyNotification({
    method: "item/completed",
    params: {
      threadId: "thread-2",
      item: {
        id: "file-created-1",
        type: "fileChange",
        status: "completed",
        changes: [{ path: "artifacts/report.md", kind: "created" }],
      },
    },
  });

  acc.applyNotification({
    method: "turn/diff/updated",
    params: {
      threadId: "thread-2",
      diffs: [{ path: "src/App.tsx", hunks: ["+const next = true"] }],
    },
  });

  const deltas = acc.applyNotification({
    method: "item/completed",
    params: {
      threadId: "thread-2",
      item: {
        id: "review-2",
        type: "exitedReviewMode",
        review: {
          text: "Review bundle ready",
        },
      },
    },
  });

  assert.equal(deltas[1].kind, "reviewSummaryUpdated");
  assert.equal(deltas[1].reviewSummary?.summary, "Review bundle ready");
  assert.deepEqual(
    deltas[1].reviewSummary?.outputArtifacts.map((artifact) => artifact.path),
    ["artifacts/report.md"],
  );
  assert.deepEqual(
    deltas[1].reviewSummary?.createdFiles.map((artifact) => artifact.path),
    ["artifacts/report.md"],
  );
  assert.deepEqual(
    deltas[1].reviewSummary?.modifiedFiles.map((artifact) => artifact.path),
    ["src/App.tsx"],
  );
  assert.equal(deltas[1].reviewSummary?.changedArtifacts.length, 2);
});

test("applyNotification handles turn/started", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Test",
    subtitle: "",
    state: "idle",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  const deltas = acc.applyNotification({
    method: "turn/started",
    params: {
      threadId: "thread-1",
      turn: { id: "turn-1" },
    },
  });

  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].kind, "threadStateChanged");
  assert.equal(deltas[0].state, "running");
  assert.equal(deltas[0].turnId, "turn-1");
});

test("applyNotification handles turn/completed", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Test",
    subtitle: "",
    state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  const deltas = acc.applyNotification({
    method: "turn/completed",
    params: { threadId: "thread-1" },
  });

  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].kind, "threadStateChanged");
  assert.equal(deltas[0].state, "idle");
});

test("appendSyntheticEntry preserves structured change payloads", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-structured", {
    id: "thread-structured",
    title: "Structured",
    subtitle: "",
    state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: "/tmp/project",
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  const deltas = acc.appendSyntheticEntry("thread-structured", {
    id: "synthetic-change-1",
    kind: "fileChange",
    title: "File changes",
    status: "complete",
    changes: [
      {
        kind: "modified",
        path: "/tmp/project/src/index.ts",
      },
    ],
  });

  assert.equal(deltas[0]?.kind, "entryCompleted");
  assert.deepEqual(deltas[0]?.entry?.changes, [
    {
      kind: "modified",
      path: "/tmp/project/src/index.ts",
    },
  ]);
});

test("applyNotification tracks native approvals and serverRequest/resolved clears them", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Approval test",
    state: "running",
    entries: [],
  });

  const commandApproval = acc.applyNotification({
    id: 41,
    method: "item/commandExecution/requestApproval",
    params: {
      threadId: "thread-1",
    },
  });

  assert.equal(commandApproval.length, 1);
  assert.equal(commandApproval[0].kind, "interactionStateChanged");
  assert.equal(commandApproval[0].interactionState, "executing");
  assert.deepEqual(
    Array.from(acc.getBuffer("thread-1").pendingApprovalsById.values()),
    [{ id: 41, kind: "command" }],
  );

  const fileApproval = acc.applyNotification({
    id: 42,
    method: "item/fileChange/requestApproval",
    params: {
      threadId: "thread-1",
    },
  });

  assert.equal(fileApproval.length, 0);
  assert.deepEqual(
    Array.from(acc.getBuffer("thread-1").pendingApprovalsById.values()),
    [
      { id: 41, kind: "command" },
      { id: 42, kind: "file" },
    ],
  );

  const firstResolved = acc.applyNotification({
    method: "serverRequest/resolved",
    params: {
      requestId: 41,
    },
  });

  assert.equal(firstResolved.length, 0);
  assert.deepEqual(
    Array.from(acc.getBuffer("thread-1").pendingApprovalsById.values()),
    [{ id: 42, kind: "file" }],
  );

  const secondResolved = acc.applyNotification({
    method: "serverRequest/resolved",
    params: {
      requestId: 42,
    },
  });

  assert.equal(secondResolved.length, 1);
  assert.equal(secondResolved[0].kind, "interactionStateChanged");
  assert.equal(secondResolved[0].interactionState, "conversation");
  assert.deepEqual(Array.from(acc.getBuffer("thread-1").pendingApprovalsById.values()), []);
});

test("applyNotification handles turn/plan/updated", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Test",
    subtitle: "",
    state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  const deltas = acc.applyNotification({
    method: "turn/plan/updated",
    params: {
      explanation: "Confirm the current state before editing.",
      plan: [
        { step: "Read the code", status: "completed" },
        { step: "Fix the bug", status: "inProgress" },
        { step: "Write tests", status: "pending" },
      ],
      threadId: "thread-1",
    },
  });

  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].kind, "planUpdated");
  assert.equal(deltas[0].planSteps.length, 3);
  assert.equal(deltas[0].planSteps[0], "Read the code");
  assert.deepEqual(deltas[0].planState.planSteps, [
    { step: "Read the code", status: "completed" },
    { step: "Fix the bug", status: "inProgress" },
    { step: "Write tests", status: "pending" },
  ]);
  assert.match(deltas[0].planScopeSummary, /chat-only work/i);
  assert.match(deltas[0].planExpectedOutputSummary, /clear response/i);

  const state = acc.getThreadState("thread-1");
  assert.deepEqual(state.planState, buildExpectedPlanState({
    explanation: "Confirm the current state before editing.",
    expectedOutputSummary: "Expected output: a clear response that covers Read the code, Fix the bug, and Write tests.",
    scopeSummary: "This run is scoped to chat-only work. Focus on Read the code, Fix the bug, and Write tests.",
    statuses: ["completed", "inProgress", "pending"],
    steps: ["Read the code", "Fix the bug", "Write tests"],
    text: "Confirm the current state before editing.\n\n1. Read the code\n2. Fix the bug\n3. Write tests",
  }));
  assert.equal(state.interactionState, "conversation");
});

test("applyNotification ignores empty turn/plan/updated payloads", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Test",
    subtitle: "",
    state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: "/tmp/project",
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  const deltas = acc.applyNotification({
    method: "turn/plan/updated",
    params: {
      plan: [],
      threadId: "thread-1",
    },
  });

  assert.deepEqual(deltas, []);
  const state = acc.getThreadState("thread-1");
  assert.equal(state.planState, null);
  assert.equal(state.interactionState, "conversation");
});

test("applyNotification ignores turn/plan/updated once execution has already started", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Test",
    subtitle: "",
    state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: "/tmp/project",
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  acc.applyNotification({
    method: "item/started",
    params: {
      threadId: "thread-1",
      item: {
        id: "cmd-1",
        type: "commandExecution",
        command: ["pwd"],
        cwd: "/tmp/project",
        status: "running",
      },
    },
  });

  const deltas = acc.applyNotification({
    method: "turn/plan/updated",
    params: {
      explanation: "Inspect files before editing.",
      plan: [
        { step: "Inspect files", status: "inProgress" },
        { step: "Edit the target file", status: "pending" },
      ],
      threadId: "thread-1",
      workspaceRoot: "/tmp/project",
    },
  });

  assert.deepEqual(deltas, []);
  const state = acc.getThreadState("thread-1");
  assert.equal(state.planState, null);
  assert.equal(state.interactionState, "executing");
});

test("applyNotification does not emit duplicate plan deltas when structured plan data is unchanged", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    entries: [],
    id: "thread-1",
    title: "Thread 1",
  });

  const notification = {
    method: "turn/plan/updated",
    params: {
      explanation: "Confirm the current state before editing.",
      plan: [
        { step: "Read the code", status: "completed" },
        { step: "Fix the bug", status: "inProgress" },
      ],
      threadId: "thread-1",
    },
  };

  const firstDeltas = acc.applyNotification(notification);
  assert.equal(firstDeltas.filter((delta) => delta.kind === "planUpdated").length, 1);

  const secondDeltas = acc.applyNotification(notification);
  assert.equal(secondDeltas.filter((delta) => delta.kind === "planUpdated").length, 0);
});

test("applyNotification handles turn/diff/updated", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Test",
    subtitle: "",
    state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  const deltas = acc.applyNotification({
    method: "turn/diff/updated",
    params: {
      threadId: "thread-1",
      diff: {
        files: [
          { path: "src/App.tsx", hunks: ["+new line"] },
          { filePath: "README.md" },
        ],
      },
    },
  });

  assert.equal(deltas.length, 2);
  assert.equal(deltas[0].kind, "diffUpdated");
  assert.deepEqual(deltas[0].diffs, [
    { path: "src/App.tsx", hunks: ["+new line"] },
    { path: "README.md" },
  ]);
  assert.equal(deltas[1].kind, "interactionStateChanged");
  assert.equal(deltas[1].interactionState, "executing");
});

test("applyNotification merges changed file paths across native turn/diff/updated notifications", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-merge-diff", {
    id: "thread-merge-diff",
    title: "Merge diffs",
    subtitle: "",
    state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  acc.applyNotification({
    method: "turn/diff/updated",
    params: {
      threadId: "thread-merge-diff",
      diff: {
        files: [
          { path: "src/App.tsx", hunks: ["+new line"] },
        ],
      },
    },
  });

  const deltas = acc.applyNotification({
    method: "turn/diff/updated",
    params: {
      threadId: "thread-merge-diff",
      diff: {
        changes: [
          { after: { path: "src/lib/review.ts" } },
        ],
      },
    },
  });

  assert.equal(deltas[0].kind, "diffUpdated");
  assert.deepEqual(deltas[0].diffs, [
    { path: "src/App.tsx", hunks: ["+new line"] },
    { path: "src/lib/review.ts" },
  ]);
  assert.deepEqual(acc.getThreadState("thread-merge-diff").diffState, {
    diffs: [
      { path: "src/App.tsx", hunks: ["+new line"] },
      { path: "src/lib/review.ts" },
    ],
  });
});

test("setDiffState supplements native diff paths instead of replacing them", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-diff-supplement", {
    id: "thread-diff-supplement",
    title: "Supplement diffs",
    subtitle: "",
    state: "idle",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  acc.applyNotification({
    method: "turn/diff/updated",
    params: {
      threadId: "thread-diff-supplement",
      diff: {
        files: [
          { path: "src/App.tsx" },
        ],
      },
    },
  });

  const deltas = acc.setDiffState("thread-diff-supplement", [
    { path: "README.md" },
  ]);

  assert.equal(deltas[0].kind, "diffUpdated");
  assert.deepEqual(deltas[0].diffs, [
    { path: "src/App.tsx" },
    { path: "README.md" },
  ]);
});

test("appendSyntheticEntry preserves file change metadata for clickable artifact rows", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-file-link", {
    id: "thread-file-link",
    title: "Synthetic file link",
    subtitle: "",
    state: "idle",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: "/tmp/workspace",
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  const deltas = acc.appendSyntheticEntry("thread-file-link", {
    kind: "fileChange",
    title: "File changes",
    changes: [
      {
        kind: "created",
        path: "/tmp/workspace/created.txt",
      },
    ],
    status: "complete",
  });

  assert.equal(deltas[0].kind, "entryCompleted");
  assert.equal(deltas[0].entry.kind, "fileChange");
  assert.deepEqual(deltas[0].entry.changes, [
    {
      kind: "created",
      path: "/tmp/workspace/created.txt",
    },
  ]);
});

test("applyNotification handles tool/requestUserInput", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Test",
    subtitle: "",
    state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  const deltas = acc.applyNotification({
    id: 42,
    method: "tool/requestUserInput",
    params: {
      threadId: "thread-1",
      prompt: "What API key should I use?",
      questions: [
        {
          header: "Environment",
          question: "What API key should I use?",
          isOther: true,
          choices: [
            { label: "Staging", description: "Use the staging key." },
            { label: "Production", description: "Use the production key." },
          ],
        },
      ],
    },
  });

  assert.equal(deltas.length, 2);
  assert.equal(deltas[0].kind, "inputRequested");
  assert.equal(deltas[0].requestId, 42);
  assert.equal(deltas[0].prompt, "What API key should I use?");
  assert.deepEqual(deltas[0].questions, [
    {
      id: null,
      header: "Environment",
      question: "What API key should I use?",
      isOther: true,
      choices: [
        { label: "Staging", description: "Use the staging key.", value: "Staging" },
        { label: "Production", description: "Use the production key.", value: "Production" },
      ],
    },
  ]);
  assert.equal(deltas[1].kind, "interactionStateChanged");
  assert.equal(deltas[1].interactionState, "clarification");
});

test("applyNotification normalizes structured questions when prompt is omitted", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    entries: [],
    id: "thread-1",
    title: "Thread 1",
  });

  const deltas = acc.applyNotification({
    id: 99,
    method: "item/tool/requestUserInput",
    params: {
      threadId: "thread-1",
      questions: [
        {
          header: "Environment",
          options: [
            { description: "Use staging.", label: "Staging" },
            { description: "Use production.", name: "Production" },
          ],
          prompt: "Which environment should I use?",
          isOther: true,
        },
      ],
    },
  });

  assert.equal(deltas[0].kind, "inputRequested");
  assert.equal(
    deltas[0].prompt,
    "Environment: Which environment should I use?\n   1. Staging\n   2. Production\n   Other: allowed",
  );
  assert.deepEqual(deltas[0].questions, [
    {
      id: null,
      header: "Environment",
      question: "Which environment should I use?",
      isOther: true,
      choices: [
        { label: "Staging", description: "Use staging.", value: "Staging" },
        { label: "Production", description: "Use production.", value: "Production" },
      ],
    },
  ]);
});

test("applyNotification handles thread/name/updated", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Old title",
    subtitle: "",
    state: "idle",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  const deltas = acc.applyNotification({
    method: "thread/name/updated",
    params: {
      threadId: "thread-1",
      name: "New title",
    },
  });

  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].kind, "threadMetadataChanged");
  assert.equal(deltas[0].title, "New title");
});

// --- ThreadStateAccumulator: buffer management ---

test("dropBuffer removes a thread buffer and clears active thread if matching", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Test",
    subtitle: "",
    state: "idle",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });
  acc.setActiveThread("thread-1");

  acc.dropBuffer("thread-1");
  assert.equal(acc.getThreadState("thread-1"), null);
  assert.equal(acc.activeThreadId, null);
});

test("clear removes all buffers", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Test",
    subtitle: "",
    state: "idle",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });
  acc.loadSnapshot("thread-2", {
    id: "thread-2",
    title: "Test 2",
    subtitle: "",
    state: "idle",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  acc.clear();
  assert.equal(acc.getThreadState("thread-1"), null);
  assert.equal(acc.getThreadState("thread-2"), null);
  assert.equal(acc.activeThreadId, null);
});

// --- ThreadStateAccumulator: full streaming sequence ---

test("full streaming sequence: start turn, receive deltas, complete item, complete turn", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Test",
    subtitle: "",
    state: "idle",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [
      { id: "user-1", kind: "user", title: "You", body: "Fix the bug" },
    ],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });
  acc.setActiveThread("thread-1");

  // 1. Turn starts.
  const turnStart = acc.applyNotification({
    method: "turn/started",
    params: {
      threadId: "thread-1",
      turn: { id: "turn-stream-1" },
    },
  });
  assert.equal(turnStart[0].kind, "threadStateChanged");
  assert.equal(turnStart[0].state, "running");
  assert.equal(turnStart[0].turnId, "turn-stream-1");

  // 2. Item starts (agent message).
  const itemStart = acc.applyNotification({
    method: "item/started",
    params: {
      threadId: "thread-1",
      item: { id: "agent-1", type: "agentMessage", text: "", phase: "thinking" },
    },
  });
  assert.equal(itemStart[0].kind, "entryStarted");

  // 3. Delta chunks arrive.
  acc.applyNotification({
    method: "item/agentMessage/delta",
    params: { threadId: "thread-1", itemId: "agent-1", delta: "I'll look " },
  });
  acc.applyNotification({
    method: "item/agentMessage/delta",
    params: { threadId: "thread-1", itemId: "agent-1", delta: "at the code " },
  });
  acc.applyNotification({
    method: "item/agentMessage/delta",
    params: { threadId: "thread-1", itemId: "agent-1", delta: "now." },
  });

  // Check accumulated text.
  let state = acc.getThreadState("thread-1");
  const streamingEntry = state.entries.find((e) => e.id === "agent-1");
  assert.equal(streamingEntry.body, "I'll look at the code now.");
  assert.equal(streamingEntry.status, "streaming");

  // 4. Item completes.
  const itemComplete = acc.applyNotification({
    method: "item/completed",
    params: {
      threadId: "thread-1",
      item: {
        id: "agent-1",
        type: "agentMessage",
        text: "I'll look at the code now.",
        phase: "final_answer",
      },
    },
  });
  assert.equal(itemComplete[0].kind, "entryCompleted");
  assert.equal(itemComplete[0].entry.status, "complete");

  // 5. Turn completes.
  const turnComplete = acc.applyNotification({
    method: "turn/completed",
    params: { threadId: "thread-1" },
  });
  assert.equal(turnComplete[0].kind, "threadStateChanged");
  assert.equal(turnComplete[0].state, "idle");

  // Final state check.
  state = acc.getThreadState("thread-1");
  assert.equal(state.state, "idle");
  assert.equal(state.entries.length, 2); // user + agent
  assert.equal(state.entries[0].id, "user-1");
  assert.equal(state.entries[1].id, "agent-1");
  assert.equal(state.entries[1].body, "I'll look at the code now.");
  assert.equal(state.entries[1].status, "complete");
});

test("item completion falls back to streamed agent text when final text is omitted", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Test",
    subtitle: "",
    state: "idle",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: "/tmp/project",
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  acc.applyNotification({
    method: "item/started",
    params: {
      threadId: "thread-1",
      item: { id: "agent-1", type: "agentMessage", text: "", phase: "thinking" },
    },
  });
  acc.applyNotification({
    method: "item/agentMessage/delta",
    params: {
      threadId: "thread-1",
      itemId: "agent-1",
      delta:
        "Request Summary\n- Talk through the landing page\n\nIntended Actions\n- Share recommendations only",
    },
  });

  const itemComplete = acc.applyNotification({
    method: "item/completed",
    params: {
      threadId: "thread-1",
      item: {
        id: "agent-1",
        type: "agentMessage",
        text: "",
        phase: "final_answer",
      },
    },
  });

  assert.equal(itemComplete[0].kind, "entryCompleted");
  assert.equal(
    itemComplete[0].entry.body,
    "Request Summary\n- Talk through the landing page\n\nIntended Actions\n- Share recommendations only",
  );
  assert.equal(itemComplete[0].entry.status, "complete");

  const state = acc.getThreadState("thread-1");
  assert.equal(
    state.entries[0].body,
    "Request Summary\n- Talk through the landing page\n\nIntended Actions\n- Share recommendations only",
  );
});

// --- Fallback cold-load behavior ---

test("loadSnapshot with null snapshot resets buffer to empty state", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Had stuff",
    subtitle: "",
    state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: "/tmp",
    entries: [
      { id: "e-1", kind: "user", title: "You", body: "test" },
    ],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  const delta = acc.loadSnapshot("thread-1", null);
  assert.equal(delta.kind, "snapshot");
  assert.equal(delta.entries.length, 0);
  assert.equal(delta.state, "idle");
  assert.equal(delta.interactionState, "conversation");
  assert.equal(delta.title, "Untitled thread");
});

// --- Exploratory: thread switch while streaming ---

test("switching active thread during streaming preserves both buffers independently", () => {
  const acc = new ThreadStateAccumulator();

  // Load two threads.
  acc.loadSnapshot("thread-A", {
    id: "thread-A",
    title: "Thread A",
    subtitle: "",
    state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });
  acc.loadSnapshot("thread-B", {
    id: "thread-B",
    title: "Thread B",
    subtitle: "",
    state: "idle",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });
  acc.setActiveThread("thread-A");

  // Thread A starts streaming.
  acc.applyNotification({
    method: "item/agentMessage/delta",
    params: { threadId: "thread-A", itemId: "msg-A", delta: "Hello from A" },
  });

  // User switches to thread B.
  acc.setActiveThread("thread-B");

  // Thread A continues to receive deltas (background streaming).
  const deltasA = acc.applyNotification({
    method: "item/agentMessage/delta",
    params: { threadId: "thread-A", itemId: "msg-A", delta: " still going" },
  });

  // Delta is still produced for thread A even though active thread is B.
  assert.equal(deltasA.length, 1);
  assert.equal(deltasA[0].kind, "entryDelta");
  assert.equal(deltasA[0].threadId, "thread-A");

  // Thread A buffer has accumulated text.
  const stateA = acc.getThreadState("thread-A");
  const entryA = stateA.entries.find((e) => e.id === "msg-A");
  assert.equal(entryA.body, "Hello from A still going");

  // Thread B buffer is unaffected.
  const stateB = acc.getThreadState("thread-B");
  assert.equal(stateB.entries.length, 0);
  assert.equal(stateB.state, "idle");
});

// --- Exploratory: reconnect cold-load replaces stale streaming state ---

test("loadSnapshot after streaming recovers entries but preserves sidebar state", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Test",
    subtitle: "",
    state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });
  acc.setActiveThread("thread-1");

  // Simulate partial streaming.
  acc.applyNotification({
    method: "item/agentMessage/delta",
    params: { threadId: "thread-1", itemId: "msg-1", delta: "Partial text" },
  });
  acc.applyNotification({
    method: "turn/plan/updated",
    params: { threadId: "thread-1", text: "1. Do something" },
  });

  // Verify streaming state exists.
  let state = acc.getThreadState("thread-1");
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].body, "Partial text");
  assert.ok(state.planState);

  // Simulate reconnect: load a fresh snapshot (cold load).
  const delta = acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Recovered",
    subtitle: "After reconnect",
    state: "idle",
    updatedAt: "2026-03-23T02:00:00.000Z",
    updatedLabel: "2 hr ago",
    workspaceRoot: "/tmp/project",
    entries: [
      { id: "user-1", kind: "user", title: "You", body: "Hello" },
      { id: "agent-1", kind: "assistant", title: "Sense-1", body: "Done!", status: "complete" },
    ],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  // Snapshot should replace entries but carry preserved sidebar state.
  assert.equal(delta.kind, "snapshot");
  assert.equal(delta.entries.length, 2);
  assert.equal(delta.state, "idle");
  assert.equal(delta.interactionState, "conversation");
  assert.equal(delta.title, "Recovered");
  assert.deepEqual(delta.planState, buildExpectedPlanState({
    expectedOutputSummary: "Expected output: a clear response that covers Do something.",
    scopeSummary: "This run is scoped to chat-only work. Focus on Do something.",
    steps: ["Do something"],
    text: "1. Do something",
  }));
  assert.equal(delta.diffState, null);
  assert.equal(delta.inputRequestState, null);

  // Verify entries are replaced but sidebar state is preserved
  // (plan/diff/input come from live events, not from the raw thread snapshot).
  state = acc.getThreadState("thread-1");
  assert.equal(state.entries.length, 2);
  assert.deepEqual(state.planState, buildExpectedPlanState({
    expectedOutputSummary: "Expected output: a clear response that covers Do something.",
    scopeSummary: "This run is scoped to chat-only work. Focus on Do something.",
    steps: ["Do something"],
    text: "1. Do something",
  }));
  assert.equal(state.diffState, null);
  assert.equal(state.inputRequestState, null);

  // Buffer should accept new deltas cleanly after cold load.
  const newDeltas = acc.applyNotification({
    method: "item/agentMessage/delta",
    params: { threadId: "thread-1", itemId: "msg-new", delta: "New streaming" },
  });
  assert.equal(newDeltas.length, 1);
  assert.equal(newDeltas[0].kind, "entryDelta");
});

test("loadSnapshot applies explicit durable input-request state overrides", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Test",
    subtitle: "",
    state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  acc.applyNotification({
    id: 77,
    method: "tool/requestUserInput",
    params: {
      threadId: "thread-1",
      prompt: "Existing in-memory prompt",
    },
  });

  let delta = acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Reloaded",
    subtitle: "",
    state: "idle",
    updatedAt: "2026-03-23T01:00:00.000Z",
    updatedLabel: "later",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
    inputRequestState: {
      requestId: 99,
      prompt: "Durable prompt",
      threadId: "thread-1",
    },
  });

  assert.deepEqual(delta.inputRequestState, {
    requestId: 99,
    prompt: "Durable prompt",
    threadId: "thread-1",
    questions: [],
  });

  delta = acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Reloaded again",
    subtitle: "",
    state: "idle",
    updatedAt: "2026-03-23T02:00:00.000Z",
    updatedLabel: "later",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
    inputRequestState: null,
  });

  assert.equal(delta.inputRequestState, null);
  assert.equal(acc.getThreadState("thread-1").inputRequestState, null);
});

// --- Sidebar / input-request propagation ---

test("plan, diff, and inputRequest state are independently tracked per buffer", () => {
  const acc = new ThreadStateAccumulator();
  acc.loadSnapshot("thread-1", {
    id: "thread-1",
    title: "Test",
    subtitle: "",
    state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    hasLoadedDetails: true,
  });

  // Set plan state.
  acc.applyNotification({
    method: "turn/plan/updated",
    params: { threadId: "thread-1", text: "1. Step A\n2. Step B" },
  });

  // Set diff state.
  acc.applyNotification({
    method: "turn/diff/updated",
    params: { threadId: "thread-1", diff: { paths: ["file.ts"] } },
  });

  // Set input request.
  acc.applyNotification({
    id: 99,
    method: "tool/requestUserInput",
    params: { threadId: "thread-1", prompt: "Enter your key:" },
  });

  const state = acc.getThreadState("thread-1");
  assert.deepEqual(state.planState, buildExpectedPlanState({
    expectedOutputSummary: "Expected output: a clear response that covers Step A and Step B.",
    scopeSummary: "This run is scoped to chat-only work. Focus on Step A and Step B.",
    steps: ["Step A", "Step B"],
    text: "1. Step A\n2. Step B",
  }));
  assert.deepEqual(state.diffState, { diffs: [{ path: "file.ts" }] });
  assert.deepEqual(state.inputRequestState, {
    requestId: 99,
    prompt: "Enter your key:",
    threadId: "thread-1",
    questions: [],
  });
});

// --- Per-thread sidebar isolation (review finding #1) ---

test("plan/diff/input state for thread A does not leak into thread B", () => {
  const acc = new ThreadStateAccumulator();

  acc.loadSnapshot("thread-A", {
    id: "thread-A", title: "A", subtitle: "", state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z", updatedLabel: "now",
    workspaceRoot: null, entries: [], changeGroups: [],
    progressSummary: [], hasLoadedDetails: true,
  });
  acc.loadSnapshot("thread-B", {
    id: "thread-B", title: "B", subtitle: "", state: "idle",
    updatedAt: "2026-03-23T00:00:00.000Z", updatedLabel: "now",
    workspaceRoot: null, entries: [], changeGroups: [],
    progressSummary: [], hasLoadedDetails: true,
  });

  // Set sidebar state only on thread A.
  acc.applyNotification({
    method: "turn/plan/updated",
    params: { threadId: "thread-A", text: "1. Plan A step" },
  });
  acc.applyNotification({
    method: "turn/diff/updated",
    params: { threadId: "thread-A", diff: { files: [{ path: "a.ts" }] } },
  });
  acc.applyNotification({
    id: 10,
    method: "tool/requestUserInput",
    params: { threadId: "thread-A", prompt: "A needs input" },
  });

  // Thread A has sidebar state.
  const stateA = acc.getThreadState("thread-A");
  assert.ok(stateA.planState);
  assert.ok(stateA.diffState);
  assert.ok(stateA.inputRequestState);

  // Thread B has no sidebar state.
  const stateB = acc.getThreadState("thread-B");
  assert.equal(stateB.planState, null);
  assert.equal(stateB.diffState, null);
  assert.equal(stateB.inputRequestState, null);
});

test("switching threads and reloading snapshot preserves per-thread sidebar state", () => {
  const acc = new ThreadStateAccumulator();

  acc.loadSnapshot("thread-A", {
    id: "thread-A", title: "A", subtitle: "", state: "running",
    updatedAt: "2026-03-23T00:00:00.000Z", updatedLabel: "now",
    workspaceRoot: null, entries: [], changeGroups: [],
    progressSummary: [], hasLoadedDetails: true,
  });

  // Thread A gets plan state.
  acc.applyNotification({
    method: "turn/plan/updated",
    params: { threadId: "thread-A", text: "1. Step one\n2. Step two" },
  });

  // Simulate thread reselection / cold-load.
  const delta = acc.loadSnapshot("thread-A", {
    id: "thread-A", title: "A reloaded", subtitle: "", state: "idle",
    updatedAt: "2026-03-23T01:00:00.000Z", updatedLabel: "1h ago",
    workspaceRoot: null,
    entries: [{ id: "u-1", kind: "user", title: "You", body: "Hello" }],
    changeGroups: [], progressSummary: [], hasLoadedDetails: true,
  });

  // Snapshot delta should carry the preserved plan state.
  assert.deepEqual(delta.planState, buildExpectedPlanState({
    expectedOutputSummary: "Expected output: a clear response that covers Step one and Step two.",
    scopeSummary: "This run is scoped to chat-only work. Focus on Step one and Step two.",
    steps: ["Step one", "Step two"],
    text: "1. Step one\n2. Step two",
  }));
  assert.equal(delta.diffState, null);
  assert.equal(delta.inputRequestState, null);

  // Buffer should still have plan state.
  const state = acc.getThreadState("thread-A");
  assert.deepEqual(state.planState, buildExpectedPlanState({
    expectedOutputSummary: "Expected output: a clear response that covers Step one and Step two.",
    scopeSummary: "This run is scoped to chat-only work. Focus on Step one and Step two.",
    steps: ["Step one", "Step two"],
    text: "1. Step one\n2. Step two",
  }));
  // Entries should be from the new snapshot.
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].id, "u-1");
});
