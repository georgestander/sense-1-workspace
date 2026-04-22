import { useSyncExternalStore } from "react";

import type { DesktopThreadEntry } from "../../../main/contracts";
import { perfMeasure } from "../../lib/perf-debug.ts";

type ScheduledFlush =
  | {
      id: number;
      kind: "raf";
    }
  | {
      id: ReturnType<typeof setTimeout>;
      kind: "timeout";
    };

type ThreadEntryBodyRecord = {
  body: string;
  pendingAppends: string[];
  pendingBytes: number;
  scheduledFlush: ScheduledFlush | null;
};

type ThreadEntryBodies = Map<string, ThreadEntryBodyRecord>;

const EMPTY_THREAD_ENTRY_BODIES: ThreadEntryBodies = new Map();
const LARGE_STREAMING_BODY_THRESHOLD = 16_000;
const HUGE_STREAMING_BODY_THRESHOLD = 64_000;
const STREAMING_BODY_DEFAULT_FLUSH_MS = 16;
const STREAMING_BODY_LARGE_FLUSH_MS = 48;
const STREAMING_BODY_HUGE_FLUSH_MS = 96;

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

function getOrCreateThreadBodies(threadId: string): ThreadEntryBodies {
  const existingBodies = threadEntryBodies.get(threadId);
  if (existingBodies) {
    return existingBodies;
  }

  const nextBodies = new Map<string, ThreadEntryBodyRecord>();
  threadEntryBodies.set(threadId, nextBodies);
  return nextBodies;
}

function createThreadEntryBodyRecord(body = ""): ThreadEntryBodyRecord {
  return {
    body,
    pendingAppends: [],
    pendingBytes: 0,
    scheduledFlush: null,
  };
}

function resolveBufferedEntryBody(record: ThreadEntryBodyRecord): string {
  if (record.pendingAppends.length === 0) {
    return record.body;
  }

  const append = record.pendingAppends.length === 1
    ? record.pendingAppends[0]
    : record.pendingAppends.join("");
  return record.body + append;
}

export function readStreamingEntryBody(threadId: string, entryId: string): string | null {
  return getThreadBodies(threadId).get(entryId)?.body ?? null;
}

function areThreadBodiesEqual(left: ThreadEntryBodies, right: ThreadEntryBodies): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const [entryId, leftRecord] of left) {
    const rightRecord = right.get(entryId);
    if (!rightRecord || resolveBufferedEntryBody(leftRecord) !== resolveBufferedEntryBody(rightRecord)) {
      return false;
    }
  }
  return true;
}

function cancelScheduledFlush(record: ThreadEntryBodyRecord): void {
  if (!record.scheduledFlush) {
    return;
  }

  if (record.scheduledFlush.kind === "raf" && typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(record.scheduledFlush.id);
  } else {
    clearTimeout(record.scheduledFlush.id);
  }

  record.scheduledFlush = null;
}

function resolveStreamingBodyFlushMs(record: ThreadEntryBodyRecord): number {
  const nextLength = record.body.length + record.pendingBytes;
  if (nextLength >= HUGE_STREAMING_BODY_THRESHOLD) {
    return STREAMING_BODY_HUGE_FLUSH_MS;
  }
  if (nextLength >= LARGE_STREAMING_BODY_THRESHOLD) {
    return STREAMING_BODY_LARGE_FLUSH_MS;
  }
  return STREAMING_BODY_DEFAULT_FLUSH_MS;
}

function flushStreamingEntryBody(threadId: string, entryId: string): void {
  const record = getThreadBodies(threadId).get(entryId);
  if (!record || record.pendingAppends.length === 0) {
    return;
  }

  const pendingAppendCount = record.pendingAppends.length;
  const pendingBytes = record.pendingBytes;
  perfMeasure(
    "session-stream.live-body.flush",
    () => {
      const nextAppend = pendingAppendCount === 1
        ? record.pendingAppends[0]
        : record.pendingAppends.join("");
      record.pendingAppends = [];
      record.pendingBytes = 0;
      record.body += nextAppend;
    },
    {
      logThresholdMs: 16,
      details: () => ({
        bodyLength: record.body.length,
        entryId,
        pendingAppendCount,
        pendingBytes,
        threadId,
      }),
    },
  );

  notifyThreadEntry(threadId, entryId);
}

