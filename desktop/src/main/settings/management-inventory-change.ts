import path from "node:path";

import { isPathWithinAnyRoot, isPathWithinRoot } from "../workspace/workspace-boundary.ts";

interface AppServerNotification {
  method?: unknown;
  params?: unknown;
}

function firstString(...values: Array<unknown>): string | null {
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.map((candidate) => path.resolve(candidate))));
}

const MANAGED_INVENTORY_SHORTCUTS = new Set([
  "plugin-creator",
  "skill-creator",
  "skill-installer",
]);

function normalizeShortcutToken(token: unknown): string {
  const resolved = firstString(token);
  if (!resolved) {
    return "";
  }

  return resolved.split(":").at(-1)?.trim().toLowerCase() ?? "";
}

export function filterProfileCodexHomeRoots(
  roots: Array<string | null | undefined>,
): string[] {
  return uniquePaths(
    roots
      .map((candidate) => firstString(candidate))
      .filter((candidate): candidate is string => Boolean(candidate))
      .filter((candidate) => path.basename(path.resolve(candidate)) === "codex-home"),
  );
}

function collectFileChangePaths(item: unknown): string[] {
  const record = asRecord(item);
  if (!record || record.type !== "fileChange" || !Array.isArray(record.changes)) {
    return [];
  }

  return record.changes
    .map((change) => asRecord(change))
    .map((change) => firstString(change?.path))
    .filter((candidate): candidate is string => Boolean(candidate));
}

function collectDiffPaths(diffs: unknown): string[] {
  if (!Array.isArray(diffs)) {
    return [];
  }

  return diffs
    .map((diff) => asRecord(diff))
    .map((diff) => firstString(diff?.path))
    .filter((candidate): candidate is string => Boolean(candidate));
}

function resolveInventoryRoots(codexHomeRoots: Array<string | null | undefined>): string[] {
  const roots = filterProfileCodexHomeRoots(codexHomeRoots);

  const inventoryRoots: string[] = [];
  for (const root of roots) {
    inventoryRoots.push(path.join(root, "skills"));
    inventoryRoots.push(path.join(root, "plugins"));
    inventoryRoots.push(path.join(root, ".agents", "plugins"));
    inventoryRoots.push(path.join(root, ".tmp", "plugins"));
  }
  return inventoryRoots;
}

export function isManagementInventoryPath(
  candidatePath: string | null | undefined,
  codexHomeRoots: Array<string | null | undefined>,
): boolean {
  const resolvedPath = firstString(candidatePath);
  if (!resolvedPath) {
    return false;
  }

  const absolutePath = path.resolve(resolvedPath);
  const configRoots = codexHomeRoots
    .flatMap((root) => filterProfileCodexHomeRoots([root]))
    .map((root) => path.join(root, "config.toml"));
  if (configRoots.includes(absolutePath)) {
    return true;
  }

  return isPathWithinAnyRoot(absolutePath, resolveInventoryRoots(codexHomeRoots));
}

export function latestUserEntryRequestsManagedInventoryInstall(
  threadState: { entries?: Array<{ kind?: unknown; promptShortcuts?: Array<{ token?: unknown }> }> } | null | undefined,
): boolean {
  const entries = Array.isArray(threadState?.entries) ? threadState.entries : [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.kind !== "user") {
      continue;
    }

    const shortcuts = Array.isArray(entry.promptShortcuts) ? entry.promptShortcuts : [];
    return shortcuts.some((shortcut) => MANAGED_INVENTORY_SHORTCUTS.has(normalizeShortcutToken(shortcut?.token)));
  }

  return false;
}

export function collectManagementInventoryPathsFromRuntimeMessage(
  message: AppServerNotification | Record<string, unknown> | null | undefined,
  codexHomeRoots: Array<string | null | undefined>,
): string[] {
  const method = firstString(message?.method);
  const params = asRecord(message?.params);
  if (!method || !params) {
    return [];
  }

  let changedPaths: string[] = [];
  if (method === "item/completed") {
    changedPaths = collectFileChangePaths(params.item);
  } else if (method === "turn/diff/updated") {
    changedPaths = collectDiffPaths(params.diffs);
  }

  return uniquePaths(changedPaths.filter((candidate) => isManagementInventoryPath(candidate, codexHomeRoots)));
}

export class ManagementInventoryChangeTracker {
  readonly #changedThreadIds = new Set<string>();

  observe(
    message: AppServerNotification | Record<string, unknown> | null | undefined,
    codexHomeRoots: Array<string | null | undefined>,
  ): void {
    const record = asRecord(message);
    const method = firstString(record?.method);
    const params = asRecord(record?.params);
    const threadId = firstString(params?.threadId);
    if (!method || !threadId) {
      return;
    }

    if (method === "turn/started") {
      this.#changedThreadIds.delete(threadId);
      return;
    }

    if (collectManagementInventoryPathsFromRuntimeMessage(record, codexHomeRoots).length > 0) {
      this.#changedThreadIds.add(threadId);
    }
  }

  consume(threadId: string | null | undefined): boolean {
    const resolvedThreadId = firstString(threadId);
    if (!resolvedThreadId) {
      return false;
    }

    const hasChanged = this.#changedThreadIds.has(resolvedThreadId);
    this.#changedThreadIds.delete(resolvedThreadId);
    return hasChanged;
  }

  clear(threadId: string | null | undefined): void {
    const resolvedThreadId = firstString(threadId);
    if (!resolvedThreadId) {
      return;
    }

    this.#changedThreadIds.delete(resolvedThreadId);
  }

  clearAll(): void {
    this.#changedThreadIds.clear();
  }
}
