import test from "node:test";
import assert from "node:assert/strict";

import { listVisibleSubstrateSessions } from "./substrate-thread-enrichment.js";

test("listVisibleSubstrateSessions hides sessions that belong to archived workspaces", () => {
  const visible = listVisibleSubstrateSessions({
    existingThreadIds: [],
    sessions: [
      {
        codex_thread_id: "thread-archived-workspace",
        ended_at: null,
        started_at: "2026-03-31T12:00:00.000Z",
        status: "active",
        title: "Archived workspace thread",
        workspace_id: "workspace-archived",
      },
      {
        codex_thread_id: "thread-chat",
        ended_at: null,
        started_at: "2026-03-31T11:00:00.000Z",
        status: "active",
        title: "Standalone chat",
        workspace_id: null,
      },
      {
        codex_thread_id: "thread-active-workspace",
        ended_at: "2026-03-31T10:30:00.000Z",
        started_at: "2026-03-31T10:00:00.000Z",
        status: "active",
        title: "Active workspace thread",
        workspace_id: "workspace-active",
      },
    ],
    workspaces: [
      {
        id: "workspace-archived",
        metadata: {
          lifecycle: {
            archivedAt: "2026-03-31T12:05:00.000Z",
            status: "archived",
          },
        },
        root_path: "/tmp/archived",
      },
      {
        id: "workspace-active",
        metadata: {
          lifecycle: {
            archivedAt: null,
            status: "active",
          },
        },
        root_path: "/tmp/active",
      },
    ],
  });

  assert.deepEqual(visible, [
    {
      status: "active",
      threadId: "thread-chat",
      title: "Standalone chat",
      updatedAt: "2026-03-31T11:00:00.000Z",
      workspaceRoot: null,
    },
    {
      status: "active",
      threadId: "thread-active-workspace",
      title: "Active workspace thread",
      updatedAt: "2026-03-31T10:30:00.000Z",
      workspaceRoot: "/tmp/active",
    },
  ]);
});
