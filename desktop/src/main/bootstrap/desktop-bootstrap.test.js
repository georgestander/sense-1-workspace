import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

import {
  getDesktopBootstrap,
  normalizeRecentThreads,
  resolveDesktopProfile,
  resolveThreadWorkspaceRoot,
  selectDesktopProfile,
} from "./desktop-bootstrap.js";
import { buildProfileOptions } from "./bootstrap-profile.js";
import {
  DEFAULT_PROFILE_ID,
  ensureProfileDirectories,
  loadThreadWorkspaceRoot,
  loadLastSelectedThreadId,
  loadWorkspaceSidebarOrder,
  persistActiveProfileId,
  persistLastSelectedThreadId,
  rememberRecentWorkspaceFolder,
  rememberWorkspaceSidebarOrder,
  rememberThreadWorkspaceRoot,
  resolveProfileSubstrateDbPath,
} from "../profile/profile-state.js";
import { listDesktopPolicyCapabilities } from "../settings/policy.js";
import {
  ensureProfileSubstrate,
  ensureSubstrateSessionForThread,
  rememberSubstrateWorkspace,
  resolveDefaultScopeId,
  resolvePrimaryActorId,
} from "../substrate/substrate.js";
import {
  addTenantMember,
  createTenant,
} from "../tenant/tenant-state.ts";

function createTestEnv(runtimeRoot, tenantRoot = null) {
  return {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
    ...(tenantRoot ? { SENSE1_TENANT_STATE_ROOT: tenantRoot } : {}),
  };
}

const OWNER_CAPABILITIES = listDesktopPolicyCapabilities();
const CANONICAL_PROFILE_ID = DEFAULT_PROFILE_ID;

test("normalizeRecentThreads maps thread/list payloads to desktop summaries", () => {
  const summary = normalizeRecentThreads({
    data: [
      {
        id: "thread-1",
        title: "Plan weekly sprint",
        subtitle: "Workspace: /Users/example/project",
        status: "running",
        updated_at: "2026-03-19T10:00:00.000Z",
      },
      {
        id: "thread-2",
        title: "Older thread",
        updated_at: "2026-03-19T09:00:00.000Z",
      },
    ],
  });

  assert.equal(summary.length, 2);
  assert.deepEqual(summary[0], {
    id: "thread-1",
    title: "Plan weekly sprint",
    subtitle: "Workspace: /Users/example/project",
    state: "running",
    interactionState: "conversation",
    updatedAt: "2026-03-19T10:00:00.000Z",
    workspaceRoot: null,
  });
  assert.equal(summary[1].id, "thread-2");
  assert.equal(summary[1].title, "Older thread");
  assert.equal(summary[1].subtitle, "Sense-1 thread");
  assert.equal(summary[1].state, "idle");
  assert.equal(summary[1].interactionState, "conversation");
  assert.equal(summary[1].updatedAt, "2026-03-19T09:00:00.000Z");
});

test("normalizeRecentThreads only trusts persisted workspace bindings for workspace roots", () => {
  const summary = normalizeRecentThreads(
    {
      data: [
        {
          id: "thread-with-persisted-root",
          title: "Folder task",
          workspace_root: "/Users/georgestander/dev/tools/sense-1",
          workspace_root_name: "sense-1",
          updated_at: "2026-03-19T10:00:00.000Z",
        },
        {
          id: "thread-with-raw-root-only",
          title: "Chat task",
          workspace_root: "/Users/georgestander/dev/tools/sense-1",
          updated_at: "2026-03-19T09:00:00.000Z",
        },
      ],
    },
    {
      "thread-with-persisted-root": "/tmp/approved-workspace",
    },
  );

  assert.equal(summary[0].workspaceRoot, "/tmp/approved-workspace");
  assert.equal(summary[1].workspaceRoot, null);
  assert.equal(summary[0].subtitle, "sense-1");
  assert.equal(summary[1].subtitle, "Sense-1 thread");
});

test("getDesktopBootstrap sorts recent threads newest first even if thread/list is unsorted", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);
  await selectDesktopProfile("ops-team", env);

  const manager = {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          requiresOpenaiAuth: false,
        };
      }

      if (method === "thread/list") {
        return {
          data: [
            {
              id: "thread-older",
              title: "Older thread",
              updated_at: "2026-03-19T09:00:00.000Z",
            },
            {
              id: "thread-newer",
              title: "Newer thread",
              updated_at: "2026-03-19T11:00:00.000Z",
            },
          ],
        };
      }

      if (method === "thread/loaded/list") {
        return { data: [] };
      }

      if (method === "thread/read") {
        assert.deepEqual(params, { threadId: "thread-selected", includeTurns: true });
        return {
          thread: {
            id: "thread-selected",
            name: "Selected thread",
            preview: "Selected thread preview",
            updatedAt: 1_742_367_200,
            turns: [],
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.deepEqual(
    bootstrap.recentThreads.map((thread) => thread.id),
    ["thread-newer", "thread-older"],
  );
});

test("getDesktopBootstrap prefers the remembered thread when recents have identical timestamps", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);
  await selectDesktopProfile("ops-team", env);
  await persistLastSelectedThreadId("ops-team", "thread-selected", env);

  const manager = {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          requiresOpenaiAuth: false,
        };
      }

      if (method === "thread/list") {
        return {
          data: [
            {
              id: "thread-other",
              title: "Untitled thread",
              updated_at: "2026-03-19T10:00:00.000Z",
            },
            {
              id: "thread-selected",
              title: "Untitled thread",
              updated_at: "2026-03-19T10:00:00.000Z",
            },
          ],
        };
      }

      if (method === "thread/loaded/list") {
        return { data: [] };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.deepEqual(
    bootstrap.recentThreads.map((thread) => thread.id),
    ["thread-selected", "thread-other"],
  );
  assert.equal(bootstrap.lastSelectedThreadId, "thread-selected");
});

