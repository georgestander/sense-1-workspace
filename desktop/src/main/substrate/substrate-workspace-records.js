import { randomUUID } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  normalizeWorkspaceRootPath,
} from "../workspace/workspace-root.ts";
import {
  setWorkspaceLifecycleState as applyWorkspaceLifecycleState,
} from "../../shared/lifecycle.js";
import { migrateWorkspacePolicyRoot } from "./substrate-workspace-policies.js";
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

function parseJsonObject(value) {
  if (typeof value !== "string" || !value.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function serializeJson(value) {
  if (value === undefined || value === null) {
    return null;
  }

  return JSON.stringify(value);
}

function createId(prefix) {
  return `${prefix}_${randomUUID()}`;
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

function mapWorkspaceRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    metadata: parseJsonObject(row.metadata),
  };
}

function insertEventRecord(db, {
  actorId,
  afterState = null,
  beforeState = null,
  causationId = null,
  correlationId = null,
  detail = null,
  engineItemId = null,
  engineTurnId = null,
  id = createId("evt"),
  profileId,
  scopeId,
  sessionId = null,
  sourceEventIds = null,
  subjectId = null,
  subjectType = null,
  ts = new Date().toISOString(),
  verb,
}) {
  db.prepare(
    `INSERT INTO events (
      id,
      ts,
      actor_id,
      scope_id,
      verb,
      subject_type,
      subject_id,
      before_state,
      after_state,
      detail,
      engine_turn_id,
      engine_item_id,
      source_event_ids,
      causation_id,
      correlation_id,
      session_id,
      profile_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    ts,
    actorId,
    scopeId,
    verb,
    subjectType,
    subjectId,
    serializeJson(beforeState),
    serializeJson(afterState),
    serializeJson(detail),
    engineTurnId,
    engineItemId,
    serializeJson(sourceEventIds),
    causationId,
    correlationId,
    sessionId,
    profileId,
  );

  return id;
}

function getWorkspaceByIdWithDatabase(db, workspaceId) {
  const resolvedWorkspaceId = firstString(workspaceId);
  if (!resolvedWorkspaceId) {
    return null;
  }

  const row = db.prepare(
    `SELECT
      id,
      profile_id,
      scope_id,
      root_path,
      display_name,
      registered_at,
      last_active_at,
      session_count,
      metadata
    FROM workspaces
    WHERE id = ?`,
  ).get(resolvedWorkspaceId);

  return mapWorkspaceRow(row);
}

export function ensureWorkspaceWithDatabase(db, {
  actorId,
  now,
  profileId,
  rootPath,
  scopeId,
}) {
  const normalizedRootPath = normalizeWorkspaceRootPath(rootPath);
  if (!normalizedRootPath) {
    return null;
  }

  const nextDisplayName = path.basename(normalizedRootPath);
  const requestedMetadata = withWorkspaceIdentityMetadata({}, normalizedRootPath);
  const nextIdentityKey = workspaceIdentityKeyFromMetadata(requestedMetadata);
  const nextComparableRootPath = workspaceComparableRootFromMetadata(requestedMetadata);
  const workspaces = db.prepare(
    `SELECT
      id,
      profile_id,
      scope_id,
      root_path,
      display_name,
      registered_at,
      last_active_at,
      session_count,
      metadata
    FROM workspaces
    WHERE scope_id = ?`,
  ).all(scopeId).map(mapWorkspaceRow).filter(Boolean);
  const resolvedWorkspaces = workspaces.map((workspace) => ({
    identity: resolveWorkspaceRowIdentity(workspace),
    workspace,
  }));
  let existingMatch =
    resolvedWorkspaces.find(({ workspace }) => workspace.root_path === normalizedRootPath)
    ?? null;

  if (!existingMatch && nextIdentityKey) {
    existingMatch =
      resolvedWorkspaces.find(({ identity }) => identity.identityKey === nextIdentityKey)
      ?? null;
  }

  if (!existingMatch && nextComparableRootPath) {
    existingMatch =
      resolvedWorkspaces.find(({ identity }) => identity.comparableRootPath === nextComparableRootPath)
      ?? null;
  }

  if (!existingMatch) {
    const legacyMatches = resolvedWorkspaces.filter(({ identity, workspace }) => {
      if (workspace.root_path === normalizedRootPath) {
        return false;
      }

      if (identity.identityKey) {
        return false;
      }

      if (
        workspaceIdentityKeyFromMetadata(workspace.metadata)
        || workspaceComparableRootFromMetadata(workspace.metadata)
      ) {
        return false;
      }

      const displayName = firstString(workspace.display_name, path.basename(workspace.root_path));
      return displayName === nextDisplayName;
    });

    if (legacyMatches.length === 1) {
      existingMatch = legacyMatches[0];
    }
  }

  const existing = existingMatch?.workspace ?? null;
  const nextMetadata = withWorkspaceIdentityMetadata(existing?.metadata ?? {}, normalizedRootPath);

  if (existing) {
    if (
      existing.root_path !== normalizedRootPath
      || JSON.stringify(existing.metadata ?? {}) !== JSON.stringify(nextMetadata)
      || existing.display_name !== nextDisplayName
    ) {
      db.prepare(
        `UPDATE workspaces
        SET root_path = ?,
            display_name = ?,
            metadata = ?
        WHERE id = ?`,
      ).run(
        normalizedRootPath,
        nextDisplayName,
        serializeJson(nextMetadata),
        existing.id,
      );

      migrateWorkspacePolicyRoot(db, existing.root_path, normalizedRootPath);

      const linkedSessions = db.prepare(
        `SELECT id, metadata
        FROM sessions
        WHERE workspace_id = ?`,
      ).all(existing.id);

      for (const session of linkedSessions) {
        const nextSessionMetadata = parseJsonObject(session.metadata);
        nextSessionMetadata.workspaceRoot = normalizedRootPath;
        db.prepare(
          `UPDATE sessions
          SET metadata = ?
          WHERE id = ?`,
        ).run(serializeJson(nextSessionMetadata), session.id);
      }
    }

    return {
      ...existing,
      display_name: nextDisplayName,
      isNew: false,
      metadata: nextMetadata,
      root_path: normalizedRootPath,
    };
  }

  const workspaceId = createId("workspace");
  const displayName = nextDisplayName;
  db.prepare(
    `INSERT INTO workspaces (
      id,
      profile_id,
      scope_id,
      root_path,
      display_name,
      registered_at,
      last_active_at,
      session_count,
      metadata
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?)`,
  ).run(
    workspaceId,
    profileId,
    scopeId,
    normalizedRootPath,
    displayName,
    now,
    serializeJson(nextMetadata),
  );

  insertEventRecord(db, {
    actorId,
    afterState: {
      display_name: displayName,
      root_path: normalizedRootPath,
      session_count: 0,
    },
    detail: {
      rootPath: normalizedRootPath,
    },
    profileId,
    scopeId,
    subjectId: workspaceId,
    subjectType: "workspace",
    ts: now,
    verb: "workspace.registered",
  });

  return {
    display_name: displayName,
    id: workspaceId,
    isNew: true,
    last_active_at: null,
    metadata: nextMetadata,
    profile_id: profileId,
    registered_at: now,
    root_path: normalizedRootPath,
    scope_id: scopeId,
    session_count: 0,
  };
}

export async function rememberSubstrateWorkspace({
  actorId,
  dbPath,
  now = new Date().toISOString(),
  profileId,
  scopeId,
  workspaceRoot,
}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedProfileId = firstString(profileId);
  const resolvedScopeId = firstString(scopeId);
  const resolvedActorId = firstString(actorId);
  const resolvedWorkspaceRoot = normalizeWorkspaceRootPath(workspaceRoot);
  if (!resolvedDbPath || !resolvedProfileId || !resolvedScopeId || !resolvedActorId || !resolvedWorkspaceRoot) {
    throw new Error("A database path, profile id, scope id, actor id, and workspace root are required to remember a workspace.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    return runInTransaction(db, () => ensureWorkspaceWithDatabase(db, {
      actorId: resolvedActorId,
      now,
      profileId: resolvedProfileId,
      rootPath: resolvedWorkspaceRoot,
      scopeId: resolvedScopeId,
    }));
  } finally {
    db.close();
  }
}

export async function setSubstrateWorkspaceLifecycleState({
  dbPath,
  workspaceId,
  status,
  archivedAt = null,
}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedWorkspaceId = firstString(workspaceId);
  const resolvedStatus = firstString(status);
  if (!resolvedDbPath || !resolvedWorkspaceId || !resolvedStatus) {
    return null;
  }

  const db = openDatabase(resolvedDbPath);
  try {
    return runInTransaction(db, () => {
      const existingWorkspace = getWorkspaceByIdWithDatabase(db, resolvedWorkspaceId);
      if (!existingWorkspace) {
        return null;
      }

      const nextMetadata = applyWorkspaceLifecycleState(
        existingWorkspace.metadata,
        resolvedStatus,
        archivedAt,
      );

      db.prepare(
        `UPDATE workspaces
        SET metadata = ?
        WHERE id = ?`,
      ).run(JSON.stringify(nextMetadata), resolvedWorkspaceId);

      return {
        ...existingWorkspace,
        metadata: nextMetadata,
      };
    });
  } finally {
    db.close();
  }
}

export async function deleteSubstrateWorkspace({
  dbPath,
  workspaceId,
}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedWorkspaceId = firstString(workspaceId);
  if (!resolvedDbPath || !resolvedWorkspaceId) {
    return null;
  }

  const db = openDatabase(resolvedDbPath);
  try {
    return runInTransaction(db, () => {
      const workspace = getWorkspaceByIdWithDatabase(db, resolvedWorkspaceId);
      if (!workspace) {
        return null;
      }

      db.prepare(
        `DELETE FROM events
        WHERE subject_type = 'workspace' AND subject_id = ?`,
      ).run(resolvedWorkspaceId);
      db.prepare("DELETE FROM workspace_policies WHERE workspace_root = ?").run(workspace.root_path);
      db.prepare("DELETE FROM workspaces WHERE id = ?").run(resolvedWorkspaceId);
      return workspace;
    });
  } finally {
    db.close();
  }
}
