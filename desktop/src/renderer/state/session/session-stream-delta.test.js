import test from "node:test";
import assert from "node:assert/strict";

import { applyThreadDelta } from "./session-stream-delta.ts";
import { createThreadDeltaBuffer } from "./session-stream-buffer.ts";

function createThread(overrides = {}) {
  return {
    id: "thread-1",
    title: "Thread",
    subtitle: "Chat",
    state: "idle",
    interactionState: "conversation",
    updatedAt: "2026-04-08T10:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: null,
    cwd: null,
    threadInputState: null,
    entries: [],
    changeGroups: [],
    progressSummary: [],
    reviewSummary: null,
    hasLoadedDetails: true,
    ...overrides,
  };
}

function createDeps(initialThreads) {
  let threads = initialThreads;
  let perThreadSidebar = {};
  let activeTurnIdsByThread = {};
  let streamingEntryBodiesByThread = {};
  const threadDeltaBufferRef = {
    current: createThreadDeltaBuffer(),
  };
  threadDeltaBufferRef.current.rememberKnownThreadIds(initialThreads.map((thread) => thread.id));

  return {
    getState() {
      return {
        threads,
        perThreadSidebar,
        activeTurnIdsByThread,
        streamingEntryBodiesByThread,
      };
    },
    deps: {
      appendStreamingEntryBody(threadId, entryId, append) {
        const currentThreadBodies = streamingEntryBodiesByThread[threadId] ?? {};
        streamingEntryBodiesByThread = {
          ...streamingEntryBodiesByThread,
          [threadId]: {
            ...currentThreadBodies,
            [entryId]: `${currentThreadBodies[entryId] ?? ""}${append}`,
          },
        };
      },
      cachePendingThreadDelta(delta) {
        threadDeltaBufferRef.current.queue(delta);
      },
      clearStreamingEntryBody(threadId, entryId) {
        const currentThreadBodies = streamingEntryBodiesByThread[threadId] ?? {};
        if (!(entryId in currentThreadBodies)) {
          return;
        }
        const { [entryId]: _ignored, ...remainingBodies } = currentThreadBodies;
        streamingEntryBodiesByThread = {
          ...streamingEntryBodiesByThread,
          [threadId]: remainingBodies,
        };
      },
      clearStreamingThreadBodies(threadId) {
        const { [threadId]: _ignored, ...remainingThreads } = streamingEntryBodiesByThread;
        streamingEntryBodiesByThread = remainingThreads;
      },
      flushPendingThreadDeltas(threadId) {
        for (const pendingDelta of threadDeltaBufferRef.current.drain(threadId)) {
          applyThreadDelta(pendingDelta, this);
        }
      },
      rememberKnownThreadIds(threadIds, options = {}) {
        if (options.replace) {
          threadDeltaBufferRef.current.setKnownThreadIds(threadIds);
        } else {
          threadDeltaBufferRef.current.rememberKnownThreadIds(threadIds);
        }
      },
      seedStreamingThreadBodies(threadId, entries) {
        const nextBodies = Object.fromEntries(
          entries
            .filter((entry) => entry.kind === "assistant" && "status" in entry && entry.status === "streaming" && "body" in entry)
            .map((entry) => [entry.id, entry.body]),
        );
        streamingEntryBodiesByThread = {
          ...streamingEntryBodiesByThread,
          [threadId]: nextBodies,
        };
      },
      setActiveTurnIdsByThread(updater) {
        activeTurnIdsByThread = typeof updater === "function" ? updater(activeTurnIdsByThread) : updater;
      },
      setPerThreadSidebar(updater) {
        perThreadSidebar = typeof updater === "function" ? updater(perThreadSidebar) : updater;
      },
      setThreads(updater) {
        threads = typeof updater === "function" ? updater(threads) : updater;
      },
      threadDeltaBufferRef,
    },
  };
}