test("getDesktopBootstrap restores the active tenant context into the bootstrap run context", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const tenantRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-tenant-cloud-"));
  const env = {
    ...createTestEnv(runtimeRoot),
    SENSE1_TENANT_STATE_ROOT: tenantRoot,
  };
  await selectDesktopProfile("ops-team", env);
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

  const manager = {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          requiresOpenaiAuth: false,
        };
      }

      if (method === "thread/list" || method === "thread/loaded/list") {
        return { data: [] };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-04-08T09:02:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.4.1",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.deepEqual(bootstrap.tenant, {
    id: "cro-submissions",
    displayName: "CRO Submissions",
    role: "admin",
    scopeId: "scope_cro-submissions_team",
    scopeDisplayName: "CRO Submissions team",
    actorId: "actor_cro_submissions_george_example_com",
    actorDisplayName: "George",
  });
  assert.equal(bootstrap.runContext?.scope.kind, "team");
  assert.equal(bootstrap.runContext?.scope.id, "scope_cro-submissions_team");
  assert.equal(bootstrap.runContext?.scope.tenantId, "cro-submissions");
  assert.equal(bootstrap.runContext?.actor.id, "actor_cro_submissions_george_example_com");
  assert.equal(bootstrap.runContext?.actor.role, "admin");
  assert.deepEqual(bootstrap.teamSetup, {
    mode: "team",
    source: "desktopLocal",
    canWorkLocally: true,
    canCreateFirstTeam: false,
    canManageTeam: true,
  });
});

test("SENSE1_PROFILE_ID pins desktop profile selection", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = {
    ...createTestEnv(runtimeRoot),
    SENSE1_PROFILE_ID: "fixed-profile",
  };

  const rejected = await selectDesktopProfile("other-profile", env);
  assert.equal(rejected.success, false);
  if (!rejected.success) {
    assert.match(rejected.reason, /fixed-profile/);
  }

  const selected = await selectDesktopProfile("fixed-profile", env);
  assert.equal(selected.success, true);
  if (selected.success) {
    assert.equal(selected.profile.id, "fixed-profile");
    assert.equal(selected.profile.source, "environment");
  }
});

test("resolveDesktopProfile keeps the hidden default slot even after selecting a legacy local profile", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);

  const initial = await resolveDesktopProfile(env);
  assert.equal(initial.id, DEFAULT_PROFILE_ID);

  const selected = await selectDesktopProfile("ops-team", env);
  assert.equal(selected.success, true);

  const restored = await resolveDesktopProfile(env);
  assert.equal(restored.id, DEFAULT_PROFILE_ID);
  assert.equal(restored.source, "default");
});

test("persistLastSelectedThreadId stores and clears the per-profile last thread", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);

  await persistLastSelectedThreadId("ops-team", "thread-7", env);
  assert.equal(await loadLastSelectedThreadId("ops-team", env), "thread-7");

  await persistLastSelectedThreadId("ops-team", null, env);
  assert.equal(await loadLastSelectedThreadId("ops-team", env), null);
});

test("resolveDesktopProfile and selectDesktopProfile keep shared Codex auth out of profile storage", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const sharedCodexHome = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-shared-codex-"));
  const env = {
    ...createTestEnv(runtimeRoot),
    CODEX_HOME: sharedCodexHome,
  };

  await fs.writeFile(
    path.join(sharedCodexHome, "auth.json"),
    JSON.stringify({ auth_mode: "chatgpt", test: true }),
    "utf8",
  );

  const resolved = await resolveDesktopProfile(env);
  await assert.rejects(fs.readFile(path.join(resolved.codexHome, "auth.json"), "utf8"));

  const selected = await selectDesktopProfile("ops-team", env);
  assert.equal(selected.success, true);
  assert.notEqual(selected.profile.codexHome, sharedCodexHome);
  await assert.rejects(fs.readFile(path.join(selected.profile.codexHome, "auth.json"), "utf8"));
});

test("getDesktopBootstrap returns profile-scoped recent workspace folders in newest-first order", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);
  await selectDesktopProfile("ops-team", env);

  await rememberRecentWorkspaceFolder("ops-team", "/tmp/alpha-project", env);
  await rememberRecentWorkspaceFolder("ops-team", "/tmp/beta-project", env);
  await rememberRecentWorkspaceFolder("ops-team", "/tmp/alpha-project", env);

  const manager = {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          requiresOpenaiAuth: false,
        };
      }

      if (method === "thread/list") {
        return {
          data: [],
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.deepEqual(
    bootstrap.recentFolders.map((folder) => folder.path),
    [path.resolve("/tmp/alpha-project"), path.resolve("/tmp/beta-project")],
  );
  assert.deepEqual(
    bootstrap.recentFolders.map((folder) => folder.name),
    ["alpha-project", "beta-project"],
  );
  assert.deepEqual(bootstrap.runContext, {
    actor: {
      id: "actor_default_primary",
      kind: "user",
      displayName: "George",
      email: "george@example.com",
      homeScopeId: "scope_default_private",
      role: "owner",
      capabilities: OWNER_CAPABILITIES,
      trustLevel: "medium",
    },
    scope: {
      id: "scope_default_private",
      kind: "private",
      displayName: "default private",
      profileId: CANONICAL_PROFILE_ID,
    },
    grants: [],
    policy: {
        executionPolicyMode: "auto",
      approvalPolicy: "onRequest",
      sandboxPolicy: "readOnly",
      trustLevel: "medium",
    },
  });
  assert.deepEqual(bootstrap.auditEvents, []);
  assert.equal(bootstrap.profileId, CANONICAL_PROFILE_ID);
  assert.deepEqual(bootstrap.profileOptions, []);
  assert.equal(bootstrap.isSignedIn, true);
  assert.equal(bootstrap.accountEmail, "george@example.com");
  assert.deepEqual(bootstrap.runtimeStatus, {
    appVersion: "0.1.0",
    platform: "darwin",
  });
  assert.equal(bootstrap.runtimeSetup, null);
  assert.equal(bootstrap.lastSelectedThreadId, null);
  assert.deepEqual(bootstrap.workspaceSidebarOrder, []);
  assert.equal(bootstrap.tenant, null);
  assert.deepEqual(bootstrap.teamSetup, {
    mode: "local",
    source: "desktopLocal",
    canWorkLocally: true,
    canCreateFirstTeam: true,
    canManageTeam: false,
  });
});

