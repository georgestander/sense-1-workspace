import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { DesktopThreadDelta, DesktopThreadEntry } from "../../../main/contracts";
import { buildChangeGroups, buildProgressSummary, formatUpdatedLabel } from "../../lib/live-thread-data.js";
import { createThreadRecord, upsertThread } from "../threads/thread-summary-state.js";
import type { SidebarState, ThreadRecord } from "./session-types.js";
import type { ThreadDeltaBuffer } from "./session-stream-buffer.js";

type ApplyThreadDeltaDeps = {
  cachePendingThreadDelta: (delta: DesktopThreadDelta) => void;
  flushPendingThreadDeltas: (threadId: string) => void;
  rememberKnownThreadIds: (threadIds: Iterable<string>, options?: { replace?: boolean }) => void;
  setActiveTurnIdsByThread: Dispatch<SetStateAction<Record<string, string>>>;
  setPerThreadSidebar: Dispatch<SetStateAction<Record<string, SidebarState>>>;
  setThreads: Dispatch<SetStateAction<ThreadRecord[]>>;
  threadDeltaBufferRef: MutableRefObject<ThreadDeltaBuffer>;
};

export function applyThreadDelta(
  delta: DesktopThreadDelta,
  deps: ApplyThreadDeltaDeps,
) {
  if (delta.kind === "snapshot") {
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
    deps.setThreads((current) => {
      const thread = current.find((t) => t.id === delta.threadId);
      if (!thread) {
        return current;
      }
      const entries = thread.entries.map((entry) => {
        if (entry.id !== delta.entryId) {
          return entry;
        }
        if ("body" in entry) {
          return { ...entry, body: entry.body + delta.append };
        }
        return entry;
      });
      if (!entries.some((e) => e.id === delta.entryId)) {
        entries.push({
          id: delta.entryId,
          kind: "assistant" as const,
          title: "Sense-1 activity",
          body: delta.append,
          status: "streaming",
        });
      }
      return upsertThread(current, {
        ...thread,
        entries,
      });
    });
    return;
  }

  if (delta.kind === "entryStarted") {
    deps.setThreads((current) => {
      const thread = current.find((t) => t.id === delta.threadId);
      if (!thread) {
        return current;
      }
      const entries = thread.entries.some((e) => e.id === delta.entry.id)
        ? thread.entries.map((e) => (e.id === delta.entry.id ? delta.entry : e))
        : [...thread.entries, delta.entry];
      const updatedAt = new Date().toISOString();
      return upsertThread(current, {
        ...thread,
        entries,
        changeGroups: buildChangeGroups(entries),
        progressSummary: buildProgressSummary(entries, thread.state),
        updatedAt,
        updatedLabel: formatUpdatedLabel(updatedAt),
      });
    });
    return;
  }

  if (delta.kind === "entryCompleted") {
    deps.setThreads((current) => {
      const thread = current.find((t) => t.id === delta.threadId);
      if (!thread) {
        return current;
      }
      const entries = thread.entries.some((e) => e.id === delta.entryId)
        ? thread.entries.map((e) => (e.id === delta.entryId ? delta.entry : e))
        : [...thread.entries, delta.entry];
      const updatedAt =
        "status" in delta.entry && delta.entry.status === "streaming"
          ? thread.updatedAt
          : new Date().toISOString();
      return upsertThread(current, {
        ...thread,
        entries,
        changeGroups: buildChangeGroups(entries),
        progressSummary: buildProgressSummary(entries, thread.state),
        updatedAt,
        updatedLabel: formatUpdatedLabel(updatedAt),
      });
    });
    return;
  }

  if (delta.kind === "threadStateChanged") {
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
      const thread = current.find((t) => t.id === delta.threadId);
      if (!thread) {
        return current;
      }
      return upsertThread(current, {
        ...thread,
        interactionState: delta.interactionState,
        updatedAt: delta.updatedAt,
        updatedLabel: formatUpdatedLabel(delta.updatedAt),
      });
    });
    return;
  }

  if (delta.kind === "threadMetadataChanged") {
    deps.setThreads((current) => {
      const thread = current.find((t) => t.id === delta.threadId);
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
      const thread = current.find((item) => item.id === delta.threadId);
      if (!thread) {
        return current;
      }

      return upsertThread(current, {
        ...thread,
        updatedAt: delta.updatedAt,
        updatedLabel: formatUpdatedLabel(delta.updatedAt),
        threadInputState: delta.threadInputState,
      });
    });
  }
}
