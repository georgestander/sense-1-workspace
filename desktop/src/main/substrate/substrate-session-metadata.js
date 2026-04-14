import {
  mapSessionRow,
  serializeJson,
} from "./substrate-record-codecs.js";
import {
  createId,
  firstString,
  openDatabase,
  runInTransaction,
} from "./substrate-store-core.js";
import {
  buildThreadTitleContext,
  shouldAutoRenameThreadTitle,
  summarizeEarlyConversationThreadTitle,
} from "./thread-title-summarizer.js";

const PLACEHOLDER_THREAD_TITLES = new Set([
  "untitled thread",
  "new thread",
  "new task",
  "current thread",
]);

export function normalizeRuntimeThreadTitle(title) {
  const resolvedTitle = firstString(title);
  if (!resolvedTitle) {
    return null;
  }

  return PLACEHOLDER_THREAD_TITLES.has(resolvedTitle.toLowerCase()) ? null : resolvedTitle;
}

export function insertEventRecord(db, {
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

export function insertObjectRefRecord(db, {
  action = null,
  id = createId("objref"),
  metadata = null,
  refId = null,
  refPath = null,
  refType,
  sessionId,
  ts = new Date().toISOString(),
}) {
  db.prepare(
    `INSERT INTO object_refs (
      id,
      session_id,
      ref_type,
      ref_path,
      ref_id,
      action,
      ts,
      metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    sessionId,
    refType,
    refPath,
    refId,
    action,
    ts,
    serializeJson(metadata),
  );

  return id;
}

export function getSessionByThreadIdWithDatabase(db, codexThreadId) {
  const resolvedThreadId = firstString(codexThreadId);
  if (!resolvedThreadId) {
    return null;
  }

  const row = db.prepare(
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
    WHERE codex_thread_id = ?`,
  ).get(resolvedThreadId);

  return mapSessionRow(row);
}

export function getSessionByIdWithDatabase(db, sessionId) {
  const resolvedSessionId = firstString(sessionId);
  if (!resolvedSessionId) {
    return null;
  }

  const row = db.prepare(
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
    WHERE id = ?`,
  ).get(resolvedSessionId);

  return mapSessionRow(row);
}

export async function getSubstrateSessionByThreadId({
  codexThreadId,
  dbPath,
}) {
  const resolvedDbPath = firstString(dbPath);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to look up a session.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    return getSessionByThreadIdWithDatabase(db, codexThreadId);
  } finally {
    db.close();
  }
}

export async function appendSubstrateEvent(input) {
  const resolvedDbPath = firstString(input.dbPath);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to append an event.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    return insertEventRecord(db, input);
  } finally {
    db.close();
  }
}

export async function appendSubstrateObjectRef(input) {
  const resolvedDbPath = firstString(input.dbPath);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to append an object reference.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    return insertObjectRefRecord(db, input);
  } finally {
    db.close();
  }
}

export async function updateSubstrateSessionThreadTitle({
  codexThreadId,
  dbPath,
  title = null,
}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedThreadId = firstString(codexThreadId);
  const resolvedTitle = normalizeRuntimeThreadTitle(title);
  if (!resolvedDbPath || !resolvedThreadId) {
    throw new Error("A substrate database path and thread id are required to update a session title.");
  }

  if (!resolvedTitle) {
    return null;
  }

  const db = openDatabase(resolvedDbPath);
  try {
    return runInTransaction(db, () => {
      const existingSession = getSessionByThreadIdWithDatabase(db, resolvedThreadId);
      if (!existingSession) {
        return null;
      }

      db.prepare(
        `UPDATE sessions
        SET title = ?
        WHERE id = ?`,
      ).run(resolvedTitle, existingSession.id);

      return getSessionByThreadIdWithDatabase(db, resolvedThreadId);
    });
  } finally {
    db.close();
  }
}

export async function updateSubstrateSessionReviewSummary({
  dbPath,
  sessionId,
  summary = null,
  updatedAt = new Date().toISOString(),
}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedSessionId = firstString(sessionId);
  const resolvedUpdatedAt = firstString(updatedAt) || new Date().toISOString();
  if (!resolvedDbPath || !resolvedSessionId) {
    throw new Error("A substrate database path and session id are required to update a session review summary.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    return runInTransaction(db, () => {
      const existingSession = getSessionByIdWithDatabase(db, resolvedSessionId);
      if (!existingSession) {
        throw new Error(`Could not find substrate session ${resolvedSessionId}.`);
      }

      const metadata = { ...existingSession.metadata };
      metadata.reviewSummary = {
        summary: firstString(summary),
        updatedAt: resolvedUpdatedAt,
      };
      db.prepare(
        `UPDATE sessions
        SET summary = COALESCE(?, summary),
            metadata = ?
        WHERE id = ?`,
      ).run(
        firstString(summary),
        JSON.stringify(metadata),
        resolvedSessionId,
      );

      return {
        sessionId: resolvedSessionId,
        summary: firstString(summary, existingSession.summary),
        updatedAt: resolvedUpdatedAt,
      };
    });
  } finally {
    db.close();
  }
}

export async function updateSubstrateSessionTitleContext({
  assistantText = null,
  dbPath,
  sessionId,
  userText = null,
}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedSessionId = firstString(sessionId);
  if (!resolvedDbPath || !resolvedSessionId) {
    throw new Error("A substrate database path and session id are required to update title context.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    return runInTransaction(db, () => {
      const existingSession = getSessionByIdWithDatabase(db, resolvedSessionId);
      if (!existingSession) {
        throw new Error(`Could not find substrate session ${resolvedSessionId}.`);
      }

      const metadata = { ...existingSession.metadata };
      const titleContext = buildThreadTitleContext(metadata.titleContext, {
        assistantText,
        seedTitle: existingSession.title,
        userText,
      });
      const suggestedTitle = shouldAutoRenameThreadTitle({
        currentTitle: existingSession.title,
        titleContext,
      })
        ? summarizeEarlyConversationThreadTitle(titleContext)
        : null;
      const nextTitle = firstString(suggestedTitle, existingSession.title);
      const nextTitleContext = buildThreadTitleContext(titleContext, {
        autoTitle: suggestedTitle,
      });
      metadata.titleContext = nextTitleContext;

      db.prepare(
        `UPDATE sessions
        SET title = COALESCE(?, title),
            metadata = ?
        WHERE id = ?`,
      ).run(
        firstString(suggestedTitle),
        JSON.stringify(metadata),
        resolvedSessionId,
      );

      return {
        sessionId: resolvedSessionId,
        title: nextTitle,
        titleUpdated: Boolean(suggestedTitle && suggestedTitle !== existingSession.title),
      };
    });
  } finally {
    db.close();
  }
}

export async function deleteSubstrateSession({
  dbPath,
  sessionId,
}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedSessionId = firstString(sessionId);
  if (!resolvedDbPath || !resolvedSessionId) {
    return;
  }

  const db = openDatabase(resolvedDbPath);
  try {
    runInTransaction(db, () => {
      db.prepare("DELETE FROM plans WHERE session_id = ?").run(resolvedSessionId);
      db.prepare("DELETE FROM questions WHERE session_id = ?").run(resolvedSessionId);
      db.prepare("DELETE FROM plans WHERE session_id = ?").run(resolvedSessionId);
      db.prepare("DELETE FROM object_refs WHERE session_id = ?").run(resolvedSessionId);
      db.prepare("DELETE FROM events WHERE session_id = ?").run(resolvedSessionId);
      db.prepare("DELETE FROM sessions WHERE id = ?").run(resolvedSessionId);
    });
  } finally {
    db.close();
  }
}

export async function setSubstrateSessionStatus({
  dbPath,
  sessionId,
  status,
}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedSessionId = firstString(sessionId);
  const resolvedStatus = firstString(status);
  if (!resolvedDbPath || !resolvedSessionId || !resolvedStatus) {
    return null;
  }

  const db = openDatabase(resolvedDbPath);
  try {
    return runInTransaction(db, () => {
      const existingSession = getSessionByIdWithDatabase(db, resolvedSessionId);
      if (!existingSession) {
        return null;
      }

      db.prepare(
        `UPDATE sessions
        SET status = ?
        WHERE id = ?`,
      ).run(resolvedStatus, resolvedSessionId);

      return {
        ...existingSession,
        status: resolvedStatus,
      };
    });
  } finally {
    db.close();
  }
}

export async function listSubstrateSessionsByWorkspace({
  dbPath,
  workspaceId,
}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedWorkspaceId = firstString(workspaceId);
  if (!resolvedDbPath || !resolvedWorkspaceId) {
    return [];
  }

  const db = openDatabase(resolvedDbPath);
  try {
    const rows = db.prepare(
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
      WHERE workspace_id = ?`,
    ).all(resolvedWorkspaceId);
    return rows.map(mapSessionRow);
  } finally {
    db.close();
  }
}
