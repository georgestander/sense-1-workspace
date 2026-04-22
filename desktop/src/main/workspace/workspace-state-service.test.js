import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { loadThreadInteractionStates } from "../profile/profile-state.js";
import { DesktopWorkspaceStateService } from "./workspace-state-service.ts";

function createEnv() {
  return {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: path.join(os.tmpdir(), `sense1-workspace-state-${Date.now()}-${Math.random().toString(16).slice(2)}`),
  };
}

test("rememberThreadInteractionState skips duplicate writes for the same thread state", async () => {
  const env = createEnv();
  const service = new DesktopWorkspaceStateService({
    env,
    resolveProfile: async () => ({ id: "default" }),
  });

  await service.rememberThreadInteractionState("thread-1", "running");
  const firstState = await loadThreadInteractionStates("default", env);
  const firstUpdatedAt = firstState[0]?.updatedAt ?? null;

  await new Promise((resolve) => setTimeout(resolve, 20));
  await service.rememberThreadInteractionState("thread-1", "running");
  const secondState = await loadThreadInteractionStates("default", env);
  const secondUpdatedAt = secondState[0]?.updatedAt ?? null;

  assert.equal(secondState[0]?.interactionState, "running");
  assert.equal(secondUpdatedAt, firstUpdatedAt);

  await fs.rm(env.SENSE1_RUNTIME_STATE_ROOT, { recursive: true, force: true });
});

test("rememberThreadInteractionState serializes quick successive state changes", async () => {
  const env = createEnv();
  const service = new DesktopWorkspaceStateService({
    env,
    resolveProfile: async () => ({ id: "default" }),
  });

  await Promise.all([
    service.rememberThreadInteractionState("thread-2", "running"),
    service.rememberThreadInteractionState("thread-2", "review"),
  ]);

  const states = await loadThreadInteractionStates("default", env);
  assert.deepEqual(states, [
    {
      threadId: "thread-2",
      interactionState: "review",
      updatedAt: states[0]?.updatedAt ?? null,
    },
  ]);

  await fs.rm(env.SENSE1_RUNTIME_STATE_ROOT, { recursive: true, force: true });
});
