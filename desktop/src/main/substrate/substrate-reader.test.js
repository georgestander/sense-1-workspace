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
  getLatestPlanForSession,
  getPendingQuestionByRequestId,
  getPendingQuestionByThreadId,
  getSession,
  getPlan,
  getWorkspace,
  listEventsBySession,
  listObjectRefsBySession,
  listPlansBySession,
  listQuestionsBySession,
  listRecentSessions,
  listRecentWorkspaces,
  listSessionsByWorkspace,
} from "./substrate-reader.js";

function createTestEnv(runtimeRoot) {
  return {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
  };
}

async function setupTestSubstrate() {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-substrate-reader-test-"));
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

  // 2 workspaces: ws_1 (recent), ws_2 (older)
  db.prepare(
    `INSERT INTO workspaces (id, profile_id, scope_id, root_path, display_name, registered_at, last_active_at, session_count, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("ws_1", profileId, scopeId, "/tmp/project-a", "project-a", "2026-03-20T10:00:00Z", "2026-03-24T10:00:00Z", 2, "{}");

  db.prepare(
    `INSERT INTO workspaces (id, profile_id, scope_id, root_path, display_name, registered_at, last_active_at, session_count, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("ws_2", profileId, scopeId, "/tmp/project-b", "project-b", "2026-03-18T10:00:00Z", "2026-03-19T10:00:00Z", 1, "{}");

  // 3 sessions: sess_1 and sess_2 in ws_1, sess_3 is chat-only (null workspace_id)
  db.prepare(
    `INSERT INTO sessions (id, profile_id, scope_id, actor_id, codex_thread_id, workspace_id, title, model, effort, status, started_at, ended_at, summary, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("sess_1", profileId, scopeId, actorId, "thread_1", "ws_1", "Fix build", "gpt-5.4", "high", "active", "2026-03-24T09:00:00Z", null, null, '{"workspaceRoot":"/tmp/project-a"}');

  db.prepare(
    `INSERT INTO sessions (id, profile_id, scope_id, actor_id, codex_thread_id, workspace_id, title, model, effort, status, started_at, ended_at, summary, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("sess_2", profileId, scopeId, actorId, "thread_2", "ws_1", "Add tests", "gpt-5.4", "medium", "active", "2026-03-24T08:00:00Z", null, null, null);

  db.prepare(
    `INSERT INTO sessions (id, profile_id, scope_id, actor_id, codex_thread_id, workspace_id, title, model, effort, status, started_at, ended_at, summary, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("sess_3", profileId, scopeId, actorId, "thread_3", null, "Chat only", "gpt-5.4", "low", "active", "2026-03-24T07:00:00Z", null, null, null);

  // 3 events: evt_1 and evt_2 in sess_1, evt_3 in sess_2
  db.prepare(
    `INSERT INTO events (id, ts, actor_id, scope_id, verb, subject_type, subject_id, before_state, after_state, detail, engine_turn_id, engine_item_id, source_event_ids, causation_id, correlation_id, session_id, profile_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("evt_1", "2026-03-24T09:01:00Z", actorId, scopeId, "file.created", "file", "file_1", null, '{"path":"/src/main.ts"}', null, "turn_1", null, null, null, "thread_1", "sess_1", profileId);

  db.prepare(
    `INSERT INTO events (id, ts, actor_id, scope_id, verb, subject_type, subject_id, before_state, after_state, detail, engine_turn_id, engine_item_id, source_event_ids, causation_id, correlation_id, session_id, profile_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("evt_2", "2026-03-24T09:02:00Z", actorId, scopeId, "file.modified", "file", "file_1", '{"path":"/src/main.ts"}', '{"path":"/src/main.ts","lines":42}', '{"reason":"lint fix"}', "turn_2", null, '["evt_1"]', "evt_1", "thread_1", "sess_1", profileId);

  db.prepare(
    `INSERT INTO events (id, ts, actor_id, scope_id, verb, subject_type, subject_id, before_state, after_state, detail, engine_turn_id, engine_item_id, source_event_ids, causation_id, correlation_id, session_id, profile_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("evt_3", "2026-03-24T08:30:00Z", actorId, scopeId, "test.added", "test", "test_1", null, null, null, "turn_3", null, null, null, "thread_2", "sess_2", profileId);

  // 2 object_refs in sess_1
  db.prepare(
    `INSERT INTO object_refs (id, session_id, ref_type, ref_path, ref_id, action, ts, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("objref_1", "sess_1", "file", "/src/main.ts", "file_1", "created", "2026-03-24T09:01:00Z", '{"language":"typescript"}');

  db.prepare(
    `INSERT INTO object_refs (id, session_id, ref_type, ref_path, ref_id, action, ts, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("objref_2", "sess_1", "file", "/src/utils.ts", "file_2", "modified", "2026-03-24T09:03:00Z", null);

  db.prepare(
    `INSERT INTO plans (id, session_id, profile_id, scope_id, actor_id, status, request_summary, assumptions, intended_actions, affected_locations, approval_status, approved_by_actor_id, approved_at, rejected_by_actor_id, rejected_at, created_at, updated_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "plan_1",
    "sess_1",
    profileId,
    scopeId,
    actorId,
    "ready_for_approval",
    "Create a launch page plan",
    '["Assume a B2B buyer"]',
    '["Draft hero","Define sections"]',
    '["/tmp/project-a","/tmp/project-a/src"]',
    "pending",
    null,
    null,
    null,
    null,
    "2026-03-24T09:04:00Z",
    "2026-03-24T09:05:00Z",
    '{"source":"product"}',
  );

  db.prepare(
    `INSERT INTO plans (id, session_id, profile_id, scope_id, actor_id, status, request_summary, assumptions, intended_actions, affected_locations, approval_status, approved_by_actor_id, approved_at, rejected_by_actor_id, rejected_at, created_at, updated_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "plan_2",
    "sess_1",
    profileId,
    scopeId,
    actorId,
    "proposed",
    "Refine the CTA plan",
    '["Assume same buyer"]',
    '["Test CTA copy"]',
    '["/tmp/project-a/src/components"]',
    "approved",
    actorId,
    "2026-03-24T09:07:00Z",
    null,
    null,
    "2026-03-24T09:06:00Z",
    "2026-03-24T09:07:00Z",
    '{"source":"engine"}',
  );

  db.prepare(
    `INSERT INTO plans (id, session_id, profile_id, scope_id, actor_id, status, request_summary, assumptions, intended_actions, affected_locations, approval_status, approved_by_actor_id, approved_at, rejected_by_actor_id, rejected_at, created_at, updated_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "plan_3",
    "sess_2",
    profileId,
    scopeId,
    actorId,
    "proposed",
    "Plan test coverage",
    '["Assume no flaky tests"]',
    '["Add happy-path tests"]',
    '["/tmp/project-a/tests"]',
    "rejected",
    null,
    null,
    actorId,
    "2026-03-24T08:35:00Z",
    "2026-03-24T08:20:00Z",
    "2026-03-24T08:35:00Z",
    '{"source":"product"}',
  );

  db.close();

  return { actorId, dbPath, profileId, runtimeRoot, scopeId };
}

let ctx;

test("substrate-reader setup", async () => {
  ctx = await setupTestSubstrate();
});

test("listRecentWorkspaces returns workspaces ordered by last_active_at", async () => {
  const workspaces = await listRecentWorkspaces({ dbPath: ctx.dbPath, profileId: ctx.profileId });
  assert.ok(workspaces.length >= 2);
  assert.equal(workspaces[0].id, "ws_1");
  assert.equal(workspaces[1].id, "ws_2");
  assert.equal(workspaces[0].display_name, "project-a");
  assert.equal(workspaces[1].display_name, "project-b");
  assert.deepEqual(workspaces[0].metadata, {});
});

test("listRecentWorkspaces respects limit", async () => {
  const workspaces = await listRecentWorkspaces({ dbPath: ctx.dbPath, limit: 1, profileId: ctx.profileId });
  assert.equal(workspaces.length, 1);
  assert.equal(workspaces[0].id, "ws_1");
});

test("listRecentSessions returns sessions ordered by started_at desc", async () => {
  const sessions = await listRecentSessions({ dbPath: ctx.dbPath, profileId: ctx.profileId });
  assert.ok(sessions.length >= 3);
  assert.equal(sessions[0].id, "sess_1");
  assert.equal(sessions[1].id, "sess_2");
  assert.equal(sessions[2].id, "sess_3");
  assert.equal(sessions[0].title, "Fix build");
  assert.deepEqual(sessions[0].metadata, { workspaceRoot: "/tmp/project-a" });
  assert.deepEqual(sessions[2].metadata, {});
});

test("listRecentSessions respects limit", async () => {
  const sessions = await listRecentSessions({ dbPath: ctx.dbPath, limit: 2, profileId: ctx.profileId });
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].id, "sess_1");
  assert.equal(sessions[1].id, "sess_2");
});

test("listSessionsByWorkspace returns only sessions for the given workspace", async () => {
  const sessions = await listSessionsByWorkspace({ dbPath: ctx.dbPath, workspaceId: "ws_1" });
  assert.equal(sessions.length, 2);
  const ids = sessions.map((s) => s.id);
  assert.ok(ids.includes("sess_1"));
  assert.ok(ids.includes("sess_2"));
  assert.ok(!ids.includes("sess_3"));
});

test("getSession returns a session by id", async () => {
  const session = await getSession({ dbPath: ctx.dbPath, sessionId: "sess_1" });
  assert.ok(session);
  assert.equal(session.id, "sess_1");
  assert.equal(session.title, "Fix build");
  assert.equal(session.model, "gpt-5.4");
  assert.equal(session.effort, "high");
  assert.equal(session.workspace_id, "ws_1");
  assert.equal(session.codex_thread_id, "thread_1");
  assert.deepEqual(session.metadata, { workspaceRoot: "/tmp/project-a" });
});

test("getSession returns null for unknown id", async () => {
  const session = await getSession({ dbPath: ctx.dbPath, sessionId: "sess_nonexistent" });
  assert.equal(session, null);
});

test("getWorkspace returns a workspace by id", async () => {
  const workspace = await getWorkspace({ dbPath: ctx.dbPath, workspaceId: "ws_1" });
  assert.ok(workspace);
  assert.equal(workspace.id, "ws_1");
  assert.equal(workspace.root_path, "/tmp/project-a");
  assert.equal(workspace.display_name, "project-a");
  assert.equal(workspace.session_count, 2);
  assert.equal(workspace.last_active_at, "2026-03-24T10:00:00Z");
  assert.deepEqual(workspace.metadata, {});
});

test("getWorkspace returns null for unknown id", async () => {
  const workspace = await getWorkspace({ dbPath: ctx.dbPath, workspaceId: "ws_nonexistent" });
  assert.equal(workspace, null);
});

test("getPlan returns a parsed plan by id", async () => {
  const plan = await getPlan({ dbPath: ctx.dbPath, planId: "plan_2" });
  assert.ok(plan);
  assert.equal(plan.id, "plan_2");
  assert.equal(plan.session_id, "sess_1");
  assert.equal(plan.approval_status, "approved");
  assert.equal(plan.approved_by_actor_id, ctx.actorId);
  assert.deepEqual(plan.assumptions, ["Assume same buyer"]);
  assert.deepEqual(plan.intended_actions, ["Test CTA copy"]);
  assert.deepEqual(plan.affected_locations, ["/tmp/project-a/src/components"]);
  assert.deepEqual(plan.metadata, { source: "engine" });
});

test("getPlan returns null for unknown id", async () => {
  const plan = await getPlan({ dbPath: ctx.dbPath, planId: "plan_missing" });
  assert.equal(plan, null);
});

test("listPlansBySession returns only session-linked plans ordered by recency", async () => {
  const plans = await listPlansBySession({ dbPath: ctx.dbPath, sessionId: "sess_1" });
  assert.equal(plans.length, 2);
  assert.equal(plans[0].id, "plan_2");
  assert.equal(plans[1].id, "plan_1");
  assert.deepEqual(plans[0].metadata, { source: "engine" });
  assert.deepEqual(plans[1].metadata, { source: "product" });
});

test("listEventsBySession returns events ordered by ts asc", async () => {
  const events = await listEventsBySession({ dbPath: ctx.dbPath, sessionId: "sess_1" });
  assert.equal(events.length, 2);
  assert.equal(events[0].id, "evt_1");
  assert.equal(events[1].id, "evt_2");
  assert.equal(events[0].verb, "file.created");
  assert.equal(events[1].verb, "file.modified");
  assert.deepEqual(events[0].after_state, { path: "/src/main.ts" });
  assert.deepEqual(events[1].before_state, { path: "/src/main.ts" });
  assert.deepEqual(events[1].after_state, { path: "/src/main.ts", lines: 42 });
  assert.deepEqual(events[1].detail, { reason: "lint fix" });
  assert.deepEqual(events[1].source_event_ids, ["evt_1"]);
});

test("listEventsBySession returns empty array for session with no events", async () => {
  const events = await listEventsBySession({ dbPath: ctx.dbPath, sessionId: "sess_3" });
  assert.deepEqual(events, []);
});

test("listObjectRefsBySession returns refs for the session", async () => {
  const refs = await listObjectRefsBySession({ dbPath: ctx.dbPath, sessionId: "sess_1" });
  assert.equal(refs.length, 2);
  assert.equal(refs[0].id, "objref_1");
  assert.equal(refs[1].id, "objref_2");
  assert.equal(refs[0].ref_type, "file");
  assert.equal(refs[0].ref_path, "/src/main.ts");
  assert.equal(refs[0].action, "created");
  assert.deepEqual(refs[0].metadata, { language: "typescript" });
  assert.deepEqual(refs[1].metadata, {});
});

test("listObjectRefsBySession returns empty array for session with no refs", async () => {
  const refs = await listObjectRefsBySession({ dbPath: ctx.dbPath, sessionId: "sess_2" });
  assert.deepEqual(refs, []);
});

test("question readers restore pending questions and linked plan state", async () => {
  const db = new DatabaseSync(ctx.dbPath);
  try {
    db.prepare(
      `INSERT INTO events (id, ts, actor_id, scope_id, verb, subject_type, subject_id, before_state, after_state, detail, engine_turn_id, engine_item_id, source_event_ids, causation_id, correlation_id, session_id, profile_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "evt_plan_1",
      "2026-03-24T09:05:00Z",
      ctx.actorId,
      ctx.scopeId,
      "plan.updated",
      "plan",
      "plan:turn_2",
      null,
      JSON.stringify({ text: "1. Ask\n2. Build", steps: ["Ask", "Build"] }),
      JSON.stringify({ threadId: "thread_1" }),
      "turn_2",
      null,
      null,
      null,
      "thread_1",
      "sess_1",
      ctx.profileId,
    );
    db.prepare(
      `INSERT INTO questions (id, profile_id, scope_id, session_id, actor_id, codex_thread_id, engine_turn_id, request_id, prompt, status, answer_text, asked_at, answered_at, target_kind, target_id, target_snapshot, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "question_1",
      ctx.profileId,
      ctx.scopeId,
      "sess_1",
      ctx.actorId,
      "thread_1",
      "turn_2",
      42,
      "Which environment should I use?",
      "pending",
      null,
      "2026-03-24T09:06:00Z",
      null,
      "pending_run",
      "turn_2",
      JSON.stringify({ threadId: "thread_1", turnId: "turn_2" }),
      JSON.stringify({ source: "test" }),
    );
    db.prepare(
      `INSERT INTO questions (id, profile_id, scope_id, session_id, actor_id, codex_thread_id, engine_turn_id, request_id, prompt, status, answer_text, asked_at, answered_at, target_kind, target_id, target_snapshot, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "question_2",
      ctx.profileId,
      ctx.scopeId,
      "sess_1",
      ctx.actorId,
      "thread_1",
      "turn_2",
      43,
      "Already answered",
      "answered",
      "Production",
      "2026-03-24T09:07:00Z",
      "2026-03-24T09:08:00Z",
      "plan",
      "evt_plan_1",
      JSON.stringify({ eventId: "evt_plan_1" }),
      JSON.stringify({ source: "test" }),
    );
  } finally {
    db.close();
  }

  const questions = await listQuestionsBySession({ dbPath: ctx.dbPath, sessionId: "sess_1" });
  assert.equal(questions.length, 2);
  assert.equal(questions[0].id, "question_1");
  assert.deepEqual(questions[0].target_snapshot, { threadId: "thread_1", turnId: "turn_2" });

  const pendingByThread = await getPendingQuestionByThreadId({ dbPath: ctx.dbPath, codexThreadId: "thread_1" });
  assert.ok(pendingByThread);
  assert.equal(pendingByThread.id, "question_1");
  assert.equal(pendingByThread.request_id, 42);

  const pendingByRequest = await getPendingQuestionByRequestId({ dbPath: ctx.dbPath, requestId: 42 });
  assert.ok(pendingByRequest);
  assert.equal(pendingByRequest.id, "question_1");

  const plan = await getLatestPlanForSession({ dbPath: ctx.dbPath, sessionId: "sess_1", engineTurnId: "turn_2" });
  assert.deepEqual(plan, {
    eventId: "evt_plan_1",
    subjectId: "plan:turn_2",
    engineTurnId: "turn_2",
    planText: "1. Ask\n2. Build",
    planSteps: ["Ask", "Build"],
    ts: "2026-03-24T09:05:00Z",
  });
});

test("substrate-reader teardown", async () => {
  if (ctx?.runtimeRoot) {
    await fs.rm(ctx.runtimeRoot, { recursive: true, force: true });
  }
});
