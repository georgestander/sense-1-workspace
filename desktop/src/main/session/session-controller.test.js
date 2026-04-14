import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

import { DesktopSessionController } from "../session-controller.ts";
import { readSessionRecord, writeSessionRecord } from "./session-record.ts";
import {
  DEFAULT_PROFILE_ID,
  ensureProfileDirectories,
  forgetThreadInteractionState,
  loadDesktopSettings,
  loadLastSelectedThreadId,
  loadProfileArtifactRoot,
  resolveProfileCodexHome,
  resolveProfileArtifactRoot,
  loadPendingApprovals,
  loadRecentWorkspaceFolders,
  loadThreadInteractionStates,
  loadThreadWorkspaceRoot,
  loadWorkspaceSidebarOrder,
  persistDesktopSettings,
  persistPendingApprovals,
  rememberThreadInteractionState,
  resolveProfileSubstrateDbPath,
  resolveProfileRoot,
  sanitizeProfileId,
} from "../profile/profile-state.js";
import {
  createSubstratePlan,
  createSubstrateSessionShell,
  ensureProfileSubstrate,
  finalizeSubstrateSessionStart,
  getSubstrateSessionByThreadId,
  loadWorkspacePolicy,
  resolveDefaultScopeId,
  resolvePrimaryActorId,
  upsertWorkspacePolicy,
  upsertSubstrateActor,
} from "../substrate/substrate.js";
import {
  addTenantMember,
  createTenant,
} from "../tenant/tenant-state.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestEnv(runtimeRoot) {
  return {
    ...process.env,
    SENSE1_ARTIFACT_ROOT: path.join(runtimeRoot, "visible-artifacts"),
    SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
  };
}

