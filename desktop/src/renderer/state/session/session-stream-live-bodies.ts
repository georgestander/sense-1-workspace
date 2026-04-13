import { useSyncExternalStore } from "react";

import type { DesktopThreadEntry } from "../../../main/contracts";

type ThreadEntryBodies = Record<string, string>;

const EMPTY_THREAD_ENTRY_BODIES: ThreadEntryBodies = Object.freeze({});
const threadEntryBodies = new Map<string, ThreadEntryBodies>();
const threadEntryListeners = new Map<string, Map<string, Set<() => void>>>();

function getThreadEntryListeners(threadId: string): Map<string, Set<() => void>> | undefined {
  return threadEntryListeners.get(threadId);
}

function notifyThreadEntry(threadId: string, entryId: string) {
  const entryListeners = getThreadEntryListeners(threadId)?.get(entryId);
  if (!entryListeners) {
    return;
  }
  for (const listener of entryListeners) {
    listener();
  }
}

function notifyThreadEntries(threadId: string, entryIds: Iterable<string>) {
  for (const entryId of entryIds) {
    notifyThreadEntry(threadId, entryId);
  }
}

function getThreadBodies(threadId: string): ThreadEntryBodies {
  return threadEntryBodies.get(threadId) ?? EMPTY_THREAD_ENTRY_BODIES;
}

function getThreadEntryBody(threadId: string, entryId: string): string | null {
  return getThreadBodies(threadId)[entryId] ?? null;
}

function areThreadBodiesEqual(left: ThreadEntryBodies, right: ThreadEntryBodies): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}

export function appendStreamingEntryBody(threadId: string, entryId: string, append: string): void {
  if (!append) {
    return;
  }
  const currentBodies = getThreadBodies(threadId);
  const nextBodies = {
    ...currentBodies,
    [entryId]: `${currentBodies[entryId] ?? ""}${append}`,
  };
  if (areThreadBodiesEqual(currentBodies, nextBodies)) {
    return;
  }
  threadEntryBodies.set(threadId, nextBodies);
  notifyThreadEntry(threadId, entryId);
}

export function clearStreamingEntryBody(threadId: string, entryId: string): void {
  const currentBodies = getThreadBodies(threadId);
  if (!(entryId in currentBodies)) {
    return;
  }
  const { [entryId]: _ignored, ...remainingBodies } = currentBodies;
  if (Object.keys(remainingBodies).length === 0) {
    threadEntryBodies.delete(threadId);
  } else {
    threadEntryBodies.set(threadId, remainingBodies);
  }
  notifyThreadEntry(threadId, entryId);
}

export function clearStreamingThreadBodies(threadId: string): void {
  const currentBodies = threadEntryBodies.get(threadId);
  if (!currentBodies) {
    return;
  }
  threadEntryBodies.delete(threadId);
  notifyThreadEntries(threadId, Object.keys(currentBodies));
}

export function seedStreamingThreadBodies(threadId: string, entries: DesktopThreadEntry[]): void {
  const nextBodies: ThreadEntryBodies = {};
  for (const entry of entries) {
    if (entry.kind === "assistant" && "status" in entry && entry.status === "streaming" && "body" in entry) {
      nextBodies[entry.id] = entry.body;
    }
  }
  const currentBodies = getThreadBodies(threadId);
  if (Object.keys(nextBodies).length === 0) {
    clearStreamingThreadBodies(threadId);
    return;
  }
  if (areThreadBodiesEqual(currentBodies, nextBodies)) {
    return;
  }
  threadEntryBodies.set(threadId, nextBodies);
  const changedEntryIds = new Set([
    ...Object.keys(currentBodies),
    ...Object.keys(nextBodies),
  ].filter((entryId) => currentBodies[entryId] !== nextBodies[entryId]));
  notifyThreadEntries(threadId, changedEntryIds);
}

export function useStreamingEntryBody(threadId: string, entryId: string): string | null {
  return useSyncExternalStore(
    (listener) => {
      const entryListenersByThread = threadEntryListeners.get(threadId) ?? new Map<string, Set<() => void>>();
      const entryListeners = entryListenersByThread.get(entryId) ?? new Set<() => void>();
      entryListeners.add(listener);
      entryListenersByThread.set(entryId, entryListeners);
      threadEntryListeners.set(threadId, entryListenersByThread);
      return () => {
        const currentEntryListenersByThread = threadEntryListeners.get(threadId);
        const currentEntryListeners = currentEntryListenersByThread?.get(entryId);
        if (!currentEntryListenersByThread || !currentEntryListeners) {
          return;
        }
        currentEntryListeners.delete(listener);
        if (currentEntryListeners.size === 0) {
          currentEntryListenersByThread.delete(entryId);
        }
        if (currentEntryListenersByThread.size === 0) {
          threadEntryListeners.delete(threadId);
        }
      };
    },
    () => getThreadEntryBody(threadId, entryId),
    () => getThreadEntryBody(threadId, entryId),
  );
}
