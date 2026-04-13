import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import {
  loadActiveProfileId,
  loadDesktopSettings,
  loadLastSelectedThreadId,
  loadPendingApprovals,
  loadThreadInteractionStates,
  persistActiveProfileId,
  persistDesktopSettings,
  persistLastSelectedThreadId,
  persistPendingApprovals,
  rememberThreadInteractionState,
  resolveProfileRoot,
  sanitizeProfileId,
} from "./profile-state.js";

function createEnv() {
  return {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: path.join(os.tmpdir(), `sense1-profile-state-${Date.now()}-${Math.random().toString(16).slice(2)}`),
  };
}

test("active profile state persists under the sanitized profile root", async () => {
  const env = createEnv();

  await persistActiveProfileId("../ops team", env);

  assert.equal(await loadActiveProfileId(env), "ops-team");
  assert.match(resolveProfileRoot("../ops team", env), /ops-team$/);

  await fs.rm(env.SENSE1_RUNTIME_STATE_ROOT, { recursive: true, force: true });
});

test("settings, selected thread, interaction state, and approvals survive the profile barrel split", async () => {
  const env = createEnv();
  const profileId = "ops-team";

  await persistDesktopSettings(profileId, { model: "gpt-5.4", reasoningEffort: "high" }, env);
  await persistLastSelectedThreadId(profileId, "thread-7", env);
  await rememberThreadInteractionState(profileId, "thread-7", "review", env);
  await persistPendingApprovals(profileId, [{ id: "approval-1", threadId: "thread-7" }], env);

  assert.deepEqual(await loadDesktopSettings(profileId, env), {
    model: "gpt-5.4",
    reasoningEffort: "high",
    updated_at: await loadDesktopSettings(profileId, env).then((settings) => settings.updated_at),
  });
  assert.equal(await loadLastSelectedThreadId(profileId, env), "thread-7");
  assert.deepEqual(await loadThreadInteractionStates(profileId, env), [
    {
      threadId: "thread-7",
      interactionState: "review",
      updatedAt: await loadThreadInteractionStates(profileId, env).then((states) => states[0]?.updatedAt ?? null),
    },
  ]);
  assert.deepEqual(await loadPendingApprovals(profileId, env), [{ id: "approval-1", threadId: "thread-7" }]);

  await fs.rm(env.SENSE1_RUNTIME_STATE_ROOT, { recursive: true, force: true });
});

test("sanitizeProfileId still produces the default fallback for empty input", () => {
  assert.equal(sanitizeProfileId(""), "default");
});
