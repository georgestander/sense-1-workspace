import { DatabaseSync } from "node:sqlite";
import {
  mapEventRow,
  mapObjectRefRow,
  mapPlanRow,
  parseJsonOrNull,
  mapQuestionRow,
  mapSessionRow,
  mapWorkspaceRow,
} from "./substrate-reader-codecs.js";
import {
  EVENT_SELECT_COLUMNS,
  OBJECT_REF_SELECT_COLUMNS,
  PLAN_SELECT_COLUMNS,
  QUESTION_SELECT_COLUMNS,
  SESSION_SELECT_COLUMNS,
  WORKSPACE_SELECT_COLUMNS,
} from "./substrate-reader-queries.js";

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

export async function listRecentWorkspaces({ dbPath, profileId, limit = 20 }) {
  const resolvedDbPath = firstString(dbPath);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to list workspaces.");
  }

  const resolvedProfileId = firstString(profileId);
  if (!resolvedProfileId) {
    throw new Error("A profile id is required to list workspaces.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    const rows = db.prepare(
      `SELECT
        ${WORKSPACE_SELECT_COLUMNS}
      FROM workspaces
      WHERE profile_id = ?
      ORDER BY last_active_at DESC NULLS LAST, registered_at DESC
      LIMIT ?`,
    ).all(resolvedProfileId, limit);

    return rows.map(mapWorkspaceRow);
  } finally {
    db.close();
  }
}

export async function listRecentSessions({ dbPath, profileId, limit = 20 }) {
  const resolvedDbPath = firstString(dbPath);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to list sessions.");
  }

  const resolvedProfileId = firstString(profileId);
  if (!resolvedProfileId) {
    throw new Error("A profile id is required to list sessions.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    const rows = db.prepare(
      `SELECT
        ${SESSION_SELECT_COLUMNS}
      FROM sessions
      WHERE profile_id = ?
      ORDER BY started_at DESC
      LIMIT ?`,
    ).all(resolvedProfileId, limit);

    return rows.map(mapSessionRow);
  } finally {
    db.close();
  }
}

export async function listSessionsByWorkspace({ dbPath, workspaceId, limit = 20 }) {
  const resolvedDbPath = firstString(dbPath);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to list sessions.");
  }

  const resolvedWorkspaceId = firstString(workspaceId);
  if (!resolvedWorkspaceId) {
    throw new Error("A workspace id is required to list sessions by workspace.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    const rows = db.prepare(
      `SELECT
        ${SESSION_SELECT_COLUMNS}
      FROM sessions
      WHERE workspace_id = ?
      ORDER BY started_at DESC
      LIMIT ?`,
    ).all(resolvedWorkspaceId, limit);

    return rows.map(mapSessionRow);
  } finally {
    db.close();
  }
}

export async function getSession({ dbPath, sessionId }) {
  const resolvedDbPath = firstString(dbPath);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to get a session.");
  }

  const resolvedSessionId = firstString(sessionId);
  if (!resolvedSessionId) {
    return null;
  }

  const db = openDatabase(resolvedDbPath);
  try {
    const row = db.prepare(
      `SELECT
        ${SESSION_SELECT_COLUMNS}
      FROM sessions
      WHERE id = ?`,
    ).get(resolvedSessionId);

    return mapSessionRow(row);
  } finally {
    db.close();
  }
}

export async function getWorkspace({ dbPath, workspaceId }) {
  const resolvedDbPath = firstString(dbPath);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to get a workspace.");
  }

  const resolvedWorkspaceId = firstString(workspaceId);
  if (!resolvedWorkspaceId) {
    return null;
  }

  const db = openDatabase(resolvedDbPath);
  try {
    const row = db.prepare(
      `SELECT
        ${WORKSPACE_SELECT_COLUMNS}
      FROM workspaces
      WHERE id = ?`,
    ).get(resolvedWorkspaceId);

    return mapWorkspaceRow(row);
  } finally {
    db.close();
  }
}

export async function getPlan({ dbPath, planId }) {
  const resolvedDbPath = firstString(dbPath);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to get a plan.");
  }

  const resolvedPlanId = firstString(planId);
  if (!resolvedPlanId) {
    return null;
  }

  const db = openDatabase(resolvedDbPath);
  try {
    const row = db.prepare(
      `SELECT
        ${PLAN_SELECT_COLUMNS}
      FROM plans
      WHERE id = ?`,
    ).get(resolvedPlanId);

    return mapPlanRow(row);
  } finally {
    db.close();
  }
}

export async function listPlansBySession({ dbPath, sessionId, limit = 20 }) {
  const resolvedDbPath = firstString(dbPath);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to list plans.");
  }

  const resolvedSessionId = firstString(sessionId);
  if (!resolvedSessionId) {
    throw new Error("A session id is required to list plans by session.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    const rows = db.prepare(
      `SELECT
        ${PLAN_SELECT_COLUMNS}
      FROM plans
      WHERE session_id = ?
      ORDER BY updated_at DESC, created_at DESC
      LIMIT ?`,
    ).all(resolvedSessionId, limit);

    return rows.map(mapPlanRow);
  } finally {
    db.close();
  }
}

