import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { canonicalizeSignedInProfile } from "./profile-merge.js";
import {
  ensureProfileDirectories,
  loadActiveProfileId,
  loadProfileArtifactRoot,
  persistProfileArtifactRoot,
  persistProfileIdentity,
  resolveEmailProfileId,
  resolveProfileCodexHome,
  resolveProfileSubstrateDbPath,
} from "./profile-state.js";
import { ensureProfileSubstrate } from "../substrate/substrate.js";
import { resolveDefaultScopeId, resolvePrimaryActorId } from "../substrate/substrate-schema.js";
import { openDatabase } from "../substrate/substrate-store-core.js";

function createTestEnv(runtimeRoot) {
  return {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
  };
}

async function seedCodexHomeProfile(profileId, env, { threads, withAuth = false }) {
  const directories = await ensureProfileDirectories(profileId, env);
  const codexHome = directories.codexHome;
  await fs.mkdir(codexHome, { recursive: true });
  if (withAuth) {
    await fs.writeFile(
      path.join(codexHome, "auth.json"),
      JSON.stringify({ auth_mode: "chatgpt", email: "george@example.com" }, null, 2),
      "utf8",
    );
  }

  const dbPath = path.join(codexHome, "state_5.sqlite");
  const db = openDatabase(dbPath);
  try {
    db.exec(
      `CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        rollout_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        source TEXT NOT NULL,
        model_provider TEXT NOT NULL,
        cwd TEXT NOT NULL,
        title TEXT NOT NULL,
        sandbox_policy TEXT NOT NULL,
        approval_mode TEXT NOT NULL,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        has_user_event INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        archived_at INTEGER,
        git_sha TEXT,
        git_branch TEXT,
        git_origin_url TEXT,
        cli_version TEXT NOT NULL DEFAULT '',
        first_user_message TEXT NOT NULL DEFAULT '',
        agent_nickname TEXT,
        agent_role TEXT,
        memory_mode TEXT NOT NULL DEFAULT 'enabled'
      );`,
    );
    const insertThread = db.prepare(
      `INSERT INTO threads (
        id, rollout_path, created_at, updated_at, source, model_provider, cwd, title,
        sandbox_policy, approval_mode, tokens_used, has_user_event, archived, archived_at,
        git_sha, git_branch, git_origin_url, cli_version, first_user_message, agent_nickname,
        agent_role, memory_mode
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, NULL, NULL, NULL, NULL, '', '', NULL, NULL, 'enabled'
      )`,
    );
    for (const thread of threads) {
      insertThread.run(
        thread.id,
        `rollout-${thread.id}.jsonl`,
        Date.now(),
        Date.now(),
        "appServer",
        "openai",
        "/tmp",
        thread.title,
        "workspace-write",
        "auto",
      );
    }
  } finally {
    db.close();
  }

  await fs.writeFile(
    path.join(codexHome, "session_index.jsonl"),
    threads.map((thread) => JSON.stringify({
      id: thread.id,
      thread_name: thread.title,
      updated_at: "2026-04-08T12:00:00.000Z",
    })).join("\n"),
    "utf8",
  );
}

async function seedSubstrateSession(profileId, env, { sessionId, threadId, title }) {
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);
  await ensureProfileSubstrate({
    actorEmail: `${profileId}@example.com`,
    dbPath,
    profileId,
  });
  const db = openDatabase(dbPath);
  try {
    db.prepare(
      `INSERT INTO sessions (
        id, profile_id, scope_id, actor_id, codex_thread_id, workspace_id, title, model, effort, status, started_at, ended_at, summary, metadata
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, 'gpt-5.4', 'high', 'active', ?, NULL, NULL, '{}')`,
    ).run(
      sessionId,
      profileId,
      resolveDefaultScopeId(profileId),
      resolvePrimaryActorId(profileId),
      threadId,
      title,
      "2026-04-08T12:00:00.000Z",
    );
  } finally {
    db.close();
  }
}

test("canonicalizeSignedInProfile merges only the selected and explicitly linked legacy profiles", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-profile-merge-"));
  const env = createTestEnv(runtimeRoot);
  const artifactRoot = path.join(runtimeRoot, "Sense-1");
  await fs.mkdir(artifactRoot, { recursive: true });
  const canonicalProfileId = resolveEmailProfileId("george@example.com");

  await persistProfileArtifactRoot("default", artifactRoot, env);
  await persistProfileArtifactRoot("George", artifactRoot, env);
  await persistProfileArtifactRoot("Jesse", artifactRoot, env);
  await persistProfileIdentity("George", {
    mergedIntoProfileId: canonicalProfileId,
  }, env);

  await seedCodexHomeProfile("default", env, {
    threads: [{ id: "thread-default", title: "Default thread" }],
    withAuth: false,
  });
  await seedCodexHomeProfile("George", env, {
    threads: [{ id: "thread-george", title: "George thread" }],
    withAuth: true,
  });
  await seedCodexHomeProfile("Jesse", env, {
    threads: [{ id: "thread-jesse", title: "Jesse thread" }],
    withAuth: true,
  });
  await seedSubstrateSession("default", env, {
    sessionId: "sess-default",
    threadId: "thread-default",
    title: "Default thread",
  });
  await seedSubstrateSession("George", env, {
    sessionId: "sess-george",
    threadId: "thread-george",
    title: "George thread",
  });
  await seedSubstrateSession("Jesse", env, {
    sessionId: "sess-jesse",
    threadId: "thread-jesse",
    title: "Jesse thread",
  });
  const canonicalProfile = await canonicalizeSignedInProfile({
    currentProfile: {
      id: "default",
      source: "stored",
      rootPath: path.join(runtimeRoot, "profiles", "default"),
      codexHome: resolveProfileCodexHome("default", env),
    },
    displayName: "George Stander",
    email: "george@example.com",
    env,
  });

  assert.equal(canonicalProfile.id, canonicalProfileId);
  assert.equal(await loadActiveProfileId(env), canonicalProfileId);
  assert.equal(await loadProfileArtifactRoot(canonicalProfileId, env), artifactRoot);

  const substrateDb = openDatabase(resolveProfileSubstrateDbPath(canonicalProfileId, env));
  try {
    assert.equal(
      substrateDb.prepare("SELECT COUNT(*) AS count FROM sessions WHERE profile_id = ?").get(canonicalProfileId).count,
      2,
    );
    assert.equal(
      substrateDb.prepare("SELECT COUNT(*) AS count FROM sessions WHERE codex_thread_id = 'thread-jesse'").get().count,
      0,
    );
  } finally {
    substrateDb.close();
  }

  const codexDb = openDatabase(path.join(resolveProfileCodexHome(canonicalProfileId, env), "state_5.sqlite"));
  try {
    assert.equal(codexDb.prepare("SELECT COUNT(*) AS count FROM threads").get().count, 2);
    assert.equal(codexDb.prepare("SELECT COUNT(*) AS count FROM threads WHERE id = 'thread-jesse'").get().count, 0);
  } finally {
    codexDb.close();
  }

  const sessionIndex = await fs.readFile(path.join(resolveProfileCodexHome(canonicalProfileId, env), "session_index.jsonl"), "utf8");
  assert.equal(sessionIndex.trim().split("\n").length, 2);
  await fs.access(path.join(resolveProfileCodexHome(canonicalProfileId, env), "auth.json"));
});
