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
  evaluateDesktopPolicy,
  listDesktopPolicyCapabilities,
} from "../settings/policy.js";
import {
  createSubstratePlan,
  createSubstrateSessionShell,
  deleteSubstrateSession,
  ensureProfileSubstrate,
  getSubstrateScope,
  ensureSubstrateSessionForThread,
  finalizeSubstrateSessionStart,
  getSubstrateActor,
  ingestSubstratePlanSuggestion,
  loadAllWorkspacePolicies,
  loadWorkspacePolicy,
  rememberSubstrateWorkspace,
  resolveSubstratePlanApproval,
  resolveDefaultScopeId,
  resolvePrimaryActorId,
  updateSubstratePlan,
  upsertWorkspacePolicy,
  upsertSubstrateScopeSettingsPolicy,
  upsertSubstrateActor,
} from "./substrate.js";

const OWNER_CAPABILITIES = listDesktopPolicyCapabilities();

function createTestEnv(runtimeRoot) {
  return {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
  };
}

test("ensureProfileSubstrate is idempotent and upgrades the primary actor when identity becomes known", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-substrate-test-"));
  const env = createTestEnv(runtimeRoot);
  const { profileId } = await ensureProfileDirectories("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);

  await ensureProfileSubstrate({
    dbPath,
    profileId,
  });
  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });

  const db = new DatabaseSync(dbPath);

  try {
    const scopeRows = db.prepare("SELECT id, profile_id FROM scopes").all();
    assert.deepEqual(scopeRows.map((row) => ({ ...row })), [
      {
        id: resolveDefaultScopeId(profileId),
        profile_id: profileId,
      },
    ]);

    const actorRows = db.prepare("SELECT id, display_name, metadata FROM actors").all();
    assert.equal(actorRows.length, 1);
    assert.equal(actorRows[0].id, resolvePrimaryActorId(profileId));
    assert.equal(actorRows[0].display_name, "George");
    assert.deepEqual(JSON.parse(actorRows[0].metadata), {
      capabilities: OWNER_CAPABILITIES,
      email: "george@example.com",
      primary: true,
      role: "owner",
      trustLevel: "medium",
    });
  } finally {
    db.close();
  }
});

test("upsertSubstrateActor creates a non-primary product worker with distinct capabilities", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-substrate-test-"));
  const env = createTestEnv(runtimeRoot);
  const { profileId } = await ensureProfileDirectories("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);
  const scopeId = resolveDefaultScopeId(profileId);

  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });

  const actor = await upsertSubstrateActor({
    actorId: "actor_ops_team_workspace_assistant",
    dbPath,
    displayName: "Workspace assistant",
    kind: "agent",
    metadata: {
      capabilities: ["session.start", "workspace.use", "workspace.write"],
      role: "assistant",
      trustLevel: "low",
    },
    profileId,
    scopeId,
  });

  assert.equal(actor.id, "actor_ops_team_workspace_assistant");
  assert.equal(actor.kind, "agent");
  assert.equal(actor.display_name, "Workspace assistant");
  assert.deepEqual(actor.metadata, {
    capabilities: ["session.start", "workspace.use", "workspace.write"],
    role: "assistant",
    trustLevel: "low",
  });

  const loadedActor = await getSubstrateActor({
    actorId: actor.id,
    dbPath,
  });
  assert.deepEqual(loadedActor, actor);
});

test("rememberSubstrateWorkspace updates an existing workspace row when the same folder remounts at a new path", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-substrate-test-"));
  const env = createTestEnv(runtimeRoot);
  const { profileId } = await ensureProfileDirectories("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);
  const substrate = await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });
  const realWorkspaceRoot = path.join(runtimeRoot, "workspace-real");
  const originalMountPath = path.join(runtimeRoot, "workspace-mount-a");
  const remountedPath = path.join(runtimeRoot, "workspace-mount-b");

  await fs.mkdir(realWorkspaceRoot, { recursive: true });
  await fs.symlink(realWorkspaceRoot, originalMountPath);
  await fs.symlink(realWorkspaceRoot, remountedPath);

  const firstWorkspace = await rememberSubstrateWorkspace({
    actorId: substrate.actorId,
    dbPath,
    profileId,
    scopeId: substrate.scopeId,
    workspaceRoot: originalMountPath,
  });
  const secondWorkspace = await rememberSubstrateWorkspace({
    actorId: substrate.actorId,
    dbPath,
    profileId,
    scopeId: substrate.scopeId,
    workspaceRoot: remountedPath,
  });

  assert.equal(firstWorkspace?.id, secondWorkspace?.id);
  assert.equal(secondWorkspace?.root_path, path.resolve(remountedPath));

  const db = new DatabaseSync(dbPath);
  try {
    const rows = db.prepare(
      `SELECT id, root_path, metadata
      FROM workspaces
      ORDER BY registered_at ASC`,
    ).all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].root_path, path.resolve(remountedPath));
    const metadata = JSON.parse(rows[0].metadata);
    assert.equal(typeof metadata.identityKey, "string");
    assert.equal(metadata.comparableRootPath, await fs.realpath(realWorkspaceRoot));
  } finally {
    db.close();
  }
});

