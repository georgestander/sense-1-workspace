import { createId, firstString, openDatabase, runInTransaction } from "./substrate-store-core.js";
import { mapQuestionRow, serializeJson } from "./substrate-record-codecs.js";

function selectQuestionById(db, questionId) {
  return mapQuestionRow(
    db.prepare(
      `SELECT
        id,
        profile_id,
        scope_id,
        session_id,
        actor_id,
        codex_thread_id,
        engine_turn_id,
        request_id,
        prompt,
        status,
        answer_text,
        asked_at,
        answered_at,
        target_kind,
        target_id,
        target_snapshot,
        metadata
      FROM questions
      WHERE id = ?`,
    ).get(questionId),
  );
}

export async function upsertSubstrateQuestion({
  actorId,
  answerText = null,
  answeredAt = null,
  codexThreadId,
  dbPath,
  engineTurnId = null,
  metadata = null,
  profileId,
  prompt,
  questionId = null,
  requestId = null,
  scopeId,
  sessionId,
  status = "pending",
  targetId = null,
  targetKind = "pending_run",
  targetSnapshot = null,
  ts = new Date().toISOString(),
}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedSessionId = firstString(sessionId);
  const resolvedProfileId = firstString(profileId);
  const resolvedScopeId = firstString(scopeId);
  const resolvedActorId = firstString(actorId);
  const resolvedThreadId = firstString(codexThreadId);
  const resolvedPrompt = firstString(prompt);
  const resolvedStatus = firstString(status) || "pending";
  const resolvedTargetKind = firstString(targetKind) || "pending_run";
  const resolvedQuestionId = firstString(questionId);
  const resolvedRequestId = Number.isInteger(requestId) ? requestId : null;
  if (
    !resolvedDbPath ||
    !resolvedSessionId ||
    !resolvedProfileId ||
    !resolvedScopeId ||
    !resolvedActorId ||
    !resolvedThreadId ||
    !resolvedPrompt
  ) {
    throw new Error(
      "Question upsert requires a database path, session, profile, scope, actor, thread, and prompt.",
    );
  }

  const db = openDatabase(resolvedDbPath);
  try {
    return runInTransaction(db, () => {
      const existing = resolvedQuestionId
        ? selectQuestionById(db, resolvedQuestionId)
        : resolvedRequestId !== null
          ? mapQuestionRow(
              db.prepare(
                `SELECT
                  id,
                  profile_id,
                  scope_id,
                  session_id,
                  actor_id,
                  codex_thread_id,
                  engine_turn_id,
                  request_id,
                  prompt,
                  status,
                  answer_text,
                  asked_at,
                  answered_at,
                  target_kind,
                  target_id,
                  target_snapshot,
                  metadata
                FROM questions
                WHERE session_id = ? AND request_id = ?`,
              ).get(resolvedSessionId, resolvedRequestId),
            )
          : null;
      const nextQuestionId = existing?.id ?? resolvedQuestionId ?? createId("question");

      if (existing) {
        db.prepare(
          `UPDATE questions
          SET profile_id = ?,
              scope_id = ?,
              session_id = ?,
              actor_id = ?,
              codex_thread_id = ?,
              engine_turn_id = COALESCE(?, engine_turn_id),
              request_id = COALESCE(?, request_id),
              prompt = ?,
              status = ?,
              answer_text = COALESCE(?, answer_text),
              answered_at = COALESCE(?, answered_at),
              target_kind = ?,
              target_id = COALESCE(?, target_id),
              target_snapshot = COALESCE(?, target_snapshot),
              metadata = COALESCE(?, metadata)
          WHERE id = ?`,
        ).run(
          resolvedProfileId,
          resolvedScopeId,
          resolvedSessionId,
          resolvedActorId,
          resolvedThreadId,
          firstString(engineTurnId),
          resolvedRequestId,
          resolvedPrompt,
          resolvedStatus,
          firstString(answerText),
          firstString(answeredAt),
          resolvedTargetKind,
          firstString(targetId),
          serializeJson(targetSnapshot),
          serializeJson(metadata),
          nextQuestionId,
        );
      } else {
        db.prepare(
          `INSERT INTO questions (
            id,
            profile_id,
            scope_id,
            session_id,
            actor_id,
            codex_thread_id,
            engine_turn_id,
            request_id,
            prompt,
            status,
            answer_text,
            asked_at,
            answered_at,
            target_kind,
            target_id,
            target_snapshot,
            metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          nextQuestionId,
          resolvedProfileId,
          resolvedScopeId,
          resolvedSessionId,
          resolvedActorId,
          resolvedThreadId,
          firstString(engineTurnId),
          resolvedRequestId,
          resolvedPrompt,
          resolvedStatus,
          firstString(answerText),
          ts,
          firstString(answeredAt),
          resolvedTargetKind,
          firstString(targetId),
          serializeJson(targetSnapshot),
          serializeJson(metadata),
        );
      }

      return selectQuestionById(db, nextQuestionId);
    });
  } finally {
    db.close();
  }
}

export async function answerSubstrateQuestion({
  answerText,
  answeredAt = new Date().toISOString(),
  dbPath,
  questionId,
  targetId = null,
  targetKind = "pending_run",
  targetSnapshot = null,
}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedQuestionId = firstString(questionId);
  const resolvedAnswerText = firstString(answerText);
  const resolvedTargetKind = firstString(targetKind) || "pending_run";
  if (!resolvedDbPath || !resolvedQuestionId || !resolvedAnswerText) {
    throw new Error("Question answer persistence requires a database path, question id, and answer text.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    return runInTransaction(db, () => {
      const existing = selectQuestionById(db, resolvedQuestionId);
      if (!existing) {
        return null;
      }

      db.prepare(
        `UPDATE questions
        SET status = 'answered',
            answer_text = ?,
            answered_at = ?,
            target_kind = ?,
            target_id = ?,
            target_snapshot = ?
        WHERE id = ?`,
      ).run(
        resolvedAnswerText,
        firstString(answeredAt) || new Date().toISOString(),
        resolvedTargetKind,
        firstString(targetId),
        serializeJson(targetSnapshot),
        resolvedQuestionId,
      );

      return selectQuestionById(db, resolvedQuestionId);
    });
  } finally {
    db.close();
  }
}