function scheduleStreamingEntryFlush(threadId: string, entryId: string, record: ThreadEntryBodyRecord): void {
  if (record.scheduledFlush) {
    return;
  }

  const flushDelayMs = resolveStreamingBodyFlushMs(record);
  const flush = () => {
    record.scheduledFlush = null;
    flushStreamingEntryBody(threadId, entryId);
  };

  if (
    flushDelayMs <= STREAMING_BODY_DEFAULT_FLUSH_MS
    && typeof window !== "undefined"
    && typeof window.requestAnimationFrame === "function"
  ) {
    record.scheduledFlush = {
      id: window.requestAnimationFrame(flush),
      kind: "raf",
    };
    return;
  }

  record.scheduledFlush = {
    id: setTimeout(flush, flushDelayMs),
    kind: "timeout",
  };
}

export function appendStreamingEntryBody(threadId: string, entryId: string, append: string): void {
  if (!append) {
    return;
  }

  const threadBodies = getOrCreateThreadBodies(threadId);
  const record = threadBodies.get(entryId) ?? createThreadEntryBodyRecord();
  record.pendingAppends.push(append);
  record.pendingBytes += append.length;
  threadBodies.set(entryId, record);
  scheduleStreamingEntryFlush(threadId, entryId, record);
}

export function clearStreamingEntryBody(threadId: string, entryId: string): void {
  const currentBodies = threadEntryBodies.get(threadId);
  const record = currentBodies?.get(entryId);
  if (!currentBodies || !record) {
    return;
  }

  cancelScheduledFlush(record);
  currentBodies.delete(entryId);
  if (currentBodies.size === 0) {
    threadEntryBodies.delete(threadId);
  }
  notifyThreadEntry(threadId, entryId);
}

export function clearStreamingThreadBodies(threadId: string): void {
  const currentBodies = threadEntryBodies.get(threadId);
  if (!currentBodies) {
    return;
  }

  for (const record of currentBodies.values()) {
    cancelScheduledFlush(record);
  }

  const entryIds = [...currentBodies.keys()];
  threadEntryBodies.delete(threadId);
  notifyThreadEntries(threadId, entryIds);
}

export function seedStreamingThreadBodies(threadId: string, entries: DesktopThreadEntry[]): void {
  const nextBodies: ThreadEntryBodies = new Map();
  for (const entry of entries) {
    if (entry.kind === "assistant" && "status" in entry && entry.status === "streaming" && "body" in entry) {
      nextBodies.set(entry.id, createThreadEntryBodyRecord(entry.body));
    }
  }
  const currentBodies = getThreadBodies(threadId);
  if (nextBodies.size === 0) {
    clearStreamingThreadBodies(threadId);
    return;
  }
  if (areThreadBodiesEqual(currentBodies, nextBodies)) {
    return;
  }

  for (const record of currentBodies.values()) {
    cancelScheduledFlush(record);
  }

  threadEntryBodies.set(threadId, nextBodies);
  const changedEntryIds = new Set([
    ...currentBodies.keys(),
    ...nextBodies.keys(),
  ].filter((entryId) => resolveBufferedEntryBody(currentBodies.get(entryId) ?? createThreadEntryBodyRecord()) !== resolveBufferedEntryBody(nextBodies.get(entryId) ?? createThreadEntryBodyRecord())));
  notifyThreadEntries(threadId, changedEntryIds);
}

export function useStreamingEntryBody(threadId: string, entryId: string): string | null {
  return useSyncExternalStore(
    (listener) => subscribeStreamingEntryBody(threadId, entryId, listener),
    () => readStreamingEntryBody(threadId, entryId),
    () => readStreamingEntryBody(threadId, entryId),
  );
}

export function subscribeStreamingEntryBody(
  threadId: string,
  entryId: string,
  listener: () => void,
): () => void {
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
}