async function makeTempRoot() {
  const root = path.join(os.tmpdir(), `sc-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await fs.mkdir(root, { recursive: true });
  return root;
}

async function flushSubstrateWrites() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const CANONICAL_PROFILE_ID = DEFAULT_PROFILE_ID;

function normalizeManagerMethods(calls) {
  const methods = calls
    .map((entry) => (typeof entry === "string" ? entry : entry?.method))
    .filter((method) => typeof method === "string");
  const normalized = [];
  let sawAccountRead = false;

  for (const method of methods) {
    if (method === "account/read") {
      if (sawAccountRead) {
        continue;
      }
      sawAccountRead = true;
    }
    normalized.push(method);
  }

  return normalized;
}

function assertManagerMethods(calls, expectedMethods) {
  assert.deepEqual(normalizeManagerMethods(calls), expectedMethods);
}

function assertNoNonAuthManagerCalls(calls) {
  assert.deepEqual(
    normalizeManagerMethods(calls).filter((method) => method !== "account/read"),
    [],
  );
}

async function waitFor(assertion, { timeoutMs = 500, intervalMs = 20 } = {}) {
  const startedAt = Date.now();
  while (true) {
    try {
      return await assertion();
    } catch (error) {
      if (Date.now() - startedAt >= timeoutMs) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}

async function grantWorkspaceReadPermission(env, workspaceRoot, mode = "always") {
  const dbPath = resolveProfileSubstrateDbPath(CANONICAL_PROFILE_ID, env);
  await ensureProfileDirectories(CANONICAL_PROFILE_ID, env);
  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId: CANONICAL_PROFILE_ID,
  });
  await upsertWorkspacePolicy({
    dbPath,
    readGrantMode: mode,
    readGranted: true,
    readGrantedAt: "2026-03-27T09:00:00.000Z",
    workspaceRoot,
  });
  return dbPath;
}

async function createProductActor({
  actorId,
  dbPath,
  displayName,
  env,
  kind = "agent",
  metadata,
  profileId = CANONICAL_PROFILE_ID,
}) {
  await ensureProfileDirectories(profileId, env);
  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });

  return await upsertSubstrateActor({
    actorId,
    dbPath,
    displayName,
    kind,
    metadata,
    profileId,
    scopeId: resolveDefaultScopeId(profileId),
  });
}

function makeApproval(id, threadId = "thread-1", overrides = {}) {
  return {
    id,
    kind: "command",
    threadId,
    reason: `approval-${id}`,
    command: ["echo", "hello"],
    cwd: "/tmp/project",
    grantRoot: "/tmp/project",
    permissions: null,
    runContext: {
      actor: {
        id: "actor_test",
        kind: "user",
        displayName: "Test User",
        email: "test@example.com",
        homeScopeId: "scope_test_private",
        trustLevel: "medium",
      },
      scope: {
        id: "scope_test_private",
        kind: "private",
        displayName: "test private",
        profileId: "test-profile",
      },
      grants: [],
      policy: {
        executionPolicyMode: "defaultProfilePrivateScope",
        approvalPolicy: "onRequest",
        sandboxPolicy: "workspaceWrite",
        trustLevel: "medium",
      },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Approval persistence: round-trip
// ---------------------------------------------------------------------------

test("persistPendingApprovals then loadPendingApprovals returns the same approvals", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  await ensureProfileDirectories("test-profile", env);

  const approvals = [makeApproval(1), makeApproval(2, "thread-2")];
  await persistPendingApprovals("test-profile", approvals, env);

  const loaded = await loadPendingApprovals("test-profile", env);
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0].id, 1);
  assert.equal(loaded[0].threadId, "thread-1");
  assert.equal(loaded[1].id, 2);
  assert.equal(loaded[1].threadId, "thread-2");
});

test("loadPendingApprovals returns empty array when no file exists", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  await ensureProfileDirectories("test-profile", env);

  const loaded = await loadPendingApprovals("test-profile", env);
  assert.deepEqual(loaded, []);
});

test("loadPendingApprovals returns empty array for corrupt JSON", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  await ensureProfileDirectories("test-profile", env);

  const profileRoot = resolveProfileRoot(sanitizeProfileId("test-profile"), env);
  await fs.writeFile(path.join(profileRoot, "pending-approvals.json"), "{{broken", "utf8");

  const loaded = await loadPendingApprovals("test-profile", env);
  assert.deepEqual(loaded, []);
});

test("loadPendingApprovals returns empty array when approvals field is missing", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  await ensureProfileDirectories("test-profile", env);

  const profileRoot = resolveProfileRoot(sanitizeProfileId("test-profile"), env);
  await fs.writeFile(
    path.join(profileRoot, "pending-approvals.json"),
    JSON.stringify({ notApprovals: true }),
    "utf8",
  );

  const loaded = await loadPendingApprovals("test-profile", env);
  assert.deepEqual(loaded, []);
});

test("persistPendingApprovals overwrites previous state completely", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  await ensureProfileDirectories("test-profile", env);

  await persistPendingApprovals("test-profile", [makeApproval(10), makeApproval(11)], env);
  await persistPendingApprovals("test-profile", [makeApproval(20)], env);

  const loaded = await loadPendingApprovals("test-profile", env);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, 20);
});

test("persisting empty array clears all approvals", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  await ensureProfileDirectories("test-profile", env);

  await persistPendingApprovals("test-profile", [makeApproval(1)], env);
  await persistPendingApprovals("test-profile", [], env);

  const loaded = await loadPendingApprovals("test-profile", env);
  assert.deepEqual(loaded, []);
});

// ---------------------------------------------------------------------------
// Approval persistence: profile isolation
// ---------------------------------------------------------------------------

test("approvals for different profiles are isolated", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  await ensureProfileDirectories("profile-a", env);
  await ensureProfileDirectories("profile-b", env);

  await persistPendingApprovals("profile-a", [makeApproval(1)], env);
  await persistPendingApprovals("profile-b", [makeApproval(2), makeApproval(3)], env);

  const loadedA = await loadPendingApprovals("profile-a", env);
  const loadedB = await loadPendingApprovals("profile-b", env);
  assert.equal(loadedA.length, 1);
  assert.equal(loadedA[0].id, 1);
  assert.equal(loadedB.length, 2);
  assert.equal(loadedB[0].id, 2);
});

// ---------------------------------------------------------------------------
// Approval persistence: data shape integrity
// ---------------------------------------------------------------------------

test("persisted approvals preserve runContext through round-trip", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  await ensureProfileDirectories("test-profile", env);

  const approval = makeApproval(42);
  await persistPendingApprovals("test-profile", [approval], env);

  const loaded = await loadPendingApprovals("test-profile", env);
  assert.deepEqual(loaded[0].runContext, approval.runContext);
  assert.equal(loaded[0].kind, "command");
  assert.deepEqual(loaded[0].command, ["echo", "hello"]);
  assert.equal(loaded[0].cwd, "/tmp/project");
  assert.equal(loaded[0].grantRoot, "/tmp/project");
  assert.equal(loaded[0].reason, "approval-42");
});

test("thread interaction states persist per thread and can be forgotten", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  await ensureProfileDirectories("test-profile", env);

  await rememberThreadInteractionState("test-profile", "thread-1", "plan_review", env);
  await rememberThreadInteractionState("test-profile", "thread-2", "executing", env);
  await rememberThreadInteractionState("test-profile", "thread-1", "review", env);

  let loaded = await loadThreadInteractionStates("test-profile", env);
  assert.deepEqual(loaded.map((entry) => [entry.threadId, entry.interactionState]), [
    ["thread-1", "review"],
    ["thread-2", "executing"],
  ]);

  loaded = await forgetThreadInteractionState("test-profile", "thread-1", env);
  assert.deepEqual(loaded.map((entry) => [entry.threadId, entry.interactionState]), [
    ["thread-2", "executing"],
  ]);
});

// ---------------------------------------------------------------------------
// Approval persistence: simulate session controller filtering
// ---------------------------------------------------------------------------

test("approval entries without numeric id or string threadId would be filtered by controller restore logic", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  await ensureProfileDirectories("test-profile", env);

  // Simulate what the controller does: persist raw, then filter on restore
  const mixed = [
    makeApproval(1),                            // valid
    { id: "not-a-number", threadId: "t" },      // invalid id type
    { id: 2 },                                  // missing threadId
    { threadId: "t" },                           // missing id
    makeApproval(3, "thread-3"),                 // valid
  ];
  await persistPendingApprovals("test-profile", mixed, env);

  const loaded = await loadPendingApprovals("test-profile", env);
  // Raw load returns all 5 — the session controller applies its own filter
  assert.equal(loaded.length, 5);

  // Apply the same filter the controller uses
  const filtered = loaded.filter(
    (a) => typeof a?.id === "number" && typeof a?.threadId === "string",
  );
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0].id, 1);
  assert.equal(filtered[1].id, 3);
});

// ---------------------------------------------------------------------------
// Interrupt flow validation
// ---------------------------------------------------------------------------

test("interruptTurn sends turn/interrupt with trimmed thread and turn ids to the manager", async () => {
  const calls = [];
  const manager = {
    request: async (method, params) => {
      calls.push({ method, params });
      return {};
    },
  };
  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env: createTestEnv(await makeTempRoot()),
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  await controller.interruptTurn({ threadId: "  thread-active  ", turnId: "  turn-active  " });
  assert.deepEqual(calls, [
    { method: "turn/interrupt", params: { threadId: "thread-active", turnId: "turn-active", expectedTurnId: "turn-active" } },
  ]);
});

test("interruptTurn resolves the active turn when the renderer has lost the cached turn id", async () => {
  const calls = [];
  const manager = {
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/read") {
        return {
          thread: {
            id: "thread-active",
            turns: [
              {
                id: "turn-complete-1",
                status: "completed",
              },
              {
                id: "turn-active-1",
                status: "in_progress",
              },
            ],
          },
        };
      }

      return {};
    },
  };
  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env: createTestEnv(await makeTempRoot()),
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  await controller.interruptTurn({ threadId: "  thread-active  " });

  assert.deepEqual(calls, [
    {
      method: "thread/read",
      params: {
        includeTurns: true,
        threadId: "thread-active",
      },
    },
    {
      method: "turn/interrupt",
      params: {
        expectedTurnId: "turn-active-1",
        threadId: "thread-active",
        turnId: "turn-active-1",
      },
    },
  ]);
});

test("interruptTurn rejects on empty threadId or when no active turn can be found", async () => {
  const manager = {
    request: async (method) => {
      if (method === "thread/read") {
        return {
          thread: {
            id: "thread-1",
            turns: [
              {
                id: "turn-complete-1",
                status: "completed",
              },
            ],
          },
        };
      }

      return {};
    },
  };
  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env: createTestEnv(await makeTempRoot()),
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  await assert.rejects(() => controller.interruptTurn({ threadId: "", turnId: "turn-1" }), /No thread to interrupt/);
  await assert.rejects(() => controller.interruptTurn({ threadId: "   ", turnId: "turn-1" }), /No thread to interrupt/);
  await assert.rejects(() => controller.interruptTurn({ threadId: "thread-1", turnId: "" }), /No active run to interrupt/);
  await assert.rejects(() => controller.interruptTurn({ threadId: "thread-1", turnId: "   " }), /No active run to interrupt/);
});

test("interruptTurn propagates manager errors", async () => {
  const manager = {
    request: async (method) => {
      if (method === "turn/interrupt") {
        throw new Error("Engine refused interrupt: no active turn");
      }

      return {};
    },
  };
  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env: createTestEnv(await makeTempRoot()),
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  await assert.rejects(
    () => controller.interruptTurn({ threadId: "thread-1", turnId: "turn-1" }),
    /Engine refused interrupt/,
  );
});

test("steerTurn resolves the active turn and forwards turn/steer through the manager", async () => {
  const requestCalls = [];
  const steerCalls = [];
  const manager = {
    async request(method, params) {
      requestCalls.push({ method, params });
      if (method === "thread/read") {
        return {
          thread: {
            id: "thread-steer-1",
            turns: [
              {
                id: "turn-complete-1",
                status: "completed",
              },
              {
                id: "turn-active-1",
                status: "in_progress",
              },
            ],
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    async steerTurn(threadId, input, options) {
      steerCalls.push({ threadId, input, options });
      return { ok: true };
    },
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env: createTestEnv(await makeTempRoot()),
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  await controller.steerTurn("  thread-steer-1  ", "  Tighten the acceptance criteria.  ");

  assert.deepEqual(requestCalls, [
    {
      method: "thread/read",
      params: {
        includeTurns: true,
        threadId: "thread-steer-1",
      },
    },
  ]);
  assert.deepEqual(steerCalls, [
    {
      threadId: "thread-steer-1",
      input: [
        {
          type: "text",
          text: "Tighten the acceptance criteria.",
        },
      ],
      options: {
        expectedTurnId: "turn-active-1",
      },
    },
  ]);
});

test("ingestRuntimeMessage does not auto-start native review for a completed workspace execution", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  await rememberThreadInteractionState("default", "thread-review-1", "executing", env);

  const requestCalls = [];
  const requestReviewCalls = [];
  const manager = {
    async request(method, params) {
      requestCalls.push({ method, params });
      if (method === "thread/read") {
        return {
          thread: {
            id: "thread-review-1",
            name: "Review thread",
            preview: "Review thread",
            turns: [
              {
                id: "turn-review-1",
                status: "completed",
                items: [
                  {
                    aggregatedOutput: "ok",
                    command: ["pnpm", "test"],
                    cwd: path.join(root, "workspace-review"),
                    exitCode: 0,
                    id: "cmd-review-1",
                    status: "completed",
                    type: "commandExecution",
                  },
                ],
              },
            ],
            status: {
              type: "idle",
            },
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    async requestReview(threadId, options) {
      requestReviewCalls.push({ threadId, options });
      return { ok: true };
    },
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  controller.ingestRuntimeMessage({
    method: "turn/completed",
    params: {
      threadId: "thread-review-1",
      turn: {
        id: "turn-review-1",
        status: "completed",
      },
    },
  });
  for (let index = 0; index < 20; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assertNoNonAuthManagerCalls(requestCalls);
  assert.deepEqual(requestReviewCalls, []);
});

test("ingestRuntimeMessage skips native review when the thread is already in review", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const requestReviewCalls = [];
  await rememberThreadInteractionState("default", "thread-review-2", "review", env);

  const manager = {
    async request() {
      throw new Error("thread/read should not run when review is already active");
    },
    async requestReview(threadId, options) {
      requestReviewCalls.push({ threadId, options });
      return { ok: true };
    },
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  controller.ingestRuntimeMessage({
    method: "turn/completed",
    params: {
      threadId: "thread-review-2",
      turn: {
        id: "turn-review-2",
        status: "completed",
      },
    },
  });
  for (let index = 0; index < 20 && requestReviewCalls.length === 0; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.deepEqual(requestReviewCalls, []);
});

// ---------------------------------------------------------------------------
// Interrupt + approval coexistence
// ---------------------------------------------------------------------------

test("approvals persist correctly even when interrupt occurs between ingest and resolve", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  await ensureProfileDirectories("test-profile", env);

  // Simulate: approval arrives, interrupt fires, then approval resolves
  const approvals = [makeApproval(90), makeApproval(91)];
  await persistPendingApprovals("test-profile", approvals, env);

  // After interrupt, approvals should still be on disk
  const afterInterrupt = await loadPendingApprovals("test-profile", env);
  assert.equal(afterInterrupt.length, 2);

  // Resolve one approval (simulate controller removing it from the list)
  await persistPendingApprovals("test-profile", [makeApproval(91)], env);

  const afterResolve = await loadPendingApprovals("test-profile", env);
  assert.equal(afterResolve.length, 1);
  assert.equal(afterResolve[0].id, 91);
});

// ---------------------------------------------------------------------------
// Desktop settings governance
// ---------------------------------------------------------------------------

test("updateDesktopSettings persists safe changes and records a settings audit trail", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const manager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "model/list") {
        return {
          data: [
            {
              id: "gpt-5.4-mini",
              name: "GPT-5.4 Mini",
              supportedReasoningEfforts: ["medium", "high", "xhigh"],
            },
            {
              id: "gpt-5.4",
              name: "GPT-5.4",
              supportedReasoningEfforts: ["low", "medium", "high", "xhigh"],
            },
          ],
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-25T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-25T10:00:00.000Z",
    },
  });

  const result = await controller.updateDesktopSettings({
    model: "gpt-5.4",
    personality: "concise",
    runtimeInstructions: "Custom desktop runtime policy text.",
  });

  assert.equal(result.settings.model, "gpt-5.4");
  assert.equal(result.settings.personality, "pragmatic");
  assert.equal(result.settings.runtimeInstructions, "Custom desktop runtime policy text.");

  const persisted = await loadDesktopSettings(CANONICAL_PROFILE_ID, env);
  assert.equal(persisted.version, 2);
  assert.equal(persisted.policy.profile.workspaceDefaults.model, "gpt-5.4");
  assert.equal(persisted.policy.profile.workspaceDefaults.personality, "pragmatic");
  assert.equal(persisted.policy.profile.generalDefaults.runtimeInstructions, "Custom desktop runtime policy text.");

  const bootstrap = await controller.getBootstrap();
  assert.equal(bootstrap.auditEvents[0]?.eventType, "settings.updated");
  assert.deepEqual(bootstrap.auditEvents[0]?.details.changedKeys, ["model", "personality", "runtimeInstructions"]);

  const db = new DatabaseSync(resolveProfileSubstrateDbPath(CANONICAL_PROFILE_ID, env));
  try {
    const eventRow = db.prepare(
      "SELECT verb, subject_type, subject_id, before_state, after_state, detail FROM events WHERE verb = 'settings.updated' ORDER BY rowid DESC LIMIT 1",
    ).get();
    assert.equal(eventRow.verb, "settings.updated");
    assert.equal(eventRow.subject_type, "settings");
    assert.equal(eventRow.subject_id, "desktop.defaults");
    assert.equal(JSON.parse(eventRow.before_state).model, "gpt-5.4-mini");
    assert.equal(JSON.parse(eventRow.after_state).model, "gpt-5.4");
    assert.equal(JSON.parse(eventRow.after_state).runtimeInstructions, "Custom desktop runtime policy text.");
    assert.deepEqual(JSON.parse(eventRow.detail).changedKeys, ["model", "personality", "runtimeInstructions"]);
  } finally {
    db.close();
  }
});

test("updateDesktopSettings records team authority when the signed-in user has an active tenant membership", async () => {
  const root = await makeTempRoot();
  const tenantRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-tenant-cloud-"));
  const env = {
    ...createTestEnv(root),
    SENSE1_TENANT_STATE_ROOT: tenantRoot,
  };
  await createTenant({
    tenantId: "cro-ops",
    displayName: "CRO Ops",
    env,
    now: "2026-04-08T09:00:00.000Z",
  });
  await addTenantMember({
    tenantId: "cro-ops",
    email: "george@example.com",
    role: "admin",
    displayName: "George",
    env,
    now: "2026-04-08T09:01:00.000Z",
  });

  const manager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "model/list") {
        return {
          data: [
            {
              id: "gpt-5.4-mini",
              name: "GPT-5.4 Mini",
              supportedReasoningEfforts: ["medium", "high", "xhigh"],
            },
          ],
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-04-08T09:02:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.4.1",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-04-08T09:02:00.000Z",
    },
  });

  await controller.updateDesktopSettings({
    runtimeInstructions: "Team-governed runtime instructions.",
  });

  const bootstrap = await controller.getBootstrap();
  assert.equal(bootstrap.auditEvents[0]?.scope.kind, "team");
  assert.equal(bootstrap.auditEvents[0]?.scope.id, "scope_cro-ops_team");
  assert.equal(bootstrap.auditEvents[0]?.scope.tenantId, "cro-ops");
});

test("updateDesktopSettings rejects team-member admin changes when tenant membership lacks settings authority", async () => {
  const root = await makeTempRoot();
  const tenantRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-tenant-cloud-"));
  const env = {
    ...createTestEnv(root),
    SENSE1_TENANT_STATE_ROOT: tenantRoot,
  };
  await createTenant({
    tenantId: "cro-ops",
    displayName: "CRO Ops",
    env,
    now: "2026-04-08T09:00:00.000Z",
  });
  await addTenantMember({
    tenantId: "cro-ops",
    email: "george@example.com",
    role: "member",
    displayName: "George",
    env,
    now: "2026-04-08T09:01:00.000Z",
  });

  const manager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "model/list") {
        return {
          data: [
            {
              id: "gpt-5.4-mini",
              name: "GPT-5.4 Mini",
              supportedReasoningEfforts: ["medium", "high", "xhigh"],
            },
          ],
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-04-08T09:02:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.4.1",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-04-08T09:02:00.000Z",
    },
  });

  await assert.rejects(
    controller.updateDesktopSettings({
      runtimeInstructions: "Team members should not rewrite org defaults.",
    }),
    /settings\.manage/i,
  );
});

test("updateDesktopSettings rejects weakened approval posture and leaves settings unchanged", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const manager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-25T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-25T10:00:00.000Z",
    },
  });

  await assert.rejects(
    () => controller.updateDesktopSettings({
      approvalPosture: "never",
    }),
    /cannot weaken approval posture/i,
  );

  const persisted = await loadDesktopSettings("default", env);
  assert.equal(persisted.approvalPosture, undefined);

  const bootstrap = await controller.getBootstrap();
  assert.equal(bootstrap.auditEvents.some((event) => event.eventType === "settings.updated"), false);
});

test("updateDesktopSettings surfaces approval posture failure before unrelated model validation", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  await persistDesktopSettings(
    "default",
    {
      model: "gpt-missing",
    },
    env,
  );
  const manager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "model/list") {
        return {
          data: [
            {
              id: "gpt-5.4-mini",
              supportedReasoningEfforts: ["medium", "high", "xhigh"],
            },
          ],
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-25T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-25T10:00:00.000Z",
    },
  });

  await assert.rejects(
    () => controller.updateDesktopSettings({
      approvalPosture: "never",
    }),
    /cannot weaken approval posture/i,
  );
});

test("getDesktopSettings resolves legacy flat settings into the current policy-backed defaults", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  await persistDesktopSettings(
    "default",
    {
      model: "gpt-5.4",
      reasoningEffort: "high",
      personality: "formal",
      approvalPosture: "onRequest",
      sandboxPosture: "readOnly",
    },
    env,
  );

  const controller = new DesktopSessionController(
    {
      request: async () => {
        throw new Error("Unexpected manager request.");
      },
    },
    {
      appStartedAt: "2026-03-25T10:00:00.000Z",
      env,
      openExternal: async () => {},
      runtimeInfo: {
        appVersion: "0.1.0",
        electronVersion: "35.2.1",
        platform: "darwin",
        startedAt: "2026-03-25T10:00:00.000Z",
      },
    },
  );

  const result = await controller.getDesktopSettings();
  assert.equal(result.settings.model, "gpt-5.4");
  assert.equal(result.settings.reasoningEffort, "high");
  assert.equal(result.settings.personality, "pragmatic");
  assert.equal(result.settings.runtimeInstructions, DesktopSessionController.DEFAULT_SETTINGS.runtimeInstructions);
  assert.equal(result.settings.sandboxPosture, "readOnly");
});

test("getDesktopPolicyRules returns grouped policy copy from the resolved desktop settings", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const controller = new DesktopSessionController(
    {
      request: async (method) => {
        if (method === "account/read") {
          return {
            account: {
              email: "george@example.com",
            },
          };
        }

        throw new Error(`Unexpected manager request: ${method}`);
      },
    },
    {
      appStartedAt: "2026-03-25T10:00:00.000Z",
      env,
      openExternal: async () => {},
      runtimeInfo: {
        appVersion: "0.1.0",
        electronVersion: "35.2.1",
        platform: "darwin",
        startedAt: "2026-03-25T10:00:00.000Z",
      },
    },
  );

  await controller.updateDesktopSettings({
    runtimeInstructions: "Use the operator tone from the desktop playbook.",
    personality: "formal",
    sandboxPosture: "readOnly",
    defaultOperatingMode: "preview",
  });

  const result = await controller.getDesktopPolicyRules();
  const identity = result.groups.find((group) => group.id === "identity");
  const approvals = result.groups.find((group) => group.id === "permissions-approvals");
  const workspace = result.groups.find((group) => group.id === "workspace-boundaries");

  assert.equal(identity?.rules[0]?.currentValue, "Custom");
  assert.equal(identity?.rules[1]?.currentValue, "Pragmatic");
  assert.match(approvals?.rules[1]?.description ?? "", /read-only posture/i);
  assert.equal(workspace?.rules.at(-1)?.currentValue, "Auto");
  assert.equal(result.groups.some((group) => group.id === "planning"), false);
  assert.equal(result.groups.some((group) => group.id === "clarification"), false);
});

test("runDesktopTask uses a model persisted in desktop settings after controller restart", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const settingsManager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "model/list") {
        return {
          data: [
            {
              id: "gpt-5.4-mini",
              supportedReasoningEfforts: ["medium", "high", "xhigh"],
            },
            {
              id: "gpt-5.4",
              supportedReasoningEfforts: ["low", "medium", "high"],
            },
          ],
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const settingsController = new DesktopSessionController(settingsManager, {
    appStartedAt: "2026-03-25T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-25T10:00:00.000Z",
    },
  });

  await settingsController.updateDesktopSettings({
    model: "gpt-5.4",
    reasoningEffort: "high",
  });

  const managerCalls = [];
  const restartedManager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "model/list") {
        return {
          data: [
            {
              id: "gpt-5.4-mini",
              supportedReasoningEfforts: ["medium", "high", "xhigh"],
            },
            {
              id: "gpt-5.4",
              supportedReasoningEfforts: ["low", "medium", "high"],
            },
          ],
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-persisted-model-1",
            name: "Persisted model thread",
            preview: "Persisted model thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-persisted-model-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    start: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const restartedController = new DesktopSessionController(restartedManager, {
    appStartedAt: "2026-03-25T10:05:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-25T10:05:00.000Z",
    },
  });

  await restartedController.runDesktopTask({
    prompt: "Use the saved model after restart",
  });

  const threadStart = managerCalls.find((entry) => entry.method === "thread/start");
  const turnStart = managerCalls.find((entry) => entry.method === "turn/start");
  assert.equal(threadStart?.params.model, "gpt-5.4");
  assert.equal(turnStart?.params.model, "gpt-5.4");
});

test("listModels applies persisted model restrictions", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  await persistDesktopSettings(
    "default",
    {
      version: 2,
      policy: {
        system: null,
        organization: null,
        profile: {
          modelRestrictions: {
            allowedModels: ["gpt-5.4-mini"],
          },
        },
        workspaces: {},
      },
    },
    env,
  );

  const controller = new DesktopSessionController(
    {
      request: async (method) => {
        if (method === "model/list") {
          return {
            data: [
              { id: "gpt-5.4", name: "GPT-5.4", supportedReasoningEfforts: ["low", "high"] },
              { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", supportedReasoningEfforts: ["medium"] },
            ],
          };
        }

        throw new Error(`Unexpected method: ${method}`);
      },
    },
    {
      appStartedAt: "2026-03-25T10:00:00.000Z",
      env,
      openExternal: async () => {},
      runtimeInfo: {
        appVersion: "0.1.0",
        electronVersion: "35.2.1",
        platform: "darwin",
        startedAt: "2026-03-25T10:00:00.000Z",
      },
    },
  );

  const result = await controller.listModels();
  assert.deepEqual(result.models, [
    {
      id: "gpt-5.4-mini",
      name: "GPT-5.4 Mini",
      supportedReasoningEfforts: ["medium"],
    },
  ]);
});

test("listModels preserves runtime default metadata for the renderer", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const controller = new DesktopSessionController(
    {
      request: async (method) => {
        if (method === "model/list") {
          return {
            data: [
              {
                id: "gpt-5.4",
                isDefault: true,
                name: "GPT-5.4",
                defaultReasoningEffort: "high",
                supportedReasoningEfforts: ["medium", "high"],
              },
            ],
          };
        }

        throw new Error(`Unexpected method: ${method}`);
      },
    },
    {
      appStartedAt: "2026-03-25T10:00:00.000Z",
      env,
      openExternal: async () => {},
      runtimeInfo: {
        appVersion: "0.1.0",
        electronVersion: "35.2.1",
        platform: "darwin",
        startedAt: "2026-03-25T10:00:00.000Z",
      },
    },
  );

  const result = await controller.listModels();
  assert.deepEqual(result.models, [
    {
      id: "gpt-5.4",
      isDefault: true,
      name: "GPT-5.4",
      defaultReasoningEffort: "high",
      supportedReasoningEfforts: ["medium", "high"],
    },
  ]);
});

test("runDesktopTask applies persisted workspace policy defaults to the runtime request", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "model/list") {
        return {
          data: [
            {
              id: "gpt-5.4-mini",
              name: "GPT-5.4 Mini",
              supportedReasoningEfforts: ["medium", "high", "xhigh"],
            },
          ],
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-policy-1",
            name: "Policy thread",
            preview: "Policy thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-policy-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    handleProfileChange: async () => {},
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  await controller.updateDesktopSettings({
    model: "gpt-5.4-mini",
    reasoningEffort: "high",
    personality: "formal",
    runtimeInstructions: "Keep outputs crisp for this desktop runtime.",
    sandboxPosture: "readOnly",
  });

  const workspaceRoot = path.join(root, "workspace-policy");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  const result = await controller.runDesktopTask({
    prompt: "Apply the saved defaults",
    workspaceRoot,
  });

  assert.equal(result.threadId, "thread-policy-1");
  assert.equal(result.runContext?.policy.approvalPolicy, "onRequest");
  assert.equal(result.runContext?.policy.sandboxPolicy, "workspaceWrite");

  const threadStart = managerCalls.find((entry) => entry.method === "thread/start");
  const turnStart = managerCalls.find((entry) => entry.method === "turn/start");
  assert.equal(threadStart?.params.model, "gpt-5.4-mini");
  assert.equal(threadStart?.params.personality, "pragmatic");
  assert.match(threadStart?.params.developerInstructions ?? "", /^Keep outputs crisp for this desktop runtime\./);
  assert.match(threadStart?.params.config?.developer_instructions ?? "", /^Keep outputs crisp for this desktop runtime\./);
  assert.equal(threadStart?.params.sandbox, "workspace-write");
  assert.equal(turnStart?.params.model, "gpt-5.4-mini");
  assert.equal(turnStart?.params.personality, "pragmatic");
  assert.equal(turnStart?.params.reasoningEffort, "high");
  assert.deepEqual(turnStart?.params.sandboxPolicy, {
    type: "workspaceWrite",
    networkAccess: true,
    writableRoots: [await fs.realpath(workspaceRoot)],
  });
});

test("runDesktopTask adds durable workspace continuity instructions from prior session records", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-continuity-1",
            name: "Continuity thread",
            preview: "Continuity thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-continuity-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-continuity");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);

  const dbPath = resolveProfileSubstrateDbPath(CANONICAL_PROFILE_ID, env);
  const artifactRoot = await resolveProfileArtifactRoot(CANONICAL_PROFILE_ID, env);
  const scopeId = resolveDefaultScopeId(CANONICAL_PROFILE_ID);
  const actorId = resolvePrimaryActorId(CANONICAL_PROFILE_ID);
  const previousSession = await createSubstrateSessionShell({
    actorId,
    dbPath,
    model: "gpt-5.4-mini",
    now: "2026-04-11T09:00:00Z",
    profileId: CANONICAL_PROFILE_ID,
    scopeId,
    title: "Review workspace continuity",
    workspaceRoot,
  });
  await finalizeSubstrateSessionStart({
    actorId,
    codexThreadId: "thread-previous-continuity",
    dbPath,
    effort: "medium",
    model: "gpt-5.4-mini",
    now: "2026-04-11T09:10:00Z",
    profileId: CANONICAL_PROFILE_ID,
    scopeId,
    sessionId: previousSession.sessionId,
    threadTitle: "Review workspace continuity",
    workspaceRoot,
  });
  await writeSessionRecord({
    artifactRoot,
    intent: "Review workspace continuity",
    outcomes: ["Recovered context from substrate history"],
    pathsWritten: [path.join(workspaceRoot, "docs", "continuity.md")],
    sessionId: previousSession.sessionId,
    startedAt: "2026-04-11T09:00:00Z",
    workspaceRoot,
  });

  const result = await controller.runDesktopTask({
    prompt: "What were we working on in this workspace?",
    workspaceRoot,
  });

  assert.equal(result.threadId, "thread-continuity-1");
  const threadStart = managerCalls.find((entry) => entry.method === "thread/start");
  const developerInstructions =
    threadStart?.params.developerInstructions
    ?? threadStart?.params.config?.developer_instructions
    ?? "";
  assert.match(developerInstructions, /Workspace continuity is available from 1 recent durable session record for this folder\./);
  assert.match(developerInstructions, /Recovered context from substrate history/);
  assert.match(developerInstructions, /docs\/continuity\.md/);
});

test("runDesktopTask forwards selected attachment paths through the session controller", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-attachment-pass-through",
            name: "Attachment pass-through",
            preview: "Use these files",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-attachment-pass-through",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    start: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-attachments");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
  await fs.writeFile(path.join(workspaceRoot, "notes.txt"), "Remember the user notes.\n");
  await fs.writeFile(path.join(workspaceRoot, "src", "index.ts"), "export const ready = true;\n");
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    attachments: [
      path.join(workspaceRoot, "notes.txt"),
      path.join(workspaceRoot, "src", "index.ts"),
    ],
    prompt: "Use these files",
    workspaceRoot,
  });

  const turnStart = managerCalls.find((entry) => entry.method === "turn/start");
  assert.deepEqual(turnStart?.params.input, [
    {
      type: "mention",
      name: "notes.txt",
      path: path.join(workspaceRoot, "notes.txt"),
    },
    {
      type: "mention",
      name: "index.ts",
      path: path.join(workspaceRoot, "src", "index.ts"),
    },
    {
      type: "text",
      text: "Use these files",
    },
  ]);
  assert.equal("attachments" in (turnStart?.params ?? {}), false);
});

test("runDesktopAutomationNow respects local vs worktree targets and records runs as started", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const controller = new DesktopSessionController({
    request: async () => {
      throw new Error("Unexpected request");
    },
    respond: () => {},
  }, {
    appStartedAt: "2026-04-09T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-04-09T10:00:00.000Z",
    },
  });

  const localAutomation = await controller.saveDesktopAutomation({
    name: "Local automation",
    prompt: "Check the local repo state",
    status: "ACTIVE",
    rrule: "RRULE:FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0",
    model: "gpt-5.4-mini",
    reasoningEffort: "medium",
    executionEnvironment: "local",
    cwds: ["/tmp/local-project"],
  });
  const worktreeAutomation = await controller.saveDesktopAutomation({
    name: "Worktree automation",
    prompt: "Check the worktree repo state",
    status: "ACTIVE",
    rrule: "RRULE:FREQ=WEEKLY;BYDAY=TU;BYHOUR=9;BYMINUTE=0",
    model: "gpt-5.4-mini",
    reasoningEffort: "medium",
    executionEnvironment: "worktree",
    cwds: ["/tmp/worktree-project"],
  });

  const runRequests = [];
  controller.runDesktopTask = async (request) => {
    runRequests.push(request);
    return {
      status: "started",
      cwd: request.cwd ?? null,
      workspaceRoot: request.workspaceRoot ?? null,
      runContext: null,
      permissionRequest: null,
      thread: {
        id: `thread-${runRequests.length}`,
        title: "Automation thread",
        subtitle: null,
        updatedAt: "2026-04-09T10:00:00.000Z",
        state: "running",
        interactionState: "executing",
        workspaceRoot: request.workspaceRoot ?? null,
        cwd: request.cwd ?? null,
        runContext: null,
        threadInputState: null,
      },
      threadId: `thread-${runRequests.length}`,
      turnId: `turn-${runRequests.length}`,
    };
  };

  const localRun = await controller.runDesktopAutomationNow({ id: localAutomation.automation.id });
  const worktreeRun = await controller.runDesktopAutomationNow({ id: worktreeAutomation.automation.id });

  assert.equal(runRequests[0]?.cwd, "/tmp/local-project");
  assert.equal(runRequests[0]?.workspaceRoot, null);
  assert.equal(runRequests[1]?.cwd, "/tmp/worktree-project");
  assert.equal(runRequests[1]?.workspaceRoot, "/tmp/worktree-project");

  assert.equal(localRun.runs[0]?.status, "started");
  assert.equal(localRun.runs[0]?.finishedAt, null);
  assert.match(localRun.runs[0]?.note ?? "", /started from the automations page/i);

  assert.equal(worktreeRun.runs[0]?.status, "started");
  assert.equal(worktreeRun.runs[0]?.finishedAt, null);
});

test("runDesktopTask copies chat attachments from outside the session folder before turn/start", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "model/list") {
        return {
          data: [
            {
              id: "gpt-5.4-mini",
              name: "GPT-5.4 Mini",
              supportedReasoningEfforts: ["medium", "high", "xhigh"],
            },
          ],
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-chat-attachment-copy",
            name: "Chat attachment copy",
            preview: "Chat attachment copy",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-chat-attachment-copy",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const downloadsRoot = path.join(root, "downloads");
  await fs.mkdir(downloadsRoot, { recursive: true });
  const externalAttachmentPath = path.join(downloadsRoot, "brief.md");
  await fs.writeFile(externalAttachmentPath, "# Brief\n");

  const result = await controller.runDesktopTask({
    attachments: [externalAttachmentPath],
    prompt: "Use this brief",
  });

  const turnStart = managerCalls.find((entry) => entry.method === "turn/start");
  const copiedAttachmentPath = turnStart?.params.input?.[0]?.path;
  assert.equal(copiedAttachmentPath, path.join(result.cwd, "brief.md"));
  assert.notEqual(copiedAttachmentPath, externalAttachmentPath);
  assert.equal(await fs.readFile(copiedAttachmentPath, "utf8"), "# Brief\n");
});

test("runDesktopTask copies workspace attachments from outside the workspace into the session folder", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-workspace-attachment-copy",
            name: "Workspace attachment copy",
            preview: "Workspace attachment copy",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-workspace-attachment-copy",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-external-attachments");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);

  const externalAttachmentPath = path.join(root, "outside", "spec.txt");
  await fs.mkdir(path.dirname(externalAttachmentPath), { recursive: true });
  await fs.writeFile(externalAttachmentPath, "external spec\n");

  const result = await controller.runDesktopTask({
    attachments: [externalAttachmentPath],
    prompt: "Use this spec",
    workspaceRoot,
  });

  const artifactRoot = await loadProfileArtifactRoot("default", env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: result.threadId,
    dbPath: resolveProfileSubstrateDbPath("default", env),
  });
  assert.ok(session);

  const turnStart = managerCalls.find((entry) => entry.method === "turn/start");
  const copiedAttachmentPath = turnStart?.params.input?.[0]?.path;
  assert.equal(copiedAttachmentPath, path.join(artifactRoot, "sessions", session.id, "spec.txt"));
  assert.notEqual(copiedAttachmentPath, externalAttachmentPath);
  assert.equal(await fs.readFile(copiedAttachmentPath, "utf8"), "external spec\n");
});

test("runDesktopTask surfaces a clear error when an attachment copy fails", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  await assert.rejects(
    () => controller.runDesktopTask({
      attachments: [path.join(root, "missing", "ghost.docx")],
      prompt: "Use this file",
    }),
    /Could not attach file: ghost\.docx\. The file may not be accessible\./,
  );
  assertManagerMethods(managerCalls, ["account/read", "model/list"],);
});

// ---------------------------------------------------------------------------
// Phase 3 substrate integration
// ---------------------------------------------------------------------------

test("runDesktopTask creates a substrate session, workspace, and lifecycle events for a new folder-bound thread", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-new-1",
            name: "Initial thread title",
            preview: "Initial thread title",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-new-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-alpha");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  const result = await controller.runDesktopTask({
    prompt: "Wire the substrate path",
    workspaceRoot,
  });

  assert.equal(result.threadId, "thread-new-1");
  assert.equal(result.turnId, "turn-new-1");

  const profileDbPath = resolveProfileSubstrateDbPath("default", env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-new-1",
    dbPath: profileDbPath,
  });
  assert.ok(session);
  assert.equal(session.codex_thread_id, "thread-new-1");
  assert.equal(session.profile_id, "default");
  assert.equal(session.scope_id, "scope_default_private");
  assert.equal(session.actor_id, "actor_default_primary");
  assert.equal(session.workspace_id !== null, true);
  const sessionRecord = await readSessionRecord({
    artifactRoot: path.join(root, "visible-artifacts"),
    sessionId: session.id,
  });
  assert.deepEqual(sessionRecord, {
    schema_version: 1,
    id: session.id,
    started_at: session.started_at,
    ended_at: null,
    intent: "Wire the substrate path",
    workspace_root: workspaceRoot,
    paths_read: [],
    paths_written: [],
    outcomes: [],
    log_cursor: {
      from_ts: session.started_at,
      to_ts: null,
    },
  });

  const db = new DatabaseSync(profileDbPath);
  try {
    const workspaceRows = db.prepare(
      "SELECT root_path, session_count, last_active_at FROM workspaces ORDER BY registered_at ASC",
    ).all().map((row) => ({ ...row }));
    assert.equal(workspaceRows.length, 1);
    assert.equal(workspaceRows[0].root_path, workspaceRoot);
    assert.equal(workspaceRows[0].session_count, 1);
    assert.ok(workspaceRows[0].last_active_at);

    const sessionRows = db.prepare(
      "SELECT codex_thread_id, workspace_id, title, model, effort, metadata FROM sessions",
    ).all().map((row) => ({ ...row }));
    assert.equal(sessionRows.length, 1);
    assert.equal(sessionRows[0].codex_thread_id, "thread-new-1");
    assert.equal(sessionRows[0].title, "Initial thread title");
    assert.equal(sessionRows[0].model, "gpt-5.4-mini");
    assert.equal(sessionRows[0].effort, "xhigh");
    assert.deepEqual(JSON.parse(sessionRows[0].metadata), {
      titleContext: {
        initialPrompt: "Wire the substrate path",
        seedTitle: "Initial thread title",
      },
      workspaceRoot,
    });

    const eventVerbs = db.prepare(
      "SELECT verb FROM events ORDER BY rowid ASC",
    ).all().map((row) => row.verb);
    assert.deepEqual(eventVerbs, [
      "workspace.registered",
      "workspace.bound",
      "session.started",
      "policy.allow",
    ]);
  } finally {
    db.close();
  }

  assertManagerMethods(managerCalls, ["account/read", "model/list", "thread/start", "turn/start"],);

  const bootstrap = await controller.getBootstrap();
  assert.equal(bootstrap.auditEvents[0]?.eventType, "run.started");
  assert.equal(bootstrap.auditEvents[0]?.details.executionIntent, "lightweightConversation");
  assert.equal(bootstrap.auditEvents[0]?.details.executionIntentRule, "chat-default");
});

test("ingestRuntimeMessage syncs file writes into session.json paths_written", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const manager = {
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-session-write-1",
            name: "Session write thread",
            preview: "Session write thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-session-write-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-session-write");
  const writtenFilePath = path.join(workspaceRoot, "src", "index.ts");
  await fs.mkdir(path.dirname(writtenFilePath), { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Track written files",
    workspaceRoot,
  });

  controller.ingestRuntimeMessage({
    method: "item/completed",
    params: {
      threadId: "thread-session-write-1",
      turnId: "turn-session-write-1",
      item: {
        changes: [
          { kind: "modified", path: writtenFilePath },
          { kind: "modified", path: writtenFilePath },
        ],
        id: "file-session-write-1",
        status: "completed",
        type: "fileChange",
      },
    },
  });
  await flushSubstrateWrites();

  const profileDbPath = resolveProfileSubstrateDbPath("default", env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-session-write-1",
    dbPath: profileDbPath,
  });
  assert.ok(session);

  await waitFor(async () => {
    const updatedSessionRecord = await readSessionRecord({
      artifactRoot: path.join(root, "visible-artifacts"),
      sessionId: session.id,
    });
    assert.deepEqual(updatedSessionRecord?.paths_written, [writtenFilePath]);
    assert.ok(updatedSessionRecord?.log_cursor.to_ts);
  }, { timeoutMs: 1500, intervalMs: 25 });
});

test("ingestRuntimeMessage auto-renames a generic thread after the first assistant answer", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-auto-title-1",
            name: "Fix this",
            preview: "Fix this",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-auto-title-1",
          },
        };
      }

      if (method === "thread/name/set") {
        return {};
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-auto-title");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Fix this",
    workspaceRoot,
  });

  controller.ingestRuntimeMessage({
    method: "item/completed",
    params: {
      threadId: "thread-auto-title-1",
      turnId: "turn-auto-title-1",
      item: {
        id: "user-auto-title-1",
        type: "userMessage",
        content: [
          { type: "text", text: "Fix this" },
        ],
      },
    },
  });
  controller.ingestRuntimeMessage({
    method: "item/completed",
    params: {
      threadId: "thread-auto-title-1",
      turnId: "turn-auto-title-1",
      item: {
        id: "assistant-auto-title-1",
        type: "agentMessage",
        phase: "final_answer",
        text: "I'll inspect the login crash and patch the auth handler.",
      },
    },
  });
  await flushSubstrateWrites();

  const renameCalls = managerCalls.filter((entry) => entry.method === "thread/name/set");
  assert.deepEqual(renameCalls, [
    {
      method: "thread/name/set",
      params: {
        threadId: "thread-auto-title-1",
        name: "Inspect the login crash and patch the auth handler",
      },
    },
  ]);

  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-auto-title-1",
    dbPath: resolveProfileSubstrateDbPath("default", env),
  });
  assert.equal(session?.title, "Inspect the login crash and patch the auth handler");
});

test("renameDesktopThread prevents auto-title suggestions from overriding a manual rename", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-manual-title-1",
            name: "Fix this",
            preview: "Fix this",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-manual-title-1",
          },
        };
      }

      if (method === "thread/name/set") {
        return {};
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-manual-title");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Fix this",
    workspaceRoot,
  });

  await controller.renameDesktopThread({
    threadId: "thread-manual-title-1",
    title: "Manual login crash fix",
  });

  controller.ingestRuntimeMessage({
    method: "item/completed",
    params: {
      threadId: "thread-manual-title-1",
      turnId: "turn-manual-title-1",
      item: {
        id: "user-manual-title-1",
        type: "userMessage",
        content: [
          { type: "text", text: "Fix this" },
        ],
      },
    },
  });
  controller.ingestRuntimeMessage({
    method: "item/completed",
    params: {
      threadId: "thread-manual-title-1",
      turnId: "turn-manual-title-1",
      item: {
        id: "assistant-manual-title-1",
        type: "agentMessage",
        phase: "final_answer",
        text: "I'll inspect the login crash and patch the auth handler.",
      },
    },
  });
  await flushSubstrateWrites();

  const renameCalls = managerCalls.filter((entry) => entry.method === "thread/name/set");
  assert.deepEqual(renameCalls, [
    {
      method: "thread/name/set",
      params: {
        threadId: "thread-manual-title-1",
        name: "Manual login crash fix",
      },
    },
  ]);

  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-manual-title-1",
    dbPath: resolveProfileSubstrateDbPath("default", env),
  });
  assert.equal(session?.title, "Manual login crash fix");
});

test("archiveDesktopThread writes summary.md and closes the session record", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-archive-1",
            name: "Archive thread",
            preview: "Archive thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-archive-1",
          },
        };
      }

      if (method === "thread/archive") {
        return {};
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-archive");
  const writtenFilePath = path.join(workspaceRoot, "src", "archive.ts");
  await fs.mkdir(path.dirname(writtenFilePath), { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Prepare the archive summary",
    workspaceRoot,
  });

  controller.ingestRuntimeMessage({
    method: "item/completed",
    params: {
      threadId: "thread-archive-1",
      turnId: "turn-archive-1",
      item: {
        changes: [{ kind: "modified", path: writtenFilePath }],
        id: "file-archive-1",
        status: "completed",
        type: "fileChange",
      },
    },
  });
  await flushSubstrateWrites();

  await controller.archiveDesktopThread({
    threadId: "thread-archive-1",
  });

  const profileDbPath = resolveProfileSubstrateDbPath("default", env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-archive-1",
    dbPath: profileDbPath,
  });
  assert.ok(session);

  const artifactRoot = path.join(root, "visible-artifacts");
  const summaryPath = path.join(artifactRoot, "sessions", session.id, "summary.md");
  const { sessionRecord, summary } = await waitFor(async () => {
    const nextSessionRecord = await readSessionRecord({
      artifactRoot,
      sessionId: session.id,
    });
    assert.ok(nextSessionRecord?.ended_at);
    return {
      sessionRecord: nextSessionRecord,
      summary: await fs.readFile(summaryPath, "utf8"),
    };
  }, { timeoutMs: 1500, intervalMs: 25 });
  assert.ok(sessionRecord.ended_at);
  assert.match(summary, /## Intent/);
  assert.match(summary, /Prepare the archive summary/);
  assert.match(summary, /archive\.ts/);
  assertManagerMethods(managerCalls, ["account/read", "model/list", "thread/start", "turn/start", "thread/archive"],);
});

test("restoreDesktopThread makes an archived thread visible again", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-restore-1",
            name: "Restore thread",
            preview: "Restore thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-restore-1",
          },
        };
      }

      if (method === "thread/archive" || method === "thread/unarchive") {
        return {};
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-restore");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Prepare restore coverage",
    workspaceRoot,
  });

  const dbPath = resolveProfileSubstrateDbPath(CANONICAL_PROFILE_ID, env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-restore-1",
    dbPath,
  });
  assert.ok(session?.workspace_id);

  await controller.archiveDesktopThread({
    threadId: "thread-restore-1",
  });

  const archivedSessions = await controller.substrateRecentSessions(10);
  assert.equal(
    archivedSessions.sessions.find((entry) => entry.codex_thread_id === "thread-restore-1")?.status,
    "archived",
  );
  assert.deepEqual(await controller.projectedSessions(session.workspace_id, 10), { sessions: [] });

  await controller.restoreDesktopThread({
    threadId: "thread-restore-1",
  });

  const restoredSessions = await controller.substrateRecentSessions(10);
  assert.equal(
    restoredSessions.sessions.find((entry) => entry.codex_thread_id === "thread-restore-1")?.status,
    "active",
  );
  assert.equal(
    (await controller.projectedSessions(session.workspace_id, 10)).sessions[0]?.codex_thread_id,
    "thread-restore-1",
  );
  assertManagerMethods(managerCalls, ["account/read", "model/list", "thread/start", "turn/start", "thread/archive", "thread/unarchive"],);
});

test("deleteDesktopThread removes local history and keeps workspace files untouched", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-delete-1",
            name: "Delete thread",
            preview: "Delete thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-delete-1",
          },
        };
      }

      if (method === "thread/archive") {
        return {};
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-delete-thread");
  const userFilePath = path.join(workspaceRoot, "notes.txt");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.writeFile(userFilePath, "keep me", "utf8");
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Prepare delete coverage",
    workspaceRoot,
  });

  const dbPath = resolveProfileSubstrateDbPath(CANONICAL_PROFILE_ID, env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-delete-1",
    dbPath,
  });
  assert.ok(session?.id);

  await persistPendingApprovals("default", [makeApproval(78, "thread-delete-1")], env);
  await rememberThreadInteractionState("default", "thread-delete-1", "clarification", env);
  await controller.rememberLastSelectedThread({ threadId: "thread-delete-1" });

  const artifactRoot = await loadProfileArtifactRoot("default", env);
  assert.ok(artifactRoot);
  const sessionArtifactPath = path.join(artifactRoot, "sessions", session.id);
  await fs.access(sessionArtifactPath);

  await controller.deleteDesktopThread({
    threadId: "thread-delete-1",
  });

  assert.equal(
    await getSubstrateSessionByThreadId({
      codexThreadId: "thread-delete-1",
      dbPath,
    }),
    null,
  );
  await assert.rejects(() => fs.access(sessionArtifactPath));
  assert.equal(await loadThreadWorkspaceRoot("default", "thread-delete-1", env), null);
  assert.equal(await loadLastSelectedThreadId("default", env), null);
  assert.deepEqual(await loadPendingApprovals("default", env), []);
  assert.equal(
    (await loadThreadInteractionStates("default", env)).some((entry) => entry.threadId === "thread-delete-1"),
    false,
  );
  assert.equal(await fs.readFile(userFilePath, "utf8"), "keep me");
  assertManagerMethods(managerCalls, ["account/read", "model/list", "thread/start", "turn/start", "thread/archive"],);
});

test("deleteDesktopThread keeps local state when runtime archiving fails", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method) => {
      managerCalls.push(method);
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-delete-fails-1",
            name: "Delete failure thread",
            preview: "Delete failure thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-delete-fails-1",
          },
        };
      }

      if (method === "thread/archive") {
        throw new Error("archive failed");
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-delete-thread-fails");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Prepare failed delete coverage",
    workspaceRoot,
  });

  const dbPath = resolveProfileSubstrateDbPath("default", env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-delete-fails-1",
    dbPath,
  });
  assert.ok(session?.id);

  await persistPendingApprovals("default", [makeApproval(78, "thread-delete-fails-1")], env);
  await rememberThreadInteractionState("default", "thread-delete-fails-1", "clarification", env);
  await controller.rememberLastSelectedThread({ threadId: "thread-delete-fails-1" });

  const artifactRoot = await loadProfileArtifactRoot("default", env);
  assert.ok(artifactRoot);
  const sessionArtifactPath = path.join(artifactRoot, "sessions", session.id);
  await fs.access(sessionArtifactPath);

  await assert.rejects(
    () =>
      controller.deleteDesktopThread({
        threadId: "thread-delete-fails-1",
      }),
    /could not archive it safely/i,
  );

  assert.ok(
    await getSubstrateSessionByThreadId({
      codexThreadId: "thread-delete-fails-1",
      dbPath,
    }),
  );
  await fs.access(sessionArtifactPath);
  assert.equal(await loadThreadWorkspaceRoot("default", "thread-delete-fails-1", env), workspaceRoot);
  assert.equal(await loadLastSelectedThreadId("default", env), "thread-delete-fails-1");
  assert.deepEqual(await loadPendingApprovals("default", env), [makeApproval(78, "thread-delete-fails-1")]);
  assert.equal(
    (await loadThreadInteractionStates("default", env)).some((entry) => entry.threadId === "thread-delete-fails-1"),
    true,
  );
  assertManagerMethods(managerCalls, [
      "account/read",
      "model/list",
      "thread/start",
      "turn/start",
      "thread/archive",
      "thread/read",
      "thread/list",
    ],);
});

test("deleteDesktopThread proceeds when runtime archive fails but the thread is already archived", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-delete-runtime-archived-1",
            name: "Delete runtime archived thread",
            preview: "Delete runtime archived thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-delete-runtime-archived-1",
          },
        };
      }

      if (method === "thread/archive") {
        throw new Error("already archived remotely");
      }

      if (method === "thread/read") {
        return {
          thread: {
            id: "thread-delete-runtime-archived-1",
            status: {
              type: "archived",
            },
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  await controller.runDesktopTask({
    prompt: "Prepare runtime archived delete coverage",
  });

  const dbPath = resolveProfileSubstrateDbPath("default", env);
  await controller.deleteDesktopThread({
    threadId: "thread-delete-runtime-archived-1",
  });

  assert.equal(
    await getSubstrateSessionByThreadId({
      codexThreadId: "thread-delete-runtime-archived-1",
      dbPath,
    }),
    null,
  );
  assertManagerMethods(managerCalls, ["account/read", "model/list", "thread/start", "turn/start", "thread/archive", "thread/read"],);
});

test("deleteDesktopThread proceeds when runtime rejects a stale invalid thread id", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-delete-invalid-1",
            name: "Delete invalid thread",
            preview: "Delete invalid thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-delete-invalid-1",
          },
        };
      }

      if (method === "thread/archive") {
        throw new Error("invalid thread id: invalid character: expected an optional prefix of `urn:uuid:` followed by [0-9a-fA-F-], found `t` at 1");
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  await controller.runDesktopTask({
    prompt: "Prepare invalid thread delete coverage",
  });

  const dbPath = resolveProfileSubstrateDbPath("default", env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-delete-invalid-1",
    dbPath,
  });
  assert.ok(session?.id);

  const db = new DatabaseSync(dbPath);
  db.prepare("UPDATE sessions SET codex_thread_id = ? WHERE id = ?").run("thread-1", session.id);
  db.close();

  await controller.deleteDesktopThread({
    threadId: "thread-1",
  });

  assert.equal(
    await getSubstrateSessionByThreadId({
      codexThreadId: "thread-1",
      dbPath,
    }),
    null,
  );
  assertManagerMethods(managerCalls, ["account/read", "model/list", "thread/start", "turn/start", "thread/archive"],);
});

test("deleteDesktopThread proceeds when a sense-generated temp thread cannot be archived anymore", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-delete-temp-1",
            name: "Delete temp thread",
            preview: "Delete temp thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-delete-temp-1",
          },
        };
      }

      if (method === "thread/archive") {
        throw new Error("archive failed");
      }

      if (method === "thread/read") {
        throw new Error("runtime unavailable");
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const generatedTempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense-personality-"));
  const workspaceRoot = path.join(generatedTempRoot, "workspace");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Prepare temp delete coverage",
    workspaceRoot,
  });

  const dbPath = resolveProfileSubstrateDbPath("default", env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-delete-temp-1",
    dbPath,
  });
  assert.ok(session?.id);

  const artifactRoot = await loadProfileArtifactRoot("default", env);
  assert.ok(artifactRoot);
  const sessionArtifactPath = path.join(artifactRoot, "sessions", session.id);
  await fs.access(sessionArtifactPath);

  await controller.deleteDesktopThread({
    threadId: "thread-delete-temp-1",
  });

  assert.equal(
    await getSubstrateSessionByThreadId({
      codexThreadId: "thread-delete-temp-1",
      dbPath,
    }),
    null,
  );
  await assert.rejects(() => fs.access(sessionArtifactPath));
  assertManagerMethods(managerCalls, ["account/read", "model/list", "thread/start", "turn/start", "thread/archive", "thread/read"],);
});

test("deleteDesktopThread proceeds when the runtime is unavailable during delete", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-delete-runtime-down-1",
            name: "Delete runtime unavailable thread",
            preview: "Delete runtime unavailable thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-delete-runtime-down-1",
          },
        };
      }

      if (method === "thread/archive") {
        throw new Error("App Server is not ready yet.");
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-delete-runtime-down");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Prepare runtime unavailable delete coverage",
    workspaceRoot,
  });

  const dbPath = resolveProfileSubstrateDbPath("default", env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-delete-runtime-down-1",
    dbPath,
  });
  assert.ok(session?.id);

  await controller.deleteDesktopThread({
    threadId: "thread-delete-runtime-down-1",
  });

  assert.equal(
    await getSubstrateSessionByThreadId({
      codexThreadId: "thread-delete-runtime-down-1",
      dbPath,
    }),
    null,
  );
  assertManagerMethods(managerCalls, ["account/read", "model/list", "thread/start", "turn/start", "thread/archive"],);
});

test("deleteDesktopThread skips re-archiving after the runtime already reported the thread as archived", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-delete-runtime-notified-1",
            name: "Delete runtime notified thread",
            preview: "Delete runtime notified thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-delete-runtime-notified-1",
          },
        };
      }

      if (method === "thread/archive") {
        throw new Error("archive failed after archived notification");
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  await controller.runDesktopTask({
    prompt: "Prepare runtime archived notification coverage",
  });

  const dbPath = resolveProfileSubstrateDbPath("default", env);
  controller.ingestRuntimeMessage({
    method: "thread/archived",
    params: {
      threadId: "thread-delete-runtime-notified-1",
    },
  });
  await flushSubstrateWrites();

  await controller.deleteDesktopThread({
    threadId: "thread-delete-runtime-notified-1",
  });

  assert.equal(
    await getSubstrateSessionByThreadId({
      codexThreadId: "thread-delete-runtime-notified-1",
      dbPath,
    }),
    null,
  );
  assertManagerMethods(managerCalls, ["account/read", "model/list", "thread/start", "turn/start"],);
});

test("deleteWorkspace proceeds when runtime archive fails but a linked thread is already gone", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method) => {
      managerCalls.push(method);
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-workspace-delete-gone-1",
            name: "Workspace delete missing thread",
            preview: "Workspace delete missing thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-workspace-delete-gone-1",
          },
        };
      }

      if (method === "thread/archive") {
        throw new Error("thread missing remotely");
      }

      if (method === "thread/read") {
        return {
          thread: null,
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-delete-gone");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Prepare missing runtime thread delete coverage",
    workspaceRoot,
  });

  const dbPath = resolveProfileSubstrateDbPath("default", env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-workspace-delete-gone-1",
    dbPath,
  });
  assert.ok(session?.id && session.workspace_id);

  await controller.deleteWorkspace({
    workspaceId: session.workspace_id,
  });

  assert.equal((await controller.substrateWorkspaceDetail(session.workspace_id)).workspace, null);
  assert.equal(
    await getSubstrateSessionByThreadId({
      codexThreadId: "thread-workspace-delete-gone-1",
      dbPath,
    }),
    null,
  );
  assertManagerMethods(managerCalls, [
      "account/read",
      "model/list",
      "thread/start",
      "turn/start",
      "thread/archive",
      "thread/read",
    ],);
});

test("deleteWorkspace proceeds when a linked thread id is stale and invalid for the runtime", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method) => {
      managerCalls.push(method);
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-workspace-delete-invalid-1",
            name: "Workspace delete invalid thread",
            preview: "Workspace delete invalid thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-workspace-delete-invalid-1",
          },
        };
      }

      if (method === "thread/archive") {
        throw new Error("invalid thread id: invalid character: expected an optional prefix of `urn:uuid:` followed by [0-9a-fA-F-], found `t` at 1");
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-delete-invalid");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Prepare invalid workspace delete coverage",
    workspaceRoot,
  });

  const dbPath = resolveProfileSubstrateDbPath("default", env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-workspace-delete-invalid-1",
    dbPath,
  });
  assert.ok(session?.id && session.workspace_id);

  const db = new DatabaseSync(dbPath);
  db.prepare("UPDATE sessions SET codex_thread_id = ? WHERE id = ?").run("thread-1", session.id);
  db.close();

  await controller.deleteWorkspace({
    workspaceId: session.workspace_id,
  });

  assert.equal((await controller.substrateWorkspaceDetail(session.workspace_id)).workspace, null);
  assert.equal(
    await getSubstrateSessionByThreadId({
      codexThreadId: "thread-1",
      dbPath,
    }),
    null,
  );
  assertManagerMethods(managerCalls, ["account/read", "model/list", "thread/start", "turn/start", "thread/archive"],);
});

test("deleteWorkspace proceeds when a sense-generated temp workspace cannot archive a dead thread", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method) => {
      managerCalls.push(method);
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-workspace-delete-temp-1",
            name: "Workspace delete temp thread",
            preview: "Workspace delete temp thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-workspace-delete-temp-1",
          },
        };
      }

      if (method === "thread/archive") {
        throw new Error("archive failed");
      }

      if (method === "thread/read") {
        throw new Error("runtime unavailable");
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const generatedTempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense166-"));
  const workspaceRoot = path.join(generatedTempRoot, "workspace-policy");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Prepare temp workspace delete coverage",
    workspaceRoot,
  });
  await controller.rememberWorkspaceSidebarOrder({
    rootPaths: [workspaceRoot],
  });

  const dbPath = resolveProfileSubstrateDbPath("default", env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-workspace-delete-temp-1",
    dbPath,
  });
  assert.ok(session?.id && session.workspace_id);

  const artifactRoot = await loadProfileArtifactRoot("default", env);
  assert.ok(artifactRoot);
  const sessionArtifactPath = path.join(artifactRoot, "sessions", session.id);
  await fs.access(sessionArtifactPath);

  await controller.deleteWorkspace({
    workspaceId: session.workspace_id,
  });

  assert.equal((await controller.substrateWorkspaceDetail(session.workspace_id)).workspace, null);
  assert.equal(
    await getSubstrateSessionByThreadId({
      codexThreadId: "thread-workspace-delete-temp-1",
      dbPath,
    }),
    null,
  );
  await assert.rejects(() => fs.access(sessionArtifactPath));
  assert.equal((await loadRecentWorkspaceFolders("default", env)).some((entry) => entry.path === workspaceRoot), false);
  assert.deepEqual(await loadWorkspaceSidebarOrder(CANONICAL_PROFILE_ID, env), []);
  assertManagerMethods(managerCalls, ["account/read", "model/list", "thread/start", "turn/start", "thread/archive", "thread/read"],);
});

test("deleteWorkspace proceeds when the runtime is unavailable during workspace delete", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method) => {
      managerCalls.push(method);
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-workspace-delete-runtime-down-1",
            name: "Workspace delete runtime unavailable thread",
            preview: "Workspace delete runtime unavailable thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-workspace-delete-runtime-down-1",
          },
        };
      }

      if (method === "thread/archive") {
        throw new Error("Timed out waiting 5000ms for app-server initialize.");
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-delete-runtime-down");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Prepare runtime unavailable workspace delete coverage",
    workspaceRoot,
  });
  await controller.rememberWorkspaceSidebarOrder({
    rootPaths: [workspaceRoot],
  });

  const dbPath = resolveProfileSubstrateDbPath("default", env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-workspace-delete-runtime-down-1",
    dbPath,
  });
  assert.ok(session?.id && session.workspace_id);

  await controller.deleteWorkspace({
    workspaceId: session.workspace_id,
  });

  assert.equal((await controller.substrateWorkspaceDetail(session.workspace_id)).workspace, null);
  assert.equal(
    await getSubstrateSessionByThreadId({
      codexThreadId: "thread-workspace-delete-runtime-down-1",
      dbPath,
    }),
    null,
  );
  assertManagerMethods(managerCalls, ["account/read", "model/list", "thread/start", "turn/start", "thread/archive"],);
});

test("deleteWorkspace proceeds when a Sense-owned session workspace cannot archive a dead thread", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method) => {
      managerCalls.push(method);
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-workspace-delete-owned-session-1",
            name: "Workspace delete owned session thread",
            preview: "Workspace delete owned session thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-workspace-delete-owned-session-1",
          },
        };
      }

      if (method === "thread/archive") {
        throw new Error("archive failed");
      }

      if (method === "thread/read") {
        throw new Error("runtime unavailable");
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const artifactRoot = await resolveProfileArtifactRoot("default", env);
  assert.ok(artifactRoot);
  const workspaceRoot = path.join(artifactRoot, "sessions", "sess_workspace_delete_owned", "workspace");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Prepare owned session workspace delete coverage",
    workspaceRoot,
  });

  const dbPath = resolveProfileSubstrateDbPath("default", env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-workspace-delete-owned-session-1",
    dbPath,
  });
  assert.ok(session?.id && session.workspace_id);

  await controller.deleteWorkspace({
    workspaceId: session.workspace_id,
  });

  assert.equal((await controller.substrateWorkspaceDetail(session.workspace_id)).workspace, null);
  assert.equal(
    await getSubstrateSessionByThreadId({
      codexThreadId: "thread-workspace-delete-owned-session-1",
      dbPath,
    }),
    null,
  );
  assertManagerMethods(managerCalls, ["account/read", "model/list", "thread/start", "turn/start", "thread/archive", "thread/read"],);
});

test("deleteWorkspace skips re-archiving threads after the runtime already reported them as archived", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method) => {
      managerCalls.push(method);
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-workspace-delete-runtime-notified-1",
            name: "Workspace delete runtime notified thread",
            preview: "Workspace delete runtime notified thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-workspace-delete-runtime-notified-1",
          },
        };
      }

      if (method === "thread/archive") {
        throw new Error("archive failed after archived notification");
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-delete-runtime-notified");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Prepare runtime archived workspace notification coverage",
    workspaceRoot,
  });

  const dbPath = resolveProfileSubstrateDbPath("default", env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-workspace-delete-runtime-notified-1",
    dbPath,
  });
  assert.ok(session?.id && session.workspace_id);

  controller.ingestRuntimeMessage({
    method: "thread/archived",
    params: {
      threadId: "thread-workspace-delete-runtime-notified-1",
    },
  });
  await flushSubstrateWrites();

  await controller.deleteWorkspace({
    workspaceId: session.workspace_id,
  });

  assert.equal((await controller.substrateWorkspaceDetail(session.workspace_id)).workspace, null);
  assert.equal(
    await getSubstrateSessionByThreadId({
      codexThreadId: "thread-workspace-delete-runtime-notified-1",
      dbPath,
    }),
    null,
  );
  assertManagerMethods(managerCalls, ["account/read", "model/list", "thread/start", "turn/start"],);
});

test("deleteDesktopThread proceeds when the runtime no longer lists the thread", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method) => {
      managerCalls.push(method);
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-delete-runtime-gone-1",
            name: "Delete runtime gone thread",
            preview: "Delete runtime gone thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-delete-runtime-gone-1",
          },
        };
      }

      if (method === "thread/archive") {
        throw new Error("archive failed");
      }

      if (method === "thread/read") {
        throw new Error("read failed");
      }

      if (method === "thread/list") {
        return {
          data: [{ id: "thread-other" }],
        };
      }

      if (method === "thread/loaded/list") {
        return {
          data: ["thread-loaded-other"],
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  await controller.runDesktopTask({
    prompt: "Prepare runtime gone delete coverage",
  });

  const dbPath = resolveProfileSubstrateDbPath("default", env);
  await controller.deleteDesktopThread({
    threadId: "thread-delete-runtime-gone-1",
  });

  assert.equal(
    await getSubstrateSessionByThreadId({
      codexThreadId: "thread-delete-runtime-gone-1",
      dbPath,
    }),
    null,
  );
  assertManagerMethods(managerCalls, [
      "account/read",
      "model/list",
      "thread/start",
      "turn/start",
      "thread/archive",
      "thread/read",
      "thread/list",
      "thread/loaded/list",
    ],);
});

test("deleteWorkspace proceeds when the runtime no longer lists a linked thread", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method) => {
      managerCalls.push(method);
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-workspace-delete-runtime-gone-1",
            name: "Workspace delete runtime gone thread",
            preview: "Workspace delete runtime gone thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-workspace-delete-runtime-gone-1",
          },
        };
      }

      if (method === "thread/archive") {
        throw new Error("archive failed");
      }

      if (method === "thread/read") {
        throw new Error("read failed");
      }

      if (method === "thread/list") {
        return {
          data: [{ id: "thread-other" }],
        };
      }

      if (method === "thread/loaded/list") {
        return {
          data: ["thread-loaded-other"],
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-delete-runtime-gone");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Prepare runtime gone workspace delete coverage",
    workspaceRoot,
  });

  const dbPath = resolveProfileSubstrateDbPath("default", env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-workspace-delete-runtime-gone-1",
    dbPath,
  });
  assert.ok(session?.id && session.workspace_id);

  await controller.deleteWorkspace({
    workspaceId: session.workspace_id,
  });

  assert.equal((await controller.substrateWorkspaceDetail(session.workspace_id)).workspace, null);
  assert.equal(
    await getSubstrateSessionByThreadId({
      codexThreadId: "thread-workspace-delete-runtime-gone-1",
      dbPath,
    }),
    null,
  );
  assertManagerMethods(managerCalls, [
      "account/read",
      "model/list",
      "thread/start",
      "turn/start",
      "thread/archive",
      "thread/read",
      "thread/list",
      "thread/loaded/list",
    ],);
});

test("deleteDesktopThread removes an already archived thread without re-archiving it", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-delete-archived-1",
            name: "Delete archived thread",
            preview: "Delete archived thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-delete-archived-1",
          },
        };
      }

      if (method === "thread/archive") {
        return {};
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  await controller.runDesktopTask({
    prompt: "Prepare archived delete coverage",
  });

  const dbPath = resolveProfileSubstrateDbPath("default", env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-delete-archived-1",
    dbPath,
  });
  assert.ok(session?.id);

  await controller.archiveDesktopThread({
    threadId: "thread-delete-archived-1",
  });

  const archivedSession = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-delete-archived-1",
    dbPath,
  });
  assert.equal(archivedSession?.status, "archived");

  await controller.deleteDesktopThread({
    threadId: "thread-delete-archived-1",
  });

  assert.equal(
    await getSubstrateSessionByThreadId({
      codexThreadId: "thread-delete-archived-1",
      dbPath,
    }),
    null,
  );
  assertManagerMethods(managerCalls, ["account/read", "model/list", "thread/start", "turn/start", "thread/archive"],);
});

test("archiveWorkspace hides a workspace from default surfaces and restoreWorkspace brings it back", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const manager = {
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-workspace-archive-1",
            name: "Workspace archive thread",
            preview: "Workspace archive thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-workspace-archive-1",
          },
        };
      }

      if (method === "thread/list") {
        return {
          data: [
            {
              id: "thread-workspace-archive-1",
              title: "Workspace archive thread",
              updated_at: "2026-03-24T10:00:00.000Z",
            },
          ],
        };
      }

      if (method === "thread/loaded/list") {
        return { data: [] };
      }

      if (method === "thread/read") {
        return {
          thread: {
            id: "thread-workspace-archive-1",
            name: "Workspace archive thread",
            preview: "Workspace archive thread",
            turns: [],
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: [],
            },
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-archive-restore");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Prepare workspace archive coverage",
    workspaceRoot,
  });
  await flushSubstrateWrites();
  await controller.rememberWorkspaceSidebarOrder({
    rootPaths: [workspaceRoot],
  });

  const dbPath = resolveProfileSubstrateDbPath(CANONICAL_PROFILE_ID, env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-workspace-archive-1",
    dbPath,
  });
  assert.ok(session?.workspace_id);
  assert.equal((await loadRecentWorkspaceFolders(CANONICAL_PROFILE_ID, env)).some((folder) => folder.path === workspaceRoot), true);

  await controller.archiveWorkspace({
    workspaceId: session.workspace_id,
  });

  const archivedWorkspace = await controller.substrateWorkspaceDetail(session.workspace_id);
  assert.equal(archivedWorkspace.workspace?.status, "archived");
  assert.deepEqual(await controller.projectedWorkspaces(), { workspaces: [] });
  assert.equal((await loadRecentWorkspaceFolders(CANONICAL_PROFILE_ID, env)).some((folder) => folder.path === workspaceRoot), false);
  assert.deepEqual(await loadWorkspaceSidebarOrder(CANONICAL_PROFILE_ID, env), []);

  await controller.restoreWorkspace({
    workspaceId: session.workspace_id,
  });

  const restoredWorkspace = await controller.substrateWorkspaceDetail(session.workspace_id);
  assert.equal(restoredWorkspace.workspace?.status, "active");
  assert.equal((await controller.projectedWorkspaces()).workspaces[0]?.workspace_id, session.workspace_id);
  assert.equal((await loadRecentWorkspaceFolders(CANONICAL_PROFILE_ID, env)).some((folder) => folder.path === workspaceRoot), true);
});

test("deleteWorkspace purges Sense-1 workspace data but keeps the real folder on disk", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method) => {
      managerCalls.push(method);
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-workspace-delete-1",
            name: "Workspace delete thread",
            preview: "Workspace delete thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-workspace-delete-1",
          },
        };
      }

      if (method === "thread/archive") {
        return {};
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-delete");
  const userFilePath = path.join(workspaceRoot, "README.md");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.writeFile(userFilePath, "# keep folder\n", "utf8");
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Prepare workspace delete coverage",
    workspaceRoot,
  });
  await controller.rememberWorkspaceSidebarOrder({
    rootPaths: [workspaceRoot],
  });

  const dbPath = resolveProfileSubstrateDbPath("default", env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-workspace-delete-1",
    dbPath,
  });
  assert.ok(session?.id && session.workspace_id);
  await controller.rememberLastSelectedThread({ threadId: "thread-workspace-delete-1" });

  const artifactRoot = await loadProfileArtifactRoot("default", env);
  assert.ok(artifactRoot);
  const sessionArtifactPath = path.join(artifactRoot, "sessions", session.id);
  await fs.access(sessionArtifactPath);

  await controller.deleteWorkspace({
    workspaceId: session.workspace_id,
  });

  assert.equal((await controller.substrateWorkspaceDetail(session.workspace_id)).workspace, null);
  assert.deepEqual(await controller.substrateSessionsByWorkspace(session.workspace_id, 10), { sessions: [] });
  assert.equal(
    await getSubstrateSessionByThreadId({
      codexThreadId: "thread-workspace-delete-1",
      dbPath,
    }),
    null,
  );
  await assert.rejects(() => fs.access(sessionArtifactPath));
  assert.equal(await fs.readFile(userFilePath, "utf8"), "# keep folder\n");
  assert.equal((await loadRecentWorkspaceFolders("default", env)).some((entry) => entry.path === workspaceRoot), false);
  assert.deepEqual(await loadWorkspaceSidebarOrder("default", env), []);
  assert.equal(await loadLastSelectedThreadId("default", env), null);
  assertManagerMethods(managerCalls, ["account/read", "model/list", "thread/start", "turn/start", "thread/archive"],);
});

test("deleteWorkspace keeps local state when a linked thread cannot be archived", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method) => {
      managerCalls.push(method);
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-workspace-delete-fails-1",
            name: "Workspace delete failure thread",
            preview: "Workspace delete failure thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-workspace-delete-fails-1",
          },
        };
      }

      if (method === "thread/archive") {
        throw new Error("archive failed");
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-delete-fails");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Prepare failed workspace delete coverage",
    workspaceRoot,
  });
  await controller.rememberWorkspaceSidebarOrder({
    rootPaths: [workspaceRoot],
  });

  const dbPath = resolveProfileSubstrateDbPath("default", env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-workspace-delete-fails-1",
    dbPath,
  });
  assert.ok(session?.id && session.workspace_id);
  await controller.rememberLastSelectedThread({ threadId: "thread-workspace-delete-fails-1" });

  const artifactRoot = await loadProfileArtifactRoot("default", env);
  assert.ok(artifactRoot);
  const sessionArtifactPath = path.join(artifactRoot, "sessions", session.id);
  await fs.access(sessionArtifactPath);

  await assert.rejects(
    () =>
      controller.deleteWorkspace({
        workspaceId: session.workspace_id,
      }),
    /could not be archived safely/i,
  );

  assert.ok((await controller.substrateWorkspaceDetail(session.workspace_id)).workspace);
  assert.ok(
    await getSubstrateSessionByThreadId({
      codexThreadId: "thread-workspace-delete-fails-1",
      dbPath,
    }),
  );
  await fs.access(sessionArtifactPath);
  assert.equal(await loadLastSelectedThreadId("default", env), "thread-workspace-delete-fails-1");
  assert.equal((await loadRecentWorkspaceFolders("default", env)).some((entry) => entry.path === workspaceRoot), true);
  assert.deepEqual(await loadWorkspaceSidebarOrder("default", env), [workspaceRoot]);
  assertManagerMethods(managerCalls, ["account/read", "model/list", "thread/start", "turn/start", "thread/archive", "thread/read", "thread/list"],);
});

test("deleteWorkspace removes already archived threads without re-archiving them", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method) => {
      managerCalls.push(method);
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-workspace-delete-archived-1",
            name: "Workspace delete archived thread",
            preview: "Workspace delete archived thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-workspace-delete-archived-1",
          },
        };
      }

      if (method === "thread/archive") {
        return {};
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-delete-archived");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Prepare archived workspace delete coverage",
    workspaceRoot,
  });

  const dbPath = resolveProfileSubstrateDbPath("default", env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-workspace-delete-archived-1",
    dbPath,
  });
  assert.ok(session?.id && session.workspace_id);

  await controller.archiveDesktopThread({
    threadId: "thread-workspace-delete-archived-1",
  });

  const archivedSession = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-workspace-delete-archived-1",
    dbPath,
  });
  assert.equal(archivedSession?.status, "archived");

  await controller.deleteWorkspace({
    workspaceId: session.workspace_id,
  });

  assert.equal((await controller.substrateWorkspaceDetail(session.workspace_id)).workspace, null);
  assert.equal(
    await getSubstrateSessionByThreadId({
      codexThreadId: "thread-workspace-delete-archived-1",
      dbPath,
    }),
    null,
  );
  assertManagerMethods(managerCalls, ["account/read", "model/list", "thread/start", "turn/start", "thread/archive"],);
});

test("rememberWorkspaceFolder records first-contact workspaces without auto-granting or hydrating", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const workspaceRoot = path.join(root, "workspace-first-contact");
  const managerCalls = [];
  const manager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "fs/readDirectory") {
        return {
          entries: [
            {
              name: "README.md",
              path: path.join(workspaceRoot, "README.md"),
              type: "file",
            },
            {
              name: "package.json",
              path: path.join(workspaceRoot, "package.json"),
              type: "file",
            },
            {
              children: [
                {
                  name: "index.ts",
                  path: path.join(workspaceRoot, "src", "index.ts"),
                  type: "file",
                },
                {
                  name: "App.tsx",
                  path: path.join(workspaceRoot, "src", "components", "App.tsx"),
                  type: "file",
                },
              ],
              name: "src",
              path: path.join(workspaceRoot, "src"),
              type: "directory",
            },
          ],
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-27T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-27T10:00:00.000Z",
    },
  });

  await controller.rememberWorkspaceFolder(workspaceRoot);

  const dbPath = resolveProfileSubstrateDbPath("default", env);
  const policy = await loadWorkspacePolicy({
    dbPath,
    workspaceRoot,
  });
  assert.equal(policy.read_granted, 0);
  assert.equal(policy.read_grant_mode, null);
  assert.equal(policy.read_granted_at, null);
  assert.equal(policy.last_hydrated_at, null);
  assert.deepEqual(policy.context_paths, []);
  assert.deepEqual(policy.known_structure, []);
  assertNoNonAuthManagerCalls(managerCalls);
});

test("getWorkspacePolicy returns persisted substrate policy for a workspace root", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const workspaceRoot = path.join(root, "workspace-policy-read");
  const dbPath = resolveProfileSubstrateDbPath("default", env);
  await ensureProfileDirectories("default", env);
  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId: "default",
  });
  await upsertWorkspacePolicy({
    contextPaths: [path.join(workspaceRoot, "README.md")],
    dbPath,
    knownStructure: [
      {
        name: "README.md",
        path: path.join(workspaceRoot, "README.md"),
        type: "file",
      },
    ],
    pinnedPaths: [path.join(workspaceRoot, "src")],
    readGranted: true,
    readGrantedAt: "2026-03-27T09:00:00.000Z",
    workspaceRoot,
    writeMode: "trusted",
  });

  const controller = new DesktopSessionController({
    request: async () => {
      throw new Error("Unexpected request");
    },
    respond: () => {},
  }, {
    appStartedAt: "2026-03-27T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-27T10:00:00.000Z",
    },
  });

  const result = await controller.getWorkspacePolicy(workspaceRoot);
  assert.deepEqual(result.policy, {
    context_paths: [path.join(workspaceRoot, "README.md")],
    known_structure: [
      {
        name: "README.md",
        path: path.join(workspaceRoot, "README.md"),
        type: "file",
      },
    ],
    last_hydrated_at: null,
    pinned_paths: [path.join(workspaceRoot, "src")],
    read_granted: 1,
    read_granted_at: "2026-03-27T09:00:00.000Z",
    read_grant_mode: null,
    workspace_root: workspaceRoot,
    operating_mode: "auto",
    write_mode: "trusted",
  });
});

test("getWorkspacePolicy returns the default ungranted policy for a first-contact workspace root", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const workspaceRoot = path.join(root, "workspace-policy-first-contact");

  const controller = new DesktopSessionController({
    request: async () => {
      throw new Error("Unexpected request");
    },
    respond: () => {},
  }, {
    appStartedAt: "2026-03-27T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-27T10:00:00.000Z",
    },
  });

  const result = await controller.getWorkspacePolicy(workspaceRoot);
  assert.deepEqual(result.policy, {
    context_paths: [],
    known_structure: [],
    last_hydrated_at: null,
    pinned_paths: [],
    read_granted: 0,
    read_granted_at: null,
    read_grant_mode: null,
    workspace_root: workspaceRoot,
    operating_mode: "auto",
    write_mode: "conversation",
  });
});

test("setWorkspaceOperatingMode persists the selected workspace mode", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const workspaceRoot = path.join(root, "workspace-mode");

  const controller = new DesktopSessionController({
    request: async () => {
      throw new Error("Unexpected request");
    },
    respond: () => {},
  }, {
    appStartedAt: "2026-03-27T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-27T10:00:00.000Z",
    },
  });

  const result = await controller.setWorkspaceOperatingMode({
    mode: "apply",
    rootPath: workspaceRoot,
  });

  assert.equal(result.policy.workspace_root, workspaceRoot);
  assert.equal(result.policy.operating_mode, "apply");

  const persisted = await controller.getWorkspacePolicy(workspaceRoot);
  assert.equal(persisted.policy.operating_mode, "apply");
});

test("grantWorkspacePermission seeds new workspace policies from the saved default operating mode", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const workspaceRoot = path.join(root, "workspace-grant-preview");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.writeFile(path.join(workspaceRoot, "README.md"), "# Preview workspace\n");

  const controller = new DesktopSessionController({
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "model/list") {
        return {
          data: [
            {
              id: "gpt-5.4-mini",
              name: "GPT-5.4 Mini",
              supportedReasoningEfforts: ["medium", "high", "xhigh"],
            },
          ],
        };
      }

      if (method === "fs/readDirectory") {
        return {
          entries: [
            {
              name: "README.md",
              path: path.join(workspaceRoot, "README.md"),
              type: "file",
            },
          ],
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    respond: () => {},
  }, {
    appStartedAt: "2026-03-27T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-27T10:00:00.000Z",
    },
  });

  await controller.updateDesktopSettings({
    defaultOperatingMode: "preview",
  });

  const result = await controller.grantWorkspacePermission({
    mode: "always",
    rootPath: workspaceRoot,
  });

  assert.equal(result.policy.operating_mode, "preview");
});

test("runDesktopTask uses the stored workspace operating mode on the next turn", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const workspaceRoot = path.join(root, "workspace-mode-runtime");
  const managerCalls = [];
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);

  const controller = new DesktopSessionController({
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "model/list") {
        return {
          data: [
            {
              id: "gpt-5.4-mini",
              name: "GPT-5.4 Mini",
              supportedReasoningEfforts: ["medium", "high", "xhigh"],
            },
          ],
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-workspace-preview",
            name: "Workspace preview",
            preview: "Workspace preview",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-workspace-preview",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  }, {
    appStartedAt: "2026-03-27T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-27T10:00:00.000Z",
    },
  });

  await controller.setWorkspaceOperatingMode({
    mode: "preview",
    rootPath: workspaceRoot,
  });

  const result = await controller.runDesktopTask({
    prompt: "Inspect this workspace without changing files",
    workspaceRoot,
  });

  assert.equal(result.runContext?.policy.executionPolicyMode, "preview");
  const turnStart = managerCalls.find((entry) => entry.method === "turn/start");
  assert.deepEqual(turnStart?.params.sandboxPolicy, {
    type: "readOnly",
  });
});

test("runDesktopTask ignores legacy read-only sandbox settings for workspace apply mode", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const workspaceRoot = path.join(root, "workspace-apply-write");
  const managerCalls = [];
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);

  const controller = new DesktopSessionController({
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "model/list") {
        return {
          data: [
            {
              id: "gpt-5.4-mini",
              name: "GPT-5.4 Mini",
              supportedReasoningEfforts: ["medium", "high", "xhigh"],
            },
          ],
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-workspace-apply-write-1",
            name: "Workspace apply write",
            preview: "Workspace apply write",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-workspace-apply-write-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  }, {
    appStartedAt: "2026-03-27T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-27T10:00:00.000Z",
    },
  });

  await controller.updateDesktopSettings({
    sandboxPosture: "readOnly",
  });

  await controller.setWorkspaceOperatingMode({
    mode: "apply",
    rootPath: workspaceRoot,
  });

  const result = await controller.runDesktopTask({
    prompt: "Save the final document in this workspace.",
    workspaceRoot,
  });

  assert.equal(result.status, "started");
  assert.equal(result.runContext?.policy.executionPolicyMode, "apply");
  assert.equal(result.runContext?.policy.sandboxPolicy, "workspaceWrite");

  const turnStart = managerCalls.find((entry) => entry.method === "turn/start");
  assert.deepEqual(turnStart?.params.sandboxPolicy, {
    type: "workspaceWrite",
    networkAccess: true,
    writableRoots: [await fs.realpath(workspaceRoot)],
  });
});

test("grantWorkspacePermission stores the grant mode and hydrates the workspace", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const workspaceRoot = path.join(root, "workspace-grant");
  const dbPath = resolveProfileSubstrateDbPath("default", env);
  await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
  await fs.writeFile(path.join(workspaceRoot, "README.md"), "# Workspace grant\n");
  await fs.writeFile(path.join(workspaceRoot, "package.json"), "{\"name\":\"workspace-grant\"}\n");
  await ensureProfileDirectories("default", env);
  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId: "default",
  });

  const controller = new DesktopSessionController({
    request: async (method) => {
      throw new Error(`Unexpected method: ${method}`);
    },
    respond: () => {},
  }, {
    appStartedAt: "2026-03-27T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-27T10:00:00.000Z",
    },
  });

  const result = await controller.grantWorkspacePermission({
    mode: "always",
    rootPath: workspaceRoot,
  });

  assert.equal(result.policy.read_granted, 1);
  assert.equal(result.policy.read_grant_mode, "always");
  assert.ok(result.policy.read_granted_at);
  assert.ok(result.policy.last_hydrated_at);
  assert.deepEqual(result.policy.context_paths, [
    path.join(workspaceRoot, "README.md"),
    path.join(workspaceRoot, "package.json"),
  ]);
});

test("grantWorkspacePermission only records top-level key files plus .codex/config.toml as context", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const workspaceRoot = path.join(root, "workspace-context-top-level");
  await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, ".codex"), { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, "nested"), { recursive: true });
  await fs.writeFile(path.join(workspaceRoot, "src", "README.md"), "# Nested readme\n");
  await fs.writeFile(path.join(workspaceRoot, "package.json"), "{\"name\":\"workspace-context-top-level\"}\n");
  await fs.writeFile(path.join(workspaceRoot, ".codex", "config.toml"), "model = \"gpt-5\"\n");
  await fs.writeFile(path.join(workspaceRoot, "nested", "package.json"), "{\"name\":\"nested\"}\n");

  const controller = new DesktopSessionController({
    request: async (method) => {
      throw new Error(`Unexpected method: ${method}`);
    },
    respond: () => {},
  }, {
    appStartedAt: "2026-03-27T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-27T10:00:00.000Z",
    },
  });

  const result = await controller.grantWorkspacePermission({
    mode: "always",
    rootPath: workspaceRoot,
  });

  assert.deepEqual(result.policy.context_paths, [
    path.join(workspaceRoot, "package.json"),
  ]);
});

test("grantWorkspacePermission falls back to local hydration when app-server reads fail", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const workspaceRoot = path.join(root, "workspace-grant-failure");
  const dbPath = resolveProfileSubstrateDbPath("default", env);
  await fs.mkdir(workspaceRoot, { recursive: true });
  await ensureProfileDirectories("default", env);
  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId: "default",
  });

  const controller = new DesktopSessionController({
    request: async (method) => {
      throw new Error(`Unexpected method: ${method}`);
    },
    respond: () => {},
  }, {
    appStartedAt: "2026-03-27T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-27T10:00:00.000Z",
    },
  });

  const result = await controller.grantWorkspacePermission({
    mode: "always",
    rootPath: workspaceRoot,
  });

  assert.equal(result.policy.read_granted, 1);
  assert.equal(result.policy.read_grant_mode, "always");
  assert.ok(result.policy.read_granted_at);
  assert.ok(result.policy.last_hydrated_at);
  assert.deepEqual(result.policy.context_paths, []);
  assert.deepEqual(result.policy.known_structure, []);

  const storedPolicy = await loadWorkspacePolicy({
    dbPath,
    workspaceRoot,
  });
  assert.equal(storedPolicy.read_granted, 1);
  assert.equal(storedPolicy.read_grant_mode, "always");
  assert.ok(storedPolicy.read_granted_at);
  assert.ok(storedPolicy.last_hydrated_at);
  assert.deepEqual(storedPolicy.context_paths, []);
  assert.deepEqual(storedPolicy.known_structure, []);
});

test("hydrateWorkspace refreshes known structure and returns a summary", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const workspaceRoot = path.join(root, "workspace-hydrate");
  const dbPath = resolveProfileSubstrateDbPath("default", env);
  await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
  await fs.writeFile(path.join(workspaceRoot, "README.md"), "# Workspace hydrate\n");
  await fs.writeFile(path.join(workspaceRoot, "package.json"), "{\"name\":\"workspace-hydrate\"}\n");
  await ensureProfileDirectories("default", env);
  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId: "default",
  });
  await upsertWorkspacePolicy({
    contextPaths: [path.join(workspaceRoot, "README.md")],
    dbPath,
    knownStructure: [
      {
        name: "README.md",
        path: path.join(workspaceRoot, "README.md"),
        type: "file",
      },
    ],
    readGranted: true,
    readGrantedAt: "2026-03-27T08:00:00.000Z",
    workspaceRoot,
  });

  const controller = new DesktopSessionController({
    request: async (method) => {
      throw new Error(`Unexpected method: ${method}`);
    },
    respond: () => {},
  }, {
    appStartedAt: "2026-03-27T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-27T10:00:00.000Z",
    },
  });

  const result = await controller.hydrateWorkspace(workspaceRoot);

  assert.equal(result.rootPath, workspaceRoot);
  assert.equal(result.displayName, "workspace-hydrate");
  assert.equal(result.fileCount, 3);
  assert.deepEqual(result.keyFiles, [
    path.join(workspaceRoot, "README.md"),
    path.join(workspaceRoot, "package.json"),
  ]);
  assert.equal(result.projectType, "Node.js");
  assert.ok(result.lastHydrated);

  const policy = await loadWorkspacePolicy({
    dbPath,
    workspaceRoot,
  });
  assert.deepEqual(policy.known_structure, [
    {
      name: "package.json",
      path: path.join(workspaceRoot, "package.json"),
      type: "file",
    },
    {
      name: "README.md",
      path: path.join(workspaceRoot, "README.md"),
      type: "file",
    },
    {
      name: "src",
      path: path.join(workspaceRoot, "src"),
      type: "directory",
    },
  ]);
  assert.equal(policy.last_hydrated_at, result.lastHydrated);
});

test("runDesktopTask immediately preserves workspace binding on the selected thread for bootstrap recovery", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const workspaceRoot = path.join(root, "workspace-bootstrap-selected");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);

  const manager = {
    request: async (method, params) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-bootstrap-selected-1",
            name: "Bootstrap selected thread",
            preview: "Bootstrap selected thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-bootstrap-selected-1",
          },
        };
      }

      if (method === "thread/list") {
        return {
          data: [
            {
              id: "thread-bootstrap-selected-1",
              title: "Bootstrap selected thread",
              updated_at: "2026-03-27T10:00:00.000Z",
            },
          ],
        };
      }

      if (method === "thread/loaded/list") {
        return { data: [] };
      }

      if (method === "thread/read") {
        if (params?.includeTurns === false) {
          return {
            thread: {
              id: "thread-bootstrap-selected-1",
              title: "Bootstrap selected thread",
              updated_at: "2026-03-27T10:00:00.000Z",
            },
          };
        }

        return {
          thread: {
            id: "thread-bootstrap-selected-1",
            name: "Bootstrap selected thread",
            preview: "Bootstrap selected thread",
            updatedAt: Math.floor(Date.now() / 1000),
            turns: [],
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-27T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-27T10:00:00.000Z",
    },
  });

  const result = await controller.runDesktopTask({
    prompt: "Write a workspace bootstrap note",
    workspaceRoot,
  });

  assert.equal(result.threadId, "thread-bootstrap-selected-1");
  assert.equal(
    await loadThreadWorkspaceRoot(CANONICAL_PROFILE_ID, "thread-bootstrap-selected-1", env),
    workspaceRoot,
  );
  assert.equal(
    await loadLastSelectedThreadId(CANONICAL_PROFILE_ID, env),
    "thread-bootstrap-selected-1",
  );
});

test("runDesktopTask blocks a chat-only run when the chosen actor cannot write artifacts", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    request: async (method) => {
      managerCalls.push(method);
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const dbPath = resolveProfileSubstrateDbPath("default", env);
  await createProductActor({
    actorId: "actor_default_observer",
    dbPath,
    displayName: "Observer",
    env,
    metadata: {
      role: "observer",
      trustLevel: "medium",
    },
  });

  await assert.rejects(
    () => controller.runDesktopTask({
      prompt: "Try to create a chat-only draft",
      runContext: {
        actor: {
          id: "actor_default_observer",
        },
      },
    }),
    /artifact\.write/,
  );

  assertManagerMethods(managerCalls, ["account/read", "model/list"]);

  const db = new DatabaseSync(dbPath);
  try {
    const policyEvents = db.prepare(
      "SELECT verb, detail, session_id FROM events WHERE subject_type = 'policy' ORDER BY rowid ASC",
    ).all().map((row) => ({ ...row }));
    assert.equal(policyEvents.length, 1);
    assert.equal(policyEvents[0].verb, "policy.block");
    assert.equal(policyEvents[0].session_id, null);
    assert.equal(JSON.parse(policyEvents[0].detail).matchedRule, "missing-capability-grant");
  } finally {
    db.close();
  }

  const bootstrap = await controller.getBootstrap();
  assert.equal(bootstrap.auditEvents[0]?.eventType, "run.policy.blocked");
});

test("runDesktopTask escalates a workspace run before engine launch when the actor is low trust", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    request: async (method) => {
      managerCalls.push(method);
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-escalated");
  await fs.mkdir(workspaceRoot, { recursive: true });
  const dbPath = resolveProfileSubstrateDbPath("default", env);
  await createProductActor({
    actorId: "actor_default_workspace_assistant",
    dbPath,
    displayName: "Workspace assistant",
    env,
    metadata: {
      capabilities: ["session.start", "workspace.use", "workspace.write"],
      role: "assistant",
      trustLevel: "low",
    },
  });

  await assert.rejects(
    () => controller.runDesktopTask({
      prompt: "Edit the workspace",
      workspaceRoot,
      runContext: {
        actor: {
          id: "actor_default_workspace_assistant",
        },
      },
    }),
    /more trusted actor|update policy/i,
  );

  assertManagerMethods(managerCalls, ["account/read", "model/list"]);

  const db = new DatabaseSync(dbPath);
  try {
    const policyEvents = db.prepare(
      "SELECT verb, detail, session_id FROM events WHERE subject_type = 'policy' ORDER BY rowid ASC",
    ).all().map((row) => ({ ...row }));
    assert.equal(policyEvents.length, 1);
    assert.equal(policyEvents[0].verb, "policy.escalate");
    assert.equal(policyEvents[0].session_id, null);
    assert.equal(JSON.parse(policyEvents[0].detail).matchedRule, "low-trust-agent-escalation");
  } finally {
    db.close();
  }

  const bootstrap = await controller.getBootstrap();
  assert.equal(bootstrap.auditEvents[0]?.eventType, "run.policy.escalated");
});

test("runDesktopTask falls back to the profile primary actor when the requested actor id is stale", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "model/list") {
        return {
          data: [
            {
              id: "gpt-5.4-mini",
              name: "GPT-5.4 Mini",
              supportedReasoningEfforts: ["medium", "high", "xhigh"],
            },
          ],
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-stale-actor-fallback",
            name: "Recovered actor run",
            preview: "Recovered actor run",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-stale-actor-fallback",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  await ensureProfileDirectories(CANONICAL_PROFILE_ID, env);
  const substrate = await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath: resolveProfileSubstrateDbPath(CANONICAL_PROFILE_ID, env),
    profileId: CANONICAL_PROFILE_ID,
  });

  const result = await controller.runDesktopTask({
    prompt: "Recover from a stale actor id",
    runContext: {
      actor: {
        id: "actor_default_deleted",
      },
    },
  });

  assert.equal(result.status, "started");
  assert.equal(result.runContext?.actor.id, substrate.actorId);
  assert.equal(managerCalls.some((entry) => entry.method === "thread/start"), true);
  assert.equal(managerCalls.some((entry) => entry.method === "turn/start"), true);
});

test("runDesktopTask keeps the active tenant scope in the live run context", async () => {
  const root = await makeTempRoot();
  const tenantRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-tenant-cloud-"));
  const env = {
    ...createTestEnv(root),
    SENSE1_TENANT_STATE_ROOT: tenantRoot,
  };
  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "model/list") {
        return {
          data: [
            {
              id: "gpt-5.4-mini",
              name: "GPT-5.4 Mini",
              supportedReasoningEfforts: ["medium", "high", "xhigh"],
            },
          ],
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-tenant-run",
            name: "Tenant run",
            preview: "Tenant run",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-tenant-run",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  await createTenant({
    tenantId: "cro-submissions",
    displayName: "CRO Submissions",
    env,
    now: "2026-04-08T09:00:00.000Z",
  });
  await addTenantMember({
    tenantId: "cro-submissions",
    email: "george@example.com",
    role: "admin",
    displayName: "George",
    env,
    now: "2026-04-08T09:01:00.000Z",
  });

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-04-08T09:02:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.4.1",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-04-08T09:02:00.000Z",
    },
  });

  const result = await controller.runDesktopTask({
    prompt: "Start a team run",
  });

  assert.equal(result.status, "started");
  assert.equal(result.runContext?.scope.kind, "team");
  assert.equal(result.runContext?.scope.id, "scope_cro-submissions_team");
  assert.equal(result.runContext?.scope.tenantId, "cro-submissions");
  assert.equal(result.runContext?.actor.id, "actor_cro_submissions_george_example_com");
  assert.equal(result.runContext?.actor.role, "admin");
  assert.equal(result.runContext?.actor.trustLevel, "high");
  assert.equal(result.runContext?.actor.capabilities?.includes("scope.cross"), true);
  assert.equal(managerCalls.some((entry) => entry.method === "thread/start"), true);
});

test("runDesktopTask requests permission before switching a folder-bound chat into another folder", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const workspaceRoot = path.join(root, "workspace-approval-source");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);

  const manager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    start: async () => {},
    respond(requestId, payload) {
      throw new Error(`Unexpected approval response ${requestId}: ${JSON.stringify(payload)}`);
    },
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const result = await controller.runDesktopTask({
    prompt: "Write a file to /tmp/sense1-approval-check.txt",
    workspaceRoot,
  });

  assert.equal(result.status, "permissionRequired");
  assert.equal(result.threadId, null);
  assert.equal(result.turnId, null);
  assert.deepEqual(result.permissionRequest, {
    displayName: "tmp",
    rootPath: "/tmp",
  });
  assert.equal(managerCalls.some((entry) => entry.method === "thread/start"), false);
  assert.equal(managerCalls.some((entry) => entry.method === "turn/start"), false);

  const bootstrap = await controller.getBootstrap();
  assert.equal(bootstrap.pendingApprovals.length, 0);
  assert.equal(await loadLastSelectedThreadId(CANONICAL_PROFILE_ID, env), null);
});

test("runDesktopTask resolves native shortcut mentions before starting the turn", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const workspaceRoot = path.join(root, "workspace-shortcuts");
  const managerCalls = [];
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);

  const manager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    request: async (method, params) => {
      managerCalls.push({ method, params });

      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          authMode: "chatgpt",
          requiresOpenaiAuth: false,
        };
      }

      if (method === "model/list") {
        return {
          data: [
            {
              id: "gpt-5.4-mini",
              supportedReasoningEfforts: ["minimal", "low", "medium", "high", "xhigh"],
            },
          ],
        };
      }

      if (method === "config/read") {
        return {
          config: {
            apps: {
              linear: {
                enabled: true,
              },
            },
          },
        };
      }

      if (method === "plugin/list") {
        return {
          marketplaces: [
            {
              plugins: [
                {
                  id: "gmail",
                  installed: true,
                  interface: {
                    displayName: "Gmail",
                  },
                },
              ],
            },
          ],
        };
      }

      if (method === "app/list") {
        return {
          data: [
            {
              id: "linear",
              name: "Linear",
              isAccessible: true,
              isEnabled: true,
            },
          ],
        };
      }

      if (method === "mcpServerStatus/list") {
        return {
          data: [],
        };
      }

      if (method === "skills/list") {
        return {
          data: [
            {
              cwd: workspaceRoot,
              skills: [
                {
                  name: "autopilot",
                  path: "/Users/georgestander/.codex/skills/autopilot/SKILL.md",
                  enabled: true,
                },
                {
                  name: "gmail:gmail",
                  path: "/Users/georgestander/.codex/plugins/gmail/skills/gmail/SKILL.md",
                  enabled: true,
                },
              ],
            },
          ],
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-shortcut-resolution-1",
            name: "Shortcut resolution",
            preview: "Shortcut resolution",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: [],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-shortcut-resolution-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    start: async () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const result = await controller.runDesktopTask({
    prompt: "Use $autopilot to ask $gmail about inbox items and sync $linear.",
    workspaceRoot,
  });

  assert.equal(result.status, "started");

  const turnStart = managerCalls.find((entry) => entry.method === "turn/start");
  assert.deepEqual(turnStart?.params.input, [
    {
      type: "mention",
      name: "autopilot",
      path: "/Users/georgestander/.codex/skills/autopilot/SKILL.md",
    },
    {
      type: "mention",
      name: "gmail:gmail",
      path: "/Users/georgestander/.codex/plugins/gmail/skills/gmail/SKILL.md",
    },
    {
      type: "mention",
      name: "Linear",
      path: "app://linear",
    },
    {
      type: "text",
      text: "Use $autopilot to ask $gmail about inbox items and sync $linear.",
    },
  ]);
});

test("runDesktopTask routes profile-global creator shortcuts through profile codex home even when folder-bound", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const workspaceRoot = path.join(root, "workspace-profile-global-shortcuts");
  const managerCalls = [];
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  const profileCodexHome = resolveProfileCodexHome(CANONICAL_PROFILE_ID, env);

  const manager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    request: async (method, params) => {
      managerCalls.push({ method, params });

      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          authMode: "chatgpt",
          requiresOpenaiAuth: false,
        };
      }

      if (method === "model/list") {
        return {
          data: [
            {
              id: "gpt-5.4-mini",
              supportedReasoningEfforts: ["minimal", "low", "medium", "high", "xhigh"],
            },
          ],
        };
      }

      if (method === "config/read") {
        return { config: {} };
      }

      if (method === "plugin/list") {
        return { marketplaces: [] };
      }

      if (method === "app/list") {
        return { data: [] };
      }

      if (method === "mcpServerStatus/list") {
        return { data: [] };
      }

      if (method === "skills/list") {
        return {
          data: [
            {
              cwd: profileCodexHome,
              skills: [
                {
                  name: "plugin-creator",
                  path: "/Users/georgestander/.codex/skills/.system/plugin-creator/SKILL.md",
                  enabled: true,
                },
                {
                  name: "skill-creator",
                  path: "/Users/georgestander/.codex/skills/.system/skill-creator/SKILL.md",
                  enabled: true,
                },
              ],
            },
          ],
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-profile-global-shortcuts-1",
            name: "Profile global shortcuts",
            preview: "Profile global shortcuts",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: [],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-profile-global-shortcuts-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    start: async () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const result = await controller.runDesktopTask({
    prompt: "Use $plugin-creator to scaffold a plugin, then ask $skill-creator to add a helper skill.",
    workspaceRoot,
  });

  assert.equal(result.status, "started");

  const threadStart = managerCalls.find((entry) => entry.method === "thread/start");
  const turnStart = managerCalls.find((entry) => entry.method === "turn/start");
  const developerInstructions =
    threadStart?.params.developerInstructions
    ?? threadStart?.params.config?.developer_instructions
    ?? "";
  assert.equal(await fs.realpath(turnStart?.params.cwd), await fs.realpath(profileCodexHome));
  assert.match(
    developerInstructions,
    new RegExp(profileCodexHome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  assert.match(developerInstructions, /profile plugin/u);
  assert.match(developerInstructions, /profile CODEX_HOME/u);
  assert.match(developerInstructions, /create_basic_plugin\.py/u);
  assert.match(developerInstructions, /Do not stop at a TODO-only template/u);
});

test("runDesktopTask falls back to plain text when shortcut overview lookup fails", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const workspaceRoot = path.join(root, "workspace-shortcut-fallback");
  const managerCalls = [];
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);

  const manager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    request: async (method, params) => {
      managerCalls.push({ method, params });

      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          authMode: "chatgpt",
          requiresOpenaiAuth: false,
        };
      }

      if (method === "model/list") {
        return {
          data: [
            {
              id: "gpt-5.4-mini",
              supportedReasoningEfforts: ["minimal", "low", "medium", "high", "xhigh"],
            },
          ],
        };
      }

      if (method === "config/read") {
        return {
          config: {},
        };
      }

      if (method === "plugin/list") {
        throw new Error("plugin list unavailable");
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-shortcut-fallback-1",
            name: "Shortcut fallback",
            preview: "Shortcut fallback",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: [],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-shortcut-fallback-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    start: async () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const result = await controller.runDesktopTask({
    prompt: "Explain how shell lookup uses $PATH before writing anything.",
    workspaceRoot,
  });

  assert.equal(result.status, "started");

  const turnStart = managerCalls.find((entry) => entry.method === "turn/start");
  assert.deepEqual(turnStart?.params.input, [
    {
      type: "text",
      text: "Explain how shell lookup uses $PATH before writing anything.",
    },
  ]);
});

test("runDesktopTask sends vague folder-bound requests straight to the runtime instead of synthetic clarification", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const workspaceRoot = path.join(root, "workspace-clarification");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  const dbPath = resolveProfileSubstrateDbPath("default", env);
  await ensureProfileDirectories("default", env);
  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId: "default",
  });
  await upsertWorkspacePolicy({
    contextPaths: [
      path.join(workspaceRoot, "data", "inverter-readings.csv"),
      path.join(workspaceRoot, "reports", "inverter-summary.xlsx"),
    ],
    dbPath,
    knownStructure: [
      {
        name: "data",
        path: path.join(workspaceRoot, "data"),
        type: "directory",
      },
      {
        name: "reports",
        path: path.join(workspaceRoot, "reports"),
        type: "directory",
      },
      {
        name: "inverter-readings.csv",
        path: path.join(workspaceRoot, "data", "inverter-readings.csv"),
        type: "file",
      },
      {
        name: "inverter-summary.xlsx",
        path: path.join(workspaceRoot, "reports", "inverter-summary.xlsx"),
        type: "file",
      },
    ],
    readGranted: true,
    readGrantedAt: "2026-03-24T09:59:00.000Z",
    workspaceRoot,
  });

  const manager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-clarification-1",
            name: "Clarification thread",
            preview: "Clarification thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: [],
            },
          },
        };
      }

      if (method === "thread/resume") {
        return {
          thread: {
            id: "thread-clarification-1",
            name: "Clarification thread",
            preview: "Clarification thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: [],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-clarification-started-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    respond() {
      throw new Error("This test should not proxy through manager.respond.");
    },
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const clarificationResult = await controller.runDesktopTask({
    prompt: "Fix this",
    workspaceRoot,
  });

  assert.equal(clarificationResult.status, "started");
  assert.equal(clarificationResult.threadId, "thread-clarification-1");
  assert.equal(clarificationResult.turnId, "turn-clarification-started-1");
  assertManagerMethods(managerCalls, ["account/read", "model/list", "thread/start", "turn/start"],);
  assert.equal(
    await loadThreadWorkspaceRoot("default", "thread-clarification-1", env),
    workspaceRoot,
  );
});

test("runDesktopTask no longer hydrates workspace structure just to synthesize clarification prompts", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const workspaceRoot = path.join(root, "workspace-clarification-hydrate");
  await fs.mkdir(workspaceRoot, { recursive: true });
  const dbPath = resolveProfileSubstrateDbPath("default", env);
  await ensureProfileDirectories("default", env);
  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId: "default",
  });
  await upsertWorkspacePolicy({
    dbPath,
    readGranted: true,
    readGrantedAt: "2026-03-24T09:00:00.000Z",
    workspaceRoot,
  });

  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "fs/readDirectory") {
        return {
          entries: [
            {
              name: "data",
              path: path.join(workspaceRoot, "data"),
              type: "directory",
              children: [
                {
                  name: "daily.csv",
                  path: path.join(workspaceRoot, "data", "daily.csv"),
                  type: "file",
                },
              ],
            },
            {
              name: "reports",
              path: path.join(workspaceRoot, "reports"),
              type: "directory",
              children: [
                {
                  name: "weekly.xlsx",
                  path: path.join(workspaceRoot, "reports", "weekly.xlsx"),
                  type: "file",
                },
              ],
            },
          ],
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-clarification-hydrate-1",
            name: "Clarification hydrate thread",
            preview: "Clarification hydrate thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: [],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-clarification-hydrate-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const result = await controller.runDesktopTask({
    prompt: "Build a dashboard in this workspace.",
    workspaceRoot,
  });

  assert.equal(result.status, "started");
  assert.equal(result.permissionRequest, null);
  assertManagerMethods(managerCalls, ["account/read", "model/list", "thread/start", "turn/start"],);

  const policy = await loadWorkspacePolicy({
    dbPath,
    workspaceRoot,
  });
  assert.equal(policy.read_granted, 1);
  assert.equal(policy.last_hydrated_at, null);
  assert.deepEqual(policy.context_paths, []);
});

test("runDesktopTask creates a visible per-session artifact directory for a new chat-only thread", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-chat-1",
            name: "Chat only thread",
            preview: "Chat only thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-chat-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const result = await controller.runDesktopTask({
    prompt: "Keep notes for this chat",
  });

  assert.equal(result.threadId, "thread-chat-1");
  assert.equal(result.turnId, "turn-chat-1");
  assert.equal(result.workspaceRoot, null);
  assert.ok(result.cwd);
  assert.match(result.cwd, /visible-artifacts\/sessions\/sess_/);
  await assert.doesNotReject(fs.access(result.cwd));

  const artifactRoot = await loadProfileArtifactRoot("default", env);
  assert.equal(artifactRoot, path.join(root, "visible-artifacts"));

  const profileDbPath = resolveProfileSubstrateDbPath("default", env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-chat-1",
    dbPath: profileDbPath,
  });
  assert.ok(session);
  assert.equal(session.workspace_id, null);
  assert.deepEqual(session.metadata, {
    artifactRoot: result.cwd,
  });
  const sessionRecord = await readSessionRecord({
    artifactRoot,
    sessionId: session.id,
  });
  assert.deepEqual(sessionRecord, {
    schema_version: 1,
    id: session.id,
    started_at: session.started_at,
    ended_at: null,
    intent: "Keep notes for this chat",
    workspace_root: null,
    paths_read: [],
    paths_written: [],
    outcomes: [],
    log_cursor: {
      from_ts: session.started_at,
      to_ts: null,
    },
  });

  const db = new DatabaseSync(profileDbPath);
  try {
    const workspaceCount = db.prepare("SELECT COUNT(*) AS count FROM workspaces").get();
    assert.equal(workspaceCount.count, 0);
  } finally {
    db.close();
  }

  assertManagerMethods(managerCalls, ["account/read", "model/list", "thread/start", "turn/start"],);
  const nonAuthManagerCalls = managerCalls.filter((entry) => entry.method !== "account/read");
  assert.equal(nonAuthManagerCalls[1].params.cwd, result.cwd);
  assert.equal(nonAuthManagerCalls[2].params.cwd, await fs.realpath(result.cwd));

  const bootstrap = await controller.getBootstrap();
  assert.equal(bootstrap.auditEvents[0]?.eventType, "run.started");
  assert.equal(bootstrap.auditEvents[0]?.details.executionIntent, "lightweightConversation");
  assert.equal(bootstrap.auditEvents[0]?.details.executionIntentRule, "chat-default");
});

test("runDesktopTask gates the first concrete execution-intent workspace request before starting a turn", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const workspaceRoot = path.join(root, "robotics-workspace");
  await fs.mkdir(workspaceRoot, { recursive: true });
  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-first-plan-1",
            name: "First plan thread",
            preview: "First plan thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: [],
            },
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    handleProfileChange: async () => {},
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const result = await controller.runDesktopTask({
    prompt: "Create a single static landing page in this empty workspace for a robotics startup. Use plain HTML and CSS. One page only.",
    workspaceRoot,
  });

  assert.equal(result.status, "permissionRequired");
  assert.equal(result.threadId, null);
  assert.equal(result.turnId, null);
  assert.deepEqual(result.permissionRequest, {
    displayName: path.basename(workspaceRoot),
    rootPath: workspaceRoot,
  });
  const managerMethods = managerCalls.map((entry) => entry.method);
  assert.ok(managerMethods.includes("account/read"));
  assert.ok(!managerMethods.includes("thread/start"));
  assert.ok(!managerMethods.includes("turn/start"));
});

test("runDesktopTask does not block workspace execution behind legacy write mode", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const workspaceRoot = path.join(root, "workspace-conversation-mode");
  await fs.mkdir(workspaceRoot, { recursive: true });
  const dbPath = resolveProfileSubstrateDbPath("default", env);
  await ensureProfileDirectories("default", env);
  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId: "default",
  });
  await upsertWorkspacePolicy({
    dbPath,
    readGranted: true,
    workspaceRoot,
    writeMode: "conversation",
  });

  const managerCalls = [];
  const manager = {
    request: async (method, params) => {
      managerCalls.push({ method, params });
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-conversation-mode-1",
            name: "Conversation mode thread",
            preview: "Conversation mode thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: [],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-conversation-mode-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    respond: () => {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const result = await controller.runDesktopTask({
    prompt: "Build a landing page in this workspace.",
    workspaceRoot,
  });

  assert.equal(result.status, "started");
  assert.equal(result.threadId, "thread-conversation-mode-1");
  assert.equal(result.turnId, "turn-conversation-mode-1");
  assert.equal(result.thread.interactionState, "conversation");
  const managerMethods = managerCalls.map((entry) => entry.method);
  assert.ok(managerMethods.includes("thread/start"));
  assert.ok(managerMethods.includes("turn/start"));

  const session = await getSubstrateSessionByThreadId({
    codexThreadId: result.threadId,
    dbPath,
  });
  assert.ok(session);
});

test("approval request and resolution write substrate approval events for the linked session", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const manager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-approval-1",
            name: "Approval thread",
            preview: "Approval thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-approval-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    respondCalls: [],
    respond(requestId, payload) {
      this.respondCalls.push({ requestId, payload });
    },
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  await controller.runDesktopTask({
    prompt: "Wait for approval",
  });

  controller.ingestRuntimeEvent({
    kind: "approvalRequested",
    approval: makeApproval(201, "thread-approval-1"),
  });
  await controller.respondToDesktopApproval({
    decision: "accept",
    requestId: 201,
  });
  controller.ingestRuntimeEvent({
    kind: "approvalResolved",
    requestId: 201,
  });
  await flushSubstrateWrites();
  await flushSubstrateWrites();
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.deepEqual(manager.respondCalls, [
    {
      requestId: 201,
      payload: "accept",
    },
  ]);

  const db = new DatabaseSync(resolveProfileSubstrateDbPath(CANONICAL_PROFILE_ID, env));
  try {
    const approvalEvents = db.prepare(
      "SELECT verb, before_state, after_state, detail, session_id, subject_id FROM events WHERE subject_type = 'approval' ORDER BY rowid ASC",
    ).all().map((row) => ({ ...row }));
    assert.equal(approvalEvents.length, 2);
    assert.equal(approvalEvents[0].verb, "approval.requested");
    assert.equal(approvalEvents[0].subject_id, "201");
    assert.deepEqual(JSON.parse(approvalEvents[0].after_state), {
      status: "requested",
    });
    assert.equal(JSON.parse(approvalEvents[0].detail).requestId, 201);

    assert.equal(approvalEvents[1].verb, "approval.granted");
    assert.deepEqual(JSON.parse(approvalEvents[1].before_state), {
      status: "requested",
    });
    assert.deepEqual(JSON.parse(approvalEvents[1].after_state), {
      status: "accepted",
    });
    assert.equal(JSON.parse(approvalEvents[1].detail).decision, "accept");
    assert.equal(approvalEvents[0].session_id, approvalEvents[1].session_id);
  } finally {
    db.close();
  }
});

test("respondToDesktopApproval forwards acceptForSession with session scope for runtime approvals", async () => {
  const manager = {
    respondCalls: [],
    respond(requestId, payload) {
      this.respondCalls.push({ requestId, payload });
    },
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env: createTestEnv(await makeTempRoot()),
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  controller.ingestRuntimeEvent({
    kind: "approvalRequested",
    approval: makeApproval(401, "thread-approval-session", {
      command: [],
      cwd: null,
      grantRoot: null,
      kind: "network",
      permissions: {
        network: {
          enabled: true,
        },
      },
      reason: "Network access required.",
    }),
  });

  await controller.respondToDesktopApproval({
    decision: "acceptForSession",
    requestId: 401,
  });

  assert.deepEqual(manager.respondCalls, [
    {
      requestId: 401,
      payload: {
        permissions: {
          network: {
            enabled: true,
          },
        },
        scope: "session",
      },
    },
  ]);
});

test("runtime approvals stay pending until the user responds", async () => {
  const manager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respondCalls: [],
    respond(requestId, payload) {
      this.respondCalls.push({ requestId, payload });
    },
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env: createTestEnv(await makeTempRoot()),
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  controller.ingestRuntimeEvent({
    kind: "approvalRequested",
    approval: makeApproval(402, "thread-approval-pending"),
  });
  await flushSubstrateWrites();

  const bootstrap = await controller.getBootstrap();
  assert.equal(manager.respondCalls.length, 0);
  assert.equal(bootstrap.pendingApprovals.length, 1);
  assert.equal(bootstrap.pendingApprovals[0]?.id, 402);
});

test("acceptForSession trust does not carry into a new controller session", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const firstManager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respondCalls: [],
    respond(requestId, payload) {
      this.respondCalls.push({ requestId, payload });
    },
  };

  const firstController = new DesktopSessionController(firstManager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  firstController.ingestRuntimeEvent({
    kind: "approvalRequested",
    approval: makeApproval(403, "thread-approval-session-a", {
      kind: "network",
      permissions: {
        network: {
          enabled: true,
        },
      },
    }),
  });
  await firstController.respondToDesktopApproval({
    decision: "acceptForSession",
    requestId: 403,
  });

  assert.deepEqual(firstManager.respondCalls, [
    {
      requestId: 403,
      payload: {
        permissions: {
          network: {
            enabled: true,
          },
        },
        scope: "session",
      },
    },
  ]);

  const secondManager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    respondCalls: [],
    respond(requestId, payload) {
      this.respondCalls.push({ requestId, payload });
    },
  };

  const secondController = new DesktopSessionController(secondManager, {
    appStartedAt: "2026-03-24T10:10:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:10:00.000Z",
    },
  });

  secondController.ingestRuntimeEvent({
    kind: "approvalRequested",
    approval: makeApproval(404, "thread-approval-session-b", {
      kind: "network",
      permissions: {
        network: {
          enabled: true,
        },
      },
    }),
  });
  await flushSubstrateWrites();

  const bootstrap = await secondController.getBootstrap();
  assert.equal(secondManager.respondCalls.length, 0);
  assert.equal(bootstrap.pendingApprovals.length, 1);
  assert.equal(bootstrap.pendingApprovals[0]?.id, 404);
});

test("acceptForSession resolutions log approval.trusted for the linked session", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const manager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-approval-trusted-1",
            name: "Approval trusted thread",
            preview: "Approval trusted thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-approval-trusted-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    respondCalls: [],
    respond(requestId, payload) {
      this.respondCalls.push({ requestId, payload });
    },
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  await controller.runDesktopTask({
    prompt: "Allow this session to use the network",
  });

  controller.ingestRuntimeEvent({
    kind: "approvalRequested",
    approval: makeApproval(405, "thread-approval-trusted-1", {
      command: [],
      cwd: null,
      grantRoot: null,
      kind: "network",
      permissions: {
        network: {
          enabled: true,
        },
      },
      reason: "Network access required.",
    }),
  });
  await controller.respondToDesktopApproval({
    decision: "acceptForSession",
    requestId: 405,
  });
  controller.ingestRuntimeEvent({
    kind: "approvalResolved",
    requestId: 405,
  });
  await flushSubstrateWrites();
  await flushSubstrateWrites();
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.deepEqual(manager.respondCalls, [
    {
      requestId: 405,
      payload: {
        permissions: {
          network: {
            enabled: true,
          },
        },
        scope: "session",
      },
    },
  ]);

  const db = new DatabaseSync(resolveProfileSubstrateDbPath(CANONICAL_PROFILE_ID, env));
  try {
    const approvalEvents = db.prepare(
      "SELECT verb, before_state, after_state, detail FROM events WHERE subject_type = 'approval' AND subject_id = '405' ORDER BY rowid ASC",
    ).all().map((row) => ({ ...row }));
    assert.equal(approvalEvents.length, 2);
    assert.equal(approvalEvents[0].verb, "approval.requested");
    assert.equal(approvalEvents[1].verb, "approval.trusted");
    assert.deepEqual(JSON.parse(approvalEvents[1].before_state), {
      status: "requested",
    });
    assert.deepEqual(JSON.parse(approvalEvents[1].after_state), {
      status: "trusted",
    });
    assert.equal(JSON.parse(approvalEvents[1].detail).decision, "acceptForSession");
  } finally {
    db.close();
  }
});

test("duplicate approvalResolved notifications are ignored after the cached decision is consumed", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const manager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-approval-duplicate-1",
            name: "Duplicate approval thread",
            preview: "Duplicate approval thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-approval-duplicate-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    respondCalls: [],
    respond(requestId, payload) {
      this.respondCalls.push({ requestId, payload });
    },
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  await controller.runDesktopTask({
    prompt: "Approve this once.",
  });

  controller.ingestRuntimeEvent({
    kind: "approvalRequested",
    approval: makeApproval(406, "thread-approval-duplicate-1"),
  });
  await controller.respondToDesktopApproval({
    decision: "accept",
    requestId: 406,
  });
  controller.ingestRuntimeEvent({
    kind: "approvalResolved",
    requestId: 406,
  });
  controller.ingestRuntimeEvent({
    kind: "approvalResolved",
    requestId: 406,
  });
  await flushSubstrateWrites();
  await flushSubstrateWrites();
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.deepEqual(manager.respondCalls, [
    {
      requestId: 406,
      payload: "accept",
    },
  ]);

  const bootstrap = await controller.getBootstrap();
  const approvalAuditEvents = bootstrap.auditEvents.filter((event) => event.eventType === "run.approval.resolved");
  assert.equal(approvalAuditEvents.length, 1);
  assert.equal(approvalAuditEvents[0]?.details.requestId, 406);
  assert.equal(approvalAuditEvents[0]?.details.decision, "accept");

  const db = new DatabaseSync(resolveProfileSubstrateDbPath(CANONICAL_PROFILE_ID, env));
  try {
    const approvalEvents = db.prepare(
      "SELECT verb, before_state, after_state, detail FROM events WHERE subject_type = 'approval' AND subject_id = '406' ORDER BY rowid ASC",
    ).all().map((row) => ({ ...row }));
    assert.equal(approvalEvents.length, 2);
    assert.equal(approvalEvents[0].verb, "approval.requested");
    assert.equal(approvalEvents[1].verb, "approval.granted");
    assert.deepEqual(JSON.parse(approvalEvents[1].before_state), {
      status: "requested",
    });
    assert.deepEqual(JSON.parse(approvalEvents[1].after_state), {
      status: "accepted",
    });
    assert.equal(JSON.parse(approvalEvents[1].detail).decision, "accept");
  } finally {
    db.close();
  }
});

test("readDesktopThread restores structured question choices without flattening them away", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);

  const manager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-question-structured-1",
            name: "Question thread",
            preview: "Question thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-question-structured-1",
          },
        };
      }

      if (method === "thread/read") {
        return {
          thread: {
            id: "thread-question-structured-1",
            name: "Question thread",
            preview: "Question thread",
            turns: [],
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    respond() {},
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-question-structured");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Ask a clarifying question",
    workspaceRoot,
  });
  controller.ingestRuntimeMessage({
    id: 502,
    method: "tool/requestUserInput",
    params: {
      threadId: "thread-question-structured-1",
      turnId: "turn-question-structured-1",
      questions: [
        {
          header: "Environment",
          question: "Which environment should I use?",
          isOther: true,
          choices: [
            { label: "Staging", description: "Use the staging environment." },
            { label: "Production", description: "Use the production environment." },
          ],
        },
      ],
    },
  });
  await flushSubstrateWrites();

  const readResult = await controller.readDesktopThread("thread-question-structured-1");
  assert.deepEqual(readResult.thread?.inputRequestState, {
    requestId: 502,
    prompt: "Environment: Which environment should I use?\n   1. Staging\n   2. Production\n   Other: allowed",
    threadId: "thread-question-structured-1",
    questions: [
      {
        id: null,
        header: "Environment",
        question: "Which environment should I use?",
        isOther: true,
        choices: [
          { label: "Staging", description: "Use the staging environment.", value: "Staging" },
          { label: "Production", description: "Use the production environment.", value: "Production" },
        ],
      },
    ],
  });
});

test("readDesktopThread restores a pending question from substrate and responding persists the answer linkage", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const manager = {
    handleProfileChange: async () => {},
    off: () => {},
    on: () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
          },
        };
      }

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-question-1",
            name: "Question thread",
            preview: "Question thread",
            updatedAt: Math.floor(Date.now() / 1000),
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-question-1",
          },
        };
      }

      if (method === "thread/read") {
        return {
          thread: {
            id: "thread-question-1",
            name: "Question thread",
            preview: "Question thread",
            turns: [],
            status: {
              type: "active",
              activeFlags: ["running"],
            },
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
    respondCalls: [],
    respond(requestId, payload) {
      this.respondCalls.push({ requestId, payload });
    },
  };

  const controller = new DesktopSessionController(manager, {
    appStartedAt: "2026-03-24T10:00:00.000Z",
    env,
    openExternal: async () => {},
    runtimeInfo: {
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  const workspaceRoot = path.join(root, "workspace-question");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await grantWorkspaceReadPermission(env, workspaceRoot);
  await controller.runDesktopTask({
    prompt: "Ask a clarifying question",
    workspaceRoot,
  });
  controller.ingestRuntimeMessage({
    method: "turn/plan/updated",
    params: {
      threadId: "thread-question-1",
      turnId: "turn-question-1",
      text: "1. Clarify environment\n2. Continue",
    },
  });
  controller.ingestRuntimeMessage({
    id: 501,
    method: "tool/requestUserInput",
    params: {
      threadId: "thread-question-1",
      turnId: "turn-question-1",
      prompt: "Which environment should I use?",
      questions: [
        {
          header: "Environment",
          question: "Which environment should I use?",
          isOther: true,
          choices: [
            { label: "Staging", description: "Use the staging environment." },
            { label: "Production", description: "Use the production environment." },
          ],
        },
      ],
    },
  });
  await flushSubstrateWrites();

  const readResult = await controller.readDesktopThread("thread-question-1");
  assert.deepEqual(readResult.thread?.inputRequestState, {
    requestId: 501,
    prompt: "Which environment should I use?",
    threadId: "thread-question-1",
    questions: [
      {
        id: null,
        header: "Environment",
        question: "Which environment should I use?",
        isOther: true,
        choices: [
          { label: "Staging", description: "Use the staging environment.", value: "Staging" },
          { label: "Production", description: "Use the production environment.", value: "Production" },
        ],
      },
    ],
  });

  await controller.respondToInputRequest({
    requestId: 501,
    text: "Use staging",
  });

  assert.deepEqual(manager.respondCalls, [
    {
      requestId: 501,
      payload: { text: "Use staging" },
    },
  ]);

  const db = new DatabaseSync(resolveProfileSubstrateDbPath(CANONICAL_PROFILE_ID, env));
  try {
    const question = db.prepare(
      "SELECT request_id, prompt, status, answer_text, target_kind, target_id, target_snapshot, session_id FROM questions ORDER BY rowid DESC LIMIT 1",
    ).get();
    assert.equal(question.request_id, 501);
    assert.equal(question.prompt, "Which environment should I use?");
    assert.equal(question.status, "answered");
    assert.equal(question.answer_text, "Use staging");
    assert.equal(question.target_kind, "pending_run");
    assert.ok(question.target_id);
    assert.deepEqual(JSON.parse(question.target_snapshot), {
      sessionId: question.session_id,
      threadId: "thread-question-1",
      turnId: "turn-question-1",
    });

    const questionEvents = db.prepare(
      "SELECT verb, detail FROM events WHERE subject_type = 'question' ORDER BY rowid ASC",
    ).all().map((row) => ({ ...row }));
    assert.equal(questionEvents.length, 2);
    assert.equal(questionEvents[0].verb, "question.asked");
    assert.equal(questionEvents[1].verb, "question.answered");
    assert.equal(JSON.parse(questionEvents[1].detail).targetKind, "pending_run");
    assert.equal(JSON.parse(questionEvents[1].detail).answerText, "Use staging");
  } finally {
    db.close();
  }

  const reread = await controller.readDesktopThread("thread-question-1");
  assert.equal(reread.thread?.inputRequestState, null);
});