test("getDesktopBootstrap restores the active tenant context for a signed-in member", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const tenantRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-tenant-cloud-"));
  const env = createTestEnv(runtimeRoot, tenantRoot);

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
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          requiresOpenaiAuth: false,
        };
      }
      if (method === "thread/list" || method === "thread/loaded/list") {
        return { data: [] };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.deepEqual(bootstrap.tenant, {
    id: "cro-ops",
    displayName: "CRO Ops",
    role: "admin",
    scopeId: "scope_cro-ops_team",
    scopeDisplayName: "CRO Ops team",
    actorId: "actor_cro_ops_george_example_com",
    actorDisplayName: "George",
  });
  assert.deepEqual(bootstrap.runContext?.scope, {
    id: "scope_cro-ops_team",
    kind: "team",
    displayName: "CRO Ops team",
    profileId: CANONICAL_PROFILE_ID,
    tenantId: "cro-ops",
    tenantDisplayName: "CRO Ops",
  });
  assert.equal(bootstrap.runContext?.actor.homeScopeId, "scope_cro-ops_team");
  assert.equal(bootstrap.runContext?.actor.id, "actor_cro_ops_george_example_com");
  assert.equal(bootstrap.runContext?.actor.trustLevel, "high");
  assert.equal(bootstrap.runContext?.actor.capabilities?.includes("scope.cross"), true);
  assert.deepEqual(bootstrap.teamSetup, {
    mode: "team",
    source: "desktopLocal",
    canWorkLocally: true,
    canCreateFirstTeam: false,
    canManageTeam: true,
  });
});

test("getDesktopBootstrap resolves the same shared tenant context across two machine roots", async () => {
  const tenantRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-tenant-cloud-"));
  const runtimeRootA = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-machine-a-"));
  const runtimeRootB = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-machine-b-"));
  const envA = createTestEnv(runtimeRootA, tenantRoot);
  const envB = createTestEnv(runtimeRootB, tenantRoot);

  await createTenant({
    tenantId: "ops-team",
    displayName: "Ops Team",
    env: envA,
    now: "2026-04-08T09:00:00.000Z",
  });
  await addTenantMember({
    tenantId: "ops-team",
    email: "george@example.com",
    role: "member",
    displayName: "George",
    env: envA,
    now: "2026-04-08T09:01:00.000Z",
  });

  const manager = {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          requiresOpenaiAuth: false,
        };
      }
      if (method === "thread/list" || method === "thread/loaded/list") {
        return { data: [] };
      }
      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrapA = await getDesktopBootstrap(manager, {
    env: envA,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });
  const bootstrapB = await getDesktopBootstrap(manager, {
    env: envB,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.deepEqual(bootstrapB.tenant, bootstrapA.tenant);
  assert.deepEqual(bootstrapB.runContext?.scope, bootstrapA.runContext?.scope);
  assert.equal(bootstrapB.runContext?.scope.kind, "team");
  assert.equal(bootstrapB.runContext?.actor.role, "member");
  assert.equal(bootstrapB.runContext?.actor.trustLevel, "medium");
  assert.equal(bootstrapB.runContext?.actor.capabilities?.includes("scope.cross"), false);
});

test("getDesktopBootstrap returns the persisted workspace sidebar order for the active profile", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);
  await selectDesktopProfile("ops-team", env);

  await rememberWorkspaceSidebarOrder("ops-team", [
    "/tmp/beta-project",
    "/tmp/alpha-project",
    "/tmp/beta-project",
  ], env);

  assert.deepEqual(await loadWorkspaceSidebarOrder("ops-team", env), [
    path.resolve("/tmp/beta-project"),
    path.resolve("/tmp/alpha-project"),
  ]);

  const manager = {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          requiresOpenaiAuth: false,
        };
      }

      if (method === "thread/list") {
        return {
          data: [],
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.deepEqual(bootstrap.workspaceSidebarOrder, [
    path.resolve("/tmp/beta-project"),
    path.resolve("/tmp/alpha-project"),
  ]);
});

test("buildProfileOptions hides internal desktop slot options from the default sign-in flow", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);
  await selectDesktopProfile("default", env);
  await selectDesktopProfile("George", env);

  const options = await buildProfileOptions({
    id: "default",
  }, env);

  assert.deepEqual(options, []);
});

