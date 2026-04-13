import {
  buildDesktopActorPolicyMetadata,
  buildDesktopActorPolicyProfile,
  normalizeDesktopSettingsLayer,
} from "../settings/policy.js";
import {
  normalizeWorkspaceRootPath,
} from "../workspace/workspace-root.ts";
import {
  setWorkspaceLifecycleState as applyWorkspaceLifecycleState,
} from "../../shared/lifecycle.js";
import {
  migrateWorkspacePolicyRoot,
  normalizeStringArray,
} from "./substrate-workspace-policies.js";
import {
  ensureActorSchemaColumns,
  ensureWorkspacePolicySchemaColumns,
  resolveActorDisplayName,
  resolveDefaultScopeId,
  resolvePrimaryActorId,
  resolvePrivateScopeDisplayName,
  SCHEMA_STATEMENTS,
} from "./substrate-schema.js";
import {
  resolveWorkspaceRowIdentity,
  withWorkspaceIdentityMetadata,
  workspaceComparableRootFromMetadata,
  workspaceIdentityKeyFromMetadata,
} from "./substrate-workspace-identity.js";
import {
  mapActorRow,
  mapQuestionRow,
  mapScopeRow,
  serializeJson,
} from "./substrate-record-codecs.js";
import {
  ensureWorkspaceWithDatabase,
  rememberSubstrateWorkspace,
  setSubstrateWorkspaceLifecycleState,
  deleteSubstrateWorkspace,
} from "./substrate-workspace-records.js";
import {
  firstString,
  openDatabase,
  runInTransaction,
} from "./substrate-store-core.js";
export {
  answerSubstrateQuestion,
  upsertSubstrateQuestion,
} from "./substrate-question-records.js";
export {
  loadAllWorkspacePolicies,
  loadWorkspacePolicy,
  upsertWorkspacePolicy,
} from "./substrate-workspace-policies.js";
export {
  rememberSubstrateWorkspace,
  setSubstrateWorkspaceLifecycleState,
  deleteSubstrateWorkspace,
} from "./substrate-workspace-records.js";
export {
  appendSubstrateEvent,
  appendSubstrateObjectRef,
  createSubstrateSessionShell,
  deleteSubstrateSession,
  ensureSubstrateSessionForThread,
  finalizeSubstrateSessionStart,
  getSubstrateSessionByThreadId,
  listSubstrateSessionsByWorkspace,
  setSubstrateSessionStatus,
  updateSubstrateSessionReviewSummary,
  updateSubstrateSessionThreadTitle,
} from "./substrate-session-records.js";
export {
  createSubstratePlan,
  updateSubstratePlan,
} from "./substrate-plan-records.js";
export {
  ingestSubstratePlanSuggestion,
  resolveSubstratePlanApproval,
} from "./substrate-plan-approval-records.js";
export {
  resolveDefaultScopeId,
  resolvePrimaryActorId,
  resolvePrivateScopeDisplayName,
} from "./substrate-schema.js";