test("rememberSubstrateWorkspace heals a legacy workspace row and carries its policy to the remounted path", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-substrate-test-"));
  const env = createTestEnv(runtimeRoot);
  const { profileId } = await ensureProfileDirectories("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);
  const substrate = await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });
  const realWorkspaceRoot = path.join(runtimeRoot, "workspace-real");
  const firstMountRoot = path.join(runtimeRoot, "mount-a");
  const secondMountRoot = path.join(runtimeRoot, "mount-b");
  const originalMountPath = path.join(firstMountRoot, "workspace");
  const remountedPath = path.join(secondMountRoot, "workspace");

  await fs.mkdir(realWorkspaceRoot, { recursive: true });
  await fs.mkdir(firstMountRoot, { recursive: true });
  await fs.mkdir(secondMountRoot, { recursive: true });
  await fs.symlink(realWorkspaceRoot, originalMountPath);
  await fs.symlink(realWorkspaceRoot, remountedPath);

  const sessionShell = await createSubstrateSessionShell({
    actorId: substrate.actorId,
    dbPath,
    model: "gpt-5.4",
    now: "2026-04-01T09:00:00.000Z",
    profileId,
    scopeId: substrate.scopeId,
    title: "Legacy SharePoint session",
    workspaceRoot: originalMountPath,
  });

  await upsertWorkspacePolicy({
    contextPaths: [path.join(originalMountPath, "README.md")],
    dbPath,
    knownStructure: [
      {
        name: "README.md",
        path: path.join(originalMountPath, "README.md"),
        type: "file",
      },
    ],
    pinnedPaths: [path.join(originalMountPath, "src")],
    readGranted: true,
    readGrantedAt: "2026-04-01T09:00:01.000Z",
    workspaceRoot: originalMountPath,
    writeMode: "trusted",
  });

  const db = new DatabaseSync(dbPath);
  try {
    const originalWorkspace = db.prepare(
      `SELECT id
      FROM workspaces
      WHERE root_path = ?`,
    ).get(path.resolve(originalMountPath));
    assert.equal(typeof originalWorkspace?.id, "string");

    db.prepare("UPDATE workspaces SET metadata = NULL WHERE id = ?").run(originalWorkspace.id);
    const session = db.prepare(
      `SELECT workspace_id, metadata
      FROM sessions
      WHERE id = ?`,
    ).get(sessionShell.sessionId);
    assert.equal(session.workspace_id, originalWorkspace.id);
    assert.deepEqual(JSON.parse(session.metadata), {
      workspaceRoot: path.resolve(originalMountPath),
    });
  } finally {
    db.close();
  }

  await fs.unlink(originalMountPath);

  const healedWorkspace = await rememberSubstrateWorkspace({
    actorId: substrate.actorId,
    dbPath,
    profileId,
    scopeId: substrate.scopeId,
    workspaceRoot: remountedPath,
  });

  assert.equal(healedWorkspace?.root_path, path.resolve(remountedPath));

  const verifyDb = new DatabaseSync(dbPath);
  try {
    const workspaceRows = verifyDb.prepare(
      `SELECT id, root_path, metadata
      FROM workspaces
      ORDER BY registered_at ASC`,
    ).all();
    assert.equal(workspaceRows.length, 1);
    assert.equal(workspaceRows[0].id, healedWorkspace?.id);
    assert.equal(workspaceRows[0].root_path, path.resolve(remountedPath));

    const metadata = JSON.parse(workspaceRows[0].metadata);
    assert.equal(typeof metadata.identityKey, "string");
    assert.equal(metadata.comparableRootPath, await fs.realpath(realWorkspaceRoot));

    const session = verifyDb.prepare(
      `SELECT workspace_id, metadata
      FROM sessions
      WHERE id = ?`,
    ).get(sessionShell.sessionId);
    assert.equal(session.workspace_id, healedWorkspace?.id);
    assert.deepEqual(JSON.parse(session.metadata), {
      workspaceRoot: path.resolve(remountedPath),
    });

    const remountedPolicy = verifyDb.prepare(
      `SELECT workspace_root, read_granted, write_mode, context_paths, pinned_paths, known_structure
      FROM workspace_policies
      WHERE workspace_root = ?`,
    ).get(path.resolve(remountedPath));
    assert.deepEqual({ ...remountedPolicy }, {
      context_paths: JSON.stringify([path.resolve(remountedPath, "README.md")]),
      known_structure: JSON.stringify([
        {
          name: "README.md",
          path: path.resolve(remountedPath, "README.md"),
          type: "file",
        },
      ]),
      pinned_paths: JSON.stringify([path.resolve(remountedPath, "src")]),
      read_granted: 1,
      workspace_root: path.resolve(remountedPath),
      write_mode: "trusted",
    });

    const stalePolicyRows = verifyDb.prepare(
      `SELECT COUNT(*) AS count
      FROM workspace_policies
      WHERE workspace_root = ?`,
    ).get(path.resolve(originalMountPath));
    assert.equal(stalePolicyRows.count, 0);
  } finally {
    verifyDb.close();
  }
});