test("resolveDesktopProfile creates the phase 3 substrate foundation for each profile", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);

  const profile = await resolveDesktopProfile(env);
  const dbPath = resolveProfileSubstrateDbPath(profile.id, env);
  const db = new DatabaseSync(dbPath);

  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row.name);

    assert.deepEqual(tables, [
      "actors",
      "events",
      "object_refs",
      "plans",
      "questions",
      "scopes",
      "sessions",
      "workspace_policies",
      "workspaces",
    ]);

    const scopes = db.prepare("SELECT id, profile_id, type, display_name FROM scopes").all();
    assert.deepEqual(scopes.map((row) => ({ ...row })), [
      {
        id: "scope_default_private",
        profile_id: "default",
        type: "private",
        display_name: "default private",
      },
    ]);

    const actors = db.prepare("SELECT id, profile_id, scope_id, kind, display_name, metadata FROM actors").all();
    assert.equal(actors.length, 1);
    assert.equal(actors[0].id, "actor_default_primary");
    assert.equal(actors[0].profile_id, "default");
    assert.equal(actors[0].scope_id, "scope_default_private");
    assert.equal(actors[0].kind, "user");
    assert.equal(actors[0].display_name, "Primary user");
    assert.deepEqual(JSON.parse(actors[0].metadata), {
      capabilities: OWNER_CAPABILITIES,
      primary: true,
      role: "owner",
      trustLevel: "medium",
    });
  } finally {
    db.close();
  }
});

test("rememberThreadWorkspaceRoot persists thread workspace bindings by profile", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);

  await rememberThreadWorkspaceRoot("ops-team", "thread-1", "/tmp/workspace-alpha", env);
  await rememberThreadWorkspaceRoot("ops-team", "thread-2", "/tmp/workspace-beta", env);
  await rememberThreadWorkspaceRoot("ops-team", "thread-1", "/tmp/workspace-alpha-next", env);

  assert.equal(
    await loadThreadWorkspaceRoot("ops-team", "thread-1", env),
    path.resolve("/tmp/workspace-alpha-next"),
  );
  assert.equal(
    await loadThreadWorkspaceRoot("ops-team", "thread-2", env),
    path.resolve("/tmp/workspace-beta"),
  );
});

test("rememberThreadWorkspaceRoot heals all bindings that point at the same remounted workspace", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);
  const realWorkspaceRoot = path.join(runtimeRoot, "workspace-real");
  const originalMountPath = path.join(runtimeRoot, "workspace-mount-a");
  const remountedPath = path.join(runtimeRoot, "workspace-mount-b");

  await fs.mkdir(realWorkspaceRoot, { recursive: true });
  await fs.symlink(realWorkspaceRoot, originalMountPath);
  await fs.symlink(realWorkspaceRoot, remountedPath);

  await rememberThreadWorkspaceRoot("ops-team", "thread-1", originalMountPath, env);
  await rememberThreadWorkspaceRoot("ops-team", "thread-2", originalMountPath, env);
  await rememberThreadWorkspaceRoot("ops-team", "thread-1", remountedPath, env);

  assert.equal(
    await loadThreadWorkspaceRoot("ops-team", "thread-1", env),
    path.resolve(remountedPath),
  );
  assert.equal(
    await loadThreadWorkspaceRoot("ops-team", "thread-2", env),
    path.resolve(remountedPath),
  );
});

test("resolveThreadWorkspaceRoot falls back to substrate when a remembered mount path has gone stale", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);
  const { profileId } = await ensureProfileDirectories("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);
  const realWorkspaceRoot = path.join(runtimeRoot, "workspace-real");
  const originalMountPath = path.join(runtimeRoot, "workspace-old");
  const remountedPath = path.join(runtimeRoot, "workspace-new");

  await fs.mkdir(realWorkspaceRoot, { recursive: true });
  await fs.symlink(realWorkspaceRoot, originalMountPath);
  await fs.symlink(realWorkspaceRoot, remountedPath);

  const substrate = await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });
  await ensureSubstrateSessionForThread({
    actorId: substrate.actorId,
    codexThreadId: "thread-remounted-1",
    dbPath,
    profileId,
    scopeId: substrate.scopeId,
    workspaceRoot: originalMountPath,
  });
  await rememberThreadWorkspaceRoot(profileId, "thread-remounted-1", originalMountPath, env);
  await rememberSubstrateWorkspace({
    actorId: substrate.actorId,
    dbPath,
    profileId,
    scopeId: substrate.scopeId,
    workspaceRoot: remountedPath,
  });
  await fs.rm(originalMountPath, { force: true });

  const workspaceRootByThreadId = {
    "thread-remounted-1": path.resolve(originalMountPath),
  };
  const resolvedWorkspaceRoot = await resolveThreadWorkspaceRoot(
    profileId,
    "thread-remounted-1",
    workspaceRootByThreadId,
    env,
  );

  assert.equal(resolvedWorkspaceRoot, path.resolve(remountedPath));
  assert.equal(workspaceRootByThreadId["thread-remounted-1"], path.resolve(remountedPath));
  assert.equal(
    await loadThreadWorkspaceRoot(profileId, "thread-remounted-1", env),
    path.resolve(remountedPath),
  );
});

