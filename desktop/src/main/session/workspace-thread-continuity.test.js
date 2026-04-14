import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

import { ensureProfileDirectories, resolveProfileArtifactRoot, resolveProfileSubstrateDbPath } from "../profile/profile-state.js";
import { ensureProfileSubstrate, resolveDefaultScopeId, resolvePrimaryActorId } from "../substrate/substrate.js";
import { writeSessionRecord } from "./session-record.ts";
import { buildRuntimeContinuityInstruction } from "./workspace-thread-continuity.ts";

function createTestEnv(runtimeRoot) {
  return {
    ...process.env,
    SENSE1_ARTIFACT_ROOT: path.join(runtimeRoot, "visible-artifacts"),
    SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
  };
}

test("buildRuntimeContinuityInstruction includes thread and workspace continuity from durable records", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-runtime-continuity-test-"));
  const env = createTestEnv(runtimeRoot);
  const { profileId } = await ensureProfileDirectories("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);
  const scopeId = resolveDefaultScopeId(profileId);
  const actorId = resolvePrimaryActorId(profileId);
  const artifactRoot = await resolveProfileArtifactRoot(profileId, env);
  const workspaceRoot = path.join(runtimeRoot, "workspace-alpha");

  await fs.mkdir(workspaceRoot, { recursive: true });
  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });

  const db = new DatabaseSync(dbPath);
  db.prepare(
    `INSERT INTO sessions (id, profile_id, scope_id, actor_id, codex_thread_id, workspace_id, title, model, effort, status, started_at, ended_at, summary, metadata)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "sess_current",
    profileId,
    scopeId,
    actorId,
    "thread-current",
    "Current thread",
    "gpt-5.4",
    "high",
    "active",
    "2026-04-12T10:00:00Z",
    null,
    null,
    JSON.stringify({ workspaceRoot }),
  );
  db.prepare(
    `INSERT INTO sessions (id, profile_id, scope_id, actor_id, codex_thread_id, workspace_id, title, model, effort, status, started_at, ended_at, summary, metadata)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "sess_previous",
    profileId,
    scopeId,
    actorId,
    "thread-previous",
    "Workspace follow-up",
    "gpt-5.4-mini",
    "medium",
    "completed",
    "2026-04-11T09:00:00Z",
    "2026-04-11T09:30:00Z",
    "Summarized workspace continuity.",
    JSON.stringify({ workspaceRoot }),
  );
  db.close();

  await writeSessionRecord({
    artifactRoot,
    intent: "Continue the current thread",
    outcomes: ["Thread state restored", "Audit trail still intact"],
    pathsWritten: [path.join(workspaceRoot, "notes", "current.txt")],
    sessionId: "sess_current",
    startedAt: "2026-04-12T10:00:00Z",
    workspaceRoot,
  });
  await writeSessionRecord({
    artifactRoot,
    intent: "Review workspace history",
    outcomes: ["Recovered context from substrate history"],
    pathsWritten: [path.join(workspaceRoot, "docs", "continuity.md")],
    sessionId: "sess_previous",
    startedAt: "2026-04-11T09:00:00Z",
    workspaceRoot,
  });

  const instruction = await buildRuntimeContinuityInstruction({
    artifactRoot,
    currentSessionId: "sess_current",
    dbPath,
    profileId,
    workspaceRoot,
  });

  assert.ok(instruction);
  assert.match(instruction ?? "", /Thread continuity is available from the durable session record for this thread\./);
  assert.match(instruction ?? "", /Thread state restored; Audit trail still intact/);
  assert.match(instruction ?? "", /Workspace continuity is available from 1 recent durable session record for this folder\./);
  assert.match(instruction ?? "", /Recovered context from substrate history/);
  assert.match(instruction ?? "", /docs\/continuity\.md/);
  assert.doesNotMatch(instruction ?? "", /Current thread/);
});