test("workspace policy records round-trip structured data and preserve earlier values across partial updates", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-substrate-test-"));
  const env = createTestEnv(runtimeRoot);
  const { profileId } = await ensureProfileDirectories("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);
  const scopeId = resolveDefaultScopeId(profileId);
  const actorId = resolvePrimaryActorId(profileId);
  const legacyWorkspaceRoot = path.join(runtimeRoot, "workspace-legacy");
  const policyWorkspaceRoot = path.join(runtimeRoot, "workspace-policy");
  const initialKnownStructure = [
    {
      name: "README.md",
      path: path.join(policyWorkspaceRoot, "README.md"),
      type: "file",
    },
    {
      name: "src",
      path: path.join(policyWorkspaceRoot, "src"),
      type: "directory",
    },
    {
      name: "index.ts",
      path: path.join(policyWorkspaceRoot, "src", "index.ts"),
      type: "file",
    },
  ];

  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });

  await createSubstrateSessionShell({
    actorId,
    dbPath,
    model: "gpt-5.4",
    now: "2026-03-26T10:00:00.000Z",
    profileId,
    scopeId,
    title: "Seed legacy workspace",
    workspaceRoot: legacyWorkspaceRoot,
  });

  assert.deepEqual(await loadWorkspacePolicy({
    dbPath,
    workspaceRoot: legacyWorkspaceRoot,
  }), {
    context_paths: [],
    known_structure: [],
    last_hydrated_at: null,
    pinned_paths: [],
    read_granted: 0,
    read_granted_at: null,
    read_grant_mode: null,
    workspace_root: path.resolve(legacyWorkspaceRoot),
    operating_mode: "auto",
    write_mode: "conversation",
  });

  const initialPolicy = await upsertWorkspacePolicy({
    contextPaths: [
      path.join(policyWorkspaceRoot, "README.md"),
      path.join(policyWorkspaceRoot, "package.json"),
    ],
    dbPath,
    lastHydratedAt: "2026-03-26T10:05:00.000Z",
    knownStructure: initialKnownStructure,
    pinnedPaths: [path.join(policyWorkspaceRoot, "src")],
    readGranted: true,
    readGrantedAt: "2026-03-26T10:01:00.000Z",
    workspaceRoot: policyWorkspaceRoot,
    writeMode: "trusted",
  });

  assert.deepEqual(initialPolicy, {
    context_paths: [
      path.resolve(policyWorkspaceRoot, "README.md"),
      path.resolve(policyWorkspaceRoot, "package.json"),
    ],
    known_structure: initialKnownStructure.map((entry) => ({
      ...entry,
      path: path.resolve(entry.path),
    })),
    last_hydrated_at: "2026-03-26T10:05:00.000Z",
    pinned_paths: [path.resolve(policyWorkspaceRoot, "src")],
    read_granted: 1,
    read_granted_at: "2026-03-26T10:01:00.000Z",
    read_grant_mode: null,
    workspace_root: path.resolve(policyWorkspaceRoot),
    operating_mode: "auto",
    write_mode: "trusted",
  });

  const mergedPolicy = await upsertWorkspacePolicy({
    contextPaths: [path.join(policyWorkspaceRoot, "CLAUDE.md")],
    dbPath,
    workspaceRoot: policyWorkspaceRoot,
    writeMode: "conversation",
  });

  assert.deepEqual(mergedPolicy, {
    context_paths: [path.resolve(policyWorkspaceRoot, "CLAUDE.md")],
    known_structure: initialKnownStructure.map((entry) => ({
      ...entry,
      path: path.resolve(entry.path),
    })),
    last_hydrated_at: "2026-03-26T10:05:00.000Z",
    pinned_paths: [path.resolve(policyWorkspaceRoot, "src")],
    read_granted: 1,
    read_granted_at: "2026-03-26T10:01:00.000Z",
    read_grant_mode: null,
    workspace_root: path.resolve(policyWorkspaceRoot),
    operating_mode: "auto",
    write_mode: "conversation",
  });

  assert.deepEqual(await loadWorkspacePolicy({
    dbPath,
    workspaceRoot: policyWorkspaceRoot,
  }), mergedPolicy);
});