export async function listEventsBySession({ dbPath, sessionId, limit = 100 }) {
  const resolvedDbPath = firstString(dbPath);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to list events.");
  }

  const resolvedSessionId = firstString(sessionId);
  if (!resolvedSessionId) {
    throw new Error("A session id is required to list events by session.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    const rows = db.prepare(
      `SELECT
        ${EVENT_SELECT_COLUMNS}
      FROM events
      WHERE session_id = ?
      ORDER BY ts ASC
      LIMIT ?`,
    ).all(resolvedSessionId, limit);

    return rows.map(mapEventRow);
  } finally {
    db.close();
  }
}

export async function listObjectRefsBySession({ dbPath, sessionId, limit = 100 }) {
  const resolvedDbPath = firstString(dbPath);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to list object references.");
  }

  const resolvedSessionId = firstString(sessionId);
  if (!resolvedSessionId) {
    throw new Error("A session id is required to list object references by session.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    const rows = db.prepare(
      `SELECT
        ${OBJECT_REF_SELECT_COLUMNS}
      FROM object_refs
      WHERE session_id = ?
      ORDER BY ts ASC
      LIMIT ?`,
    ).all(resolvedSessionId, limit);

    return rows.map(mapObjectRefRow);
  } finally {
    db.close();
  }
}

export async function listQuestionsBySession({ dbPath, sessionId, limit = 100 }) {
  const resolvedDbPath = firstString(dbPath);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to list questions.");
  }

  const resolvedSessionId = firstString(sessionId);
  if (!resolvedSessionId) {
    throw new Error("A session id is required to list questions by session.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    const rows = db.prepare(
      `SELECT
        ${QUESTION_SELECT_COLUMNS}
      FROM questions
      WHERE session_id = ?
      ORDER BY asked_at ASC
      LIMIT ?`,
    ).all(resolvedSessionId, limit);

    return rows.map(mapQuestionRow);
  } finally {
    db.close();
  }
}

export async function getPendingQuestionByThreadId({ dbPath, codexThreadId }) {
  const resolvedDbPath = firstString(dbPath);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to look up a pending question.");
  }

  const resolvedThreadId = firstString(codexThreadId);
  if (!resolvedThreadId) {
    return null;
  }

  const db = openDatabase(resolvedDbPath);
  try {
    const row = db.prepare(
      `SELECT
        ${QUESTION_SELECT_COLUMNS}
      FROM questions
      WHERE codex_thread_id = ? AND status = 'pending'
      ORDER BY asked_at DESC
      LIMIT 1`,
    ).get(resolvedThreadId);

    return mapQuestionRow(row);
  } finally {
    db.close();
  }
}

export async function getPendingQuestionByRequestId({ dbPath, requestId }) {
  const resolvedDbPath = firstString(dbPath);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to look up a question by request id.");
  }

  if (!Number.isInteger(requestId)) {
    return null;
  }

  const db = openDatabase(resolvedDbPath);
  try {
    const row = db.prepare(
      `SELECT
        ${QUESTION_SELECT_COLUMNS}
      FROM questions
      WHERE request_id = ? AND status = 'pending'
      ORDER BY asked_at DESC
      LIMIT 1`,
    ).get(requestId);

    return mapQuestionRow(row);
  } finally {
    db.close();
  }
}

export async function getLatestPlanForSession({ dbPath, engineTurnId = null, sessionId }) {
  const resolvedDbPath = firstString(dbPath);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to look up plan state.");
  }

  const resolvedSessionId = firstString(sessionId);
  if (!resolvedSessionId) {
    return null;
  }

  const resolvedTurnId = firstString(engineTurnId);
  const db = openDatabase(resolvedDbPath);
  try {
    const row = resolvedTurnId
      ? db.prepare(
          `SELECT
            id,
            ts,
            subject_id,
            engine_turn_id,
            after_state
          FROM events
          WHERE session_id = ? AND verb = 'plan.updated' AND engine_turn_id = ?
          ORDER BY ts DESC
          LIMIT 1`,
        ).get(resolvedSessionId, resolvedTurnId)
      : db.prepare(
          `SELECT
            id,
            ts,
            subject_id,
            engine_turn_id,
            after_state
          FROM events
          WHERE session_id = ? AND verb = 'plan.updated'
          ORDER BY ts DESC
          LIMIT 1`,
        ).get(resolvedSessionId);

    if (!row) {
      return null;
    }

    const afterState = parseJsonOrNull(row.after_state);
    const planText =
      afterState && typeof afterState === "object" && typeof afterState.text === "string"
        ? afterState.text
        : null;
    const planSteps =
      afterState && typeof afterState === "object" && Array.isArray(afterState.steps)
        ? afterState.steps.filter((step) => typeof step === "string")
        : [];

    return {
      eventId: row.id,
      subjectId: firstString(row.subject_id),
      engineTurnId: firstString(row.engine_turn_id),
      planText,
      planSteps,
      ts: row.ts,
    };
  } finally {
    db.close();
  }
}
