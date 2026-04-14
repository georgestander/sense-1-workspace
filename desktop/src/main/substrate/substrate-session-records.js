import path from "node:path";

import {
  mapSessionRow,
  mapWorkspaceRow,
} from "./substrate-record-codecs.js";
import {
  appendSubstrateEvent,
  appendSubstrateObjectRef,
  deleteSubstrateSession,
  getSessionByIdWithDatabase,
  getSessionByThreadIdWithDatabase,
  getSubstrateSessionByThreadId,
  insertEventRecord,
  listSubstrateSessionsByWorkspace,
  normalizeRuntimeThreadTitle,
  setSubstrateSessionStatus,
  updateSubstrateSessionTitleContext,
  updateSubstrateSessionReviewSummary,
  updateSubstrateSessionThreadTitle,
} from "./substrate-session-metadata.js";
import {
  ensureWorkspaceWithDatabase,
} from "./substrate-workspace-records.js";
import {
  createId,
  firstString,
  openDatabase,
  runInTransaction,
} from "./substrate-store-core.js";
import {
  buildThreadTitleContext,
} from "./thread-title-summarizer.js";
export {
  appendSubstrateEvent,
  appendSubstrateObjectRef,
  deleteSubstrateSession,
  getSubstrateSessionByThreadId,
  listSubstrateSessionsByWorkspace,
  setSubstrateSessionStatus,
  updateSubstrateSessionTitleContext,
  updateSubstrateSessionReviewSummary,
  updateSubstrateSessionThreadTitle,
} from "./substrate-session-metadata.js";

function resolveReusedSessionSeedTitle(existingSession, threadTitle) {
  return firstString(
    existingSession?.metadata?.titleContext?.seedTitle,
    normalizeRuntimeThreadTitle(threadTitle),
    existingSession?.title,
  );
}

export async function createSubstrateSessionShell({
  actorId,
  artifactRoot = null,
  dbPath,
  effort = null,
  initialPrompt = null,
  model = null,
  now = new Date().toISOString(),
  profileId,
  scopeId,
  title = null,
  workspaceRoot = null,
}) {
  const resolvedDbPath = firstString(dbPath);
  if (!resolvedDbPath) {
    throw new Error("A substrate database path is required to create a session shell.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    return runInTransaction(db, () => {
      const workspace = workspaceRoot
        ? ensureWorkspaceWithDatabase(db, {
            actorId,
            now,
            profileId,
            rootPath: workspaceRoot,
            scopeId,
          })
        : null;
      const sessionId = createId("sess");
      const metadata = {};
      const resolvedArtifactRoot = firstString(artifactRoot);
      const resolvedWorkspaceRoot = firstString(workspaceRoot);
      const titleContext = buildThreadTitleContext(null, {
        initialPrompt,
        seedTitle: title,
      });
      if (resolvedArtifactRoot) {
        metadata.artifactRoot = path.resolve(resolvedArtifactRoot);
      }
      if (resolvedWorkspaceRoot) {
        metadata.workspaceRoot = path.resolve(resolvedWorkspaceRoot);
      }
      if (Object.keys(titleContext).length > 0) {
        metadata.titleContext = titleContext;
      }

      db.prepare(
        `INSERT INTO sessions (
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
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'active', ?, NULL, NULL, ?)`,
      ).run(
        sessionId,
        profileId,
        scopeId,
        actorId,
        workspace?.id ?? null,
        firstString(title),
        firstString(model),
        firstString(effort),
        now,
        Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
      );

      return {
        sessionId,
        workspaceId: workspace?.id ?? null,
        workspaceRoot: workspace?.root_path ?? null,
      };
    });
  } finally {
    db.close();
  }
}

