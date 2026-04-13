import fs from "node:fs/promises";
import path from "node:path";

import {
  ensureProfileDirectories,
  fileExists,
  resolveProfileRoot,
  sanitizeProfileId,
} from "./profile-paths.js";
import {
  enrichWorkspaceEntry,
  normalizeThreadWorkspaceBinding,
  normalizeWorkspaceFolderEntry,
  normalizeWorkspaceSidebarRoot,
  workspaceEntryKey,
} from "./profile-workspace-helpers.js";
import {
  loadDesktopSettings,
  persistDesktopSettings,
} from "./profile-settings-state.js";
import {
  clearLastSelectedThreadId,
  clearLastSelectedThreadIdIfMatches,
  forgetPendingApprovalsForThread,
  forgetThreadInteractionState,
  loadLastSelectedThreadId,
  loadPendingApprovals,
  loadThreadInteractionStates,
  persistLastSelectedThreadId,
  persistPendingApprovals,
  rememberThreadInteractionState,
} from "./profile-session-state.js";
import { readWorkspaceRootIdentity } from "../workspace/workspace-root.ts";

const RECENT_WORKSPACE_FOLDERS_FILE = "recent-workspace-folders.json";
const THREAD_WORKSPACE_BINDINGS_FILE = "thread-workspace-bindings.json";
const WORKSPACE_SIDEBAR_ORDER_FILE = "workspace-sidebar-order.json";
const MAX_RECENT_WORKSPACE_FOLDERS = 8;

function resolveRecentWorkspaceFoldersFile(profileId, env = process.env) {
  return path.join(resolveProfileRoot(profileId, env), RECENT_WORKSPACE_FOLDERS_FILE);
}

function resolveThreadWorkspaceBindingsFile(profileId, env = process.env) {
  return path.join(resolveProfileRoot(profileId, env), THREAD_WORKSPACE_BINDINGS_FILE);
}

function resolveWorkspaceSidebarOrderFile(profileId, env = process.env) {
  return path.join(resolveProfileRoot(profileId, env), WORKSPACE_SIDEBAR_ORDER_FILE);
}

export async function loadRecentWorkspaceFolders(profileId, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  await ensureProfileDirectories(profile, env);
  const foldersFile = resolveRecentWorkspaceFoldersFile(profile, env);

  if (!(await fileExists(foldersFile))) {
    return [];
  }

  try {
    const raw = await fs.readFile(foldersFile, "utf8");
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.folders) ? parsed.folders : [];
    const deduped = [];
    const seen = new Set();

    for (const item of items) {
      const normalized = normalizeWorkspaceFolderEntry(item);
      const entryKey = workspaceEntryKey(normalized);
      if (!normalized || !entryKey || seen.has(entryKey)) {
        continue;
      }

      seen.add(entryKey);
      deduped.push(normalized);
    }

    return deduped.slice(0, MAX_RECENT_WORKSPACE_FOLDERS);
  } catch {
    return [];
  }
}

export async function rememberRecentWorkspaceFolder(profileId, folderPath, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  const nextWorkspace = await enrichWorkspaceEntry(folderPath);
  if (!nextWorkspace?.path) {
    return await loadRecentWorkspaceFolders(profile, env);
  }

  await ensureProfileDirectories(profile, env);
  const foldersFile = resolveRecentWorkspaceFoldersFile(profile, env);
  const existing = await loadRecentWorkspaceFolders(profile, env);
  const nextEntry = {
    path: nextWorkspace.path,
    name: path.basename(nextWorkspace.path),
    lastUsedAt: new Date().toISOString(),
    identityKey: nextWorkspace.identityKey,
  };
  const nextEntryKey = workspaceEntryKey(nextEntry);
  const merged = [
    nextEntry,
    ...existing
      .map((entry) => {
        if (nextEntryKey && workspaceEntryKey(entry) === nextEntryKey) {
          return {
            ...entry,
            path: nextEntry.path,
            name: path.basename(nextEntry.path),
            identityKey: nextEntry.identityKey,
          };
        }

        return entry;
      })
      .filter((entry) => entry.path !== nextEntry.path),
  ].slice(0, MAX_RECENT_WORKSPACE_FOLDERS);

  await fs.writeFile(
    foldersFile,
    JSON.stringify(
      {
        folders: merged,
        updated_at: nextEntry.lastUsedAt,
      },
      null,
      2,
    ),
    "utf8",
  );

  return merged;
}

