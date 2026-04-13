import { serializeJson } from "./substrate-record-codecs.js";
import { normalizePlanSuggestion } from "./substrate-plan-normalization.js";
import {
  createId,
  firstString,
  openDatabase,
  runInTransaction,
} from "./substrate-store-core.js";
import {
  getLatestPlanBySessionIdWithDatabase,
  getPlanByIdWithDatabase,
  getSessionByIdWithDatabase,
  insertEventRecord,
} from "./substrate-plan-records.js";

export async function ingestSubstratePlanSuggestion({
  actorId = null,
  dbPath,
  metadata = null,
  now = new Date().toISOString(),
  planData = null,
  planText = null,
  prompt = null,
  sessionId,
  source = "product",
  turnId = null,
} = {}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedSessionId = firstString(sessionId);
  if (!resolvedDbPath || !resolvedSessionId) {
    throw new Error("A substrate database path and session id are required to ingest a plan suggestion.");
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
        throw new Error("A plan actor is required to ingest a substrate plan suggestion.");
      }

      const existingPlan = getLatestPlanBySessionIdWithDatabase(db, resolvedSessionId, {
        approvalStatus: "pending",
      });
      const normalized = normalizePlanSuggestion({
        existingPlan,
        metadata,
        planData,
        planText,
        prompt,
        session,
        source,
        turnId,
      });

      if (!existingPlan) {
        const planId = createId("plan");
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
          normalized.status,
          normalized.requestSummary,
          serializeJson(normalized.assumptions),
          serializeJson(normalized.intendedActions),
          serializeJson(normalized.affectedLocations),
          now,
          now,
          Object.keys(normalized.metadata).length > 0 ? JSON.stringify(normalized.metadata) : null,
        );

        insertEventRecord(db, {
          actorId: resolvedActorId,
          afterState: {
            approval_status: "pending",
            request_summary: normalized.requestSummary,
            status: normalized.status,
          },
          detail: {
            affectedLocations: normalized.affectedLocations,
            assumptions: normalized.assumptions,
            intendedActions: normalized.intendedActions,
            source: normalized.metadata.source,
            sourceTurnId: normalized.metadata.sourceTurnId,
            structuredSource: normalized.metadata.structuredSource,
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
      }

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
        normalized.status,
        normalized.requestSummary,
        serializeJson(normalized.assumptions),
        serializeJson(normalized.intendedActions),
        serializeJson(normalized.affectedLocations),
        now,
        Object.keys(normalized.metadata).length > 0 ? JSON.stringify(normalized.metadata) : null,
        existingPlan.id,
      );

      insertEventRecord(db, {
        actorId: resolvedActorId,
        afterState: {
          approval_status: existingPlan.approval_status,
          request_summary: normalized.requestSummary,
          status: normalized.status,
        },
        beforeState: {
          approval_status: existingPlan.approval_status,
          request_summary: existingPlan.request_summary,
          status: existingPlan.status,
        },
        detail: {
          changedFields: ["requestSummary", "assumptions", "intendedActions", "affectedLocations", "metadata"],
          source: normalized.metadata.source,
          sourceTurnId: normalized.metadata.sourceTurnId,
          structuredSource: normalized.metadata.structuredSource,
        },
        profileId: existingPlan.profile_id,
        scopeId: existingPlan.scope_id,
        sessionId: existingPlan.session_id,
        subjectId: existingPlan.id,
        subjectType: "plan",
        ts: now,
        verb: "plan.updated",
      });

      return getPlanByIdWithDatabase(db, existingPlan.id);
    });
  } finally {
    db.close();
  }
}

export async function resolveSubstratePlanApproval({
  actorId,
  dbPath,
  decision,
  now = new Date().toISOString(),
  planId,
}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedPlanId = firstString(planId);
  const resolvedActorId = firstString(actorId);
  const normalizedDecision = firstString(decision)?.toLowerCase();
  if (!resolvedDbPath || !resolvedPlanId || !resolvedActorId) {
    throw new Error("A substrate database path, plan id, and actor id are required to resolve plan approval.");
  }
  if (!normalizedDecision || !["accept", "approved", "decline", "declined", "reject", "rejected", "revise", "add_details"].includes(normalizedDecision)) {
    throw new Error("Plan approval resolution must be accept/approved, decline/rejected, revise, or add_details.");
  }

  const nextApprovalStatus =
    normalizedDecision === "accept" || normalizedDecision === "approved"
      ? "approved"
      : normalizedDecision === "revise"
        ? "revision_requested"
        : normalizedDecision === "add_details"
          ? "details_requested"
          : "rejected";

  const db = openDatabase(resolvedDbPath);
  try {
    return runInTransaction(db, () => {
      const existingPlan = getPlanByIdWithDatabase(db, resolvedPlanId);
      if (!existingPlan) {
        throw new Error(`Could not find substrate plan ${resolvedPlanId}.`);
      }

      const isRevisionFlow = nextApprovalStatus === "revision_requested" || nextApprovalStatus === "details_requested";
      db.prepare(
        `UPDATE plans
        SET approval_status = ?,
            status = CASE WHEN ? THEN 'generating' ELSE status END,
            approved_by_actor_id = ?,
            approved_at = ?,
            rejected_by_actor_id = ?,
            rejected_at = ?,
            updated_at = ?
        WHERE id = ?`,
      ).run(
        nextApprovalStatus,
        isRevisionFlow ? 1 : 0,
        nextApprovalStatus === "approved" ? resolvedActorId : null,
        nextApprovalStatus === "approved" ? now : null,
        nextApprovalStatus === "rejected" ? resolvedActorId : null,
        nextApprovalStatus === "rejected" ? now : null,
        now,
        resolvedPlanId,
      );

      insertEventRecord(db, {
        actorId: resolvedActorId,
        afterState: {
          approval_status: nextApprovalStatus,
        },
        beforeState: {
          approval_status: existingPlan.approval_status,
        },
        detail: {
          decision: nextApprovalStatus,
        },
        profileId: existingPlan.profile_id,
        scopeId: existingPlan.scope_id,
        sessionId: existingPlan.session_id,
        subjectId: resolvedPlanId,
        subjectType: "plan",
        ts: now,
        verb:
          nextApprovalStatus === "approved"
            ? "plan.approved"
            : nextApprovalStatus === "revision_requested"
              ? "plan.revision_requested"
              : nextApprovalStatus === "details_requested"
                ? "plan.details_requested"
                : "plan.rejected",
      });

      return getPlanByIdWithDatabase(db, resolvedPlanId);
    });
  } finally {
    db.close();
  }
}
