import type { DesktopThreadDelta } from "../../../main/contracts";

export type ThreadDeltaBuffer = {
  clear: () => void;
  queue: (delta: DesktopThreadDelta) => void;
  drain: (threadId: string) => Iterable<DesktopThreadDelta>;
  dropThread: (threadId: string) => void;
  hasKnownThread: (threadId: string) => boolean;
  rememberKnownThreadIds: (threadIds: Iterable<string>) => void;
  setKnownThreadIds: (threadIds: Iterable<string>) => void;
};

export function createThreadDeltaBuffer(): ThreadDeltaBuffer {
  const knownThreadIds = new Set<string>();
  const pendingDeltas = new Map<string, DesktopThreadDelta[]>();

  return {
    clear() {
      knownThreadIds.clear();
      pendingDeltas.clear();
    },
    queue(delta: DesktopThreadDelta) {
      const list = pendingDeltas.get(delta.threadId) ?? [];
      list.push(delta);
      pendingDeltas.set(delta.threadId, list);
    },
    drain(threadId: string) {
      const deltas = pendingDeltas.get(threadId) ?? [];
      pendingDeltas.delete(threadId);
      return deltas;
    },
    dropThread(threadId: string) {
      knownThreadIds.delete(threadId);
      pendingDeltas.delete(threadId);
    },
    hasKnownThread(threadId: string) {
      return knownThreadIds.has(threadId);
    },
    rememberKnownThreadIds(threadIds: Iterable<string>) {
      for (const threadId of threadIds) {
        if (threadId.trim()) {
          knownThreadIds.add(threadId);
        }
      }
    },
    setKnownThreadIds(threadIds: Iterable<string>) {
      knownThreadIds.clear();
      for (const threadId of threadIds) {
        if (threadId.trim()) {
          knownThreadIds.add(threadId);
        }
      }
    },
  };
}
