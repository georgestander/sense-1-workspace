import { useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { DesktopThreadDelta } from "../../../main/contracts";
import { perfCount, perfMeasure } from "../../lib/perf-debug.ts";
import { getDesktopBridge } from "./desktop-bridge.js";
import {
  appendStreamingEntryBody,
  clearStreamingEntryBody,
  clearStreamingThreadBodies,
  seedStreamingThreadBodies,
} from "./session-stream-live-bodies.ts";
import type { SidebarState, ThreadRecord } from "./session-types.js";
import { coalesceThreadDeltas, STREAM_DELTA_FLUSH_MS } from "./session-stream-coalescer.ts";
import { applyThreadDelta } from "./session-stream-delta.js";
import { createThreadDeltaBuffer } from "./session-stream-buffer.js";

export { type ThreadDeltaBuffer } from "./session-stream-buffer.js";

function summarizeDeltaKinds(deltas: DesktopThreadDelta[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const delta of deltas) {
    counts[delta.kind] = (counts[delta.kind] ?? 0) + 1;
  }
  return counts;
}

export function installSessionStream(
  deps: {
    selectedProfileId: string;
    selectedThreadIdRef: MutableRefObject<string | null>;
    threads: ThreadRecord[];
    setActiveTurnIdsByThread: Dispatch<SetStateAction<Record<string, string>>>;
    setPerThreadSidebar: Dispatch<SetStateAction<Record<string, SidebarState>>>;
    setThreads: Dispatch<SetStateAction<ThreadRecord[]>>;
  },
) {
  const threadDeltaBufferRef = useRef(createThreadDeltaBuffer());
  const queuedDeltasRef = useRef<DesktopThreadDelta[]>([]);
  const scheduledFlushRef = useRef<number | ReturnType<typeof setTimeout> | null>(null);

  function rememberKnownThreadIds(threadIds: Iterable<string>, options: { replace?: boolean } = {}) {
    if (options.replace) {
      threadDeltaBufferRef.current.setKnownThreadIds(threadIds);
      return;
    }

    threadDeltaBufferRef.current.rememberKnownThreadIds(threadIds);
  }

  function cachePendingThreadDelta(delta: DesktopThreadDelta) {
    threadDeltaBufferRef.current.queue(delta);
  }

  function applyDelta(delta: DesktopThreadDelta) {
    perfMeasure(
      "session-stream.apply-delta",
      () => {
        applyThreadDelta(delta, {
          appendStreamingEntryBody,
          cachePendingThreadDelta,
          clearStreamingEntryBody,
          clearStreamingThreadBodies,
          flushPendingThreadDeltas,
          rememberKnownThreadIds,
          seedStreamingThreadBodies,
          setActiveTurnIdsByThread: deps.setActiveTurnIdsByThread,
          setPerThreadSidebar: deps.setPerThreadSidebar,
          setThreads: deps.setThreads,
          threadDeltaBufferRef,
        });
      },
      {
        logThresholdMs: 16,
        details: () => ({
          deltaKind: delta.kind,
          threadId: delta.threadId,
        }),
      },
    );
  }

  function flushQueuedDeltas() {
    if (scheduledFlushRef.current !== null) {
      if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function" && typeof scheduledFlushRef.current === "number") {
        window.cancelAnimationFrame(scheduledFlushRef.current);
      } else {
        clearTimeout(scheduledFlushRef.current);
      }
      scheduledFlushRef.current = null;
    }

    if (queuedDeltasRef.current.length === 0) {
      return;
    }

    const queuedDeltas = queuedDeltasRef.current;
    queuedDeltasRef.current = [];
    const coalescedDeltas = coalesceThreadDeltas(queuedDeltas);

    perfMeasure(
      "session-stream.flush",
      () => {
        for (const delta of coalescedDeltas) {
          applyDelta(delta);
        }
      },
      {
        logThresholdMs: 24,
        details: () => ({
          coalescedKinds: summarizeDeltaKinds(coalescedDeltas),
          coalescedCount: coalescedDeltas.length,
          queuedCount: queuedDeltas.length,
          queuedKinds: summarizeDeltaKinds(queuedDeltas),
        }),
      },
    );
  }

  function scheduleQueuedDeltaFlush() {
    if (scheduledFlushRef.current !== null) {
      return;
    }

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      scheduledFlushRef.current = window.requestAnimationFrame(() => {
        scheduledFlushRef.current = null;
        flushQueuedDeltas();
      });
      return;
    }

    scheduledFlushRef.current = setTimeout(() => {
      scheduledFlushRef.current = null;
      flushQueuedDeltas();
    }, STREAM_DELTA_FLUSH_MS);
  }

  function flushPendingThreadDeltas(threadId: string) {
    for (const delta of threadDeltaBufferRef.current.drain(threadId)) {
      applyDelta(delta);
    }
  }

  useEffect(() => {
    perfMeasure(
      "session-stream.known-thread-sync",
      () => {
        perfCount("session-stream.known-thread-sync.calls");
        threadDeltaBufferRef.current.setKnownThreadIds(deps.threads.map((thread) => thread.id));
      },
      {
        logThresholdMs: 16,
        details: () => ({
          threadCount: deps.threads.length,
        }),
      },
    );
  }, [deps.threads]);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.threads?.onDelta) {
      return;
    }

    const unsubscribe = bridge.threads.onDelta((delta: DesktopThreadDelta) => {
      perfCount(`session-stream.delta.${delta.kind}`);
      queuedDeltasRef.current.push(delta);
      scheduleQueuedDeltaFlush();
    });

    return () => {
      flushQueuedDeltas();
      unsubscribe();
    };
  }, [
    deps.setActiveTurnIdsByThread,
    deps.setPerThreadSidebar,
    deps.setThreads,
    deps.selectedProfileId,
  ]);

  return {
    flushPendingThreadDeltas,
    rememberKnownThreadIds,
    threadDeltaBufferRef,
  };
}