test("applyThreadDelta updates threadInputState without refreshing recency metadata", () => {
  const harness = createDeps([
    createThread({
      id: "thread-1",
      title: "Older thread",
      updatedAt: "2026-04-08T10:00:00.000Z",
      updatedLabel: "10 min ago",
    }),
    createThread({
      id: "thread-2",
      title: "Newer thread",
      updatedAt: "2026-04-08T11:00:00.000Z",
      updatedLabel: "5 min ago",
    }),
  ]);

  applyThreadDelta(
    {
      kind: "threadInputStateChanged",
      threadId: "thread-1",
      updatedAt: "2026-04-08T12:00:00.000Z",
      threadInputState: {
        queuedMessages: [
          {
            id: "queued-1",
            text: "Follow-up",
            enqueuedAt: "2026-04-08T11:59:00.000Z",
          },
        ],
        hasUnseenCompletion: true,
        lastCompletionAt: "2026-04-08T12:00:00.000Z",
        lastCompletionStatus: "completed",
      },
    },
    harness.deps,
  );

  const [thread] = harness.getState().threads;
  assert.equal(thread.threadInputState?.queuedMessages.length, 1);
  assert.equal(thread.threadInputState?.hasUnseenCompletion, true);
  assert.equal(thread.updatedAt, "2026-04-08T10:00:00.000Z");
  assert.equal(thread.updatedLabel, "10 min ago");
  assert.deepEqual(harness.getState().threads.map((currentThread) => currentThread.id), ["thread-1", "thread-2"]);
});

test("applyThreadDelta keeps updated labels in sync for thread state changes", () => {
  const harness = createDeps([createThread()]);

  applyThreadDelta(
    {
      kind: "threadStateChanged",
      threadId: "thread-1",
      state: "running",
      updatedAt: "2026-04-08T12:30:00.000Z",
      turnId: "turn-1",
    },
    harness.deps,
  );

  const [thread] = harness.getState().threads;
  assert.equal(thread.state, "running");
  assert.notEqual(thread.updatedLabel, "just now");
  assert.equal(harness.getState().activeTurnIdsByThread["thread-1"], "turn-1");
});

test("applyThreadDelta appends streaming entry text without bumping recency metadata", () => {
  const initialThread = createThread({
    entries: [
      {
        id: "entry-1",
        kind: "assistant",
        title: "Sense-1 activity",
        body: "Hello",
        status: "streaming",
      },
    ],
    updatedAt: "2026-04-08T10:00:00.000Z",
    updatedLabel: "10 min ago",
  });
  const harness = createDeps([initialThread]);

  applyThreadDelta(
    {
      kind: "entryDelta",
      threadId: "thread-1",
      entryId: "entry-1",
      append: " world",
    },
    harness.deps,
  );

  const [thread] = harness.getState().threads;
  assert.equal(thread.entries[0]?.body, "Hello");
  assert.equal(harness.getState().streamingEntryBodiesByThread["thread-1"]?.["entry-1"], " world");
  assert.equal(thread.updatedAt, "2026-04-08T10:00:00.000Z");
  assert.equal(thread.updatedLabel, "10 min ago");
});

test("applyThreadDelta keeps thread ordering stable for streaming entry appends", () => {
  const harness = createDeps([
    createThread({
      id: "thread-1",
      title: "Older running thread",
      updatedAt: "2026-04-08T10:00:00.000Z",
      entries: [
        {
          id: "entry-1",
          kind: "assistant",
          title: "Sense-1 activity",
          body: "Hello",
          status: "streaming",
        },
      ],
    }),
    createThread({
      id: "thread-2",
      title: "Newer idle thread",
      updatedAt: "2026-04-08T11:00:00.000Z",
    }),
  ]);

  applyThreadDelta(
    {
      kind: "entryDelta",
      threadId: "thread-1",
      entryId: "entry-1",
      append: " world",
    },
    harness.deps,
  );

  const { threads } = harness.getState();
  assert.deepEqual(threads.map((thread) => thread.id), ["thread-1", "thread-2"]);
  assert.equal(threads[0].entries[0]?.body, "Hello");
  assert.equal(harness.getState().streamingEntryBodiesByThread["thread-1"]?.["entry-1"], " world");
});