test("loadAllWorkspacePolicies includes legacy workspace roots and explicit policy rows", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-substrate-test-"));
  const env = createTestEnv(runtimeRoot);
  const { profileId } = await ensureProfileDirectories("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);
  const scopeId = resolveDefaultScopeId(profileId);
  const actorId = resolvePrimaryActorId(profileId);
  const legacyWorkspaceRoot = path.join(runtimeRoot, "workspace-legacy");
  const policyWorkspaceRoot = path.join(runtimeRoot, "workspace-explicit");

  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });

  await createSubstrateSessionShell({
    actorId,
    dbPath,
    model: "gpt-5.4",
    now: "2026-03-26T11:00:00.000Z",
    profileId,
    scopeId,
    title: "Seed legacy workspace",
    workspaceRoot: legacyWorkspaceRoot,
  });

  await upsertWorkspacePolicy({
    contextPaths: [path.join(policyWorkspaceRoot, "package.json")],
    dbPath,
    knownStructure: [
      {
        name: "package.json",
        path: path.join(policyWorkspaceRoot, "package.json"),
        type: "file",
      },
    ],
    pinnedPaths: [path.join(policyWorkspaceRoot, "src")],
    readGranted: true,
    readGrantedAt: "2026-03-26T11:05:00.000Z",
    workspaceRoot: policyWorkspaceRoot,
    writeMode: "trusted",
  });

  assert.deepEqual(await loadAllWorkspacePolicies({ dbPath }), [
    {
      context_paths: [path.resolve(policyWorkspaceRoot, "package.json")],
      known_structure: [
        {
          name: "package.json",
          path: path.resolve(policyWorkspaceRoot, "package.json"),
          type: "file",
        },
      ],
      last_hydrated_at: null,
      pinned_paths: [path.resolve(policyWorkspaceRoot, "src")],
      read_granted: 1,
      read_granted_at: "2026-03-26T11:05:00.000Z",
      read_grant_mode: null,
      workspace_root: path.resolve(policyWorkspaceRoot),
      operating_mode: "auto",
      write_mode: "trusted",
    },
    {
      context_paths: [],
      known_structure: [],
      last_hydrated_at: null,
      pinned_paths: [],
      read_granted: 0,
      read_granted_at: null,
      read_grant_mode: null,
      workspace_root: path.resolve(legacyWorkspaceRoot),
      operating_mode: "auto",
      write_mode: "conversation",
    },
  ]);
});

test("upsertWorkspacePolicy persists workspace permission modes", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-substrate-test-"));
  const env = createTestEnv(runtimeRoot);
  const { profileId } = await ensureProfileDirectories("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);
  const workspaceRoot = path.join(runtimeRoot, "workspace-permission-mode");

  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });

  const policy = await upsertWorkspacePolicy({
    dbPath,
    readGrantMode: "once",
    readGranted: true,
    readGrantedAt: "2026-03-26T10:01:00.000Z",
    workspaceRoot,
  });

  assert.equal(policy.read_granted, 1);
  assert.equal(policy.read_grant_mode, "once");

  const clearedPolicy = await upsertWorkspacePolicy({
    dbPath,
    readGranted: false,
    readGrantedAt: null,
    workspaceRoot,
  });

  assert.equal(clearedPolicy.read_granted, 0);
  assert.equal(clearedPolicy.read_grant_mode, "once");
});

