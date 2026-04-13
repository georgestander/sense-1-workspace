import path from "node:path";

import {
  normalizeWorkspaceRootPath,
  readWorkspaceRootIdentity,
} from "../workspace/workspace-root.ts";

export function workspaceEntryKey(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const identityKey = typeof entry.identityKey === "string" ? entry.identityKey.trim() : "";
  if (identityKey) {
    return `identity:${identityKey}`;
  }

  const normalizedPath = normalizeWorkspaceRootPath(entry.path ?? entry.workspaceRoot);
  return normalizedPath ? `path:${normalizedPath}` : null;
}

export async function enrichWorkspaceEntry(value) {
  const normalizedPath = normalizeWorkspaceRootPath(value);
  if (!normalizedPath) {
    return null;
  }

  const identity = await readWorkspaceRootIdentity(normalizedPath);
  return {
    path: normalizedPath,
    identityKey: identity?.identityKey ?? null,
  };
}

export function normalizeWorkspaceFolderEntry(entry) {
  if (typeof entry === "string") {
    const normalizedPath = normalizeWorkspaceRootPath(entry);
    if (!normalizedPath) {
      return null;
    }

    return {
      path: normalizedPath,
      name: path.basename(normalizedPath),
      lastUsedAt: null,
      identityKey: null,
    };
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const folderPath = typeof entry.path === "string" ? entry.path.trim() : "";
  if (!folderPath) {
    return null;
  }

  const resolvedPath = normalizeWorkspaceRootPath(folderPath);
  if (!resolvedPath) {
    return null;
  }

  const nameCandidate = typeof entry.name === "string" ? entry.name.trim() : "";
  const lastUsedAt =
    typeof entry.lastUsedAt === "string" && entry.lastUsedAt.trim() ? entry.lastUsedAt.trim() : null;
  const identityKey =
    typeof entry.identityKey === "string" && entry.identityKey.trim() ? entry.identityKey.trim() : null;

  return {
    path: resolvedPath,
    name: nameCandidate || path.basename(resolvedPath),
    lastUsedAt,
    identityKey,
  };
}

export function normalizeThreadWorkspaceBinding(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const threadId = typeof entry.threadId === "string" ? entry.threadId.trim() : "";
  const workspaceRoot = typeof entry.workspaceRoot === "string" ? entry.workspaceRoot.trim() : "";
  if (!threadId || !workspaceRoot) {
    return null;
  }

  const normalizedWorkspaceRoot = normalizeWorkspaceRootPath(workspaceRoot);
  if (!normalizedWorkspaceRoot) {
    return null;
  }

  return {
    threadId,
    workspaceRoot: normalizedWorkspaceRoot,
    lastUsedAt:
      typeof entry.lastUsedAt === "string" && entry.lastUsedAt.trim() ? entry.lastUsedAt.trim() : null,
    identityKey:
      typeof entry.identityKey === "string" && entry.identityKey.trim() ? entry.identityKey.trim() : null,
  };
}

export function normalizeWorkspaceSidebarRoot(entry) {
  if (typeof entry !== "string") {
    return null;
  }

  return normalizeWorkspaceRootPath(entry);
}
