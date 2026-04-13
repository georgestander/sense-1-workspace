import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { normalizeWorkspaceRootPath } from "../workspace/workspace-root.ts";
import {
  resolveWorkspaceRowIdentity,
  withWorkspaceIdentityMetadata,
  workspaceComparableRootFromMetadata,
  workspaceIdentityKeyFromMetadata,
} from "./substrate-workspace-identity.js";

function firstString(...values) {
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

function openDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

function runInTransaction(db, callback) {
  db.exec("BEGIN");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Ignore rollback failures and rethrow the original error.
    }
    throw error;
  }
}

function rewriteWorkspacePathPrefix(candidatePath, fromWorkspaceRoot, toWorkspaceRoot) {
  const normalizedCandidatePath = normalizeWorkspaceRootPath(candidatePath);
  const normalizedFromWorkspaceRoot = normalizeWorkspaceRootPath(fromWorkspaceRoot);
  const normalizedToWorkspaceRoot = normalizeWorkspaceRootPath(toWorkspaceRoot);
  if (!normalizedCandidatePath || !normalizedFromWorkspaceRoot || !normalizedToWorkspaceRoot) {
    return normalizedCandidatePath;
  }

  if (normalizedCandidatePath === normalizedFromWorkspaceRoot) {
    return normalizedToWorkspaceRoot;
  }

  const relativePath = path.relative(normalizedFromWorkspaceRoot, normalizedCandidatePath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return normalizedCandidatePath;
  }

  return path.join(normalizedToWorkspaceRoot, relativePath);
}

export function persistWorkspacePolicyRecord(db, record) {
  db.prepare(
    `INSERT INTO workspace_policies (
      workspace_root,
      read_granted,
      read_granted_at,
      read_grant_mode,
      write_mode,
      operating_mode,
      context_paths,
      pinned_paths,
      known_structure,
      last_hydrated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_root) DO UPDATE SET
      read_granted = excluded.read_granted,
      read_granted_at = excluded.read_granted_at,
      read_grant_mode = excluded.read_grant_mode,
      write_mode = excluded.write_mode,
      operating_mode = excluded.operating_mode,
      context_paths = excluded.context_paths,
      pinned_paths = excluded.pinned_paths,
      known_structure = excluded.known_structure,
      last_hydrated_at = excluded.last_hydrated_at`,
  ).run(
    record.workspace_root,
    record.read_granted,
    record.read_granted_at,
    record.read_grant_mode,
    record.write_mode,
    record.operating_mode,
    JSON.stringify(record.context_paths),
    JSON.stringify(record.pinned_paths),
    JSON.stringify(record.known_structure),
    record.last_hydrated_at,
  );
}

export function migrateWorkspacePolicyRoot(db, previousWorkspaceRoot, nextWorkspaceRoot) {
  const normalizedPreviousWorkspaceRoot = normalizeWorkspaceRootPath(previousWorkspaceRoot);
  const normalizedNextWorkspaceRoot = normalizeWorkspaceRootPath(nextWorkspaceRoot);
  if (
    !normalizedPreviousWorkspaceRoot
    || !normalizedNextWorkspaceRoot
    || normalizedPreviousWorkspaceRoot === normalizedNextWorkspaceRoot
  ) {
    return;
  }

  const sourceRow = db.prepare(
    `SELECT
      workspace_root,
      read_granted,
      read_granted_at,
      read_grant_mode,
      write_mode,
      operating_mode,
      context_paths,
      pinned_paths,
      known_structure,
      last_hydrated_at
    FROM workspace_policies
    WHERE workspace_root = ?`,
  ).get(normalizedPreviousWorkspaceRoot);
  if (!sourceRow) {
    return;
  }

  const sourceRecord = mapWorkspacePolicyRow(sourceRow);
  if (!sourceRecord) {
    return;
  }

  const nextRecord = {
    ...sourceRecord,
    context_paths: normalizeWorkspacePathArray(
      sourceRecord.context_paths.map((entry) => rewriteWorkspacePathPrefix(
        entry,
        normalizedPreviousWorkspaceRoot,
        normalizedNextWorkspaceRoot,
      )),
    ),
    known_structure: normalizeWorkspaceStructureEntries(
      sourceRecord.known_structure.map((entry) => ({
        ...entry,
        path: rewriteWorkspacePathPrefix(
          entry.path,
          normalizedPreviousWorkspaceRoot,
          normalizedNextWorkspaceRoot,
        ) ?? entry.path,
      })),
    ),
    pinned_paths: normalizeWorkspacePathArray(
      sourceRecord.pinned_paths.map((entry) => rewriteWorkspacePathPrefix(
        entry,
        normalizedPreviousWorkspaceRoot,
        normalizedNextWorkspaceRoot,
      )),
    ),
    workspace_root: normalizedNextWorkspaceRoot,
  };

  persistWorkspacePolicyRecord(db, nextRecord);
  db.prepare("DELETE FROM workspace_policies WHERE workspace_root = ?").run(normalizedPreviousWorkspaceRoot);
}

