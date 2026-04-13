import path from "node:path";

import {
  mapPlanRow,
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
  normalizeStringArray,
} from "./substrate-workspace-policies.js";

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

export function getPlanByIdWithDatabase(db, planId) {
  const resolvedPlanId = firstString(planId);
  if (!resolvedPlanId) {
    return null;
  }

  const row = db.prepare(
    `SELECT
      id,
      session_id,
      profile_id,
      scope_id,
      actor_id,
      status,
      request_summary,
      assumptions,
      intended_actions,
      affected_locations,
      approval_status,
      approved_by_actor_id,
      approved_at,
      rejected_by_actor_id,
      rejected_at,
      created_at,
      updated_at,
      metadata
    FROM plans
    WHERE id = ?`,
  ).get(resolvedPlanId);

  return mapPlanRow(row);
}

export function getLatestPlanBySessionIdWithDatabase(db, sessionId, { approvalStatus = null } = {}) {
  const resolvedSessionId = firstString(sessionId);
  if (!resolvedSessionId) {
    return null;
  }

  const row = approvalStatus
    ? db.prepare(
        `SELECT
          id,
          session_id,
          profile_id,
          scope_id,
          actor_id,
          status,
          request_summary,
          assumptions,
          intended_actions,
          affected_locations,
          approval_status,
          approved_by_actor_id,
          approved_at,
          rejected_by_actor_id,
          rejected_at,
          created_at,
          updated_at,
          metadata
        FROM plans
        WHERE session_id = ? AND approval_status = ?
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1`,
      ).get(resolvedSessionId, approvalStatus)
    : db.prepare(
        `SELECT
          id,
          session_id,
          profile_id,
          scope_id,
          actor_id,
          status,
          request_summary,
          assumptions,
          intended_actions,
          affected_locations,
          approval_status,
          approved_by_actor_id,
          approved_at,
          rejected_by_actor_id,
          rejected_at,
          created_at,
          updated_at,
          metadata
        FROM plans
        WHERE session_id = ?
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1`,
      ).get(resolvedSessionId);

  return mapPlanRow(row);
}

export async function createSubstratePlan({
  actorId = null,
  affectedLocations = [],
  assumptions = [],
  dbPath,
  intendedActions = [],
  metadata = null,
  now = new Date().toISOString(),
  requestSummary = null,
  sessionId,
  status = "proposed",
}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedSessionId = firstString(sessionId);
  if (!resolvedDbPath || !resolvedSessionId) {
    throw new Error("A substrate database path and session id are required to create a plan.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    return runInTransaction(db, () => {
      const session = getSessionByIdWithDatabase(db, resolvedSessionId);
      if (!session) {
        throw new Error(`Could not find substrate session ${resolvedSessionId}.`);
      }

      const resolvedActorId = firstString(actorId, session.actor_id);
      if (!resolvedActorId) {
        throw new Error("A plan actor is required to create a substrate plan.");
      }

      const planId = createId("plan");
      const resolvedStatus = firstString(status) ?? "proposed";
      const resolvedRequestSummary = firstString(requestSummary, session.title, session.summary);
      const resolvedAssumptions = normalizeStringArray(assumptions);
      const resolvedIntendedActions = normalizeStringArray(intendedActions);
      const resolvedAffectedLocations = normalizeStringArray(affectedLocations)
        .map((entry) => path.resolve(entry));
      const resolvedMetadata =
        metadata && typeof metadata === "object" && !Array.isArray(metadata)
          ? { ...metadata }
          : {};

      db.prepare(
        `INSERT INTO plans (
          id,
          session_id,
          profile_id,
          scope_id,
          actor_id,
          status,
          request_summary,
          assumptions,
          intended_actions,
          affected_locations,
          approval_status,
          approved_by_actor_id,
          approved_at,
          rejected_by_actor_id,
          rejected_at,
          created_at,
          updated_at,
          metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, NULL, ?, ?, ?)`,
      ).run(
        planId,
        session.id,
        session.profile_id,
        session.scope_id,
        resolvedActorId,
        resolvedStatus,
        resolvedRequestSummary,
        serializeJson(resolvedAssumptions),
        serializeJson(resolvedIntendedActions),
        serializeJson(resolvedAffectedLocations),
        now,
        now,
        Object.keys(resolvedMetadata).length > 0 ? JSON.stringify(resolvedMetadata) : null,
      );

      insertEventRecord(db, {
        actorId: resolvedActorId,
        afterState: {
          approval_status: "pending",
          request_summary: resolvedRequestSummary,
          status: resolvedStatus,
        },
        detail: {
          affectedLocations: resolvedAffectedLocations,
          assumptions: resolvedAssumptions,
          intendedActions: resolvedIntendedActions,
        },
        profileId: session.profile_id,
        scopeId: session.scope_id,
        sessionId: session.id,
        subjectId: planId,
        subjectType: "plan",
        ts: now,
        verb: "plan.created",
      });

      return getPlanByIdWithDatabase(db, planId);
    });
  } finally {
    db.close();
  }
}

