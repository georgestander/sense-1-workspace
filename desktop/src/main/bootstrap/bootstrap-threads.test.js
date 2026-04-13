import test from "node:test";
import assert from "node:assert/strict";

import { mergeSubstrateSessionsIntoRecentThreads } from "./bootstrap-threads.js";

test("mergeSubstrateSessionsIntoRecentThreads restores unseen substrate sessions with workspace roots", () => {
  const merged = mergeSubstrateSessionsIntoRecentThreads(
    [
      {
        id: "thread-existing",
        title: "Existing",
        subtitle: "Sense-1 thread",
        state: "idle",
        interactionState: "conversation",
        updatedAt: "2026-04-09T09:00:00.000Z",
        workspaceRoot: null,
      },
    ],
    {
      sessions: [
        {
          codex_thread_id: "thread-substrate",
          ended_at: "2026-04-09T10:00:00.000Z",
          started_at: "2026-04-09T09:30:00.000Z",
          status: "active",
          title: "Recovered session",
          workspace_id: "workspace-1",
        },
      ],
      workspaces: [
        {
          id: "workspace-1",
          root_path: "/tmp/recovered-workspace",
        },
      ],
      lastSelectedThreadId: "thread-substrate",
    },
  );

  assert.equal(merged[0]?.id, "thread-substrate");
  assert.equal(merged[0]?.workspaceRoot, "/tmp/recovered-workspace");
  assert.equal(merged[0]?.subtitle, "recovered-workspace");
});
