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

function createDeferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
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

test("loadThreadInteractionStates preserves pending desired writes during reload", async () => {
  const writeGate = createDeferred();
  const persistedStates = new Map([
    [
      "thread-3",
      {
        interactionState: "running",
        updatedAt: "2026-04-08T10:00:00.000Z",
      },
    ],
  ]);
  const service = new DesktopWorkspaceStateService({
    env: createEnv(),
    resolveProfile: async () => ({ id: "default" }),
    loadThreadInteractionStates: async () =>
      [...persistedStates.entries()].map(([threadId, entry]) => ({
        threadId,
        interactionState: entry.interactionState,
        updatedAt: entry.updatedAt,
      })),
    rememberThreadInteractionState: async (_profileId, threadId, interactionState) => {
      await writeGate.promise;
      persistedStates.set(threadId, {
        interactionState,
        updatedAt: "2026-04-08T12:00:00.000Z",
      });
    },
  });

  const pendingRemember = service.rememberThreadInteractionState("thread-3", "review");
  await Promise.resolve();

  assert.deepEqual(await service.loadThreadInteractionStates(), { "thread-3": "running" });

  writeGate.resolve();
  await pendingRemember;

  assert.deepEqual(await service.loadThreadInteractionStates(), { "thread-3": "review" });
});
