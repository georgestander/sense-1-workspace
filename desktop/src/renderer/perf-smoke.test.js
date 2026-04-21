import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import {
  buildWorkspaceSidebarGroups,
  toWorkspaceSidebarThreadSummary,
} from "./features/workspace/workspace-sidebar.ts";
import { applyThreadDelta } from "./state/session/session-stream-delta.ts";
import { createThreadDeltaBuffer } from "./state/session/session-stream-buffer.ts";
import { buildDesktopSessionViewState } from "./state/session/session-view-state.ts";

function createEntry(threadIndex, entryIndex) {
  return {
    id: `thread-${threadIndex}-entry-${entryIndex}`,
    kind: entryIndex % 2 === 0 ? "assistant" : "user",
    title: entryIndex % 2 === 0 ? "Sense-1 activity" : "You",
    body: `Entry ${entryIndex} for thread ${threadIndex}`,
    status: entryIndex === 11 ? "completed" : undefined,
  };
}

function createThread(threadIndex, workspaceCount) {
  const workspaceRoot = threadIndex % 5 === 0
    ? null
    : `/workspace-${threadIndex % workspaceCount}`;
  const updatedAt = new Date(Date.UTC(2026, 3, 21, 12, 0, threadIndex)).toISOString();

  return {
    id: `thread-${threadIndex}`,
    title: `Thread ${threadIndex}`,
    subtitle: workspaceRoot ? `workspace-${threadIndex % workspaceCount}` : "Chat",
    state: threadIndex % 7 === 0 ? "running" : "idle",
    interactionState: threadIndex % 11 === 0 ? "review" : "conversation",
    updatedAt,
    updatedLabel: updatedAt,
    workspaceRoot,
    cwd: workspaceRoot,
    threadInputState: threadIndex % 13 === 0
      ? {
          queuedMessages: [
            {
              id: `queued-${threadIndex}`,
              text: "Follow up",
              enqueuedAt: updatedAt,
            },
          ],
          hasUnseenCompletion: false,
          lastCompletionAt: null,
          lastCompletionStatus: null,
        }
      : null,
    entries: Array.from({ length: 12 }, (_, entryIndex) => createEntry(threadIndex, entryIndex)),
    changeGroups: [],
    progressSummary: [],
    reviewSummary: null,
    hasLoadedDetails: true,
  };
}

function createThreads(count, workspaceCount) {
  return Array.from({ length: count }, (_, threadIndex) => createThread(threadIndex + 1, workspaceCount));
}

function createViewFixture() {
  const threads = createThreads(240, 24);
  const selectedThreadId = threads[37].id;
  const pendingApprovals = Array.from({ length: 36 }, (_, index) => ({
    id: index + 1,
    threadId: index % 2 === 0 ? selectedThreadId : threads[index].id,
  }));
  const perThreadSidebar = Object.fromEntries(
    threads.map((thread, index) => [
      thread.id,
      {
        planState: index % 3 === 0 ? { steps: [{ id: `step-${index}`, text: "Plan step", status: "pending" }] } : null,
        diffState: index % 4 === 0 ? { diffs: [{ path: `src/file-${index}.ts`, type: "modified" }] } : null,
        inputRequestState: index % 5 === 0
          ? {
              requestId: index + 1,
              prompt: "Need clarification",
              threadId: thread.id,
              questions: [],
            }
          : null,
      },
    ]),
  );
  const activeTurnIdsByThread = Object.fromEntries(
    threads
      .filter((thread) => thread.state === "running")
      .map((thread) => [thread.id, `turn-${thread.id}`]),
  );

  return {
    activeTurnIdsByThread,
    pendingApprovals,
    perThreadSidebar,
    selectedThreadId,
    taskPending: false,
    threads,
  };
}

function cloneThread(thread) {
  return {
    ...thread,
    entries: thread.entries.map((entry) => ({ ...entry })),
    changeGroups: [...thread.changeGroups],
    progressSummary: [...thread.progressSummary],
    reviewSummary: thread.reviewSummary ? { ...thread.reviewSummary } : null,
    threadInputState: thread.threadInputState
      ? {
          ...thread.threadInputState,
          queuedMessages: thread.threadInputState.queuedMessages.map((message) => ({ ...message })),
        }
      : null,
  };
}

function createDeltaHarness(initialThreads) {
  let threads = initialThreads.map(cloneThread);
  let perThreadSidebar = {};
  let activeTurnIdsByThread = {};
  let streamingEntryBodiesByThread = {};
  const threadDeltaBufferRef = {
    current: createThreadDeltaBuffer(),
  };
  threadDeltaBufferRef.current.rememberKnownThreadIds(threads.map((thread) => thread.id));

  return {
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
          return;
        }

        threadDeltaBufferRef.current.rememberKnownThreadIds(threadIds);
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

function createThreadBurstDeltas(threads) {
  return threads.flatMap((thread, index) => {
    const updatedAt = new Date(Date.UTC(2026, 3, 21, 13, 0, index)).toISOString();
    return [
      {
        kind: "threadStateChanged",
        threadId: thread.id,
        state: index % 2 === 0 ? "running" : "idle",
        updatedAt,
        turnId: index % 2 === 0 ? `turn-${thread.id}` : null,
      },
      {
        kind: "threadMetadataChanged",
        threadId: thread.id,
        title: `${thread.title} updated`,
        updatedAt,
      },
    ];
  });
}

function measureMedianMs(name, iterations, fn) {
  for (let warmupIndex = 0; warmupIndex < 50; warmupIndex += 1) {
    fn();
  }

  const samples = [];
  for (let sampleIndex = 0; sampleIndex < 5; sampleIndex += 1) {
    const startedAt = performance.now();
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      fn();
    }
    samples.push(performance.now() - startedAt);
  }

  samples.sort((left, right) => left - right);
  const medianMs = samples[Math.floor(samples.length / 2)];
  console.info(`[perf-smoke] ${name}: median=${medianMs.toFixed(2)}ms across ${iterations} iterations`);
  return medianMs;
}

function assertWithinBudget(name, elapsedMs, budgetMs) {
  assert.ok(
    elapsedMs <= budgetMs,
    `${name} exceeded budget: ${elapsedMs.toFixed(2)}ms > ${budgetMs.toFixed(2)}ms`,
  );
}

test("renderer session view derivation stays within the local perf budget", () => {
  const fixture = createViewFixture();
  const elapsedMs = measureMedianMs(
    "session-view.build",
    1500,
    () => buildDesktopSessionViewState(fixture),
  );

  assertWithinBudget("session-view.build", elapsedMs, 900);
});

test("renderer sidebar grouping stays within the local perf budget", () => {
  const threads = createThreads(240, 24).map((thread) => toWorkspaceSidebarThreadSummary(thread));
  const elapsedMs = measureMedianMs(
    "workspace-sidebar.groups",
    1200,
    () => buildWorkspaceSidebarGroups({
      threads,
      savedOrder: ["/workspace-3", "/workspace-1", "/workspace-2"],
      activeWorkspaceRoot: "/workspace-3",
    }),
  );

  assertWithinBudget("workspace-sidebar.groups", elapsedMs, 900);
});

test("renderer thread delta bursts stay within the local perf budget", () => {
  const threads = createThreads(120, 12);
  const deltas = createThreadBurstDeltas(threads);
  const elapsedMs = measureMedianMs(
    "session-stream.thread-burst",
    80,
    () => {
      const harness = createDeltaHarness(threads);
      for (const delta of deltas) {
        applyThreadDelta(delta, harness.deps);
      }
    },
  );

  assertWithinBudget("session-stream.thread-burst", elapsedMs, 1250);
});
