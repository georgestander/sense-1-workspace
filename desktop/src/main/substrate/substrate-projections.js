import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  insertProjectionRows,
  rebuildProjectionRows,
} from "./substrate-projection-rebuild.js";
import {
  clearProjectionRows,
  ensureProjectionSchema,
  mapSessionProjectionRow,
  mapWorkspaceProjectionRow,
} from "./substrate-projection-store.js";

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

function normalizeRootPath(rootPath) {
  const resolvedRootPath = firstString(rootPath);
  if (!resolvedRootPath) {
    return null;
  }

  return path.resolve(resolvedRootPath);
}

function openDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
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

function parseJsonValue(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value;
}

function maxTimestamp(left, right) {
  const resolvedLeft = firstString(left);
  const resolvedRight = firstString(right);
  if (!resolvedLeft) {
    return resolvedRight;
  }

  if (!resolvedRight) {
    return resolvedLeft;
  }

  return resolvedLeft >= resolvedRight ? resolvedLeft : resolvedRight;
}

function pushBounded(list, value, limit) {
  list.push(value);
  if (list.length > limit) {
    list.splice(0, list.length - limit);
  }
}

function pushUniqueRecent(list, value, limit) {
  const resolvedValue = firstString(value);
  if (!resolvedValue) {
    return;
  }

  const existingIndex = list.indexOf(resolvedValue);
  if (existingIndex >= 0) {
    list.splice(existingIndex, 1);
  }
  list.push(resolvedValue);
  if (list.length > limit) {
    list.splice(0, list.length - limit);
  }
}

export async function clearSubstrateProjections({ dbPath, profileId = null }) {
  const resolvedDbPath = firstString(dbPath);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to clear projections.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    ensureProjectionSchema(db);
    clearProjectionRows(db, profileId, firstString);
  } finally {
    db.close();
  }
}