test("evaluateDesktopPolicy returns reproducible allow, block, and escalate outcomes", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-substrate-test-"));
  const env = createTestEnv(runtimeRoot);
  const { profileId } = await ensureProfileDirectories("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);
  const scopeId = resolveDefaultScopeId(profileId);

  const bootstrap = await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });
  await upsertSubstrateActor({
    actorId: "actor_ops_team_workspace_assistant",
    dbPath,
    displayName: "Workspace assistant",
    kind: "agent",
    metadata: {
      capabilities: ["session.start", "workspace.use", "workspace.write"],
      role: "assistant",
      trustLevel: "low",
    },
    profileId,
    scopeId,
  });

  const owner = await getSubstrateActor({
    actorId: bootstrap.actorId,
    dbPath,
  });
  const assistant = await getSubstrateActor({
    actorId: "actor_ops_team_workspace_assistant",
    dbPath,
  });

  const allowDecision = evaluateDesktopPolicy({
    actor: owner,
    capability: "settings.manage",
    scope: { id: scopeId },
  });
  const blockDecision = evaluateDesktopPolicy({
    actor: assistant,
    capability: "settings.manage",
    scope: { id: scopeId },
  });
  const escalateDecision = evaluateDesktopPolicy({
    actor: assistant,
    capability: "workspace.write",
    scope: { id: scopeId },
  });
  const repeatedDecision = evaluateDesktopPolicy({
    actor: assistant,
    capability: "workspace.write",
    scope: { id: scopeId },
  });

  assert.deepEqual(allowDecision, {
    actorId: bootstrap.actorId,
    capability: "settings.manage",
    decision: "allow",
    matchedRule: "capability-granted",
    reason: 'This actor is allowed to use "settings.manage" in the requested scope.',
    requiresApproval: false,
    role: "owner",
    scopeId,
    trustLevel: "medium",
  });
  assert.deepEqual(blockDecision, {
    actorId: "actor_ops_team_workspace_assistant",
    capability: "settings.manage",
    decision: "block",
    matchedRule: "missing-capability-grant",
    reason: 'This actor does not have the "settings.manage" capability.',
    requiresApproval: false,
    role: "assistant",
    scopeId,
    trustLevel: "low",
  });
  assert.deepEqual(escalateDecision, {
    actorId: "actor_ops_team_workspace_assistant",
    capability: "workspace.write",
    decision: "escalate",
    matchedRule: "low-trust-agent-escalation",
    reason: 'Low-trust agents need approval before using "workspace.write".',
    requiresApproval: true,
    role: "assistant",
    scopeId,
    trustLevel: "low",
  });
  assert.deepEqual(repeatedDecision, escalateDecision);
});

test("upsertSubstrateScopeSettingsPolicy stores normalized scope policy metadata", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-substrate-test-"));
  const env = createTestEnv(runtimeRoot);
  const { profileId } = await ensureProfileDirectories("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);
  const scopeId = resolveDefaultScopeId(profileId);

  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });

  await upsertSubstrateScopeSettingsPolicy({
    dbPath,
    scopeId,
    settingsPolicy: {
      approvalPosture: "onRequest",
      sandboxPosture: "readOnly",
    },
  });

  const scope = await getSubstrateScope({
    dbPath,
    scopeId,
  });
  assert.deepEqual(scope?.metadata, {
    defaultScope: true,
    settingsPolicy: {
      approvalPosture: "onRequest",
      sandboxPosture: "readOnly",
    },
  });
});

test("createSubstrateSessionShell and finalizeSubstrateSessionStart register a workspace-backed session", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-substrate-test-"));
  const env = createTestEnv(runtimeRoot);
  const { profileId } = await ensureProfileDirectories("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);
  const scopeId = resolveDefaultScopeId(profileId);
  const actorId = resolvePrimaryActorId(profileId);
  const workspaceRoot = path.join(runtimeRoot, "workspace-alpha");

  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });

  const shell = await createSubstrateSessionShell({
    actorId,
    dbPath,
    effort: "medium",
    model: "gpt-5.4",
    now: "2026-03-24T10:00:00.000Z",
    profileId,
    scopeId,
    title: "Investigate failing build",
    workspaceRoot,
  });

  await finalizeSubstrateSessionStart({
    actorId,
    codexThreadId: "thread-123",
    dbPath,
    effort: "medium",
    model: "gpt-5.4",
    now: "2026-03-24T10:00:02.000Z",
    profileId,
    scopeId,
    sessionId: shell.sessionId,
    threadTitle: "Investigate failing build",
    turnId: "turn-123",
  });

  const db = new DatabaseSync(dbPath);
  try {
    const session = db.prepare(
      "SELECT codex_thread_id, workspace_id, title, model, effort, metadata FROM sessions WHERE id = ?",
    ).get(shell.sessionId);
    assert.equal(session.codex_thread_id, "thread-123");
    assert.equal(session.title, "Investigate failing build");
    assert.equal(session.model, "gpt-5.4");
    assert.equal(session.effort, "medium");
    assert.deepEqual(JSON.parse(session.metadata), {
      workspaceRoot: path.resolve(workspaceRoot),
    });
    assert.equal(typeof session.workspace_id, "string");

    const workspace = db.prepare(
      "SELECT root_path, session_count, last_active_at FROM workspaces WHERE id = ?",
    ).get(session.workspace_id);
    assert.equal(workspace.root_path, path.resolve(workspaceRoot));
    assert.equal(workspace.session_count, 1);
    assert.equal(workspace.last_active_at, "2026-03-24T10:00:02.000Z");

    const verbs = db.prepare("SELECT verb FROM events ORDER BY ts, rowid").all().map((row) => row.verb);
    assert.deepEqual(verbs, [
      "workspace.registered",
      "workspace.bound",
      "session.started",
    ]);
  } finally {
    db.close();
  }
});

