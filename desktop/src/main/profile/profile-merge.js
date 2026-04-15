import fs from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_PROFILE_ID,
  ensureProfileDirectories,
  fileExists,
  loadActiveProfileId,
  listProfileIds,
  loadProfileArtifactRoot,
  loadProfileIdentity,
  persistActiveProfileId,
  persistProfileArtifactRoot,
  persistProfileIdentity,
  resolveDefaultArtifactRoot,
  resolveEmailProfileId,
  resolveProfileCodexHome,
  resolveProfileRoot,
  resolveProfileSubstrateDbPath,
  sanitizeProfileId,
} from "./profile-state.js";
import { ensureProfileSubstrate } from "../substrate/substrate.js";
import { resolveDefaultScopeId, resolvePrimaryActorId } from "../substrate/substrate-schema.js";
import { openDatabase, runInTransaction } from "../substrate/substrate-store-core.js";

const PROFILE_FILE_NAMES = {
  recentWorkspaceFolders: "recent-workspace-folders.json",
  threadWorkspaceBindings: "thread-workspace-bindings.json",
  threadInteractionStates: "thread-interaction-states.json",
  workspaceSidebarOrder: "workspace-sidebar-order.json",
  lastSelectedThread: "last-selected-thread.json",
  settings: "settings.json",
  pendingApprovals: "pending-approvals.json",
  windowState: "window-state.json",
  workspaceSourceCache: "workspace-source-cache.json",
  legacyProfile: "profile.json",
};

const CODEX_HOME_FILE_NAMES = {
  auth: "auth.json",
  config: "config.toml",
  modelsCache: "models_cache.json",
  sessionIndex: "session_index.jsonl",
  stateDb: "state_5.sqlite",
  archivedSessions: "archived_sessions",
  personalityMigration: ".personality_migration",
};

const SUBSTRATE_TABLES = [
  "scopes",
  "actors",
  "workspaces",
  "sessions",
  "plans",
  "questions",
  "events",
  "object_refs",
  "session_projections",
  "workspace_projections",
  "workspace_policies",
];

const CODEX_STATE_TABLES = [
  "threads",
  "thread_dynamic_tools",
  "stage1_outputs",
];

function resolveProfileFile(profileId, fileName, env = process.env) {
  return path.join(resolveProfileRoot(profileId, env), fileName);
}

function resolveCodexHomeFile(profileId, fileName, env = process.env) {
  return path.join(resolveProfileCodexHome(profileId, env), fileName);
}

async function statMtimeMs(targetPath) {
  try {
    const stat = await fs.stat(targetPath);
    return stat.mtimeMs;
  } catch {
    return 0;
  }
}

async function readJsonFile(targetPath) {
  if (!(await fileExists(targetPath))) {
    return null;
  }

  try {
    return JSON.parse(await fs.readFile(targetPath, "utf8"));
  } catch {
    return null;
  }
}

async function writeJsonFile(targetPath, value) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(value, null, 2), "utf8");
}

function sortNewestFirst(items, timestampKey) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left?.[timestampKey] ?? "") || 0;
    const rightTime = Date.parse(right?.[timestampKey] ?? "") || 0;
    return rightTime - leftTime;
  });
}

async function mergeRecentWorkspaceFolders(sourceProfileId, targetProfileId, env) {
  const source = await readJsonFile(resolveProfileFile(sourceProfileId, PROFILE_FILE_NAMES.recentWorkspaceFolders, env));
  if (!Array.isArray(source?.folders) || source.folders.length === 0) {
    return;
  }

  const targetPath = resolveProfileFile(targetProfileId, PROFILE_FILE_NAMES.recentWorkspaceFolders, env);
  const target = await readJsonFile(targetPath);
  const merged = [];
  const seen = new Set();
  for (const entry of sortNewestFirst([
    ...(Array.isArray(target?.folders) ? target.folders : []),
    ...source.folders,
  ], "lastUsedAt")) {
    const identityKey = typeof entry?.identityKey === "string" && entry.identityKey.trim()
      ? `identity:${entry.identityKey.trim()}`
      : typeof entry?.path === "string" && entry.path.trim()
        ? `path:${entry.path.trim()}`
        : null;
    if (!identityKey || seen.has(identityKey)) {
      continue;
    }
    seen.add(identityKey);
    merged.push(entry);
  }

  await writeJsonFile(targetPath, {
    folders: merged.slice(0, 8),
    updated_at: new Date().toISOString(),
  });
}