export async function ensureProfileSubstrate({
  actorDisplayName = null,
  actorEmail = null,
  dbPath,
  now = new Date().toISOString(),
  profileId,
}) {
  const resolvedProfileId = firstString(profileId);
  const resolvedDbPath = firstString(dbPath);
  if (!resolvedProfileId) {
    throw new Error("A profile id is required to bootstrap the Sense-1 substrate.");
  }

  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to bootstrap the Sense-1 substrate.");
  }

  const scopeId = resolveDefaultScopeId(resolvedProfileId);
  const actorId = resolvePrimaryActorId(resolvedProfileId);
  const scopeDisplayName = resolvePrivateScopeDisplayName(resolvedProfileId);
  const db = openDatabase(resolvedDbPath);

  try {
    for (const statement of SCHEMA_STATEMENTS) {
      db.exec(statement);
    }
    ensureActorSchemaColumns(db);
    ensureWorkspacePolicySchemaColumns(db);

    db.exec("BEGIN");

    const existingActor = mapActorRow(
      db.prepare(
        `SELECT
          display_name,
          role,
          capabilities,
          trust_level,
          approval_envelope,
          created_at,
          metadata
        FROM actors
        WHERE id = ?`,
      ).get(actorId),
    );
    const existingActorMetadata = existingActor?.metadata ?? {};
    const nextActorMetadata = buildDesktopActorPolicyMetadata(existingActorMetadata, {
      ...(firstString(actorEmail) ? { email: firstString(actorEmail) } : {}),
      primary: true,
    });
    const nextActorProfile = buildDesktopActorPolicyProfile({
      kind: "user",
      metadata: nextActorMetadata,
      scope_id: scopeId,
    });
    const nextActorDisplayName = resolveActorDisplayName({
      actorDisplayName,
      actorEmail,
      existingDisplayName: existingActor?.display_name,
    });

    db.prepare(
      `INSERT INTO scopes (
        id,
        profile_id,
        type,
        display_name,
        parent_scope_id,
        visibility,
        retention_policy,
        created_at,
        metadata
      ) VALUES (?, ?, 'private', ?, NULL, 'private', NULL, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        profile_id = excluded.profile_id,
        type = excluded.type,
        display_name = excluded.display_name,
        visibility = excluded.visibility,
        metadata = excluded.metadata`,
    ).run(
      scopeId,
      resolvedProfileId,
      scopeDisplayName,
      now,
      JSON.stringify({ defaultScope: true }),
    );

    db.prepare(
      `INSERT INTO actors (
        id,
        profile_id,
        scope_id,
        kind,
        display_name,
        role,
        capabilities,
        trust_level,
        approval_envelope,
        created_at,
        metadata
      ) VALUES (?, ?, ?, 'user', ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        profile_id = excluded.profile_id,
        scope_id = excluded.scope_id,
        kind = excluded.kind,
        display_name = excluded.display_name,
        role = excluded.role,
        capabilities = excluded.capabilities,
        trust_level = excluded.trust_level,
        approval_envelope = excluded.approval_envelope,
        metadata = excluded.metadata`,
    ).run(
      actorId,
      resolvedProfileId,
      scopeId,
      nextActorDisplayName,
      nextActorProfile.role,
      JSON.stringify(nextActorProfile.capabilities),
      nextActorProfile.trustLevel,
      serializeJson(nextActorMetadata.approvalEnvelope),
      firstString(existingActor?.created_at) || now,
      JSON.stringify(nextActorMetadata),
    );

    db.exec("COMMIT");

    return {
      actorId,
      dbPath: resolvedDbPath,
      scopeId,
    };
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Ignore rollback failures and rethrow the original bootstrap error.
    }
    throw error;
  } finally {
    db.close();
  }
}

export async function getSubstrateActor({
  actorId,
  dbPath,
}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedActorId = firstString(actorId);
  if (!resolvedDbPath || !resolvedActorId) {
    throw new Error("A substrate database path and actor id are required to load an actor.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    ensureActorSchemaColumns(db);
    const row = db.prepare(
      `SELECT
        id,
        profile_id,
        scope_id,
        kind,
        display_name,
        role,
        capabilities,
        trust_level,
        approval_envelope,
        created_at,
        metadata
      FROM actors
      WHERE id = ?`,
    ).get(resolvedActorId);

    return mapActorRow(row);
  } finally {
    db.close();
  }
}

export async function getSubstrateScope({
  dbPath,
  scopeId,
}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedScopeId = firstString(scopeId);
  if (!resolvedDbPath || !resolvedScopeId) {
    throw new Error("A substrate database path and scope id are required to load a scope.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    const row = db.prepare(
      `SELECT
        id,
        profile_id,
        type,
        display_name,
        parent_scope_id,
        visibility,
        retention_policy,
        created_at,
        metadata
      FROM scopes
      WHERE id = ?`,
    ).get(resolvedScopeId);

    return mapScopeRow(row);
  } finally {
    db.close();
  }
}

export async function upsertSubstrateScopeSettingsPolicy({
  dbPath,
  scopeId,
  settingsPolicy,
}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedScopeId = firstString(scopeId);
  if (!resolvedDbPath || !resolvedScopeId) {
    throw new Error("A substrate database path and scope id are required to update scope settings policy.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    return runInTransaction(db, () => {
      const existingScope = mapScopeRow(
        db.prepare(
          `SELECT
            id,
            profile_id,
            type,
            display_name,
            parent_scope_id,
            visibility,
            retention_policy,
            created_at,
            metadata
          FROM scopes
          WHERE id = ?`,
        ).get(resolvedScopeId),
      );
      if (!existingScope) {
        throw new Error(`Could not find substrate scope ${resolvedScopeId}.`);
      }

      const nextMetadata = {
        ...existingScope.metadata,
        settingsPolicy: normalizeDesktopSettingsLayer(settingsPolicy),
      };
      db.prepare("UPDATE scopes SET metadata = ? WHERE id = ?").run(
        JSON.stringify(nextMetadata),
        resolvedScopeId,
      );

      return mapScopeRow(
        db.prepare(
          `SELECT
            id,
            profile_id,
            type,
            display_name,
            parent_scope_id,
            visibility,
            retention_policy,
            created_at,
            metadata
          FROM scopes
          WHERE id = ?`,
        ).get(resolvedScopeId),
      );
    });
  } finally {
    db.close();
  }
}