test("ensureSubstrateSessionForThread reuses the session and binds a workspace later", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-substrate-test-"));
  const env = createTestEnv(runtimeRoot);
  const { profileId } = await ensureProfileDirectories("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);
  const scopeId = resolveDefaultScopeId(profileId);
  const actorId = resolvePrimaryActorId(profileId);
  const artifactRoot = path.join(runtimeRoot, "artifacts", "session-1");
  const workspaceRoot = path.join(runtimeRoot, "workspace-beta");

  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });

  const first = await ensureSubstrateSessionForThread({
    actorId,
    artifactRoot,
    codexThreadId: "thread-existing",
    dbPath,
    effort: "high",
    model: "gpt-5.4",
    now: "2026-03-24T11:00:00.000Z",
    profileId,
    scopeId,
    threadTitle: "Plan release",
    turnId: "turn-first",
  });

  const second = await ensureSubstrateSessionForThread({
    actorId,
    artifactRoot,
    codexThreadId: "thread-existing",
    dbPath,
    effort: "high",
    model: "gpt-5.4",
    now: "2026-03-24T11:05:00.000Z",
    profileId,
    scopeId,
    threadTitle: "Plan release",
    turnId: "turn-second",
    workspaceRoot,
  });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.sessionId, second.sessionId);

  const db = new DatabaseSync(dbPath);
  try {
    const session = db.prepare(
      "SELECT codex_thread_id, workspace_id, metadata FROM sessions WHERE id = ?",
    ).get(first.sessionId);
    assert.equal(session.codex_thread_id, "thread-existing");
    assert.equal(typeof session.workspace_id, "string");
    assert.deepEqual(JSON.parse(session.metadata), {
      artifactRoot: path.resolve(artifactRoot),
      workspaceRoot: path.resolve(workspaceRoot),
    });

    const workspace = db.prepare(
      "SELECT root_path, session_count, last_active_at FROM workspaces WHERE id = ?",
    ).get(session.workspace_id);
    assert.equal(workspace.root_path, path.resolve(workspaceRoot));
    assert.equal(workspace.session_count, 1);
    assert.equal(workspace.last_active_at, "2026-03-24T11:05:00.000Z");

    const verbs = db.prepare("SELECT verb FROM events ORDER BY ts, rowid").all().map((row) => row.verb);
    assert.deepEqual(verbs, [
      "session.started",
      "workspace.registered",
      "workspace.bound",
    ]);
  } finally {
    db.close();
  }
});