test("getDesktopBootstrap merges persisted workspace roots into recent thread summaries", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);
  await selectDesktopProfile("ops-team", env);
  await rememberThreadWorkspaceRoot("ops-team", "thread-1", "/tmp/workspace-alpha", env);
  await persistLastSelectedThreadId("ops-team", "thread-1", env);

  const manager = {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          requiresOpenaiAuth: false,
        };
      }

      if (method === "thread/list") {
        return {
          data: [
            {
              id: "thread-1",
              title: "Workspace task",
              updated_at: "2026-03-19T10:00:00.000Z",
            },
          ],
        };
      }

      if (method === "thread/read") {
        assert.deepEqual(params, { threadId: "thread-1", includeTurns: true });
        return {
          thread: {
            id: "thread-1",
            name: "Workspace task",
            preview: "Workspace task",
            updatedAt: 1_742_367_200,
            turns: [],
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.equal(bootstrap.recentThreads[0]?.id, "thread-1");
  assert.equal(
    bootstrap.recentThreads[0]?.workspaceRoot,
    path.resolve("/tmp/workspace-alpha"),
  );
  assert.equal(bootstrap.lastSelectedThreadId, "thread-1");
});

test("getDesktopBootstrap prefers persisted session titles when recent thread list falls back to placeholders", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);
  await selectDesktopProfile("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath("ops-team", env);

  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId: "ops-team",
  });
  await ensureSubstrateSessionForThread({
    actorId: resolvePrimaryActorId("ops-team"),
    codexThreadId: "thread-plain-chat",
    dbPath,
    profileId: "ops-team",
    scopeId: resolveDefaultScopeId("ops-team"),
    threadTitle: "Start a quick QA note about desktop continuity.",
  });

  const manager = {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          requiresOpenaiAuth: false,
        };
      }

      if (method === "thread/list") {
        return {
          data: [
            {
              id: "thread-plain-chat",
              title: "Untitled thread",
              updated_at: "2026-03-19T10:00:00.000Z",
            },
          ],
        };
      }

      if (method === "thread/loaded/list") {
        return { data: [] };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.equal(bootstrap.recentThreads[0]?.id, "thread-plain-chat");
  assert.equal(bootstrap.recentThreads[0]?.title, "Start a quick QA note about desktop continuity.");
});

test("getDesktopBootstrap includes loaded threads that are not yet in thread/list", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);
  await selectDesktopProfile("ops-team", env);
  await rememberThreadWorkspaceRoot("ops-team", "thread-9", "/tmp/workspace-loaded", env);

  const manager = {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method, params) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          requiresOpenaiAuth: false,
        };
      }

      if (method === "thread/list") {
        return { data: [] };
      }

      if (method === "thread/loaded/list") {
        return { data: ["thread-9"] };
      }

      if (method === "thread/read") {
        assert.deepEqual(params, { threadId: "thread-9", includeTurns: false });
        return {
          thread: {
            id: "thread-9",
            title: "Recovered loaded thread",
            updated_at: "2026-03-19T10:00:00.000Z",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.equal(bootstrap.recentThreads.length, 1);
  assert.equal(bootstrap.recentThreads[0].id, "thread-9");
  assert.equal(bootstrap.recentThreads[0].workspaceRoot, path.resolve("/tmp/workspace-loaded"));
});

test("getDesktopBootstrap keeps substrate-backed sessions visible even when thread/list is narrower", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);
  await selectDesktopProfile("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath("ops-team", env);

  const substrate = await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId: "ops-team",
  });
  await ensureSubstrateSessionForThread({
    actorId: substrate.actorId,
    codexThreadId: "thread-substrate-only",
    dbPath,
    profileId: "ops-team",
    scopeId: substrate.scopeId,
    threadTitle: "Substrate-only thread should stay visible",
  });

  const manager = {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          requiresOpenaiAuth: false,
        };
      }

      if (method === "thread/list") {
        return {
          data: [
            {
              id: "thread-runtime-only",
              title: "Runtime thread",
              updated_at: "2026-03-19T10:00:00.000Z",
            },
          ],
        };
      }

      if (method === "thread/loaded/list") {
        return { data: [] };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.deepEqual(
    [...bootstrap.recentThreads.map((thread) => thread.id)].sort(),
    ["thread-runtime-only", "thread-substrate-only"].sort(),
  );
});