export async function forgetRecentWorkspaceFolder(profileId, folderPath, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  const workspace = await enrichWorkspaceEntry(folderPath);
  if (!workspace?.path) {
    return await loadRecentWorkspaceFolders(profile, env);
  }

  await ensureProfileDirectories(profile, env);
  const foldersFile = resolveRecentWorkspaceFoldersFile(profile, env);
  const existing = await loadRecentWorkspaceFolders(profile, env);
  const workspaceKey = workspaceEntryKey(workspace);
  const nextFolders = existing.filter((entry) => workspaceEntryKey(entry) !== workspaceKey);

  await fs.writeFile(
    foldersFile,
    JSON.stringify(
      {
        folders: nextFolders,
        updated_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );

  return nextFolders;
}

export async function loadThreadWorkspaceBindings(profileId, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  await ensureProfileDirectories(profile, env);
  const bindingsFile = resolveThreadWorkspaceBindingsFile(profile, env);

  if (!(await fileExists(bindingsFile))) {
    return [];
  }

  try {
    const raw = await fs.readFile(bindingsFile, "utf8");
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.bindings) ? parsed.bindings : [];
    const deduped = [];
    const seen = new Set();

    for (const item of items) {
      const normalized = normalizeThreadWorkspaceBinding(item);
      if (!normalized || seen.has(normalized.threadId)) {
        continue;
      }

      seen.add(normalized.threadId);
      deduped.push(normalized);
    }

    return deduped;
  } catch {
    return [];
  }
}

export async function loadThreadWorkspaceRoot(profileId, threadId, env = process.env) {
  const resolvedThreadId = String(threadId || "").trim();
  if (!resolvedThreadId) {
    return null;
  }

  const bindings = await loadThreadWorkspaceBindings(profileId, env);
  const match = bindings.find((entry) => entry.threadId === resolvedThreadId);
  return match?.workspaceRoot ?? null;
}

export async function rememberThreadWorkspaceRoot(profileId, threadId, workspaceRoot, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  const resolvedThreadId = String(threadId || "").trim();
  const nextWorkspace = await enrichWorkspaceEntry(workspaceRoot);
  if (!resolvedThreadId || !nextWorkspace?.path) {
    return await loadThreadWorkspaceBindings(profile, env);
  }

  await ensureProfileDirectories(profile, env);
  const bindingsFile = resolveThreadWorkspaceBindingsFile(profile, env);
  const existing = await loadThreadWorkspaceBindings(profile, env);
  const nextBinding = {
    threadId: resolvedThreadId,
    workspaceRoot: nextWorkspace.path,
    lastUsedAt: new Date().toISOString(),
    identityKey: nextWorkspace.identityKey,
  };
  const nextWorkspaceKey = workspaceEntryKey({
    workspaceRoot: nextBinding.workspaceRoot,
    identityKey: nextBinding.identityKey,
  });
  const merged = [
    nextBinding,
    ...existing
      .map((entry) => {
        const entryWorkspaceKey = workspaceEntryKey({
          workspaceRoot: entry.workspaceRoot,
          identityKey: entry.identityKey,
        });
        if (nextWorkspaceKey && entryWorkspaceKey === nextWorkspaceKey) {
          return {
            ...entry,
            workspaceRoot: nextBinding.workspaceRoot,
            identityKey: nextBinding.identityKey,
          };
        }

        return entry;
      })
      .filter((entry) => entry.threadId !== resolvedThreadId),
  ];

  await fs.writeFile(
    bindingsFile,
    JSON.stringify(
      {
        bindings: merged,
        updated_at: nextBinding.lastUsedAt,
      },
      null,
      2,
    ),
    "utf8",
  );

  return merged;
}

export async function forgetThreadWorkspaceRoot(profileId, threadId, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  const resolvedThreadId = String(threadId || "").trim();
  if (!resolvedThreadId) {
    return await loadThreadWorkspaceBindings(profile, env);
  }

  await ensureProfileDirectories(profile, env);
  const bindingsFile = resolveThreadWorkspaceBindingsFile(profile, env);
  const existing = await loadThreadWorkspaceBindings(profile, env);
  const nextBindings = existing.filter((entry) => entry.threadId !== resolvedThreadId);

  await fs.writeFile(
    bindingsFile,
    JSON.stringify(
      {
        bindings: nextBindings,
        updated_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );

  return nextBindings;
}

export async function loadWorkspaceSidebarOrder(profileId, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  await ensureProfileDirectories(profile, env);
  const targetFile = resolveWorkspaceSidebarOrderFile(profile, env);

  if (!(await fileExists(targetFile))) {
    return [];
  }

  try {
    const raw = await fs.readFile(targetFile, "utf8");
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.rootPaths) ? parsed.rootPaths : [];
    const deduped = [];
    const seen = new Set();

    for (const item of items) {
      const normalized = normalizeWorkspaceSidebarRoot(item);
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      deduped.push(normalized);
    }

    return deduped;
  } catch {
    return [];
  }
}

export async function rememberWorkspaceSidebarOrder(profileId, rootPaths, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  await ensureProfileDirectories(profile, env);
  const targetFile = resolveWorkspaceSidebarOrderFile(profile, env);
  const normalizedRootPaths = [];
  const seen = new Set();

  for (const entry of Array.isArray(rootPaths) ? rootPaths : []) {
    const normalized = normalizeWorkspaceSidebarRoot(entry);
    if (!normalized) {
      continue;
    }

    const identity = await readWorkspaceRootIdentity(normalized);
    const entryKey = identity?.identityKey ? `identity:${identity.identityKey}` : `path:${normalized}`;
    if (seen.has(entryKey)) {
      continue;
    }

    seen.add(entryKey);
    normalizedRootPaths.push(normalized);
  }

  await fs.writeFile(
    targetFile,
    JSON.stringify(
      {
        rootPaths: normalizedRootPaths,
        updated_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );

  return normalizedRootPaths;
}

export async function forgetWorkspaceSidebarRoot(profileId, rootPath, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  const workspace = await enrichWorkspaceEntry(rootPath);
  if (!workspace?.path) {
    return await loadWorkspaceSidebarOrder(profile, env);
  }

  const existing = await loadWorkspaceSidebarOrder(profile, env);
  const workspaceKey = workspaceEntryKey(workspace);
  const nextOrder = [];
  for (const entry of existing) {
    const entryIdentity = await readWorkspaceRootIdentity(entry);
    const entryKey = workspaceEntryKey({
      path: entry,
      identityKey: entryIdentity?.identityKey ?? null,
    });
    if (entryKey === workspaceKey) {
      continue;
    }
    nextOrder.push(entry);
  }
  await rememberWorkspaceSidebarOrder(profile, nextOrder, env);

  return nextOrder;
}

export {
  clearLastSelectedThreadId,
  clearLastSelectedThreadIdIfMatches,
  forgetPendingApprovalsForThread,
  forgetThreadInteractionState,
  loadDesktopSettings,
  loadLastSelectedThreadId,
  loadPendingApprovals,
  loadThreadInteractionStates,
  persistDesktopSettings,
  persistLastSelectedThreadId,
  persistPendingApprovals,
  rememberThreadInteractionState,
};