function parseJsonStringArray(value) {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

const DEFAULT_WORKSPACE_WRITE_MODE = "conversation";
const DEFAULT_WORKSPACE_OPERATING_MODE = "auto";
const WORKSPACE_WRITE_MODES = new Set(["conversation", "plan_required", "trusted"]);
const WORKSPACE_OPERATING_MODES = new Set(["preview", "auto", "apply"]);
const WORKSPACE_PERMISSION_MODES = new Set(["once", "always"]);

export function normalizeWorkspacePathArray(value) {
  return Array.from(new Set(normalizeStringArray(value).map((entry) => path.resolve(entry))));
}

function parseJsonRecordArray(value) {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed
          .map((entry) => {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
              return null;
            }

            const name = firstString(entry.name);
            const type = firstString(entry.type);
            const entryPath = firstString(entry.path);
            if (!name || !type || !entryPath) {
              return null;
            }

            return {
              name,
              path: path.resolve(entryPath),
              type,
            };
          })
          .filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export function normalizeWorkspaceStructureEntries(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const name = firstString(entry.name);
      const type = firstString(entry.type);
      const entryPath = firstString(entry.path);
      if (!name || !type || !entryPath) {
        return null;
      }

      return {
        name,
        path: path.resolve(entryPath),
        type,
      };
    })
    .filter(Boolean);
}

export function normalizeWorkspaceWriteMode(value, fallback = DEFAULT_WORKSPACE_WRITE_MODE) {
  const resolvedWriteMode = firstString(value);
  if (resolvedWriteMode && WORKSPACE_WRITE_MODES.has(resolvedWriteMode)) {
    return resolvedWriteMode === "plan_required" ? "conversation" : resolvedWriteMode;
  }

  if (WORKSPACE_WRITE_MODES.has(fallback)) {
    return fallback === "plan_required" ? "conversation" : fallback;
  }

  return DEFAULT_WORKSPACE_WRITE_MODE;
}

export function normalizeWorkspaceOperatingMode(value, fallback = DEFAULT_WORKSPACE_OPERATING_MODE) {
  const resolvedOperatingMode = firstString(value);
  if (resolvedOperatingMode && WORKSPACE_OPERATING_MODES.has(resolvedOperatingMode)) {
    return resolvedOperatingMode;
  }

  return WORKSPACE_OPERATING_MODES.has(fallback) ? fallback : DEFAULT_WORKSPACE_OPERATING_MODE;
}

export function normalizeWorkspacePermissionMode(value, fallback = null) {
  const resolvedMode = firstString(value);
  if (resolvedMode && WORKSPACE_PERMISSION_MODES.has(resolvedMode)) {
    return resolvedMode;
  }

  if (fallback && WORKSPACE_PERMISSION_MODES.has(fallback)) {
    return fallback;
  }

  return null;
}

export function createDefaultWorkspacePolicyRecord(workspaceRoot) {
  const resolvedWorkspaceRoot = normalizeWorkspaceRootPath(workspaceRoot);
  if (!resolvedWorkspaceRoot) {
    throw new Error("A workspace root path is required to load workspace policy.");
  }

  return {
    context_paths: [],
    known_structure: [],
    last_hydrated_at: null,
    pinned_paths: [],
    read_granted: 0,
    read_granted_at: null,
    read_grant_mode: null,
    workspace_root: resolvedWorkspaceRoot,
    operating_mode: DEFAULT_WORKSPACE_OPERATING_MODE,
    write_mode: DEFAULT_WORKSPACE_WRITE_MODE,
  };
}

export function mapWorkspacePolicyRow(row) {
  if (!row) {
    return null;
  }

  const resolvedWorkspaceRoot = normalizeWorkspaceRootPath(row.workspace_root);
  if (!resolvedWorkspaceRoot) {
    throw new Error("A workspace policy row is missing its workspace root.");
  }

  return {
    context_paths: normalizeWorkspacePathArray(parseJsonStringArray(row.context_paths)),
    known_structure: parseJsonRecordArray(row.known_structure),
    last_hydrated_at: firstString(row.last_hydrated_at) ?? null,
    pinned_paths: normalizeWorkspacePathArray(parseJsonStringArray(row.pinned_paths)),
    read_granted: Number(row.read_granted) === 1 ? 1 : 0,
    read_granted_at: firstString(row.read_granted_at) ?? null,
    read_grant_mode: normalizeWorkspacePermissionMode(row.read_grant_mode),
    workspace_root: resolvedWorkspaceRoot,
    operating_mode: normalizeWorkspaceOperatingMode(row.operating_mode),
    write_mode: normalizeWorkspaceWriteMode(row.write_mode),
  };
}