test("getDesktopBootstrap recovers the remembered last thread even when lists are empty", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);
  await selectDesktopProfile("ops-team", env);
  await rememberThreadWorkspaceRoot("ops-team", "thread-12", "/tmp/workspace-remembered", env);
  await persistLastSelectedThreadId("ops-team", "thread-12", env);

  const manager = {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method, params) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          requiresOpenaiAuth: false,
        };
      }

      if (method === "thread/list") {
        return { data: [] };
      }

      if (method === "thread/loaded/list") {
        return { data: [] };
      }

      if (method === "thread/read") {
        if (params?.includeTurns === false) {
          return {
            thread: {
              id: "thread-12",
              title: "Remembered thread",
              updated_at: "2026-03-19T10:00:00.000Z",
            },
          };
        }

        assert.deepEqual(params, { threadId: "thread-12", includeTurns: true });
        return {
          thread: {
            id: "thread-12",
            title: "Remembered thread",
            updated_at: "2026-03-19T10:00:00.000Z",
            turns: [],
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.equal(bootstrap.lastSelectedThreadId, "thread-12");
  assert.equal(bootstrap.recentThreads.length, 1);
  assert.equal(bootstrap.recentThreads[0].id, "thread-12");
  assert.equal(bootstrap.recentThreads[0].workspaceRoot, path.resolve("/tmp/workspace-remembered"));
  assert.equal(bootstrap.selectedThread?.id, "thread-12");
  assert.deepEqual(bootstrap.runContext, {
    actor: {
      id: "actor_default_primary",
      kind: "user",
      displayName: "George",
      email: "george@example.com",
      homeScopeId: "scope_default_private",
      role: "owner",
      capabilities: OWNER_CAPABILITIES,
      trustLevel: "medium",
    },
    scope: {
      id: "scope_default_private",
      kind: "private",
      displayName: "default private",
      profileId: CANONICAL_PROFILE_ID,
    },
    grants: [
      {
        kind: "workspaceRoot",
        rootPath: path.resolve("/tmp/workspace-remembered"),
        access: "workspaceWrite",
      },
    ],
    policy: {
        executionPolicyMode: "auto",
      approvalPolicy: "onRequest",
      sandboxPolicy: "workspaceWrite",
      trustLevel: "medium",
    },
  });
});

test("getDesktopBootstrap restores workspace roots from substrate sessions when thread bindings are missing", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);
  await selectDesktopProfile("ops-team", env);
  await persistLastSelectedThreadId("ops-team", "thread-session-bound", env);

  const dbPath = resolveProfileSubstrateDbPath("ops-team", env);
  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId: "ops-team",
  });

  const db = new DatabaseSync(dbPath);
  try {
    db.prepare(
      `INSERT INTO workspaces (id, profile_id, scope_id, root_path, display_name, registered_at, last_active_at, session_count, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "ws_session_bound",
      "ops-team",
      resolveDefaultScopeId("ops-team"),
      "/tmp/workspace-session-bound",
      "workspace-session-bound",
      "2026-03-27T10:00:00.000Z",
      "2026-03-27T10:05:00.000Z",
      1,
      "{}",
    );

    db.prepare(
      `INSERT INTO sessions (id, profile_id, scope_id, actor_id, codex_thread_id, workspace_id, title, model, effort, status, started_at, ended_at, summary, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "session_thread_bound",
      "ops-team",
      resolveDefaultScopeId("ops-team"),
      resolvePrimaryActorId("ops-team"),
      "thread-session-bound",
      "ws_session_bound",
      "Session-bound thread",
      "gpt-5.4",
      null,
      "active",
      "2026-03-27T10:00:00.000Z",
      null,
      null,
      JSON.stringify({ workspaceRoot: "/tmp/workspace-session-bound" }),
    );
  } finally {
    db.close();
  }

  const manager = {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-27T10:05:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method, params) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          requiresOpenaiAuth: false,
        };
      }

      if (method === "thread/list") {
        return { data: [] };
      }

      if (method === "thread/loaded/list") {
        return { data: [] };
      }

      if (method === "thread/read") {
        if (params?.includeTurns === false) {
          return {
            thread: {
              id: "thread-session-bound",
              title: "Session-bound thread",
              updated_at: "2026-03-27T10:05:00.000Z",
            },
          };
        }

        return {
          thread: {
            id: "thread-session-bound",
            title: "Session-bound thread",
            updated_at: "2026-03-27T10:05:00.000Z",
            turns: [],
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-27T10:05:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.equal(bootstrap.lastSelectedThreadId, "thread-session-bound");
  assert.equal(bootstrap.recentThreads.length, 1);
  assert.equal(bootstrap.recentThreads[0]?.workspaceRoot, path.resolve("/tmp/workspace-session-bound"));
  assert.equal(bootstrap.selectedThread?.id, "thread-session-bound");
  assert.equal(bootstrap.selectedThread?.workspaceRoot, path.resolve("/tmp/workspace-session-bound"));
  assert.equal(
    await loadThreadWorkspaceRoot(CANONICAL_PROFILE_ID, "thread-session-bound", env),
    path.resolve("/tmp/workspace-session-bound"),
  );
});

test("getDesktopBootstrap falls back to the recent thread summary when selected thread details are still unavailable", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);
  await selectDesktopProfile("ops-team", env);
  await rememberThreadWorkspaceRoot("ops-team", "thread-live", "/tmp/workspace-live", env);
  await persistLastSelectedThreadId("ops-team", "thread-live", env);

  const manager = {
    state: "busy",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-27T11:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method, params) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          requiresOpenaiAuth: false,
        };
      }

      if (method === "thread/list") {
        return {
          data: [
            {
              id: "thread-live",
              title: "Live workspace thread",
              updated_at: "2026-03-27T11:00:00.000Z",
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
              id: "thread-live",
              title: "Live workspace thread",
              updated_at: "2026-03-27T11:00:00.000Z",
            },
          };
        }

        return {
          thread: null,
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-27T11:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.equal(bootstrap.lastSelectedThreadId, "thread-live");
  assert.equal(bootstrap.recentThreads[0]?.id, "thread-live");
  assert.equal(bootstrap.recentThreads[0]?.workspaceRoot, path.resolve("/tmp/workspace-live"));
  assert.equal(bootstrap.selectedThread?.id, "thread-live");
  assert.equal(bootstrap.selectedThread?.workspaceRoot, path.resolve("/tmp/workspace-live"));
  assert.deepEqual(bootstrap.selectedThread?.entries, []);
  assert.equal(bootstrap.selectedThread?.hasLoadedDetails, false);
});

test("getDesktopBootstrap keeps the selected recent thread bound when detail hydration throws a transient error", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);
  await selectDesktopProfile("ops-team", env);
  await rememberThreadWorkspaceRoot("ops-team", "thread-live-error", "/tmp/workspace-live-error", env);
  await persistLastSelectedThreadId("ops-team", "thread-live-error", env);

  const manager = {
    state: "busy",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-27T11:10:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method, params) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          requiresOpenaiAuth: false,
        };
      }

      if (method === "thread/list") {
        return {
          data: [
            {
              id: "thread-live-error",
              title: "Live workspace thread",
              updated_at: "2026-03-27T11:10:00.000Z",
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
              id: "thread-live-error",
              title: "Live workspace thread",
              updated_at: "2026-03-27T11:10:00.000Z",
            },
          };
        }

        throw new Error("Timed out waiting for live thread transcript.");
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-27T11:10:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.equal(bootstrap.selectedThread?.id, "thread-live-error");
  assert.equal(bootstrap.selectedThread?.workspaceRoot, path.resolve("/tmp/workspace-live-error"));
  assert.equal(bootstrap.selectedThread?.hasLoadedDetails, false);
});