export async function finalizeSubstrateSessionStart({
  actorId,
  artifactRoot = null,
  codexThreadId,
  dbPath,
  effort = null,
  initialPrompt = null,
  model = null,
  now = new Date().toISOString(),
  profileId,
  scopeId,
  sessionId,
  threadTitle = null,
  turnId = null,
  workspaceRoot = null,
}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedSessionId = firstString(sessionId);
  const resolvedThreadId = firstString(codexThreadId);
  if (!resolvedDbPath || !resolvedSessionId || !resolvedThreadId) {
    throw new Error("A session id, thread id, and database path are required to finalize a session start.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    return runInTransaction(db, () => {
      const existingSession = mapSessionRow(
        db.prepare(
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
        ).get(resolvedSessionId),
      );
      if (!existingSession) {
        throw new Error(`Could not find substrate session ${resolvedSessionId}.`);
      }
      const resolvedArtifactRoot = firstString(artifactRoot);
      const resolvedWorkspaceRoot = firstString(workspaceRoot);
      const metadata = { ...existingSession.metadata };
      if (resolvedArtifactRoot) {
        metadata.artifactRoot = path.resolve(resolvedArtifactRoot);
      }
      if (resolvedWorkspaceRoot) {
        metadata.workspaceRoot = path.resolve(resolvedWorkspaceRoot);
      }
      const resolvedSeedTitle =
        normalizeRuntimeThreadTitle(threadTitle)
        ?? firstString(metadata.titleContext?.seedTitle, existingSession.title);
      const titleContext = buildThreadTitleContext(metadata.titleContext, {
        initialPrompt,
        seedTitle: resolvedSeedTitle,
      });
      if (resolvedSeedTitle) {
        titleContext.seedTitle = resolvedSeedTitle;
      }
      if (Object.keys(titleContext).length > 0) {
        metadata.titleContext = titleContext;
      }
      const serializedMetadata =
        Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null;

      db.prepare(
        `UPDATE sessions
        SET codex_thread_id = ?,
            title = COALESCE(?, title),
            model = COALESCE(?, model),
            effort = COALESCE(?, effort),
            metadata = COALESCE(?, metadata),
            status = 'active'
        WHERE id = ?`,
      ).run(
        resolvedThreadId,
        normalizeRuntimeThreadTitle(threadTitle),
        firstString(model),
        firstString(effort),
        serializedMetadata,
        resolvedSessionId,
      );

      if (existingSession.workspace_id) {
        db.prepare(
          `UPDATE workspaces
          SET last_active_at = ?,
              session_count = session_count + 1
          WHERE id = ?`,
        ).run(now, existingSession.workspace_id);

        const workspace = mapWorkspaceRow(
          db.prepare("SELECT id, root_path FROM workspaces WHERE id = ?").get(existingSession.workspace_id),
        );
        insertEventRecord(db, {
          actorId,
          afterState: {
            root_path: workspace?.root_path ?? null,
            session_id: resolvedSessionId,
          },
          correlationId: resolvedThreadId,
          detail: {
            rootPath: workspace?.root_path ?? null,
          },
          engineTurnId: firstString(turnId),
          profileId,
          scopeId,
          sessionId: resolvedSessionId,
          subjectId: existingSession.workspace_id,
          subjectType: "workspace",
          ts: now,
          verb: "workspace.bound",
        });
      }

      insertEventRecord(db, {
        actorId,
        afterState: {
          effort: firstString(effort, existingSession.effort),
          model: firstString(model, existingSession.model),
          status: "active",
        },
        correlationId: resolvedThreadId,
        detail: {
          workspaceId: existingSession.workspace_id,
        },
        engineTurnId: firstString(turnId),
        profileId,
        scopeId,
        sessionId: resolvedSessionId,
        subjectId: resolvedSessionId,
        subjectType: "session",
        ts: now,
        verb: "session.started",
      });

      return {
        sessionId: resolvedSessionId,
        workspaceId: existingSession.workspace_id,
      };
    });
  } finally {
    db.close();
  }
}

