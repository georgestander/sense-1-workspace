import { useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { DesktopThreadDelta } from "../../../main/contracts";
import { getDesktopBridge } from "./desktop-bridge.js";
import type { SidebarState, ThreadRecord } from "./session-types.js";
import { applyThreadDelta } from "./session-stream-delta.js";
import { createThreadDeltaBuffer } from "./session-stream-buffer.js";

export { type ThreadDeltaBuffer } from "./session-stream-buffer.js";

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

  function flushPendingThreadDeltas(threadId: string) {
    for (const delta of threadDeltaBufferRef.current.drain(threadId)) {
      applyThreadDelta(delta, {
        cachePendingThreadDelta,
        flushPendingThreadDeltas,
        rememberKnownThreadIds,
        setActiveTurnIdsByThread: deps.setActiveTurnIdsByThread,
        setPerThreadSidebar: deps.setPerThreadSidebar,
        setThreads: deps.setThreads,
        threadDeltaBufferRef,
      });
    }
  }

  useEffect(() => {
    threadDeltaBufferRef.current.setKnownThreadIds(deps.threads.map((thread) => thread.id));
  }, [deps.threads]);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.threads?.onDelta) {
      return;
    }

    const unsubscribe = bridge.threads.onDelta((delta: DesktopThreadDelta) => {
      applyThreadDelta(delta, {
        cachePendingThreadDelta,
        flushPendingThreadDeltas,
        rememberKnownThreadIds,
        setActiveTurnIdsByThread: deps.setActiveTurnIdsByThread,
        setPerThreadSidebar: deps.setPerThreadSidebar,
        setThreads: deps.setThreads,
        threadDeltaBufferRef,
      });
    });

    return () => {
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
