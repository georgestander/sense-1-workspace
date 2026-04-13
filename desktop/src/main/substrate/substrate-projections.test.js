import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

import {
  ensureProfileDirectories,
  resolveProfileSubstrateDbPath,
} from "../profile/profile-state.js";
import {
  ensureProfileSubstrate,
  resolveDefaultScopeId,
  resolvePrimaryActorId,
} from "./substrate.js";
import {
  clearSubstrateProjections,
  getProjectedSession,
  getProjectedWorkspace,
  getProjectedWorkspaceByRootPath,
  listProjectedSessions,
  listProjectedWorkspaces,
  rebuildSubstrateProjections,
} from "./substrate-projections.js";

function createTestEnv(runtimeRoot) {
  return {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
  };
}

async function setupProjectionSubstrate() {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-substrate-projections-test-"));
  const env = createTestEnv(runtimeRoot);
  const { profileId } = await ensureProfileDirectories("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);
  const scopeId = resolveDefaultScopeId(profileId);
  const actorId = resolvePrimaryActorId(profileId);

  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });

  const db = new DatabaseSync(dbPath);

  db.prepare(
    `INSERT INTO workspaces (id, profile_id, scope_id, root_path, display_name, registered_at, last_active_at, session_count, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "ws_alpha",
    profileId,
    scopeId,
    "/tmp/workspace-alpha",
    "workspace-alpha",
    "2026-03-24T08:00:00Z",
    "2026-03-24T10:02:00Z",
    2,
    '{"kind":"repo"}',
  );

  db.prepare(
    `INSERT INTO sessions (id, profile_id, scope_id, actor_id, codex_thread_id, workspace_id, title, model, effort, status, started_at, ended_at, summary, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "sess_alpha_1",
    profileId,
    scopeId,
    actorId,
    "thread_alpha_1",
    "ws_alpha",
    "Workspace fix",
    "gpt-5.4",
    "high",
    "completed",
    "2026-03-24T09:00:00Z",
    "2026-03-24T09:10:00Z",
    "Resolved workspace issue",
    '{"workspaceRoot":"/tmp/workspace-alpha"}',
  );

  db.prepare(
    `INSERT INTO sessions (id, profile_id, scope_id, actor_id, codex_thread_id, workspace_id, title, model, effort, status, started_at, ended_at, summary, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "sess_alpha_2",
    profileId,
    scopeId,
    actorId,
    "thread_alpha_2",
    "ws_alpha",
    "Workspace follow-up",
    "gpt-5.4-mini",
    "medium",
    "active",
    "2026-03-24T10:00:00Z",
    null,
    null,
    '{"workspaceRoot":"/tmp/workspace-alpha","continuation":true}',
  );

  db.prepare(
    `INSERT INTO sessions (id, profile_id, scope_id, actor_id, codex_thread_id, workspace_id, title, model, effort, status, started_at, ended_at, summary, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "sess_chat_1",
    profileId,
    scopeId,
    actorId,
    "thread_chat_1",
    null,
    "Chat only",
    "gpt-5.4-mini",
    "low",
    "active",
    "2026-03-24T11:00:00Z",
    null,
    null,
    '{"artifactMode":"chat"}',
  );

  const insertEvent = db.prepare(
    `INSERT INTO events (id, ts, actor_id, scope_id, verb, subject_type, subject_id, before_state, after_state, detail, engine_turn_id, engine_item_id, source_event_ids, causation_id, correlation_id, session_id, profile_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  insertEvent.run(
    "evt_turn_started",
    "2026-03-24T09:01:00Z",
    actorId,
    scopeId,
    "turn.started",
    "turn",
    "turn_alpha_1",
    null,
    '{"status":"running"}',
    '{"phase":"draft"}',
    "turn_alpha_1",
    null,
    null,
    null,
    "thread_alpha_1",
    "sess_alpha_1",
    profileId,
  );

  insertEvent.run(
    "evt_file_a",
    "2026-03-24T09:02:00Z",
    actorId,
    scopeId,
    "file.changed",
    "file",
    "src/main.ts",
    '{"path":"src/main.ts"}',
    '{"path":"src/main.ts","lines":42}',
    '{"source":"turn/diff/updated"}',
    "turn_alpha_1",
    "item_file_a",
    null,
    null,
    "thread_alpha_1",
    "sess_alpha_1",
    profileId,
  );

  insertEvent.run(
    "evt_command_a",
    "2026-03-24T09:03:00Z",
    actorId,
    scopeId,
    "command.completed",
    "command",
    "git status",
    null,
    '{"exitCode":0}',
    '{"command":["git","status"]}',
    "turn_alpha_1",
    "item_command_a",
    null,
    null,
    "thread_alpha_1",
    "sess_alpha_1",
    profileId,
  );

  insertEvent.run(
    "evt_approval_a",
    "2026-03-24T09:04:00Z",
    actorId,
    scopeId,
    "approval.requested",
    "approval",
    "approval_1",
    null,
    '{"status":"pending"}',
    '{"requestId":7}',
    null,
    null,
    null,
    null,
    "thread_alpha_1",
    "sess_alpha_1",
    profileId,
  );

  insertEvent.run(
    "evt_policy_a",
    "2026-03-24T09:05:00Z",
    actorId,
    scopeId,
    "policy.allow",
    "policy",
    "run.start",
    null,
    '{"decision":"allow"}',
    '{"matchedRule":"workspace-safe"}',
    null,
    null,
    null,
    null,
    "thread_alpha_1",
    "sess_alpha_1",
    profileId,
  );

  insertEvent.run(
    "evt_file_b",
    "2026-03-24T10:01:00Z",
    actorId,
    scopeId,
    "file.changed",
    "file",
    "README.md",
    '{"path":"README.md"}',
    '{"path":"README.md","lines":8}',
    '{"source":"item/completed"}',
    "turn_alpha_2",
    "item_file_b",
    null,
    null,
    "thread_alpha_2",
    "sess_alpha_2",
    profileId,
  );

  insertEvent.run(
    "evt_tool_b",
    "2026-03-24T10:02:00Z",
    actorId,
    scopeId,
    "tool.completed",
    "tool",
    "web.search",
    null,
    '{"status":"completed"}',
    '{"query":"projection pipeline"}',
    "turn_alpha_2",
    "item_tool_b",
    null,
    null,
    "thread_alpha_2",
    "sess_alpha_2",
    profileId,
  );

  insertEvent.run(
    "evt_chat_turn",
    "2026-03-24T11:01:00Z",
    actorId,
    scopeId,
    "turn.started",
    "turn",
    "turn_chat_1",
    null,
    '{"status":"running"}',
    '{"phase":"chat"}',
    "turn_chat_1",
    null,
    null,
    null,
    "thread_chat_1",
    "sess_chat_1",
    profileId,
  );

  db.close();

  return { actorId, dbPath, profileId, runtimeRoot, scopeId };
}

let ctx;

test("substrate-projections setup", async () => {
  ctx = await setupProjectionSubstrate();
});

test("rebuildSubstrateProjections materializes workspace and session views from substrate events", async () => {
  const rebuild = await rebuildSubstrateProjections({
    dbPath: ctx.dbPath,
    profileId: ctx.profileId,
  });

  assert.equal(rebuild.profileId, ctx.profileId);
  assert.equal(rebuild.workspaceCount, 1);
  assert.equal(rebuild.sessionCount, 3);
  assert.equal(rebuild.sourceEventCount, 8);

  const projectedWorkspaces = await listProjectedWorkspaces({
    dbPath: ctx.dbPath,
    profileId: ctx.profileId,
  });
  assert.equal(projectedWorkspaces.length, 1);
  assert.deepEqual(projectedWorkspaces[0], {
    workspace_id: "ws_alpha",
    profile_id: ctx.profileId,
    scope_id: ctx.scopeId,
    root_path: "/tmp/workspace-alpha",
    display_name: "workspace-alpha",
    registered_at: "2026-03-24T08:00:00Z",
    last_activity_at: "2026-03-24T10:02:00Z",
    session_count: 2,
    event_count: 7,
    file_change_count: 2,
    command_count: 1,
    tool_count: 1,
    approval_count: 1,
    policy_count: 1,
    last_session_id: "sess_alpha_2",
    last_thread_id: "thread_alpha_2",
    recent_file_paths: ["README.md", "src/main.ts"],
    activity_summary: [
      {
        id: "evt_tool_b",
        ts: "2026-03-24T10:02:00Z",
        verb: "tool.completed",
        subjectType: "tool",
        subjectId: "web.search",
        detail: { query: "projection pipeline" },
        engineTurnId: "turn_alpha_2",
        engineItemId: "item_tool_b",
      },
      {
        id: "evt_file_b",
        ts: "2026-03-24T10:01:00Z",
        verb: "file.changed",
        subjectType: "file",
        subjectId: "README.md",
        detail: { source: "item/completed" },
        engineTurnId: "turn_alpha_2",
        engineItemId: "item_file_b",
      },
      {
        id: "evt_policy_a",
        ts: "2026-03-24T09:05:00Z",
        verb: "policy.allow",
        subjectType: "policy",
        subjectId: "run.start",
        detail: { matchedRule: "workspace-safe" },
        engineTurnId: null,
        engineItemId: null,
      },
      {
        id: "evt_approval_a",
        ts: "2026-03-24T09:04:00Z",
        verb: "approval.requested",
        subjectType: "approval",
        subjectId: "approval_1",
        detail: { requestId: 7 },
        engineTurnId: null,
        engineItemId: null,
      },
      {
        id: "evt_command_a",
        ts: "2026-03-24T09:03:00Z",
        verb: "command.completed",
        subjectType: "command",
        subjectId: "git status",
        detail: { command: ["git", "status"] },
        engineTurnId: "turn_alpha_1",
        engineItemId: "item_command_a",
      },
      {
        id: "evt_file_a",
        ts: "2026-03-24T09:02:00Z",
        verb: "file.changed",
        subjectType: "file",
        subjectId: "src/main.ts",
        detail: { source: "turn/diff/updated" },
        engineTurnId: "turn_alpha_1",
        engineItemId: "item_file_a",
      },
      {
        id: "evt_turn_started",
        ts: "2026-03-24T09:01:00Z",
        verb: "turn.started",
        subjectType: "turn",
        subjectId: "turn_alpha_1",
        detail: { phase: "draft" },
        engineTurnId: "turn_alpha_1",
        engineItemId: null,
      },
    ],
    metadata: { kind: "repo" },
  });

  const projectedSessions = await listProjectedSessions({
    dbPath: ctx.dbPath,
    profileId: ctx.profileId,
  });
  assert.deepEqual(
    projectedSessions.map((session) => session.session_id),
    ["sess_chat_1", "sess_alpha_2", "sess_alpha_1"],
  );

  const projectedWorkspaceSessions = await listProjectedSessions({
    dbPath: ctx.dbPath,
    profileId: ctx.profileId,
    workspaceId: "ws_alpha",
  });
  assert.deepEqual(
    projectedWorkspaceSessions.map((session) => session.session_id),
    ["sess_alpha_2", "sess_alpha_1"],
  );

  const projectedSession = await getProjectedSession({
    dbPath: ctx.dbPath,
    sessionId: "sess_alpha_1",
  });
  assert.deepEqual(projectedSession, {
    session_id: "sess_alpha_1",
    profile_id: ctx.profileId,
    scope_id: ctx.scopeId,
    workspace_id: "ws_alpha",
    actor_id: ctx.actorId,
    codex_thread_id: "thread_alpha_1",
    title: "Workspace fix",
    model: "gpt-5.4",
    effort: "high",
    status: "completed",
    started_at: "2026-03-24T09:00:00Z",
    ended_at: "2026-03-24T09:10:00Z",
    summary: "Resolved workspace issue",
    last_activity_at: "2026-03-24T09:05:00Z",
    event_count: 5,
    file_change_count: 1,
    command_count: 1,
    tool_count: 0,
    approval_count: 1,
    policy_count: 1,
    timeline: [
      {
        id: "evt_turn_started",
        ts: "2026-03-24T09:01:00Z",
        verb: "turn.started",
        subjectType: "turn",
        subjectId: "turn_alpha_1",
        detail: { phase: "draft" },
        engineTurnId: "turn_alpha_1",
        engineItemId: null,
      },
      {
        id: "evt_file_a",
        ts: "2026-03-24T09:02:00Z",
        verb: "file.changed",
        subjectType: "file",
        subjectId: "src/main.ts",
        detail: { source: "turn/diff/updated" },
        engineTurnId: "turn_alpha_1",
        engineItemId: "item_file_a",
      },
      {
        id: "evt_command_a",
        ts: "2026-03-24T09:03:00Z",
        verb: "command.completed",
        subjectType: "command",
        subjectId: "git status",
        detail: { command: ["git", "status"] },
        engineTurnId: "turn_alpha_1",
        engineItemId: "item_command_a",
      },
      {
        id: "evt_approval_a",
        ts: "2026-03-24T09:04:00Z",
        verb: "approval.requested",
        subjectType: "approval",
        subjectId: "approval_1",
        detail: { requestId: 7 },
        engineTurnId: null,
        engineItemId: null,
      },
      {
        id: "evt_policy_a",
        ts: "2026-03-24T09:05:00Z",
        verb: "policy.allow",
        subjectType: "policy",
        subjectId: "run.start",
        detail: { matchedRule: "workspace-safe" },
        engineTurnId: null,
        engineItemId: null,
      },
    ],
    file_history: [
      {
        id: "evt_file_a",
        ts: "2026-03-24T09:02:00Z",
        path: "src/main.ts",
        verb: "file.changed",
        detail: { source: "turn/diff/updated" },
      },
    ],
    metadata: { workspaceRoot: "/tmp/workspace-alpha" },
  });

  const projectedWorkspace = await getProjectedWorkspace({
    dbPath: ctx.dbPath,
    workspaceId: "ws_alpha",
  });
  assert.equal(projectedWorkspace?.workspace_id, "ws_alpha");
  assert.equal(projectedWorkspace?.last_thread_id, "thread_alpha_2");
});

test("clearSubstrateProjections removes materialized views and rebuild produces the same result", async () => {
  await rebuildSubstrateProjections({
    dbPath: ctx.dbPath,
    profileId: ctx.profileId,
  });

  const beforeWorkspace = await getProjectedWorkspace({
    dbPath: ctx.dbPath,
    workspaceId: "ws_alpha",
  });
  const beforeSession = await getProjectedSession({
    dbPath: ctx.dbPath,
    sessionId: "sess_alpha_2",
  });

  await clearSubstrateProjections({
    dbPath: ctx.dbPath,
    profileId: ctx.profileId,
  });

  assert.deepEqual(
    await listProjectedWorkspaces({
      dbPath: ctx.dbPath,
      profileId: ctx.profileId,
    }),
    [],
  );
  assert.equal(
    await getProjectedWorkspace({
      dbPath: ctx.dbPath,
      workspaceId: "ws_alpha",
    }),
    null,
  );
  assert.equal(
    await getProjectedSession({
      dbPath: ctx.dbPath,
      sessionId: "sess_alpha_2",
    }),
    null,
  );

  await rebuildSubstrateProjections({
    dbPath: ctx.dbPath,
    profileId: ctx.profileId,
  });

  const afterWorkspace = await getProjectedWorkspace({
    dbPath: ctx.dbPath,
    workspaceId: "ws_alpha",
  });
  const afterSession = await getProjectedSession({
    dbPath: ctx.dbPath,
    sessionId: "sess_alpha_2",
  });

  assert.deepEqual(afterWorkspace, beforeWorkspace);
  assert.deepEqual(afterSession, beforeSession);
});

test("getProjectedWorkspaceByRootPath resolves a workspace using the selected folder path", async () => {
  await rebuildSubstrateProjections({
    dbPath: ctx.dbPath,
    profileId: ctx.profileId,
  });

  const workspace = await getProjectedWorkspaceByRootPath({
    dbPath: ctx.dbPath,
    profileId: ctx.profileId,
    rootPath: "/tmp/workspace-alpha",
  });
  assert.equal(workspace?.workspace_id, "ws_alpha");
  assert.equal(workspace?.root_path, "/tmp/workspace-alpha");

  const missing = await getProjectedWorkspaceByRootPath({
    dbPath: ctx.dbPath,
    profileId: ctx.profileId,
    rootPath: "/tmp/workspace-missing",
  });
  assert.equal(missing, null);
});

test("substrate-projections teardown", async () => {
  if (ctx?.runtimeRoot) {
    await fs.rm(ctx.runtimeRoot, { recursive: true, force: true });
  }
});
