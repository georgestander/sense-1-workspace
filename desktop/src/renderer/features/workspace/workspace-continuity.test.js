import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWorkspaceContinuityState,
  findProjectedWorkspaceByRoot,
  sortProjectedSessionsByContinuity,
} from "./workspace-continuity.js";

test("findProjectedWorkspaceByRoot matches the selected folder against projected workspace roots", () => {
  const workspace = findProjectedWorkspaceByRoot(
    [
      { workspace_id: "ws_alpha", root_path: "/tmp/workspace-alpha" },
      { workspace_id: "ws_beta", root_path: "/tmp/workspace-beta" },
    ],
    "/tmp/workspace-beta",
  );

  assert.equal(workspace?.workspace_id, "ws_beta");
  assert.equal(findProjectedWorkspaceByRoot([], "/tmp/workspace-beta"), null);
});

test("sortProjectedSessionsByContinuity orders sessions by latest activity first", () => {
  const sessions = sortProjectedSessionsByContinuity([
    {
      session_id: "sess_old",
      started_at: "2026-03-20T09:00:00Z",
      last_activity_at: "2026-03-20T10:00:00Z",
    },
    {
      session_id: "sess_latest",
      started_at: "2026-03-24T09:00:00Z",
      last_activity_at: "2026-03-24T11:00:00Z",
    },
    {
      session_id: "sess_started_only",
      started_at: "2026-03-25T08:30:00Z",
      last_activity_at: null,
    },
  ]);

  assert.deepEqual(
    sessions.map((session) => session.session_id),
    ["sess_started_only", "sess_latest", "sess_old"],
  );
});

test("buildWorkspaceContinuityState surfaces resumable and history-only sessions separately", () => {
  const continuity = buildWorkspaceContinuityState({
    workspaceRoot: "/tmp/workspace-alpha",
    workspaces: [
      {
        workspace_id: "ws_alpha",
        root_path: "/tmp/workspace-alpha",
      },
    ],
    sessions: [
      {
        session_id: "sess_history_only",
        codex_thread_id: null,
        started_at: "2026-03-24T08:00:00Z",
        last_activity_at: "2026-03-24T08:05:00Z",
      },
      {
        session_id: "sess_resume_latest",
        codex_thread_id: "thread_resume_latest",
        started_at: "2026-03-25T10:00:00Z",
        last_activity_at: "2026-03-25T10:12:00Z",
      },
      {
        session_id: "sess_resume_older",
        codex_thread_id: "thread_resume_older",
        started_at: "2026-03-24T10:00:00Z",
        last_activity_at: "2026-03-24T10:04:00Z",
      },
    ],
  });

  assert.equal(continuity.workspace?.workspace_id, "ws_alpha");
  assert.equal(continuity.hasHistory, true);
  assert.equal(continuity.hasResumableHistory, true);
  assert.equal(continuity.historyOnlySessionCount, 1);
  assert.equal(continuity.latestResumableSession?.session_id, "sess_resume_latest");
  assert.deepEqual(
    continuity.orderedSessions.map((session) => session.session_id),
    ["sess_resume_latest", "sess_resume_older", "sess_history_only"],
  );
  assert.deepEqual(
    continuity.resumableSessions.map((session) => session.session_id),
    ["sess_resume_latest", "sess_resume_older"],
  );
});