export async function updateSubstratePlan(options = {}) {
  const resolvedDbPath = firstString(options.dbPath);
  const resolvedPlanId = firstString(options.planId);
  if (!resolvedDbPath || !resolvedPlanId) {
    throw new Error("A substrate database path and plan id are required to update a plan.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    return runInTransaction(db, () => {
      const existingPlan = getPlanByIdWithDatabase(db, resolvedPlanId);
      if (!existingPlan) {
        throw new Error(`Could not find substrate plan ${resolvedPlanId}.`);
      }

      const resolvedActorId = firstString(options.actorId, existingPlan.actor_id);
      if (!resolvedActorId) {
        throw new Error("A plan actor is required to update a substrate plan.");
      }

      const hasStatus = Object.prototype.hasOwnProperty.call(options, "status");
      const hasRequestSummary = Object.prototype.hasOwnProperty.call(options, "requestSummary");
      const hasAssumptions = Object.prototype.hasOwnProperty.call(options, "assumptions");
      const hasIntendedActions = Object.prototype.hasOwnProperty.call(options, "intendedActions");
      const hasAffectedLocations = Object.prototype.hasOwnProperty.call(options, "affectedLocations");
      const hasMetadata = Object.prototype.hasOwnProperty.call(options, "metadata");
      const now = firstString(options.now) ?? new Date().toISOString();

      const nextStatus = hasStatus
        ? firstString(options.status, existingPlan.status) ?? existingPlan.status
        : existingPlan.status;
      const nextRequestSummary = hasRequestSummary
        ? firstString(options.requestSummary, existingPlan.request_summary)
        : existingPlan.request_summary;
      const nextAssumptions = hasAssumptions
        ? normalizeStringArray(options.assumptions)
        : existingPlan.assumptions;
      const nextIntendedActions = hasIntendedActions
        ? normalizeStringArray(options.intendedActions)
        : existingPlan.intended_actions;
      const nextAffectedLocations = hasAffectedLocations
        ? normalizeStringArray(options.affectedLocations).map((entry) => path.resolve(entry))
        : existingPlan.affected_locations;
      const nextMetadata = hasMetadata
        ? (
            options.metadata && typeof options.metadata === "object" && !Array.isArray(options.metadata)
              ? { ...options.metadata }
              : {}
          )
        : existingPlan.metadata;

      db.prepare(
        `UPDATE plans
        SET actor_id = ?,
            status = ?,
            request_summary = ?,
            assumptions = ?,
            intended_actions = ?,
            affected_locations = ?,
            updated_at = ?,
            metadata = ?
        WHERE id = ?`,
      ).run(
        resolvedActorId,
        nextStatus,
        nextRequestSummary,
        serializeJson(nextAssumptions),
        serializeJson(nextIntendedActions),
        serializeJson(nextAffectedLocations),
        now,
        Object.keys(nextMetadata).length > 0 ? JSON.stringify(nextMetadata) : null,
        resolvedPlanId,
      );

      insertEventRecord(db, {
        actorId: resolvedActorId,
        afterState: {
          approval_status: existingPlan.approval_status,
          request_summary: nextRequestSummary,
          status: nextStatus,
        },
        beforeState: {
          approval_status: existingPlan.approval_status,
          request_summary: existingPlan.request_summary,
          status: existingPlan.status,
        },
        detail: {
          changedFields: [
            ...(hasStatus ? ["status"] : []),
            ...(hasRequestSummary ? ["requestSummary"] : []),
            ...(hasAssumptions ? ["assumptions"] : []),
            ...(hasIntendedActions ? ["intendedActions"] : []),
            ...(hasAffectedLocations ? ["affectedLocations"] : []),
            ...(hasMetadata ? ["metadata"] : []),
          ],
        },
        profileId: existingPlan.profile_id,
        scopeId: existingPlan.scope_id,
        sessionId: existingPlan.session_id,
        subjectId: resolvedPlanId,
        subjectType: "plan",
        ts: now,
        verb: "plan.updated",
      });

      return getPlanByIdWithDatabase(db, resolvedPlanId);
    });
  } finally {
    db.close();
  }
}