export async function upsertSubstrateActor({
  actorId,
  dbPath,
  displayName,
  kind = "user",
  metadata = null,
  now = new Date().toISOString(),
  profileId,
  scopeId,
}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedActorId = firstString(actorId);
  const resolvedProfileId = firstString(profileId);
  const resolvedScopeId = firstString(scopeId);
  const resolvedDisplayName = firstString(displayName);
  if (!resolvedDbPath || !resolvedActorId || !resolvedProfileId || !resolvedScopeId || !resolvedDisplayName) {
    throw new Error("Actor upsert requires a database path, actor id, profile id, scope id, and display name.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    ensureActorSchemaColumns(db);
    return runInTransaction(db, () => {
      const existingActor = mapActorRow(
        db.prepare(
          `SELECT
            id,
            profile_id,
            scope_id,
            kind,
            display_name,
            role,
            capabilities,
            trust_level,
            approval_envelope,
            created_at,
            metadata
          FROM actors
          WHERE id = ?`,
        ).get(resolvedActorId),
      );
      const nextMetadata = buildDesktopActorPolicyMetadata(existingActor?.metadata, metadata ?? {});
      const nextActorProfile = buildDesktopActorPolicyProfile({
        kind: firstString(kind) || existingActor?.kind || "user",
        metadata: nextMetadata,
        scope_id: resolvedScopeId,
      });

      db.prepare(
        `INSERT INTO actors (
          id,
          profile_id,
          scope_id,
          kind,
          display_name,
          role,
          capabilities,
          trust_level,
          approval_envelope,
          created_at,
          metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          profile_id = excluded.profile_id,
          scope_id = excluded.scope_id,
          kind = excluded.kind,
          display_name = excluded.display_name,
          role = excluded.role,
          capabilities = excluded.capabilities,
          trust_level = excluded.trust_level,
          approval_envelope = excluded.approval_envelope,
          metadata = excluded.metadata`,
      ).run(
        resolvedActorId,
        resolvedProfileId,
        resolvedScopeId,
        firstString(kind) || "user",
        resolvedDisplayName,
        nextActorProfile.role,
        JSON.stringify(nextActorProfile.capabilities),
        nextActorProfile.trustLevel,
        serializeJson(nextMetadata.approvalEnvelope),
        firstString(existingActor?.created_at) || now,
        JSON.stringify(nextMetadata),
      );

      return mapActorRow(
        db.prepare(
          `SELECT
            id,
            profile_id,
            scope_id,
            kind,
            display_name,
            role,
            capabilities,
            trust_level,
            approval_envelope,
            created_at,
            metadata
          FROM actors
          WHERE id = ?`,
        ).get(resolvedActorId),
      );
    });
  } finally {
    db.close();
  }
}