test("createSubstratePlan stores a durable session-linked plan and records approval transitions", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-substrate-test-"));
  const env = createTestEnv(runtimeRoot);
  const { profileId } = await ensureProfileDirectories("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);
  const scopeId = resolveDefaultScopeId(profileId);
  const actorId = resolvePrimaryActorId(profileId);
  const workspaceRoot = path.join(runtimeRoot, "workspace-plan");

  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });

  const shell = await createSubstrateSessionShell({
    actorId,
    dbPath,
    model: "gpt-5.4",
    now: "2026-03-24T12:00:00.000Z",
    profileId,
    scopeId,
    title: "Build landing page",
    workspaceRoot,
  });

  await finalizeSubstrateSessionStart({
    actorId,
    codexThreadId: "thread-plan-1",
    dbPath,
    model: "gpt-5.4",
    now: "2026-03-24T12:00:02.000Z",
    profileId,
    scopeId,
    sessionId: shell.sessionId,
    threadTitle: "Build landing page",
    turnId: "turn-plan-1",
  });

  const createdPlan = await createSubstratePlan({
    actorId,
    affectedLocations: [workspaceRoot, path.join(workspaceRoot, "src")],
    assumptions: ["Audience is early-stage founders"],
    dbPath,
    intendedActions: ["Draft hero copy", "Define page sections"],
    metadata: {
      approvalLevel: "workspace-write",
      source: "product",
    },
    now: "2026-03-24T12:00:03.000Z",
    requestSummary: "Create a landing page plan",
    sessionId: shell.sessionId,
  });

  const updatedPlan = await updateSubstratePlan({
    actorId,
    assumptions: ["Audience is early-stage founders", "Brand tone is direct"],
    dbPath,
    intendedActions: ["Draft hero copy", "Define page sections", "Outline CTA"],
    now: "2026-03-24T12:00:04.000Z",
    planId: createdPlan.id,
    status: "ready_for_approval",
  });

  const approvedPlan = await resolveSubstratePlanApproval({
    actorId,
    dbPath,
    decision: "accept",
    now: "2026-03-24T12:00:05.000Z",
    planId: createdPlan.id,
  });

  assert.equal(createdPlan.session_id, shell.sessionId);
  assert.equal(createdPlan.profile_id, profileId);
  assert.equal(createdPlan.scope_id, scopeId);
  assert.equal(createdPlan.actor_id, actorId);
  assert.equal(createdPlan.approval_status, "pending");
  assert.deepEqual(createdPlan.assumptions, ["Audience is early-stage founders"]);
  assert.deepEqual(createdPlan.intended_actions, ["Draft hero copy", "Define page sections"]);
  assert.deepEqual(createdPlan.affected_locations, [
    path.resolve(workspaceRoot),
    path.resolve(workspaceRoot, "src"),
  ]);
  assert.deepEqual(createdPlan.metadata, {
    approvalLevel: "workspace-write",
    source: "product",
  });

  assert.equal(updatedPlan.id, createdPlan.id);
  assert.equal(updatedPlan.status, "ready_for_approval");
  assert.deepEqual(updatedPlan.assumptions, [
    "Audience is early-stage founders",
    "Brand tone is direct",
  ]);
  assert.deepEqual(updatedPlan.intended_actions, [
    "Draft hero copy",
    "Define page sections",
    "Outline CTA",
  ]);

  assert.equal(approvedPlan.id, createdPlan.id);
  assert.equal(approvedPlan.approval_status, "approved");
  assert.equal(approvedPlan.approved_by_actor_id, actorId);
  assert.equal(approvedPlan.approved_at, "2026-03-24T12:00:05.000Z");
  assert.equal(approvedPlan.rejected_by_actor_id, null);
  assert.equal(approvedPlan.rejected_at, null);

  const db = new DatabaseSync(dbPath);
  try {
    const planRow = db.prepare(
      `SELECT session_id, profile_id, scope_id, actor_id, status, request_summary, assumptions, intended_actions, affected_locations, approval_status, approved_by_actor_id, approved_at, metadata
       FROM plans
       WHERE id = ?`,
    ).get(createdPlan.id);
    assert.equal(planRow.session_id, shell.sessionId);
    assert.equal(planRow.profile_id, profileId);
    assert.equal(planRow.scope_id, scopeId);
    assert.equal(planRow.actor_id, actorId);
    assert.equal(planRow.status, "ready_for_approval");
    assert.equal(planRow.request_summary, "Create a landing page plan");
    assert.deepEqual(JSON.parse(planRow.assumptions), [
      "Audience is early-stage founders",
      "Brand tone is direct",
    ]);
    assert.deepEqual(JSON.parse(planRow.intended_actions), [
      "Draft hero copy",
      "Define page sections",
      "Outline CTA",
    ]);
    assert.deepEqual(JSON.parse(planRow.affected_locations), [
      path.resolve(workspaceRoot),
      path.resolve(workspaceRoot, "src"),
    ]);
    assert.equal(planRow.approval_status, "approved");
    assert.equal(planRow.approved_by_actor_id, actorId);
    assert.equal(planRow.approved_at, "2026-03-24T12:00:05.000Z");
    assert.deepEqual(JSON.parse(planRow.metadata), {
      approvalLevel: "workspace-write",
      source: "product",
    });

    const planEvents = db.prepare(
      "SELECT verb, subject_type, subject_id, session_id, actor_id FROM events WHERE subject_type = 'plan' ORDER BY ts ASC, rowid ASC",
    ).all().map((row) => ({ ...row }));
    assert.deepEqual(planEvents, [
      {
        actor_id: actorId,
        session_id: shell.sessionId,
        subject_id: createdPlan.id,
        subject_type: "plan",
        verb: "plan.created",
      },
      {
        actor_id: actorId,
        session_id: shell.sessionId,
        subject_id: createdPlan.id,
        subject_type: "plan",
        verb: "plan.updated",
      },
      {
        actor_id: actorId,
        session_id: shell.sessionId,
        subject_id: createdPlan.id,
        subject_type: "plan",
        verb: "plan.approved",
      },
    ]);
  } finally {
    db.close();
  }

  await deleteSubstrateSession({
    dbPath,
    sessionId: shell.sessionId,
  });

  const cleanupDb = new DatabaseSync(dbPath);
  try {
    const remainingPlans = cleanupDb.prepare(
      "SELECT COUNT(*) AS count FROM plans WHERE session_id = ?",
    ).get(shell.sessionId);
    assert.equal(remainingPlans.count, 0);
  } finally {
    cleanupDb.close();
  }
});

