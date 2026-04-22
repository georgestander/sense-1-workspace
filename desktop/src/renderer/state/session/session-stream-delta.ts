import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { DesktopThreadDelta, DesktopThreadEntry } from "../../../main/contracts";
import { buildChangeGroups, buildProgressSummary, formatUpdatedLabel } from "../../lib/live-thread-data.js";
import { createThreadRecord, upsertThread } from "../threads/thread-summary-state.js";
import type { SidebarState, ThreadRecord } from "./session-types.js";
import type { ThreadDeltaBuffer } from "./session-stream-buffer.js";

type ApplyThreadDeltaDeps = {
  appendStreamingEntryBody: (threadId: string, entryId: string, append: string) => void;
  cachePendingThreadDelta: (delta: DesktopThreadDelta) => void;
  clearStreamingEntryBody: (threadId: string, entryId: string) => void;
  clearStreamingThreadBodies: (threadId: string) => void;
  flushPendingThreadDeltas: (threadId: string) => void;
  rememberKnownThreadIds: (threadIds: Iterable<string>, options?: { replace?: boolean }) => void;
  seedStreamingThreadBodies: (threadId: string, entries: DesktopThreadEntry[]) => void;
  setActiveTurnIdsByThread: Dispatch<SetStateAction<Record<string, string>>>;
  setPerThreadSidebar: Dispatch<SetStateAction<Record<string, SidebarState>>>;
  setThreads: Dispatch<SetStateAction<ThreadRecord[]>>;
  threadDeltaBufferRef: MutableRefObject<ThreadDeltaBuffer>;
};

function replaceThreadWithoutReordering(
  threads: ThreadRecord[],
  threadId: string,
  buildNextThread: (thread: ThreadRecord) => ThreadRecord,
): ThreadRecord[] {
  const threadIndex = threads.findIndex((thread) => thread.id === threadId);
  if (threadIndex === -1) {
    return threads;
  }

  const nextThread = buildNextThread(threads[threadIndex]);
  if (nextThread === threads[threadIndex]) {
    return threads;
  }

  const nextThreads = [...threads];
  nextThreads[threadIndex] = nextThread;
  return nextThreads;
}