test("getDesktopBootstrap honors an in-memory selected thread override over persisted selection", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);
  await persistLastSelectedThreadId(DEFAULT_PROFILE_ID, "thread-disk", env);

  const manager = {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method, params) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          requiresOpenaiAuth: false,
        };
      }

      if (method === "thread/list") {
        return {
          data: [
            {
              id: "thread-live",
              title: "Live thread",
              updated_at: "2026-03-19T10:00:00.000Z",
            },
          ],
        };
      }

      if (method === "thread/loaded/list") {
        return { data: [] };
      }

      if (method === "thread/read") {
        assert.deepEqual(params, { threadId: "thread-live", includeTurns: true });
        return {
          thread: {
            id: "thread-live",
            name: "Live thread",
            preview: "Live thread preview",
            updatedAt: 1_742_367_200,
            turns: [],
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    selectedThreadIdByProfile: {
      [DEFAULT_PROFILE_ID]: "thread-live",
    },
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.equal(bootstrap.lastSelectedThreadId, "thread-live");
  assert.equal(bootstrap.selectedThread?.id, "thread-live");
  assert.deepEqual(
    bootstrap.recentThreads.map((thread) => thread.id),
    ["thread-live"],
  );
});

test("getDesktopBootstrap restores a pending input request for the selected thread from substrate", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);
  await selectDesktopProfile("ops-team", env);
  await persistLastSelectedThreadId("ops-team", "thread-selected", env);

  const dbPath = resolveProfileSubstrateDbPath("ops-team", env);
  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId: "ops-team",
  });

  const db = new DatabaseSync(dbPath);
  try {
    db.prepare(
      `INSERT INTO questions (id, profile_id, scope_id, session_id, actor_id, codex_thread_id, engine_turn_id, request_id, prompt, status, answer_text, asked_at, answered_at, target_kind, target_id, target_snapshot, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "question_bootstrap_pending",
      "ops-team",
      resolveDefaultScopeId("ops-team"),
      "session_bootstrap_pending",
      resolvePrimaryActorId("ops-team"),
      "thread-selected",
      "turn-selected",
      707,
      "Which environment should I use?",
      "pending",
      null,
      "2026-03-26T10:00:00.000Z",
      null,
      "pending_run",
      "turn-selected",
      JSON.stringify({ threadId: "thread-selected", turnId: "turn-selected" }),
      JSON.stringify({
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
        source: "test",
      }),
    );
  } finally {
    db.close();
  }

  const manager = {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method, params) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          requiresOpenaiAuth: false,
        };
      }

      if (method === "thread/list") {
        return {
          data: [
            {
              id: "thread-selected",
              title: "Selected thread",
              updated_at: "2026-03-19T10:00:00.000Z",
            },
          ],
        };
      }

      if (method === "thread/loaded/list") {
        return { data: [] };
      }

      if (method === "thread/read") {
        assert.deepEqual(params, { threadId: "thread-selected", includeTurns: true });
        return {
          thread: {
            id: "thread-selected",
            name: "Selected thread",
            preview: "Selected thread preview",
            updatedAt: 1_742_367_200,
            turns: [],
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.deepEqual(bootstrap.selectedThread?.inputRequestState, {
    requestId: 707,
    prompt: "Which environment should I use?",
    threadId: "thread-selected",
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

test("getDesktopBootstrap returns a blocking setup state when codex runtime is missing", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);

  const manager = {
    state: "errored",
    lastError: "spawn codex ENOENT",
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {
      throw new Error("spawn codex ENOENT");
    },
    request: async () => {
      throw new Error("App Server is not ready yet.");
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.equal(bootstrap.runtime.setupBlocked, true);
  assert.equal(bootstrap.runtime.setupCode, "missing_codex_runtime");
  assert.match(bootstrap.runtime.setupTitle ?? "", /Codex runtime/i);
  assert.match(bootstrap.runtime.setupMessage ?? "", /blocked/i);
  assert.match(bootstrap.runtime.setupDetail ?? "", /spawn codex ENOENT/i);
  assert.deepEqual(bootstrap.runtimeSetup, {
    blocked: true,
    code: "missing_codex_runtime",
    title: "Install the Codex runtime to use Sense-1 Desktop",
    message:
      "Sense-1 could not find the local Codex runtime, so chat, sign-in, and folder work are blocked until it is available.",
    detail: "spawn codex ENOENT",
  });
  assert.equal(bootstrap.auth.isSignedIn, false);
  assert.deepEqual(bootstrap.recentThreads, []);
});

test("getDesktopBootstrap treats codex PATH resolution failures as missing runtime blockers", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);

  const manager = {
    state: "errored",
    lastError:
      'Could not find "codex" runtime on PATH. Searched: /usr/bin, /bin. Install Codex CLI or set SENSE1_CODEX_PATH.',
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {
      throw new Error(
        'Could not find "codex" runtime on PATH. Searched: /usr/bin, /bin. Install Codex CLI or set SENSE1_CODEX_PATH.',
      );
    },
    request: async () => {
      throw new Error("App Server is not ready yet.");
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.equal(bootstrap.runtime.setupBlocked, true);
  assert.equal(bootstrap.runtime.setupCode, "missing_codex_runtime");
  assert.match(bootstrap.runtime.setupDetail ?? "", /Could not find "codex" runtime on PATH/i);
});

test("getDesktopBootstrap blocks the UI for generic runtime startup failures", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);

  const manager = {
    state: "errored",
    lastError: "Restart budget exhausted after 1 attempt(s).",
    restartCount: 1,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {
      throw new Error("Restart budget exhausted after 1 attempt(s).");
    },
    request: async () => {
      throw new Error("App Server is not ready yet.");
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.equal(bootstrap.runtime.setupBlocked, true);
  assert.equal(bootstrap.runtime.setupCode, "runtime_unavailable");
  assert.match(bootstrap.runtime.setupTitle ?? "", /could not start the local runtime/i);
  assert.match(bootstrap.runtime.setupDetail ?? "", /Restart budget exhausted/i);
});

test("getDesktopBootstrap blocks startup when auth restore fails", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);

  const manager = {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method) => {
      if (method === "account/read") {
        throw new Error("account/read failed");
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.equal(bootstrap.runtime.setupBlocked, true);
  assert.equal(bootstrap.runtime.setupCode, "auth_restore_failed");
  assert.match(bootstrap.runtime.setupTitle ?? "", /restore sign-in state/i);
  assert.match(bootstrap.runtime.setupDetail ?? "", /account\/read failed/i);
  assert.equal(bootstrap.auth.isSignedIn, false);
  assert.match(bootstrap.auth.error ?? "", /account\/read failed/i);
  assert.deepEqual(bootstrap.recentThreads, []);
});

test("getDesktopBootstrap keeps fresh profiles signed out when no account is restored", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);

  const manager = {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: null,
          requiresOpenaiAuth: true,
        };
      }

      if (method === "thread/list") {
        return {
          data: [],
        };
      }

      if (method === "thread/loaded/list") {
        return {
          data: [],
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.equal(bootstrap.runtime.setupBlocked, false);
  assert.equal(bootstrap.auth.isSignedIn, false);
  assert.equal(bootstrap.auth.email, null);
  assert.equal(bootstrap.auth.requiresOpenaiAuth, true);
  assert.deepEqual(bootstrap.auditEvents, []);
  assert.deepEqual(bootstrap.recentThreads, []);
});

test("getDesktopBootstrap preserves the signed-in shell when an email is present even if auth refresh is still required", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);

  const manager = {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          requiresOpenaiAuth: true,
        };
      }

      if (method === "thread/list") {
        return {
          data: [],
        };
      }

      if (method === "thread/loaded/list") {
        return {
          data: [],
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.equal(bootstrap.isSignedIn, true);
  assert.equal(bootstrap.accountEmail, "george@example.com");
  assert.equal(bootstrap.auth.requiresOpenaiAuth, true);
});

test("getDesktopBootstrap treats apiKey auth as signed in even when no email is present", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);

  const manager = {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: null,
            type: "apiKey",
          },
          requiresOpenaiAuth: false,
        };
      }

      if (method === "thread/list" || method === "thread/loaded/list") {
        return {
          data: [],
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.equal(bootstrap.isSignedIn, true);
  assert.equal(bootstrap.accountEmail, null);
  assert.equal(bootstrap.auth.isSignedIn, true);
  assert.equal(bootstrap.auth.email, null);
  assert.equal(bootstrap.auth.accountType, "apiKey");
});

test("getDesktopBootstrap blocks startup when recent thread restore fails", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);

  const manager = {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          requiresOpenaiAuth: false,
        };
      }

      if (method === "thread/list") {
        throw new Error("thread/list failed");
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.equal(bootstrap.runtime.setupBlocked, true);
  assert.equal(bootstrap.runtime.setupCode, "recent_threads_restore_failed");
  assert.match(bootstrap.runtime.setupTitle ?? "", /restore recent threads/i);
  assert.match(bootstrap.runtime.setupDetail ?? "", /thread\/list failed/i);
  assert.equal(bootstrap.auth.isSignedIn, true);
  assert.deepEqual(bootstrap.recentThreads, []);
});

test("getDesktopBootstrap clears an unreadable remembered thread instead of restoring a stale selection", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-bootstrap-test-"));
  const env = createTestEnv(runtimeRoot);
  await persistActiveProfileId("ops-team", env);
  await persistLastSelectedThreadId("ops-team", "thread-stale", env);

  const manager = {
    state: "ready",
    lastError: null,
    restartCount: 0,
    lastStateAt: "2026-03-19T10:00:00.000Z",
    handleProfileChange: async () => {},
    start: async () => {},
    request: async (method, params) => {
      if (method === "account/read") {
        return {
          account: {
            email: "george@example.com",
            type: "chatgpt",
          },
          requiresOpenaiAuth: false,
        };
      }

      if (method === "thread/list") {
        return { data: [] };
      }

      if (method === "thread/loaded/list") {
        return { data: [] };
      }

      if (method === "thread/read") {
        assert.deepEqual(params, { threadId: "thread-stale", includeTurns: true });
        throw new Error("thread not found: thread-stale");
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const bootstrap = await getDesktopBootstrap(manager, {
    env,
    appStartedAt: "2026-03-19T10:00:00.000Z",
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.1.0",
      electronVersion: "35.2.1",
      platform: "darwin",
    },
  });

  assert.equal(bootstrap.lastSelectedThreadId, null);
  assert.equal(bootstrap.selectedThread, null);
  assert.equal(await loadLastSelectedThreadId(CANONICAL_PROFILE_ID, env), null);
});