async function mergeThreadWorkspaceBindings(sourceProfileId, targetProfileId, env) {
  const source = await readJsonFile(resolveProfileFile(sourceProfileId, PROFILE_FILE_NAMES.threadWorkspaceBindings, env));
  if (!Array.isArray(source?.bindings) || source.bindings.length === 0) {
    return;
  }

  const targetPath = resolveProfileFile(targetProfileId, PROFILE_FILE_NAMES.threadWorkspaceBindings, env);
  const target = await readJsonFile(targetPath);
  const merged = new Map();
  for (const entry of sortNewestFirst([
    ...(Array.isArray(target?.bindings) ? target.bindings : []),
    ...source.bindings,
  ], "lastUsedAt")) {
    const threadId = typeof entry?.threadId === "string" ? entry.threadId.trim() : "";
    if (!threadId || merged.has(threadId)) {
      continue;
    }
    merged.set(threadId, entry);
  }

  await writeJsonFile(targetPath, {
    bindings: [...merged.values()],
    updated_at: new Date().toISOString(),
  });
}

async function mergeThreadInteractionStates(sourceProfileId, targetProfileId, env) {
  const source = await readJsonFile(resolveProfileFile(sourceProfileId, PROFILE_FILE_NAMES.threadInteractionStates, env));
  if (!Array.isArray(source?.states) || source.states.length === 0) {
    return;
  }

  const targetPath = resolveProfileFile(targetProfileId, PROFILE_FILE_NAMES.threadInteractionStates, env);
  const target = await readJsonFile(targetPath);
  const merged = new Map();
  for (const entry of sortNewestFirst([
    ...(Array.isArray(target?.states) ? target.states : []),
    ...source.states,
  ], "updatedAt")) {
    const threadId = typeof entry?.threadId === "string" ? entry.threadId.trim() : "";
    if (!threadId || merged.has(threadId)) {
      continue;
    }
    merged.set(threadId, entry);
  }

  await writeJsonFile(targetPath, {
    states: [...merged.values()],
    updated_at: new Date().toISOString(),
  });
}

async function mergeWorkspaceSidebarOrder(sourceProfileId, targetProfileId, env) {
  const source = await readJsonFile(resolveProfileFile(sourceProfileId, PROFILE_FILE_NAMES.workspaceSidebarOrder, env));
  if (!Array.isArray(source?.rootPaths) || source.rootPaths.length === 0) {
    return;
  }

  const targetPath = resolveProfileFile(targetProfileId, PROFILE_FILE_NAMES.workspaceSidebarOrder, env);
  const target = await readJsonFile(targetPath);
  const merged = [];
  const seen = new Set();
  for (const value of [
    ...(Array.isArray(target?.rootPaths) ? target.rootPaths : []),
    ...source.rootPaths,
  ]) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    merged.push(normalized);
  }

  await writeJsonFile(targetPath, {
    rootPaths: merged,
    updated_at: new Date().toISOString(),
  });
}

async function mergeLastSelectedThread(sourceProfileId, targetProfileId, env) {
  const source = await readJsonFile(resolveProfileFile(sourceProfileId, PROFILE_FILE_NAMES.lastSelectedThread, env));
  if (!source || typeof source !== "object") {
    return;
  }

  const targetPath = resolveProfileFile(targetProfileId, PROFILE_FILE_NAMES.lastSelectedThread, env);
  const target = await readJsonFile(targetPath);
  const sourceUpdatedAt = Date.parse(source.updated_at ?? "") || 0;
  const targetUpdatedAt = Date.parse(target?.updated_at ?? "") || 0;
  if (targetUpdatedAt > sourceUpdatedAt) {
    return;
  }

  await writeJsonFile(targetPath, {
    thread_id: typeof source.thread_id === "string" && source.thread_id.trim() ? source.thread_id.trim() : null,
    updated_at: typeof source.updated_at === "string" && source.updated_at.trim()
      ? source.updated_at.trim()
      : new Date().toISOString(),
  });
}