export function applyThreadDelta(
  delta: DesktopThreadDelta,
  deps: ApplyThreadDeltaDeps,
) {
  if (delta.kind === "snapshot") {
    deps.seedStreamingThreadBodies(delta.threadId, delta.entries as DesktopThreadEntry[]);
    deps.rememberKnownThreadIds([delta.threadId]);
    deps.setThreads((current) => {
      const thread = current.find((t) => t.id === delta.threadId);
      const entries = delta.entries as DesktopThreadEntry[];
      const nextThread = {
        ...(thread ?? createThreadRecord({
          id: delta.threadId,
          title: delta.title,
          subtitle: delta.subtitle,
          state: delta.state,
          interactionState: delta.interactionState,
          updatedAt: delta.updatedAt,
          updatedLabel: formatUpdatedLabel(delta.updatedAt),
          workspaceRoot: delta.workspaceRoot,
          cwd: delta.cwd,
        })),
        entries,
        state: delta.state,
        interactionState: delta.interactionState,
        title: delta.title,
        subtitle: delta.subtitle,
        updatedAt: delta.updatedAt,
        workspaceRoot: delta.workspaceRoot,
        cwd: delta.cwd,
        changeGroups: buildChangeGroups(entries),
        progressSummary: buildProgressSummary(entries, delta.state),
        reviewSummary: delta.reviewSummary ?? null,
        threadInputState: "threadInputState" in delta ? (delta.threadInputState ?? null) : (thread?.threadInputState ?? null),
        updatedLabel: formatUpdatedLabel(delta.updatedAt),
        hasLoadedDetails: true,
      };
      return upsertThread(current, nextThread);
    });
    deps.setPerThreadSidebar((prev) => ({
      ...prev,
      [delta.threadId]: {
        planState: "planState" in delta ? (delta.planState ?? null) : (prev[delta.threadId]?.planState ?? null),
        diffState: "diffState" in delta ? (delta.diffState ?? null) : (prev[delta.threadId]?.diffState ?? null),
        inputRequestState: "inputRequestState" in delta ? (delta.inputRequestState ?? null) : (prev[delta.threadId]?.inputRequestState ?? null),
      },
    }));
    deps.flushPendingThreadDeltas(delta.threadId);
    return;
  }

  if (!deps.threadDeltaBufferRef.current.hasKnownThread(delta.threadId)) {
    deps.cachePendingThreadDelta(delta);
    return;
  }

  if (delta.kind === "entryDelta") {
    deps.appendStreamingEntryBody(delta.threadId, delta.entryId, delta.append);
    return;
  }

  if (delta.kind === "entryStarted") {
    deps.setThreads((current) => {
      return replaceThreadWithoutReordering(current, delta.threadId, (thread) => {
        const entries = thread.entries.some((entry) => entry.id === delta.entry.id)
          ? thread.entries.map((entry) => (entry.id === delta.entry.id ? delta.entry : entry))
          : [...thread.entries, delta.entry];

        return {
          ...thread,
          entries,
          changeGroups: buildChangeGroups(entries),
          progressSummary: buildProgressSummary(entries, thread.state),
        };
      });
    });
    return;
  }

  if (delta.kind === "entryCompleted") {
    deps.clearStreamingEntryBody(delta.threadId, delta.entryId);
    deps.setThreads((current) => {
      return replaceThreadWithoutReordering(current, delta.threadId, (thread) => {
        const entries = thread.entries.some((entry) => entry.id === delta.entryId)
          ? thread.entries.map((entry) => (entry.id === delta.entryId ? delta.entry : entry))
          : [...thread.entries, delta.entry];

        return {
          ...thread,
          entries,
          changeGroups: buildChangeGroups(entries),
          progressSummary: buildProgressSummary(entries, thread.state),
        };
      });
    });
    return;
  }

  if (delta.kind === "threadStateChanged") {
    if (delta.state !== "running") {
      deps.clearStreamingThreadBodies(delta.threadId);
    }
    const activeTurnId = typeof delta.turnId === "string" && delta.turnId.trim().length > 0
      ? delta.turnId
      : null;
    if (delta.state === "running" && activeTurnId) {
      deps.setActiveTurnIdsByThread((current) => ({
        ...current,
        [delta.threadId]: activeTurnId,
      }));
    } else if (delta.state !== "running") {
      deps.setActiveTurnIdsByThread((current) => {
        if (!(delta.threadId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[delta.threadId];
        return next;
      });
    }
    deps.setThreads((current) => {
      const thread = current.find((t) => t.id === delta.threadId);
      if (!thread) {
        return current;
      }
      return upsertThread(current, {
        ...thread,
        state: delta.state,
        updatedAt: delta.updatedAt,
        updatedLabel: formatUpdatedLabel(delta.updatedAt),
        progressSummary: buildProgressSummary(thread.entries, delta.state),
      });
    });
    return;
  }

  if (delta.kind === "interactionStateChanged") {
    deps.setThreads((current) => {
      return replaceThreadWithoutReordering(current, delta.threadId, (thread) => ({
        ...thread,
        interactionState: delta.interactionState,
      }));
    });
    return;
  }

  if (delta.kind === "threadMetadataChanged") {
    deps.setThreads((current) => {
      const thread = current.find((candidate) => candidate.id === delta.threadId);
      if (!thread) {
        return current;
      }
      return upsertThread(current, {
        ...thread,
        title: delta.title,
        updatedAt: delta.updatedAt,
        updatedLabel: formatUpdatedLabel(delta.updatedAt),
      });
    });
    return;
  }

  if (delta.kind === "reviewSummaryUpdated") {
    deps.setThreads((current) =>
      current.map((thread) => (
        thread.id === delta.threadId
          ? { ...thread, reviewSummary: delta.reviewSummary ?? null }
          : thread
      )),
    );
    return;
  }

  if (delta.kind === "planUpdated") {
    deps.setPerThreadSidebar((prev) => ({
      ...prev,
      [delta.threadId]: {
        ...(prev[delta.threadId] || { planState: null, diffState: null, inputRequestState: null }),
        planState: delta.planState,
      },
    }));
    return;
  }

  if (delta.kind === "diffUpdated") {
    deps.setPerThreadSidebar((prev) => ({
      ...prev,
      [delta.threadId]: {
        ...(prev[delta.threadId] || { planState: null, diffState: null, inputRequestState: null }),
        diffState: { diffs: delta.diffs },
      },
    }));
    deps.setThreads((current) =>
      current.map((thread) => {
        if (thread.id !== delta.threadId) {
          return thread;
        }

        return {
          ...thread,
          changeGroups: buildChangeGroups(thread.entries, delta.diffs),
          progressSummary: buildProgressSummary(thread.entries, thread.state, delta.diffs),
        };
      }),
    );
    return;
  }

  if (delta.kind === "inputRequested") {
    deps.setPerThreadSidebar((prev) => ({
      ...prev,
      [delta.threadId]: {
        ...(prev[delta.threadId] || { planState: null, diffState: null, inputRequestState: null }),
        inputRequestState: {
          requestId: delta.requestId,
          prompt: delta.prompt,
          threadId: delta.threadId,
          questions: delta.questions,
        },
      },
    }));
    return;
  }

  if (delta.kind === "threadInputStateChanged") {
    deps.setThreads((current) => {
      return replaceThreadWithoutReordering(current, delta.threadId, (thread) => ({
        ...thread,
        threadInputState: delta.threadInputState,
      }));
    });
  }
}