export async function rebuildSubstrateProjections({ dbPath, profileId = null }) {
  const resolvedDbPath = firstString(dbPath);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to rebuild projections.");
  }

  const resolvedProfileId = firstString(profileId);
  const db = openDatabase(resolvedDbPath);
  try {
    ensureProjectionSchema(db);
    db.exec("BEGIN");
    clearProjectionRows(db, resolvedProfileId, firstString);

    const workspaceRows = db.prepare(
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
      ${resolvedProfileId ? "WHERE profile_id = ?" : ""}
      ORDER BY registered_at ASC`,
    ).all(...(resolvedProfileId ? [resolvedProfileId] : []));

    const sessionRows = db.prepare(
      `SELECT
        id,
        profile_id,
        scope_id,
        actor_id,
        codex_thread_id,
        workspace_id,
        title,
        model,
        effort,
        status,
        started_at,
        ended_at,
        summary,
        metadata
      FROM sessions
      ${resolvedProfileId ? "WHERE profile_id = ?" : ""}
      ORDER BY started_at ASC`,
    ).all(...(resolvedProfileId ? [resolvedProfileId] : []));

    const eventRows = db.prepare(
      `SELECT
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
        session_id,
        profile_id
      FROM events
      ${resolvedProfileId ? "WHERE profile_id = ?" : ""}
      ORDER BY ts ASC, rowid ASC`,
    ).all(...(resolvedProfileId ? [resolvedProfileId] : []));

    const { sessionProjectionById, workspaceProjectionById } = rebuildProjectionRows({
      eventRows,
      helpers: {
        asRecord,
        firstString,
        maxTimestamp,
        parseJsonObject,
        parseJsonValue,
        pushBounded,
        pushUniqueRecent,
      },
      sessionRows,
      workspaceRows,
    });

    insertProjectionRows({
      db,
      sessionProjectionById,
      workspaceProjectionById,
    });

    db.exec("COMMIT");

    return {
      profileId: resolvedProfileId,
      rebuiltAt: new Date().toISOString(),
      sessionCount: sessionProjectionById.size,
      sourceEventCount: eventRows.length,
      workspaceCount: workspaceProjectionById.size,
    };
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Ignore rollback failures and rethrow the original error.
    }
    throw error;
  } finally {
    db.close();
  }
}

export async function listProjectedWorkspaces({ dbPath, profileId, limit = 20, rootPath = null }) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedProfileId = firstString(profileId);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to list projected workspaces.");
  }
  if (!resolvedProfileId) {
    throw new Error("A profile id is required to list projected workspaces.");
  }

  const resolvedRootPath = firstString(rootPath);
  const db = openDatabase(resolvedDbPath);
  try {
    ensureProjectionSchema(db);
    const rows = db.prepare(
      `SELECT
        workspace_id,
        profile_id,
        scope_id,
        root_path,
        display_name,
        registered_at,
        last_activity_at,
        session_count,
        event_count,
        file_change_count,
        command_count,
        tool_count,
        approval_count,
        policy_count,
        last_session_id,
        last_thread_id,
        recent_file_paths,
        activity_summary,
        metadata
      FROM workspace_projections
      WHERE profile_id = ?
      ${resolvedRootPath ? "AND root_path = ?" : ""}
      ORDER BY last_activity_at DESC NULLS LAST, registered_at DESC
      LIMIT ?`,
    ).all(...(resolvedRootPath ? [resolvedProfileId, resolvedRootPath, limit] : [resolvedProfileId, limit]));

    return rows.map(mapWorkspaceProjectionRow);
  } finally {
    db.close();
  }
}

export async function listProjectedSessions({ dbPath, profileId, workspaceId = null, limit = 20 }) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedProfileId = firstString(profileId);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to list projected sessions.");
  }
  if (!resolvedProfileId) {
    throw new Error("A profile id is required to list projected sessions.");
  }

  const resolvedWorkspaceId = firstString(workspaceId);
  const db = openDatabase(resolvedDbPath);
  try {
    ensureProjectionSchema(db);
    const rows = db.prepare(
      `SELECT
        session_id,
        profile_id,
        scope_id,
        workspace_id,
        actor_id,
        codex_thread_id,
        title,
        model,
        effort,
        status,
        started_at,
        ended_at,
        summary,
        last_activity_at,
        event_count,
        file_change_count,
        command_count,
        tool_count,
        approval_count,
        policy_count,
        timeline,
        file_history,
        metadata
      FROM session_projections
      WHERE profile_id = ?
      ${resolvedWorkspaceId ? "AND workspace_id = ?" : ""}
      ORDER BY COALESCE(last_activity_at, started_at) DESC, started_at DESC
      LIMIT ?`,
    ).all(...(resolvedWorkspaceId ? [resolvedProfileId, resolvedWorkspaceId, limit] : [resolvedProfileId, limit]));

    return rows.map(mapSessionProjectionRow);
  } finally {
    db.close();
  }
}

export async function getProjectedWorkspace({ dbPath, workspaceId }) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedWorkspaceId = firstString(workspaceId);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to get a projected workspace.");
  }
  if (!resolvedWorkspaceId) {
    return null;
  }

  const db = openDatabase(resolvedDbPath);
  try {
    ensureProjectionSchema(db);
    const row = db.prepare(
      `SELECT
        workspace_id,
        profile_id,
        scope_id,
        root_path,
        display_name,
        registered_at,
        last_activity_at,
        session_count,
        event_count,
        file_change_count,
        command_count,
        tool_count,
        approval_count,
        policy_count,
        last_session_id,
        last_thread_id,
        recent_file_paths,
        activity_summary,
        metadata
      FROM workspace_projections
      WHERE workspace_id = ?`,
    ).get(resolvedWorkspaceId);

    return mapWorkspaceProjectionRow(row);
  } finally {
    db.close();
  }
}

export async function getProjectedWorkspaceByRootPath({ dbPath, profileId, rootPath }) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedProfileId = firstString(profileId);
  const resolvedRootPath = normalizeRootPath(rootPath);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to get a projected workspace by root path.");
  }
  if (!resolvedProfileId) {
    throw new Error("A profile id is required to get a projected workspace by root path.");
  }
  if (!resolvedRootPath) {
    return null;
  }

  const db = openDatabase(resolvedDbPath);
  try {
    ensureProjectionSchema(db);
    const row = db.prepare(
      `SELECT
        workspace_id,
        profile_id,
        scope_id,
        root_path,
        display_name,
        registered_at,
        last_activity_at,
        session_count,
        event_count,
        file_change_count,
        command_count,
        tool_count,
        approval_count,
        policy_count,
        last_session_id,
        last_thread_id,
        recent_file_paths,
        activity_summary,
        metadata
      FROM workspace_projections
      WHERE profile_id = ? AND root_path = ?`,
    ).get(resolvedProfileId, resolvedRootPath);

    return mapWorkspaceProjectionRow(row);
  } finally {
    db.close();
  }
}

export async function getProjectedSession({ dbPath, sessionId }) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedSessionId = firstString(sessionId);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to get a projected session.");
  }
  if (!resolvedSessionId) {
    return null;
  }

  const db = openDatabase(resolvedDbPath);
  try {
    ensureProjectionSchema(db);
    const row = db.prepare(
      `SELECT
        session_id,
        profile_id,
        scope_id,
        workspace_id,
        actor_id,
        codex_thread_id,
        title,
        model,
        effort,
        status,
        started_at,
        ended_at,
        summary,
        last_activity_at,
        event_count,
        file_change_count,
        command_count,
        tool_count,
        approval_count,
        policy_count,
        timeline,
        file_history,
        metadata
      FROM session_projections
      WHERE session_id = ?`,
    ).get(resolvedSessionId);

    return mapSessionProjectionRow(row);
  } finally {
    db.close();
  }
}