async function copyIfTargetMissing(sourcePath, targetPath) {
  if (!(await fileExists(sourcePath)) || (await fileExists(targetPath))) {
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
}

async function copyDirectoryEntriesIfMissing(sourceDir, targetDir) {
  if (!(await fileExists(sourceDir))) {
    return;
  }

  await fs.mkdir(targetDir, { recursive: true });
  for (const entry of await fs.readdir(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (await fileExists(targetPath)) {
      continue;
    }
    if (entry.isDirectory()) {
      await fs.cp(sourcePath, targetPath, { recursive: true, errorOnExist: false, force: false });
      continue;
    }
    await fs.copyFile(sourcePath, targetPath);
  }
}

function normalizeSessionIndexLine(line) {
  if (typeof line !== "string" || !line.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(line);
    const id = typeof parsed?.id === "string" ? parsed.id.trim() : "";
    if (!id) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function mergeSessionIndex(sourceProfileId, targetProfileId, env) {
  const sourcePath = resolveCodexHomeFile(sourceProfileId, CODEX_HOME_FILE_NAMES.sessionIndex, env);
  if (!(await fileExists(sourcePath))) {
    return;
  }

  const targetPath = resolveCodexHomeFile(targetProfileId, CODEX_HOME_FILE_NAMES.sessionIndex, env);
  const mergedById = new Map();

  for (const targetLine of (await fileExists(targetPath))
    ? (await fs.readFile(targetPath, "utf8")).split("\n")
    : []) {
    const parsed = normalizeSessionIndexLine(targetLine);
    if (!parsed) {
      continue;
    }
    mergedById.set(parsed.id, parsed);
  }

  for (const sourceLine of (await fs.readFile(sourcePath, "utf8")).split("\n")) {
    const parsed = normalizeSessionIndexLine(sourceLine);
    if (!parsed) {
      continue;
    }
    const existing = mergedById.get(parsed.id);
    const existingUpdatedAt = Date.parse(existing?.updated_at ?? "") || 0;
    const parsedUpdatedAt = Date.parse(parsed.updated_at ?? "") || 0;
    if (!existing || parsedUpdatedAt >= existingUpdatedAt) {
      mergedById.set(parsed.id, parsed);
    }
  }

  const sorted = [...mergedById.values()].sort((left, right) => {
    return (Date.parse(right.updated_at ?? "") || 0) - (Date.parse(left.updated_at ?? "") || 0);
  });

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, sorted.map((entry) => JSON.stringify(entry)).join("\n"), "utf8");
}

function intersectColumns(sourceColumns, targetColumns) {
  const targetSet = new Set(targetColumns);
  return sourceColumns.filter((column) => targetSet.has(column));
}

function rewriteProfileScopedRow(row, {
  sourceProfileId,
  targetProfileId,
  sourceScopeId,
  targetScopeId,
  sourceActorId,
  targetActorId,
}) {
  const nextRow = { ...row };
  if (Object.prototype.hasOwnProperty.call(nextRow, "profile_id")) {
    nextRow.profile_id = targetProfileId;
  }
  if (Object.prototype.hasOwnProperty.call(nextRow, "scope_id") && nextRow.scope_id === sourceScopeId) {
    nextRow.scope_id = targetScopeId;
  }
  if (Object.prototype.hasOwnProperty.call(nextRow, "actor_id") && nextRow.actor_id === sourceActorId) {
    nextRow.actor_id = targetActorId;
  }
  if (Object.prototype.hasOwnProperty.call(nextRow, "approved_by_actor_id") && nextRow.approved_by_actor_id === sourceActorId) {
    nextRow.approved_by_actor_id = targetActorId;
  }
  if (Object.prototype.hasOwnProperty.call(nextRow, "rejected_by_actor_id") && nextRow.rejected_by_actor_id === sourceActorId) {
    nextRow.rejected_by_actor_id = targetActorId;
  }
  if (Object.prototype.hasOwnProperty.call(nextRow, "id") && nextRow.id === sourceScopeId) {
    nextRow.id = targetScopeId;
  }
  if (Object.prototype.hasOwnProperty.call(nextRow, "id") && nextRow.id === sourceActorId) {
    nextRow.id = targetActorId;
  }
  if (Object.prototype.hasOwnProperty.call(nextRow, "profileId") && nextRow.profileId === sourceProfileId) {
    nextRow.profileId = targetProfileId;
  }
  return nextRow;
}

function mergeRowsIntoTable(targetDb, tableName, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  const targetColumns = targetDb.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
  if (targetColumns.length === 0) {
    return;
  }

  const placeholders = targetColumns.map((column) => `@${column}`).join(", ");
  const statement = targetDb.prepare(
    `INSERT OR IGNORE INTO ${tableName} (${targetColumns.join(", ")}) VALUES (${placeholders})`,
  );
  for (const row of rows) {
    const payload = {};
    for (const column of targetColumns) {
      payload[column] = Object.prototype.hasOwnProperty.call(row, column) ? row[column] : null;
    }
    statement.run(payload);
  }
}

async function mergeSubstrateDatabase(sourceProfileId, targetProfileId, env) {
  const sourceDbPath = resolveProfileSubstrateDbPath(sourceProfileId, env);
  if (!(await fileExists(sourceDbPath))) {
    return;
  }

  const targetDbPath = resolveProfileSubstrateDbPath(targetProfileId, env);
  const sourceScopeId = resolveDefaultScopeId(sourceProfileId);
  const targetScopeId = resolveDefaultScopeId(targetProfileId);
  const sourceActorId = resolvePrimaryActorId(sourceProfileId);
  const targetActorId = resolvePrimaryActorId(targetProfileId);
  const sourceDb = openDatabase(sourceDbPath);
  const targetDb = openDatabase(targetDbPath);
  try {
    targetDb.exec("PRAGMA foreign_keys = OFF;");
    runInTransaction(targetDb, () => {
      for (const tableName of SUBSTRATE_TABLES) {
        const sourceColumns = sourceDb.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
        const targetColumns = targetDb.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
        const sharedColumns = intersectColumns(sourceColumns, targetColumns);
        if (sharedColumns.length === 0) {
          continue;
        }
        const rows = sourceDb.prepare(`SELECT ${sharedColumns.join(", ")} FROM ${tableName}`).all().map((row) =>
          rewriteProfileScopedRow(row, {
            sourceProfileId,
            targetProfileId,
            sourceScopeId,
            targetScopeId,
            sourceActorId,
            targetActorId,
          }),
        );
        mergeRowsIntoTable(targetDb, tableName, rows);
      }
    });
  } finally {
    try {
      targetDb.exec("PRAGMA foreign_keys = ON;");
    } catch {
      // Ignore toggle failures during cleanup.
    }
    sourceDb.close();
    targetDb.close();
  }
}

async function mergeCodexHomeDatabase(sourceProfileId, targetProfileId, env) {
  const sourceDbPath = resolveCodexHomeFile(sourceProfileId, CODEX_HOME_FILE_NAMES.stateDb, env);
  if (!(await fileExists(sourceDbPath))) {
    return;
  }

  const targetDbPath = resolveCodexHomeFile(targetProfileId, CODEX_HOME_FILE_NAMES.stateDb, env);
  if (!(await fileExists(targetDbPath))) {
    await fs.mkdir(path.dirname(targetDbPath), { recursive: true });
    await fs.copyFile(sourceDbPath, targetDbPath);
    return;
  }

  const sourceDb = openDatabase(sourceDbPath);
  const targetDb = openDatabase(targetDbPath);
  try {
    runInTransaction(targetDb, () => {
      for (const tableName of CODEX_STATE_TABLES) {
        const sourceColumns = sourceDb.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
        const targetColumns = targetDb.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
        const sharedColumns = intersectColumns(sourceColumns, targetColumns);
        if (sharedColumns.length === 0) {
          continue;
        }
        const rows = sourceDb.prepare(`SELECT ${sharedColumns.join(", ")} FROM ${tableName}`).all();
        mergeRowsIntoTable(targetDb, tableName, rows);
      }
    });
  } finally {
    sourceDb.close();
    targetDb.close();
  }
}

async function mergeCodexHome(sourceProfileId, targetProfileId, env) {
  await ensureProfileDirectories(targetProfileId, env);
  await copyIfTargetMissing(
    resolveCodexHomeFile(sourceProfileId, CODEX_HOME_FILE_NAMES.auth, env),
    resolveCodexHomeFile(targetProfileId, CODEX_HOME_FILE_NAMES.auth, env),
  );
  await copyIfTargetMissing(
    resolveCodexHomeFile(sourceProfileId, CODEX_HOME_FILE_NAMES.config, env),
    resolveCodexHomeFile(targetProfileId, CODEX_HOME_FILE_NAMES.config, env),
  );
  await copyIfTargetMissing(
    resolveCodexHomeFile(sourceProfileId, CODEX_HOME_FILE_NAMES.modelsCache, env),
    resolveCodexHomeFile(targetProfileId, CODEX_HOME_FILE_NAMES.modelsCache, env),
  );
  await copyIfTargetMissing(
    resolveCodexHomeFile(sourceProfileId, CODEX_HOME_FILE_NAMES.personalityMigration, env),
    resolveCodexHomeFile(targetProfileId, CODEX_HOME_FILE_NAMES.personalityMigration, env),
  );
  await mergeCodexHomeDatabase(sourceProfileId, targetProfileId, env);
  await mergeSessionIndex(sourceProfileId, targetProfileId, env);
  await copyDirectoryEntriesIfMissing(
    resolveCodexHomeFile(sourceProfileId, CODEX_HOME_FILE_NAMES.archivedSessions, env),
    resolveCodexHomeFile(targetProfileId, CODEX_HOME_FILE_NAMES.archivedSessions, env),
  );
}

async function mergeProfileFiles(sourceProfileId, targetProfileId, env) {
  await mergeRecentWorkspaceFolders(sourceProfileId, targetProfileId, env);
  await mergeThreadWorkspaceBindings(sourceProfileId, targetProfileId, env);
  await mergeThreadInteractionStates(sourceProfileId, targetProfileId, env);
  await mergeWorkspaceSidebarOrder(sourceProfileId, targetProfileId, env);
  await mergeLastSelectedThread(sourceProfileId, targetProfileId, env);
  await copyIfTargetMissing(
    resolveProfileFile(sourceProfileId, PROFILE_FILE_NAMES.settings, env),
    resolveProfileFile(targetProfileId, PROFILE_FILE_NAMES.settings, env),
  );
  await copyIfTargetMissing(
    resolveProfileFile(sourceProfileId, PROFILE_FILE_NAMES.pendingApprovals, env),
    resolveProfileFile(targetProfileId, PROFILE_FILE_NAMES.pendingApprovals, env),
  );
  await copyIfTargetMissing(
    resolveProfileFile(sourceProfileId, PROFILE_FILE_NAMES.windowState, env),
    resolveProfileFile(targetProfileId, PROFILE_FILE_NAMES.windowState, env),
  );
  await copyIfTargetMissing(
    resolveProfileFile(sourceProfileId, PROFILE_FILE_NAMES.workspaceSourceCache, env),
    resolveProfileFile(targetProfileId, PROFILE_FILE_NAMES.workspaceSourceCache, env),
  );
  await copyIfTargetMissing(
    resolveProfileFile(sourceProfileId, PROFILE_FILE_NAMES.legacyProfile, env),
    resolveProfileFile(targetProfileId, PROFILE_FILE_NAMES.legacyProfile, env),
  );
}

async function collectMergeCandidateProfileIds({
  canonicalProfileId,
  currentProfileId,
  email,
  env,
}) {
  const currentId = sanitizeProfileId(currentProfileId);
  const ids = await listProfileIds(env);
  const canonicalIdentity = await loadProfileIdentity(canonicalProfileId, env);
  const currentIdentity = currentId ? await loadProfileIdentity(currentId, env) : null;
  const mergeCandidates = new Set([
    currentId,
    ...(Array.isArray(canonicalIdentity?.legacyProfileIds) ? canonicalIdentity.legacyProfileIds : []),
    ...(Array.isArray(currentIdentity?.legacyProfileIds) ? currentIdentity.legacyProfileIds : []),
  ]);

  for (const id of ids) {
    const profileId = sanitizeProfileId(id);
    if (!profileId || profileId === canonicalProfileId) {
      continue;
    }

    const identity = await loadProfileIdentity(profileId, env);
    const isExplicitlyLinked =
      identity?.mergedIntoProfileId === canonicalProfileId
      || Boolean(identity?.legacyProfileIds?.includes(canonicalProfileId))
      || Boolean(identity?.legacyProfileIds?.includes(currentId));
    const hasSameSignedInIdentity = Boolean(identity?.email && identity.email === email);
    if (isExplicitlyLinked || hasSameSignedInIdentity) {
      mergeCandidates.add(profileId);
    }
  }

  return [...mergeCandidates].filter(Boolean);
}

async function rankPrimaryProfileMergeCandidates(profileIds, {
  currentProfileId,
  storedProfileId,
  env,
}) {
  const targetProfileId = DEFAULT_PROFILE_ID;
  const resolvedCurrentProfileId = sanitizeProfileId(currentProfileId);
  const resolvedStoredProfileId = sanitizeProfileId(storedProfileId);
  const defaultArtifactRoot = path.resolve(resolveDefaultArtifactRoot(env));
  const ranked = await Promise.all(profileIds.map(async (profileId) => {
    const resolvedProfileId = sanitizeProfileId(profileId);
    const identity = await loadProfileIdentity(resolvedProfileId, env);
    const artifactRoot = await loadProfileArtifactRoot(resolvedProfileId, env);
    const authPath = resolveCodexHomeFile(resolvedProfileId, CODEX_HOME_FILE_NAMES.auth, env);
    const authMtimeMs = await statMtimeMs(authPath);
    return {
      artifactRoot,
      authMtimeMs,
      hasAuth: authMtimeMs > 0,
      id: resolvedProfileId,
      isCurrent: resolvedProfileId === resolvedCurrentProfileId,
      isStored: resolvedProfileId === resolvedStoredProfileId,
      matchesDefaultArtifactRoot: artifactRoot ? path.resolve(artifactRoot) === defaultArtifactRoot : false,
      mergedIntoPrimary: identity?.mergedIntoProfileId === targetProfileId,
    };
  }));

  return ranked
    .filter((entry) => entry.id && entry.id !== targetProfileId)
    .filter((entry) => !entry.mergedIntoPrimary || entry.isCurrent || entry.isStored)
    .sort((left, right) => {
      if (left.isCurrent !== right.isCurrent) {
        return left.isCurrent ? -1 : 1;
      }
      if (left.isStored !== right.isStored) {
        return left.isStored ? -1 : 1;
      }
      if (left.hasAuth !== right.hasAuth) {
        return left.hasAuth ? -1 : 1;
      }
      if (left.authMtimeMs !== right.authMtimeMs) {
        return right.authMtimeMs - left.authMtimeMs;
      }
      if (left.matchesDefaultArtifactRoot !== right.matchesDefaultArtifactRoot) {
        return left.matchesDefaultArtifactRoot ? -1 : 1;
      }
      return left.id.localeCompare(right.id);
    })
    .map((entry) => entry.id);
}

export async function ensurePrimaryDesktopProfile({
  currentProfileId = null,
  displayName = null,
  email = null,
  env = process.env,
} = {}) {
  const targetProfileId = DEFAULT_PROFILE_ID;
  const targetArtifactRoot = resolveDefaultArtifactRoot(env);
  const storedProfileId = await loadActiveProfileId(env);
  const existingIdentity = await loadProfileIdentity(targetProfileId, env);
  const profileIds = await listProfileIds(env);
  const mergeSourceIds = await rankPrimaryProfileMergeCandidates(profileIds, {
    currentProfileId,
    env,
    storedProfileId,
  });

  await ensureProfileDirectories(targetProfileId, env);
  await persistProfileArtifactRoot(targetProfileId, targetArtifactRoot, env);
  await ensureProfileSubstrate({
    actorEmail: typeof email === "string" && email.trim() ? email.trim().toLowerCase() : undefined,
    dbPath: resolveProfileSubstrateDbPath(targetProfileId, env),
    profileId: targetProfileId,
  });

  for (const sourceProfileId of mergeSourceIds) {
    await mergeProfileFiles(sourceProfileId, targetProfileId, env);
    await mergeSubstrateDatabase(sourceProfileId, targetProfileId, env);
    await mergeCodexHome(sourceProfileId, targetProfileId, env);
    await persistProfileArtifactRoot(sourceProfileId, targetArtifactRoot, env);
    await persistProfileIdentity(sourceProfileId, {
      displayName,
      email,
      mergedIntoProfileId: targetProfileId,
    }, env);
  }

  const legacyProfileIds = [
    ...(Array.isArray(existingIdentity?.legacyProfileIds) ? existingIdentity.legacyProfileIds : []),
    ...mergeSourceIds,
  ];
  const canonicalDirectories = await ensureProfileDirectories(targetProfileId, env);
  await persistProfileIdentity(targetProfileId, {
    displayName,
    email,
    lastSignedInAt: typeof email === "string" && email.trim() ? new Date().toISOString() : null,
    legacyProfileIds,
  }, env);
  await persistActiveProfileId(targetProfileId, env);

  return {
    id: targetProfileId,
    source: storedProfileId === targetProfileId ? "stored" : "default",
    rootPath: canonicalDirectories.profileRoot,
    codexHome: canonicalDirectories.codexHome,
  };
}

export async function canonicalizeSignedInProfile({
  currentProfile,
  email,
  displayName = null,
  env = process.env,
}) {
  const resolvedEmail = String(email || "").trim().toLowerCase();
  if (!resolvedEmail) {
    return currentProfile;
  }

  const override = env.SENSE1_PROFILE_ID?.trim();
  if (override) {
    await persistProfileIdentity(currentProfile.id, {
      displayName,
      email: resolvedEmail,
      lastSignedInAt: new Date().toISOString(),
    }, env);
    return currentProfile;
  }

  const canonicalProfileId = resolveEmailProfileId(resolvedEmail);
  if (!canonicalProfileId) {
    return currentProfile;
  }

  const currentArtifactRoot = await loadProfileArtifactRoot(currentProfile.id, env) || resolveDefaultArtifactRoot(env);
  const mergeSourceIds = await collectMergeCandidateProfileIds({
    canonicalProfileId,
    currentProfileId: currentProfile.id,
    email: resolvedEmail,
    env,
  });
  await ensureProfileDirectories(canonicalProfileId, env);
  await persistProfileArtifactRoot(canonicalProfileId, currentArtifactRoot, env);
  await ensureProfileSubstrate({
    dbPath: resolveProfileSubstrateDbPath(canonicalProfileId, env),
    profileId: canonicalProfileId,
    actorEmail: resolvedEmail,
  });

  for (const sourceProfileId of mergeSourceIds) {
    if (sanitizeProfileId(sourceProfileId) === canonicalProfileId) {
      continue;
    }
    await mergeProfileFiles(sourceProfileId, canonicalProfileId, env);
    await mergeSubstrateDatabase(sourceProfileId, canonicalProfileId, env);
    await mergeCodexHome(sourceProfileId, canonicalProfileId, env);
    await persistProfileIdentity(sourceProfileId, {
      displayName,
      email: resolvedEmail,
      mergedIntoProfileId: canonicalProfileId,
    }, env);
  }

  const existingIdentity = await loadProfileIdentity(canonicalProfileId, env);
  const legacyProfileIds = [
    ...(Array.isArray(existingIdentity?.legacyProfileIds) ? existingIdentity.legacyProfileIds : []),
    ...mergeSourceIds.filter((sourceProfileId) => sanitizeProfileId(sourceProfileId) !== canonicalProfileId),
  ];
  const canonicalDirectories = await ensureProfileDirectories(canonicalProfileId, env);
  await persistProfileIdentity(canonicalProfileId, {
    displayName,
    email: resolvedEmail,
    lastSignedInAt: new Date().toISOString(),
    legacyProfileIds,
  }, env);
  await persistActiveProfileId(canonicalProfileId, env);

  return {
    id: canonicalProfileId,
    source: currentProfile.id === canonicalProfileId ? currentProfile.source : "stored",
    rootPath: canonicalDirectories.profileRoot,
    codexHome: canonicalDirectories.codexHome,
  };
}
