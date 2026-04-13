import fs, { type FSWatcher } from "node:fs";
import path from "node:path";

type WatchRecord = {
  paths: Set<string>;
  watcher: FSWatcher;
};

function firstString(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

export class WorkspaceFileActivityTracker {
  #watchersByThreadId = new Map<string, WatchRecord>();

  start(threadId: string | null | undefined, workspaceRoot: string | null | undefined): void {
    const resolvedThreadId = firstString(threadId);
    const resolvedWorkspaceRoot = firstString(workspaceRoot);
    if (!resolvedThreadId || !resolvedWorkspaceRoot) {
      return;
    }

    this.stop(resolvedThreadId);

    const paths = new Set<string>();
    try {
      const watcher = fs.watch(resolvedWorkspaceRoot, { persistent: false, recursive: true }, (_eventType, filename) => {
        const resolvedFilename = typeof filename === "string" ? filename.trim() : "";
        if (!resolvedFilename) {
          return;
        }
        paths.add(path.resolve(resolvedWorkspaceRoot, resolvedFilename));
      });

      this.#watchersByThreadId.set(resolvedThreadId, { paths, watcher });
    } catch {
      // Best-effort only. The desktop app should still run if the OS
      // cannot provide recursive watch support for the selected folder.
    }
  }

  finish(threadId: string | null | undefined): string[] {
    const resolvedThreadId = firstString(threadId);
    if (!resolvedThreadId) {
      return [];
    }

    const record = this.#watchersByThreadId.get(resolvedThreadId) ?? null;
    this.stop(resolvedThreadId);
    return record ? Array.from(record.paths).sort() : [];
  }

  stop(threadId: string | null | undefined): void {
    const resolvedThreadId = firstString(threadId);
    if (!resolvedThreadId) {
      return;
    }

    const record = this.#watchersByThreadId.get(resolvedThreadId) ?? null;
    if (!record) {
      return;
    }

    try {
      record.watcher.close();
    } catch {
      // Ignore close errors during cleanup.
    }
    this.#watchersByThreadId.delete(resolvedThreadId);
  }

  clear(): void {
    for (const threadId of this.#watchersByThreadId.keys()) {
      this.stop(threadId);
    }
  }
}