export async function ensureSubstrateSessionForThread({
  actorId,
  artifactRoot = null,
  codexThreadId,
  dbPath,
  effort = null,
  initialPrompt = null,
  model = null,
  now = new Date().toISOString(),
  profileId,
  scopeId,
  threadTitle = null,
  turnId = null,
  workspaceRoot = null,
}) {
  const resolvedDbPath = firstString(dbPath);
  const resolvedThreadId = firstString(codexThreadId);
  if (!resolvedDbPath || !resolvedThreadId) {
    throw new Error("A database path and thread id are required to ensure a substrate session.");
  }

  const db = openDatabase(resolvedDbPath);
  try {
    return runInTransaction(db, () => {
      const existingSession = getSessionByThreadIdWithDatabase(db, resolvedThreadId);
      const resolvedWorkspaceRoot = firstString(workspaceRoot);
      const resolvedArtifactRoot = firstString(artifactRoot);

      if (existingSession) {
        let workspaceId = existingSession.workspace_id;
        if (!workspaceId && resolvedWorkspaceRoot) {
          const workspace = ensureWorkspaceWithDatabase(db, {
            actorId,
            now,
            profileId,
            rootPath: resolvedWorkspaceRoot,
            scopeId,
          });
          workspaceId = workspace?.id ?? null;
          if (workspaceId) {
            db.prepare(
              `UPDATE workspaces
              SET last_active_at = ?,
                  session_count = session_count + 1
              WHERE id = ?`,
            ).run(now, workspaceId);
            insertEventRecord(db, {
              actorId,
              afterState: {
                root_path: path.resolve(resolvedWorkspaceRoot),
                session_id: existingSession.id,
              },
              correlationId: resolvedThreadId,
              detail: {
                rootPath: path.resolve(resolvedWorkspaceRoot),
              },
              engineTurnId: firstString(turnId),
              profileId,
              scopeId,
              sessionId: existingSession.id,
              subjectId: workspaceId,
              subjectType: "workspace",
              ts: now,
              verb: "workspace.bound",
            });
          }
        }
        const metadata = { ...existingSession.metadata };
        if (resolvedArtifactRoot) {
          metadata.artifactRoot = path.resolve(resolvedArtifactRoot);
        }
        if (resolvedWorkspaceRoot) {
          metadata.workspaceRoot = path.resolve(resolvedWorkspaceRoot);
        }
        const resolvedSeedTitle = resolveReusedSessionSeedTitle(existingSession, threadTitle);
        const titleContext = buildThreadTitleContext(metadata.titleContext, {
          initialPrompt,
          seedTitle: resolvedSeedTitle,
        });
        if (resolvedSeedTitle) {
          titleContext.seedTitle = resolvedSeedTitle;
        }
        if (Object.keys(titleContext).length > 0) {
          metadata.titleContext = titleContext;
        }
        db.prepare(
          `UPDATE sessions
          SET workspace_id = COALESCE(?, workspace_id),
              title = COALESCE(?, title),
              model = COALESCE(?, model),
              effort = COALESCE(?, effort),
              metadata = COALESCE(?, metadata)
          WHERE id = ?`,
        ).run(
          workspaceId,
          normalizeRuntimeThreadTitle(threadTitle),
          firstString(model),
          firstString(effort),
          Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
          existingSession.id,
        );

        return {
          created: false,
          sessionId: existingSession.id,
          workspaceId,
        };
      }

      const workspace = resolvedWorkspaceRoot
        ? ensureWorkspaceWithDatabase(db, {
            actorId,
            now,
            profileId,
            rootPath: resolvedWorkspaceRoot,
            scopeId,
          })
        : null;
      const sessionId = createId("sess");
      const metadata = {};
      if (resolvedArtifactRoot) {
        metadata.artifactRoot = path.resolve(resolvedArtifactRoot);
      }
      if (resolvedWorkspaceRoot) {
        metadata.workspaceRoot = path.resolve(resolvedWorkspaceRoot);
      }
      const titleContext = buildThreadTitleContext(null, {
        initialPrompt,
        seedTitle: normalizeRuntimeThreadTitle(threadTitle),
      });
      if (Object.keys(titleContext).length > 0) {
        metadata.titleContext = titleContext;
      }

      db.prepare(
        `INSERT INTO sessions (
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NULL, NULL, ?)`,
      ).run(
        sessionId,
        profileId,
        scopeId,
        actorId,
        resolvedThreadId,
        workspace?.id ?? null,
        normalizeRuntimeThreadTitle(threadTitle),
        firstString(model),
        firstString(effort),
        now,
        Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
      );

      if (workspace?.id) {
        db.prepare(
          `UPDATE workspaces
          SET last_active_at = ?,
              session_count = session_count + 1
          WHERE id = ?`,
        ).run(now, workspace.id);

        insertEventRecord(db, {
          actorId,
          afterState: {
            root_path: workspace.root_path,
            session_id: sessionId,
          },
          correlationId: resolvedThreadId,
          detail: {
            rootPath: workspace.root_path,
          },
          engineTurnId: firstString(turnId),
          profileId,
          scopeId,
          sessionId,
          subjectId: workspace.id,
          subjectType: "workspace",
          ts: now,
          verb: "workspace.bound",
        });
      }

      insertEventRecord(db, {
        actorId,
        afterState: {
          effort: firstString(effort),
          model: firstString(model),
          status: "active",
        },
        correlationId: resolvedThreadId,
        detail: {
          workspaceId: workspace?.id ?? null,
        },
        engineTurnId: firstString(turnId),
        profileId,
        scopeId,
        sessionId,
        subjectId: sessionId,
        subjectType: "session",
        ts: now,
        verb: "session.started",
      });

      return {
        created: true,
        sessionId,
        workspaceId: workspace?.id ?? null,
      };
    });
  } finally {
    db.close();
  }
}