export function readWorkspacePolicyRecord(db, workspaceRoot) {
  const resolvedWorkspaceRoot = normalizeWorkspaceRootPath(workspaceRoot);
  if (!resolvedWorkspaceRoot) {
    return null;
  }

  const row = db.prepare(
    `SELECT
      workspace_root,
      read_granted,
      read_granted_at,
      read_grant_mode,
      write_mode,
      operating_mode,
      context_paths,
      pinned_paths,
      known_structure,
      last_hydrated_at
    FROM workspace_policies
    WHERE workspace_root = ?`,
  ).get(resolvedWorkspaceRoot);

  return row ? mapWorkspacePolicyRow(row) : createDefaultWorkspacePolicyRecord(resolvedWorkspaceRoot);
}

export function listWorkspacePolicyRoots(db) {
  return db.prepare(
    `SELECT workspace_root
    FROM (
      SELECT root_path AS workspace_root FROM workspaces
      UNION
      SELECT workspace_root FROM workspace_policies
    )
    WHERE workspace_root IS NOT NULL
    ORDER BY workspace_root`,
  ).all().map((row) => normalizeWorkspaceRootPath(row.workspace_root)).filter(Boolean);
}

export async function upsertWorkspacePolicy({
  contextPaths,
  dbPath,
  lastHydratedAt,
  knownStructure,
  operatingMode,
  pinnedPaths,
  readGranted,
  readGrantedAt,
  readGrantMode,
  workspaceRoot,
  writeMode,
}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedWorkspaceRoot = normalizeWorkspaceRootPath(workspaceRoot);
  if (!resolvedDbPath || !resolvedWorkspaceRoot) {
    throw new Error("A substrate database path and workspace root path are required to update workspace policy.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    return runInTransaction(db, () => {
      const existing =
        readWorkspacePolicyRecord(db, resolvedWorkspaceRoot)
        ?? createDefaultWorkspacePolicyRecord(resolvedWorkspaceRoot);
      const nextRecord = {
        context_paths: contextPaths !== undefined ? normalizeWorkspacePathArray(contextPaths) : existing.context_paths,
        known_structure: knownStructure !== undefined
          ? normalizeWorkspaceStructureEntries(knownStructure)
          : existing.known_structure,
        last_hydrated_at: lastHydratedAt !== undefined ? firstString(lastHydratedAt) ?? null : existing.last_hydrated_at,
        pinned_paths: pinnedPaths !== undefined ? normalizeWorkspacePathArray(pinnedPaths) : existing.pinned_paths,
        read_granted: readGranted !== undefined ? (readGranted ? 1 : 0) : existing.read_granted,
        read_granted_at: readGrantedAt !== undefined ? firstString(readGrantedAt) ?? null : existing.read_granted_at,
        read_grant_mode: readGrantMode !== undefined
          ? normalizeWorkspacePermissionMode(readGrantMode, existing.read_grant_mode)
          : existing.read_grant_mode,
        workspace_root: resolvedWorkspaceRoot,
        operating_mode: operatingMode !== undefined
          ? normalizeWorkspaceOperatingMode(operatingMode, existing.operating_mode)
          : existing.operating_mode,
        write_mode: writeMode !== undefined
          ? normalizeWorkspaceWriteMode(writeMode, existing.write_mode)
          : existing.write_mode,
      };

      persistWorkspacePolicyRecord(db, nextRecord);
      return readWorkspacePolicyRecord(db, resolvedWorkspaceRoot);
    });
  } finally {
    db.close();
  }
}

export async function loadWorkspacePolicy({
  dbPath,
  workspaceRoot,
}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedWorkspaceRoot = normalizeWorkspaceRootPath(workspaceRoot);
  if (!resolvedDbPath || !resolvedWorkspaceRoot) {
    throw new Error("A substrate database path and workspace root path are required to load workspace policy.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    return readWorkspacePolicyRecord(db, resolvedWorkspaceRoot);
  } finally {
    db.close();
  }
}

export async function loadAllWorkspacePolicies({
  dbPath,
}) {
  const resolvedDbPath = firstString(dbPath);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to load workspace policies.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    return listWorkspacePolicyRoots(db)
      .map((workspaceRoot) => readWorkspacePolicyRecord(db, workspaceRoot))
      .filter(Boolean);
  } finally {
    db.close();
  }
}