test("ingestSubstratePlanSuggestion creates a product fallback plan and lets engine suggestions refine it", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-substrate-test-"));
  const env = createTestEnv(runtimeRoot);
  const { profileId } = await ensureProfileDirectories("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);
  const scopeId = resolveDefaultScopeId(profileId);
  const actorId = resolvePrimaryActorId(profileId);
  const workspaceRoot = path.join(runtimeRoot, "workspace-plan-ingest");

  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });

  const shell = await createSubstrateSessionShell({
    actorId,
    dbPath,
    model: "gpt-5.4",
    now: "2026-03-25T09:00:00.000Z",
    profileId,
    scopeId,
    title: "Build landing page",
    workspaceRoot,
  });

  await finalizeSubstrateSessionStart({
    actorId,
    codexThreadId: "thread-plan-ingest-1",
    dbPath,
    model: "gpt-5.4",
    now: "2026-03-25T09:00:01.000Z",
    profileId,
    scopeId,
    sessionId: shell.sessionId,
    threadTitle: "Build landing page",
    turnId: "turn-plan-ingest-1",
    workspaceRoot,
  });

  const fallbackPlan = await ingestSubstratePlanSuggestion({
    actorId,
    dbPath,
    metadata: {
      sourceEvent: "runDesktopTask",
    },
    now: "2026-03-25T09:00:02.000Z",
    prompt: "Build a landing page",
    sessionId: shell.sessionId,
    source: "product",
    turnId: "turn-plan-ingest-1",
  });

  assert.equal(fallbackPlan.status, "generating");
  assert.equal(fallbackPlan.request_summary, "Build a landing page.");
  assert.deepEqual(fallbackPlan.affected_locations, [path.resolve(workspaceRoot)]);
  assert.deepEqual(fallbackPlan.intended_actions, []);
  assert.equal(fallbackPlan.metadata.source, "product");
  assert.equal(fallbackPlan.metadata.fallbackGenerated, true);
  assert.equal(fallbackPlan.metadata.structuredSource, false);

  const refinedPlan = await ingestSubstratePlanSuggestion({
    actorId,
    dbPath,
    metadata: {
      sourceEvent: "turn/plan/updated",
    },
    now: "2026-03-25T09:00:03.000Z",
    planData: {
      explanation: "Build a landing page for the new launch.",
      plan: [
        { step: "Draft hero copy", status: "completed" },
        { step: "Outline the page sections", status: "inProgress" },
      ],
    },
    planText: "1. Draft hero copy\n2. Outline the page sections",
    prompt: "Build a landing page",
    sessionId: shell.sessionId,
    source: "engine",
    turnId: "turn-plan-ingest-1",
  });

  assert.equal(refinedPlan.id, fallbackPlan.id);
  assert.equal(refinedPlan.status, "ready_for_approval");
  assert.equal(refinedPlan.request_summary, "Build a landing page.");
  assert.deepEqual(refinedPlan.assumptions, []);
  assert.deepEqual(refinedPlan.intended_actions, [
    "Draft hero copy",
    "Outline the page sections",
  ]);
  assert.deepEqual(refinedPlan.affected_locations, [path.resolve(workspaceRoot)]);
  assert.equal(refinedPlan.metadata.source, "engine");
  assert.equal(refinedPlan.metadata.fallbackGenerated, false);
  assert.equal(refinedPlan.metadata.structuredSource, true);
  assert.equal(refinedPlan.metadata.sourceTurnId, "turn-plan-ingest-1");
  assert.deepEqual(refinedPlan.metadata.plan, [
    { step: "Draft hero copy", status: "completed" },
    { step: "Outline the page sections", status: "inProgress" },
  ]);
  assert.equal(refinedPlan.metadata.explanation, "Build a landing page for the new launch.");
  assert.equal(refinedPlan.metadata.sourcePlanText, "1. Draft hero copy\n2. Outline the page sections");

  const db = new DatabaseSync(dbPath);
  try {
    const planEvents = db.prepare(
      "SELECT verb, subject_type, subject_id FROM events WHERE subject_type = 'plan' ORDER BY ts ASC, rowid ASC",
    ).all().map((row) => ({ ...row }));
    assert.deepEqual(planEvents, [
      {
        subject_id: fallbackPlan.id,
        subject_type: "plan",
        verb: "plan.created",
      },
      {
        subject_id: fallbackPlan.id,
        subject_type: "plan",
        verb: "plan.updated",
      },
    ]);
  } finally {
    db.close();
  }
});
