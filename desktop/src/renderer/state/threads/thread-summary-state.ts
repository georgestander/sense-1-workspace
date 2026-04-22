import type { DesktopBootstrap, DesktopThreadSummary } from "../../../main/contracts";
import { buildChangeGroups, buildProgressSummary, normalizeDesktopSummary } from "../../lib/live-thread-data.js";
import { perfMeasure } from "../../lib/perf-debug.ts";
import { folderDisplayName } from "../session/session-selectors.js";
import { type FolderOption, type ThreadRecord } from "../session/session-types.js";

function sortThreads(threads: ThreadRecord[]): ThreadRecord[] {
  return perfMeasure(
    "thread-summary.sort",
    () => [...threads].sort((left, right) => {
      const updatedDelta = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      if (!Number.isNaN(updatedDelta) && updatedDelta !== 0) {
        return updatedDelta;
      }

      return left.title.localeCompare(right.title);
    }),
    {
      logThresholdMs: 12,
      details: () => ({
        threadCount: threads.length,
      }),
    },
  );
}

function preserveRunningState(existing: ThreadRecord | undefined, nextState: ThreadRecord["state"]): ThreadRecord["state"] {
  return existing?.state === "running" && nextState !== "running"
    ? existing.state
    : nextState;
}

function createThreadRecord(
  summary: ReturnType<typeof normalizeDesktopSummary>,
  existing?: ThreadRecord,
): ThreadRecord {
  const state = preserveRunningState(existing, summary.state);

  return {
    id: summary.id,
    title: summary.title,
    subtitle: summary.subtitle,
    state,
    interactionState: summary.interactionState,
    updatedAt: summary.updatedAt,
    updatedLabel: summary.updatedLabel,
    workspaceRoot: summary.workspaceRoot,
    cwd: summary.cwd,
    threadInputState: summary.threadInputState ?? existing?.threadInputState ?? null,
    entries: existing?.entries ?? [],
    changeGroups: existing?.changeGroups ?? [],
    progressSummary: existing?.progressSummary ?? buildProgressSummary([], state),
    reviewSummary: existing?.reviewSummary ?? null,
    hasLoadedDetails: existing?.hasLoadedDetails ?? false,
  };
}

export function mergeThreadDetails(existing: ThreadRecord | undefined, incoming: ThreadRecord): ThreadRecord {
  if (!existing) {
    return incoming;
  }

  const shouldPreserveLoadedDetails =
    existing.hasLoadedDetails
    && existing.id === incoming.id
    && incoming.hasLoadedDetails !== true;

  if (shouldPreserveLoadedDetails) {
    return {
      ...incoming,
      state: preserveRunningState(existing, incoming.state),
      threadInputState: incoming.threadInputState ?? existing.threadInputState ?? null,
      entries: existing.entries,
      changeGroups: existing.changeGroups,
      progressSummary: existing.progressSummary,
      reviewSummary: incoming.reviewSummary ?? existing.reviewSummary ?? null,
      hasLoadedDetails: true,
    };
  }

  const shouldPreserveLiveDetails =
    existing.hasLoadedDetails && existing.id === incoming.id && existing.state === "running";

  if (!shouldPreserveLiveDetails) {
    return incoming;
  }

  const incomingById = new Set(incoming.entries.map((entry) => entry.id));
  const entries = [
    ...incoming.entries,
    ...existing.entries.filter((entry) => !incomingById.has(entry.id)),
  ];

  return {
    ...incoming,
    state: "running",
    threadInputState: incoming.threadInputState ?? existing.threadInputState ?? null,
    entries,
    changeGroups: buildChangeGroups(entries),
    progressSummary: buildProgressSummary(entries, "running"),
    reviewSummary: incoming.reviewSummary ?? existing.reviewSummary ?? null,
    hasLoadedDetails: true,
  };
}

function upsertThread(current: ThreadRecord[], nextThread: ThreadRecord): ThreadRecord[] {
  return perfMeasure(
    "thread-summary.upsert",
    () => sortThreads([nextThread, ...current.filter((thread) => thread.id !== nextThread.id)]),
    {
      logThresholdMs: 20,
      details: () => ({
        currentCount: current.length,
        nextThreadId: nextThread.id,
        nextUpdatedAt: nextThread.updatedAt,
      }),
    },
  );
}

function mergeThreadSummaries(current: ThreadRecord[], summaries: ThreadRecord[]): ThreadRecord[] {
  return perfMeasure(
    "thread-summary.merge-summaries",
    () => {
      const currentById = new Map(current.map((thread) => [thread.id, thread]));
      const summaryIds = new Set(summaries.map((summary) => summary.id));

      return sortThreads([
        ...summaries.map((summary) => {
          const existing = currentById.get(summary.id);
          return createThreadRecord(summary, existing);
        }),
        ...current.filter((thread) => !summaryIds.has(thread.id)),
      ]);
    },
    {
      logThresholdMs: 20,
      details: () => ({
        currentCount: current.length,
        summaryCount: summaries.length,
      }),
    },
  );
}

export function reconcileThreadSummariesWithBootstrap(
  current: ThreadRecord[],
  summaries: ThreadRecord[],
  options: { pruneMissing?: boolean } = {},
): ThreadRecord[] {
  if (!options.pruneMissing) {
    return mergeThreadSummaries(current, summaries);
  }

  return perfMeasure(
    "thread-summary.reconcile-bootstrap",
    () => {
      const currentById = new Map(current.map((thread) => [thread.id, thread]));
      return sortThreads(
        summaries.map((summary) => createThreadRecord(summary, currentById.get(summary.id))),
      );
    },
    {
      logThresholdMs: 24,
      details: () => ({
        currentCount: current.length,
        pruneMissing: true,
        summaryCount: summaries.length,
      }),
    },
  );
}

function mapThreadSummaries(summaries: DesktopThreadSummary[]): ThreadRecord[] {
  return summaries.map((summary) => createThreadRecord(
    normalizeDesktopSummary(summary, summary.workspaceRoot ?? null, summary.cwd ?? null),
  ));
}

function mapFolderOptions(folders: DesktopBootstrap["recentFolders"]): FolderOption[] {
  return folders.map((folder) => ({
    name: folder.name,
    path: folder.path,
  }));
}

export function reconcileRecentFoldersWithBootstrap(
  current: FolderOption[],
  nextFolders: FolderOption[],
  options: { pruneMissing?: boolean } = {},
): FolderOption[] {
  if (options.pruneMissing) {
    return nextFolders;
  }

  const merged = [...nextFolders];
  for (const folder of current) {
    if (!merged.some((item) => item.path === folder.path)) {
      merged.push(folder);
    }
  }
  return merged;
}

function upsertRecentFolderOptions(current: FolderOption[], folderPath: string): FolderOption[] {
  const trimmedPath = folderPath.trim();
  if (!trimmedPath) {
    return current;
  }

  const nextFolder = {
    path: trimmedPath,
    name: folderDisplayName(trimmedPath),
  };
  const existing = current.filter((folder) => folder.path !== trimmedPath);
  return [nextFolder, ...existing].slice(0, 6);
}

export {
  sortThreads,
  createThreadRecord,
  upsertThread,
  mergeThreadSummaries,
  mapThreadSummaries,
  mapFolderOptions,
  upsertRecentFolderOptions,
};