test("applyThreadDelta keeps thread ordering stable when a streaming entry starts", () => {
  const harness = createDeps([
    createThread({
      id: "thread-1",
      title: "Older running thread",
      updatedAt: "2026-04-08T10:00:00.000Z",
      updatedLabel: "10 min ago",
    }),
    createThread({
      id: "thread-2",
      title: "Newer idle thread",
      updatedAt: "2026-04-08T11:00:00.000Z",
      updatedLabel: "5 min ago",
    }),
  ]);

  applyThreadDelta(
    {
      kind: "entryStarted",
      threadId: "thread-1",
      entry: {
        id: "entry-1",
        kind: "assistant",
        title: "Sense-1 activity",
        body: "Hello",
        status: "streaming",
      },
      updatedAt: "2026-04-08T12:00:00.000Z",
    },
    harness.deps,
  );

  const [thread] = harness.getState().threads;
  assert.deepEqual(harness.getState().threads.map((currentThread) => currentThread.id), ["thread-1", "thread-2"]);
  assert.equal(thread.entries[0]?.id, "entry-1");
  assert.equal(thread.updatedAt, "2026-04-08T10:00:00.000Z");
  assert.equal(thread.updatedLabel, "10 min ago");
});

test("applyThreadDelta clears streaming body overlays once an entry completes", () => {
  const initialThread = createThread({
    entries: [
      {
        id: "entry-1",
        kind: "assistant",
        title: "Sense-1 activity",
        body: "Hello",
        status: "streaming",
      },
    ],
  });
  const harness = createDeps([initialThread]);

  applyThreadDelta(
    {
      kind: "entryDelta",
      threadId: "thread-1",
      entryId: "entry-1",
      append: " world",
    },
    harness.deps,
  );

  applyThreadDelta(
    {
      kind: "entryCompleted",
      threadId: "thread-1",
      entryId: "entry-1",
      entry: {
        id: "entry-1",
        kind: "assistant",
        title: "Sense-1 activity",
        body: "Hello world",
        status: "completed",
      },
    },
    harness.deps,
  );

  const [thread] = harness.getState().threads;
  assert.equal(thread.entries[0]?.body, "Hello world");
  assert.deepEqual(harness.getState().streamingEntryBodiesByThread["thread-1"], {});
  assert.equal(thread.updatedAt, "2026-04-08T10:00:00.000Z");
  assert.equal(thread.updatedLabel, "just now");
});

test("applyThreadDelta keeps thread ordering stable for interaction and metadata updates", () => {
  const harness = createDeps([
    createThread({
      id: "thread-1",
      title: "Older thread",
      updatedAt: "2026-04-08T10:00:00.000Z",
      updatedLabel: "10 min ago",
      interactionState: "conversation",
    }),
    createThread({
      id: "thread-2",
      title: "Newer thread",
      updatedAt: "2026-04-08T11:00:00.000Z",
      updatedLabel: "5 min ago",
    }),
  ]);

  applyThreadDelta(
    {
      kind: "interactionStateChanged",
      threadId: "thread-1",
      interactionState: "review",
      updatedAt: "2026-04-08T12:00:00.000Z",
    },
    harness.deps,
  );

  applyThreadDelta(
    {
      kind: "threadMetadataChanged",
      threadId: "thread-1",
      title: "Renamed thread",
      updatedAt: "2026-04-08T12:30:00.000Z",
    },
    harness.deps,
  );

  const [thread] = harness.getState().threads;
  assert.deepEqual(harness.getState().threads.map((currentThread) => currentThread.id), ["thread-1", "thread-2"]);
  assert.equal(thread.interactionState, "review");
  assert.equal(thread.title, "Renamed thread");
  assert.equal(thread.updatedAt, "2026-04-08T10:00:00.000Z");
  assert.equal(thread.updatedLabel, "10 min ago");
});
