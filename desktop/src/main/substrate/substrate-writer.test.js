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
  createSubstrateSessionShell,
  ensureProfileSubstrate,
  ensureSubstrateSessionForThread,
  finalizeSubstrateSessionStart,
  getSubstrateSessionByThreadId,
  resolveDefaultScopeId,
  resolvePrimaryActorId,
} from "./substrate.js";
import { listPlansBySession } from "./substrate-reader.js";
import { writeRuntimeMessageToSubstrate } from "./substrate-writer.js";

function createTestEnv(runtimeRoot) {
  return {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
  };
}

async function setupLinkedSession() {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-substrate-writer-test-"));
  const env = createTestEnv(runtimeRoot);
  const { profileId } = await ensureProfileDirectories("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);

  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });

  await ensureSubstrateSessionForThread({
    actorId: "actor_ops_team_primary",
    codexThreadId: "thread-writer-1",
    dbPath,
    model: "gpt-5.4",
    profileId,
    scopeId: "scope_ops-team_private",
    threadTitle: "Writer test thread",
    turnId: "turn-seed-1",
    workspaceRoot: path.join(runtimeRoot, "workspace-writer"),
  });

  return {
    dbPath,
    profileId,
    runtimeRoot,
  };
}

test("writeRuntimeMessageToSubstrate records turn lifecycle and diff-driven file changes for a linked session", async () => {
  const { dbPath } = await setupLinkedSession();
  const linkedSession = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-writer-1",
    dbPath,
  });
  assert.ok(linkedSession);
  const sessionRecordUpdates = [];

  const resolveSessionContextByThreadId = async (threadId) =>
    await getSubstrateSessionByThreadId({
      codexThreadId: threadId,
      dbPath,
    });

  assert.deepEqual(
    await writeRuntimeMessageToSubstrate({
      dbPath,
      message: {
        method: "turn/started",
        params: {
          threadId: "thread-writer-1",
          turnId: "turn-live-1",
        },
      },
      resolveSessionContextByThreadId,
    }),
    { status: "written", threadId: "thread-writer-1" },
  );

  assert.deepEqual(
    await writeRuntimeMessageToSubstrate({
      dbPath,
      message: {
        method: "turn/diff/updated",
        params: {
          threadId: "thread-writer-1",
          turnId: "turn-live-1",
          diffs: [
            { path: "src/App.tsx", hunks: ["+line 1", "+line 2"] },
            { path: "README.md", hunks: ["+docs"] },
          ],
        },
      },
      onSessionRecordUpdate: async (update) => sessionRecordUpdates.push(update),
      resolveSessionContextByThreadId,
    }),
    { status: "written", threadId: "thread-writer-1" },
  );

  assert.deepEqual(
    await writeRuntimeMessageToSubstrate({
      dbPath,
      message: {
        method: "turn/completed",
        params: {
          threadId: "thread-writer-1",
          turnId: "turn-live-1",
          status: "completed",
        },
      },
      resolveSessionContextByThreadId,
    }),
    { status: "written", threadId: "thread-writer-1" },
  );

  const db = new DatabaseSync(dbPath);
  try {
    const runtimeEvents = db.prepare(
      "SELECT verb, subject_type, subject_id, engine_turn_id, after_state, detail FROM events WHERE verb IN ('turn.started', 'file.changed', 'turn.completed') ORDER BY rowid ASC",
    ).all().map((row) => ({ ...row }));
    assert.equal(runtimeEvents.length, 4);
    assert.equal(runtimeEvents[0].verb, "turn.started");
    assert.equal(runtimeEvents[0].engine_turn_id, "turn-live-1");
    assert.deepEqual(JSON.parse(runtimeEvents[0].after_state), {
      status: "running",
    });
    assert.equal(runtimeEvents[1].verb, "file.changed");
    assert.equal(runtimeEvents[1].subject_id, "src/App.tsx");
    assert.deepEqual(JSON.parse(runtimeEvents[1].detail), {
      hunkCount: 2,
      source: "turn/diff/updated",
    });
    assert.equal(runtimeEvents[2].subject_id, "README.md");
    assert.equal(runtimeEvents[3].verb, "turn.completed");
    assert.deepEqual(JSON.parse(runtimeEvents[3].after_state), {
      status: "completed",
    });

    const objectRefs = db.prepare(
      "SELECT ref_type, ref_path, action, metadata FROM object_refs ORDER BY rowid ASC",
    ).all().map((row) => ({ ...row }));
    assert.equal(objectRefs.length, 2);
    assert.equal(objectRefs[0].ref_type, "file");
    assert.equal(objectRefs[0].ref_path, "src/App.tsx");
    assert.equal(objectRefs[0].action, "modified");
    assert.deepEqual(JSON.parse(objectRefs[0].metadata), {
      hunkCount: 2,
      source: "turn/diff/updated",
    });

    const fileWriteEvents = db.prepare(
      "SELECT verb, subject_type, subject_id, session_id, detail FROM events WHERE verb = 'file.write' ORDER BY rowid ASC",
    ).all().map((row) => ({ ...row }));
    assert.equal(fileWriteEvents.length, 2);
    assert.equal(fileWriteEvents[0].subject_type, "file");
    assert.equal(fileWriteEvents[0].subject_id, "src/App.tsx");
    assert.ok(fileWriteEvents[0].session_id);
    assert.deepEqual(JSON.parse(fileWriteEvents[0].detail), {
      action: "modified",
      hunkCount: 2,
      path: "src/App.tsx",
      source: "turn/diff/updated",
    });
    assert.equal(fileWriteEvents[1].subject_id, "README.md");
    assert.deepEqual(sessionRecordUpdates, [
      {
        logCursor: {
          toTs: sessionRecordUpdates[0].logCursor.toTs,
        },
        pathsWritten: ["src/App.tsx", "README.md"],
        sessionId: linkedSession.id,
        threadId: "thread-writer-1",
      },
    ]);
  } finally {
    db.close();
  }
});

test("writeRuntimeMessageToSubstrate persists renamed thread titles without letting placeholders overwrite them", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-substrate-writer-test-"));
  const env = createTestEnv(runtimeRoot);
  const { profileId } = await ensureProfileDirectories("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);

  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });

  await ensureSubstrateSessionForThread({
    actorId: "actor_ops_team_primary",
    codexThreadId: "thread-writer-rename-1",
    dbPath,
    model: "gpt-5.4",
    profileId,
    scopeId: "scope_ops-team_private",
    threadTitle: "Untitled thread",
    turnId: "turn-seed-rename-1",
  });

  const resolveSessionContextByThreadId = async (threadId) =>
    await getSubstrateSessionByThreadId({
      codexThreadId: threadId,
      dbPath,
    });

  assert.deepEqual(
    await writeRuntimeMessageToSubstrate({
      dbPath,
      message: {
        method: "thread/name/updated",
        params: {
          threadId: "thread-writer-rename-1",
          name: "Start a quick QA note about desktop continuity.",
        },
      },
      resolveSessionContextByThreadId,
    }),
    { status: "written", threadId: "thread-writer-rename-1" },
  );

  assert.deepEqual(
    await writeRuntimeMessageToSubstrate({
      dbPath,
      message: {
        method: "thread/name/updated",
        params: {
          threadId: "thread-writer-rename-1",
          name: "Untitled thread",
        },
      },
      resolveSessionContextByThreadId,
    }),
    { status: "ignored", threadId: "thread-writer-rename-1" },
  );

  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-writer-rename-1",
    dbPath,
  });
  assert.equal(session?.title, "Start a quick QA note about desktop continuity.");
});

test("writeRuntimeMessageToSubstrate suggests a descriptive title from early conversation context", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-substrate-writer-test-"));
  const env = createTestEnv(runtimeRoot);
  const { profileId } = await ensureProfileDirectories("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);

  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });

  await ensureSubstrateSessionForThread({
    actorId: "actor_ops_team_primary",
    codexThreadId: "thread-writer-title-1",
    dbPath,
    initialPrompt: "Fix this",
    model: "gpt-5.4",
    profileId,
    scopeId: "scope_ops-team_private",
    threadTitle: "Fix this",
    turnId: "turn-seed-title-1",
  });

  const resolveSessionContextByThreadId = async (threadId) =>
    await getSubstrateSessionByThreadId({
      codexThreadId: threadId,
      dbPath,
    });

  assert.deepEqual(
    await writeRuntimeMessageToSubstrate({
      dbPath,
      message: {
        method: "item/completed",
        params: {
          threadId: "thread-writer-title-1",
          turnId: "turn-live-title-1",
          item: {
            id: "user-title-1",
            type: "userMessage",
            content: [
              { type: "text", text: "Fix this" },
            ],
          },
        },
      },
      resolveSessionContextByThreadId,
    }),
    { status: "written", threadId: "thread-writer-title-1" },
  );

  assert.deepEqual(
    await writeRuntimeMessageToSubstrate({
      dbPath,
      message: {
        method: "item/completed",
        params: {
          threadId: "thread-writer-title-1",
          turnId: "turn-live-title-1",
          item: {
            id: "agent-title-1",
            type: "agentMessage",
            phase: "final_answer",
            text: "I'll inspect the login crash and patch the auth handler.",
          },
        },
      },
      resolveSessionContextByThreadId,
    }),
    {
      status: "written",
      suggestedThreadTitle: "Inspect the login crash and patch the auth handler",
      threadId: "thread-writer-title-1",
    },
  );

  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-writer-title-1",
    dbPath,
  });
  assert.equal(session?.title, "Inspect the login crash and patch the auth handler");
  assert.deepEqual(session?.metadata?.titleContext, {
    initialPrompt: "Fix this",
    seedTitle: "Fix this",
    userText: "Fix this",
    assistantText: "I'll inspect the login crash and patch the auth handler.",
    autoTitle: "Inspect the login crash and patch the auth handler",
  });
});

test("writeRuntimeMessageToSubstrate records canonical runtime activity events for command, write, and read items", async () => {
  const { dbPath } = await setupLinkedSession();
  const linkedSession = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-writer-1",
    dbPath,
  });
  assert.ok(linkedSession);

  const resolveSessionContextByThreadId = async (threadId) =>
    await getSubstrateSessionByThreadId({
      codexThreadId: threadId,
      dbPath,
    });

  assert.deepEqual(
    await writeRuntimeMessageToSubstrate({
      dbPath,
      receivedAt: "2026-03-25T10:00:03.000Z",
      message: {
        method: "item/completed",
        params: {
          threadId: "thread-writer-1",
          turnId: "turn-live-2",
          item: {
            id: "cmd-1",
            type: "commandExecution",
            command: ["git", "status"],
            cwd: "/tmp/project",
            exitCode: 0,
            durationMs: 120,
            status: "completed",
          },
        },
      },
      resolveSessionContextByThreadId,
    }),
    { status: "written", threadId: "thread-writer-1" },
  );

  assert.deepEqual(
    await writeRuntimeMessageToSubstrate({
      dbPath,
      receivedAt: "2026-03-25T10:00:04.000Z",
      message: {
        method: "item/completed",
        params: {
          threadId: "thread-writer-1",
          turnId: "turn-live-2",
          item: {
            id: "review-1",
            type: "exitedReviewMode",
            review: {
              text: "Structured review summary",
            },
          },
        },
      },
      resolveSessionContextByThreadId,
    }),
    { status: "written", threadId: "thread-writer-1" },
  );

  assert.deepEqual(
    await writeRuntimeMessageToSubstrate({
      dbPath,
      receivedAt: "2026-03-25T10:00:05.000Z",
      message: {
        method: "item/completed",
        params: {
          threadId: "thread-writer-1",
          turnId: "turn-live-2",
          item: {
            id: "agent-1",
            type: "agentMessage",
            text: "Inspect /tmp/project/src/main.ts and /tmp/project/README.md before making changes.",
          },
        },
      },
      resolveSessionContextByThreadId,
    }),
    {
      status: "written",
      suggestedThreadTitle: "Inspect /tmp/project/src/main.ts and /tmp/project/README.md before",
      threadId: "thread-writer-1",
    },
  );

  assert.deepEqual(
    await writeRuntimeMessageToSubstrate({
      dbPath,
      receivedAt: "2026-03-25T10:00:03.000Z",
      message: {
        method: "item/completed",
        params: {
          threadId: "thread-writer-1",
          turnId: "turn-live-2",
          item: {
            id: "file-1",
            type: "fileChange",
            status: "completed",
            changes: [
              { path: "src/main.ts", kind: "modified" },
            ],
          },
        },
      },
      resolveSessionContextByThreadId,
    }),
    { status: "written", threadId: "thread-writer-1" },
  );

  assert.deepEqual(
    await writeRuntimeMessageToSubstrate({
      dbPath,
      receivedAt: "2026-03-25T10:00:03.000Z",
      message: {
        method: "item/completed",
        params: {
          threadId: "thread-writer-1",
          turnId: "turn-live-2",
          item: {
            id: "tool-1",
            type: "webSearch",
            query: "sense1 substrate",
            status: "completed",
          },
        },
      },
      resolveSessionContextByThreadId,
    }),
    { status: "written", threadId: "thread-writer-1" },
  );

  assert.deepEqual(
    await writeRuntimeMessageToSubstrate({
      dbPath,
      receivedAt: "2026-03-25T10:00:04.000Z",
      message: {
        method: "item/completed",
        params: {
          threadId: "thread-missing",
          turnId: "turn-live-2",
          item: {
            id: "cmd-missing",
            type: "commandExecution",
          },
        },
      },
      resolveSessionContextByThreadId,
    }),
    { status: "deferred", threadId: "thread-missing" },
  );

  const db = new DatabaseSync(dbPath);
  try {
    const activityEvents = db.prepare(
      "SELECT verb, session_id, subject_type, subject_id, engine_item_id, detail FROM events WHERE verb IN ('command.execute', 'file.write', 'file.read') ORDER BY rowid ASC",
    ).all().map((row) => ({ ...row }));
    assert.equal(activityEvents.length, 4);
    const commandExecuteEvent = activityEvents.find((event) => event.verb === "command.execute");
    const fileWriteEvent = activityEvents.find((event) => event.verb === "file.write");
    const fileReadEvents = activityEvents.filter((event) => event.verb === "file.read");
    assert.ok(commandExecuteEvent);
    assert.ok(fileWriteEvent);
    assert.equal(commandExecuteEvent.session_id, linkedSession.id);
    assert.equal(commandExecuteEvent.subject_type, "command");
    assert.deepEqual(JSON.parse(commandExecuteEvent.detail), {
      command: ["git", "status"],
      cwd: "/tmp/project",
      durationMs: 120,
      exitCode: 0,
      itemId: "cmd-1",
      itemStatus: "completed",
    });
    assert.equal(fileWriteEvent.session_id, linkedSession.id);
    assert.equal(fileWriteEvent.subject_id, "src/main.ts");
    assert.deepEqual(JSON.parse(fileWriteEvent.detail), {
      action: "modified",
      itemId: "file-1",
      itemStatus: "completed",
      path: "src/main.ts",
    });
    assert.deepEqual(fileReadEvents.map((event) => event.subject_id), [
      "/tmp/project/src/main.ts",
      "/tmp/project/README.md",
    ]);

    const events = db.prepare(
      "SELECT verb, subject_type, subject_id, engine_item_id, detail FROM events WHERE verb IN ('tool.completed', 'review.completed') ORDER BY rowid ASC",
    ).all().map((row) => ({ ...row }));
    assert.equal(events.length, 2);
    const toolEvent = events.find((event) => event.verb === "tool.completed");
    const reviewEvent = events.find((event) => event.verb === "review.completed");
    assert.ok(toolEvent);
    assert.ok(reviewEvent);
    assert.deepEqual(JSON.parse(toolEvent.detail), {
      itemType: "webSearch",
      path: null,
      query: "sense1 substrate",
      status: "completed",
      tool: null,
    });
    assert.deepEqual(JSON.parse(reviewEvent.detail), {
      summary: "Structured review summary",
    });

    const refs = db.prepare(
      "SELECT ref_type, ref_path, ref_id, action, metadata FROM object_refs WHERE ref_id = 'file-1' ORDER BY rowid ASC",
    ).all().map((row) => ({ ...row }));
    assert.equal(refs.length, 1);
    assert.equal(refs[0].ref_path, "src/main.ts");
    assert.equal(refs[0].action, "modified");
    assert.deepEqual(JSON.parse(refs[0].metadata), {
      itemId: "file-1",
      source: "item/completed",
      status: "completed",
    });

    const session = db.prepare(
      "SELECT summary, metadata FROM sessions WHERE codex_thread_id = 'thread-writer-1'",
    ).get();
    assert.equal(session.summary, "Structured review summary");
    const sessionMetadata = JSON.parse(session.metadata);
    assert.equal(sessionMetadata.reviewSummary.summary, "Structured review summary");
    assert.match(sessionMetadata.reviewSummary.updatedAt, /202\d-/);
  } finally {
    db.close();
  }
});

test("writeRuntimeMessageToSubstrate records plan updates and first-class question objects", async () => {
  const { dbPath } = await setupLinkedSession();

  const resolveSessionContextByThreadId = async (threadId) =>
    await getSubstrateSessionByThreadId({
      codexThreadId: threadId,
      dbPath,
    });

  assert.deepEqual(
    await writeRuntimeMessageToSubstrate({
      dbPath,
      message: {
        method: "turn/plan/updated",
        params: {
          explanation: "Clarify the target environment before work starts.",
          plan: [
            { step: "Clarify scope", status: "completed" },
            { step: "Draft plan", status: "inProgress" },
          ],
          threadId: "thread-writer-1",
          turnId: "turn-live-3",
        },
      },
      resolveSessionContextByThreadId,
    }),
    { status: "written", threadId: "thread-writer-1" },
  );

  assert.deepEqual(
    await writeRuntimeMessageToSubstrate({
      dbPath,
      message: {
        id: 321,
        method: "tool/requestUserInput",
        params: {
          threadId: "thread-writer-1",
          turnId: "turn-live-3",
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
      },
      resolveSessionContextByThreadId,
    }),
    { status: "written", threadId: "thread-writer-1" },
  );

  const db = new DatabaseSync(dbPath);
  try {
    const plan = db.prepare(
      "SELECT id, request_summary, intended_actions, metadata FROM plans ORDER BY rowid DESC LIMIT 1",
    ).get();
    assert.equal(plan.request_summary, "Writer test thread.");
    assert.deepEqual(JSON.parse(plan.intended_actions), ["Clarify scope", "Draft plan"]);
    assert.deepEqual(JSON.parse(plan.metadata), {
      explanation: "Clarify the target environment before work starts.",
      fallbackGenerated: false,
      normalizationVersion: 1,
      plan: [
        { step: "Clarify scope", status: "completed" },
        { step: "Draft plan", status: "inProgress" },
      ],
      source: "engine",
      sourceEvent: "turn/plan/updated",
      sourcePlanText: "1. Clarify scope\n2. Draft plan",
      sourceTurnId: "turn-live-3",
      structuredSource: true,
    });

    const planEvent = db.prepare(
      "SELECT verb, subject_type, subject_id, engine_turn_id, after_state, detail FROM events WHERE verb = 'plan.created' ORDER BY rowid DESC LIMIT 1",
    ).get();
    assert.ok(planEvent);
    assert.equal(planEvent.verb, "plan.created");
    assert.equal(planEvent.subject_type, "plan");
    assert.equal(planEvent.subject_id, plan.id);
    assert.deepEqual(JSON.parse(planEvent.after_state), {
      approval_status: "pending",
      request_summary: "Writer test thread.",
      status: "ready_for_approval",
    });
    const planDetail = JSON.parse(planEvent.detail);
    assert.deepEqual(planDetail.assumptions, []);
    assert.deepEqual(planDetail.intendedActions, ["Clarify scope", "Draft plan"]);
    assert.equal(planDetail.source, "engine");
    assert.equal(planDetail.sourceTurnId, "turn-live-3");
    assert.equal(planDetail.structuredSource, true);
    assert.ok(Array.isArray(planDetail.affectedLocations));
    assert.equal(planDetail.affectedLocations.length, 1);

    const question = db.prepare(
      "SELECT request_id, prompt, status, target_kind, target_id, target_snapshot, metadata FROM questions ORDER BY rowid DESC LIMIT 1",
    ).get();
    assert.equal(question.request_id, 321);
    assert.equal(question.prompt, "Which environment should I use?");
    assert.equal(question.status, "pending");
    assert.equal(question.target_kind, "pending_run");
    assert.equal(question.target_id, "turn-live-3");
    assert.deepEqual(JSON.parse(question.target_snapshot), {
      sessionId: db.prepare("SELECT id FROM sessions WHERE codex_thread_id = ?").get("thread-writer-1").id,
      threadId: "thread-writer-1",
      turnId: "turn-live-3",
    });
    assert.deepEqual(JSON.parse(question.metadata), {
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
      source: "tool/requestUserInput",
      threadId: "thread-writer-1",
    });

    const questionEvent = db.prepare(
      "SELECT verb, subject_type, detail FROM events WHERE verb = 'question.asked' ORDER BY rowid DESC LIMIT 1",
    ).get();
    assert.equal(questionEvent.subject_type, "question");
    assert.deepEqual(JSON.parse(questionEvent.detail), {
      prompt: "Which environment should I use?",
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
      requestId: 321,
      targetId: "turn-live-3",
      targetKind: "pending_run",
      threadId: "thread-writer-1",
    });

    const refs = db.prepare(
      "SELECT ref_type, action, metadata FROM object_refs WHERE ref_type IN ('plan', 'question') ORDER BY rowid ASC",
    ).all().map((row) => ({ ...row }));
    assert.equal(refs.length, 1);
    assert.equal(refs[0].ref_type, "question");
    assert.deepEqual(JSON.parse(refs[0].metadata), {
      prompt: "Which environment should I use?",
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
      requestId: 321,
      status: "pending",
      targetId: "turn-live-3",
      targetKind: "pending_run",
    });
  } finally {
    db.close();
  }
});

test("writeRuntimeMessageToSubstrate reports a raw turn notification as deferred before thread linkage", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-substrate-writer-test-"));
  const env = createTestEnv(runtimeRoot);
  const { profileId } = await ensureProfileDirectories("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);

  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });

  const shell = await createSubstrateSessionShell({
    actorId: "actor_ops_team_primary",
    dbPath,
    model: "gpt-5.4",
    effort: null,
    now: "2026-03-24T12:30:00.000Z",
    profileId,
    scopeId: "scope_ops-team_private",
    threadTitle: "Race window thread",
    workspaceRoot: path.join(runtimeRoot, "workspace-race"),
  });

  const resolveSessionContextByThreadId = async (threadId) =>
    await getSubstrateSessionByThreadId({
      codexThreadId: threadId,
      dbPath,
    });

  assert.deepEqual(
    await writeRuntimeMessageToSubstrate({
      dbPath,
      message: {
        method: "turn/started",
        params: {
          threadId: "thread-race-1",
          turnId: "turn-race-1",
        },
      },
      resolveSessionContextByThreadId,
    }),
    { status: "deferred", threadId: "thread-race-1" },
  );

  const beforeLinkDb = new DatabaseSync(dbPath);
  try {
    const beforeLinkCount = beforeLinkDb.prepare(
      "SELECT COUNT(*) AS count FROM events WHERE verb = 'turn.started' AND session_id = ?",
    ).get(shell.sessionId).count;
    assert.equal(beforeLinkCount, 0);
  } finally {
    beforeLinkDb.close();
  }

  const turnLinkedDb = await finalizeSubstrateSessionStart({
    actorId: "actor_ops_team_primary",
    codexThreadId: "thread-race-1",
    dbPath,
    model: "gpt-5.4",
    effort: null,
    now: "2026-03-24T12:30:02.000Z",
    profileId,
    scopeId: "scope_ops-team_private",
    sessionId: shell.sessionId,
    threadTitle: "Race window thread",
    turnId: "turn-race-2",
  });

  assert.equal(turnLinkedDb.sessionId, shell.sessionId);

  assert.deepEqual(
    await writeRuntimeMessageToSubstrate({
      dbPath,
      message: {
        method: "turn/started",
        params: {
          threadId: "thread-race-1",
          turnId: "turn-race-1",
        },
      },
      resolveSessionContextByThreadId,
    }),
    { status: "written", threadId: "thread-race-1" },
  );

  const db = new DatabaseSync(dbPath);
  try {
    const runtimeEvents = db.prepare(
      "SELECT verb, engine_turn_id, subject_id FROM events WHERE verb IN ('turn.started', 'turn.completed') ORDER BY rowid ASC",
    ).all().map((row) => ({ ...row }));
    assert.deepEqual(runtimeEvents, [
      {
        engine_turn_id: "turn-race-1",
        subject_id: shell.sessionId,
        verb: "turn.started",
      },
    ]);
  } finally {
    db.close();
  }
});

test("writeRuntimeMessageToSubstrate ingests engine plan updates into product plans", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-substrate-writer-test-"));
  const env = createTestEnv(runtimeRoot);
  const { profileId } = await ensureProfileDirectories("ops-team", env);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);
  const scopeId = resolveDefaultScopeId(profileId);
  const actorId = resolvePrimaryActorId(profileId);
  const workspaceRoot = path.join(runtimeRoot, "workspace-writer-plan");

  await ensureProfileSubstrate({
    actorEmail: "george@example.com",
    dbPath,
    profileId,
  });

  const shell = await createSubstrateSessionShell({
    actorId,
    dbPath,
    model: "gpt-5.4",
    now: "2026-03-25T10:00:00.000Z",
    profileId,
    scopeId,
    title: "Build launch page",
    workspaceRoot,
  });

  await finalizeSubstrateSessionStart({
    actorId,
    codexThreadId: "thread-writer-plan-1",
    dbPath,
    model: "gpt-5.4",
    now: "2026-03-25T10:00:01.000Z",
    profileId,
    scopeId,
    sessionId: shell.sessionId,
    threadTitle: "Build launch page",
    turnId: "turn-writer-plan-1",
    workspaceRoot,
  });

  const outcome = await writeRuntimeMessageToSubstrate({
    dbPath,
    message: {
      method: "turn/plan/updated",
      params: {
        explanation: "Build the launch page.",
        plan: [
          { step: "Draft hero section", status: "completed" },
          { step: "Define supporting sections", status: "inProgress" },
        ],
        threadId: "thread-writer-plan-1",
        turnId: "turn-writer-plan-1",
      },
    },
    receivedAt: "2026-03-25T10:00:02.000Z",
    resolveSessionContextByThreadId: async (threadId) =>
      await getSubstrateSessionByThreadId({ dbPath, codexThreadId: threadId }),
  });

  assert.deepEqual(outcome, {
    status: "written",
    threadId: "thread-writer-plan-1",
  });

  const plans = await listPlansBySession({
    dbPath,
    sessionId: shell.sessionId,
  });
  assert.equal(plans.length, 1);
  assert.equal(plans[0].request_summary, "Build launch page.");
  assert.deepEqual(plans[0].intended_actions, [
    "Draft hero section",
    "Define supporting sections",
  ]);
  assert.deepEqual(plans[0].affected_locations, [path.resolve(workspaceRoot)]);
  assert.equal(plans[0].metadata.source, "engine");
  assert.equal(plans[0].metadata.sourceEvent, "turn/plan/updated");
  assert.equal(plans[0].metadata.explanation, "Build the launch page.");
  assert.deepEqual(plans[0].metadata.plan, [
    { step: "Draft hero section", status: "completed" },
    { step: "Define supporting sections", status: "inProgress" },
  ]);
  assert.equal(
    plans[0].metadata.sourcePlanText,
    "1. Draft hero section\n2. Define supporting sections",
  );

  await fs.rm(runtimeRoot, { recursive: true, force: true });
});

test("writeRuntimeMessageToSubstrate emits runtime activity hooks and session patch hints", async () => {
  const { dbPath, runtimeRoot } = await setupLinkedSession();
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: "thread-writer-1",
    dbPath,
  });
  assert.ok(session);

  const runtimeActivities = [];
  const sessionRecordUpdates = [];
  const resolveSessionContextByThreadId = async (threadId) =>
    await getSubstrateSessionByThreadId({
      codexThreadId: threadId,
      dbPath,
    });

  assert.deepEqual(
    await writeRuntimeMessageToSubstrate({
      dbPath,
      receivedAt: "2026-03-25T10:00:05.000Z",
      message: {
        method: "item/completed",
        params: {
          threadId: "thread-writer-1",
          turnId: "turn-live-activity-1",
          item: {
            id: "cmd-activity-1",
            type: "commandExecution",
            command: ["git", "status"],
            cwd: "/tmp/project",
            durationMs: 18,
            exitCode: 0,
            status: "completed",
          },
        },
      },
      onRuntimeActivity: async (activity) => runtimeActivities.push(activity),
      onSessionRecordUpdate: async (update) => sessionRecordUpdates.push(update),
      resolveSessionContextByThreadId,
    }),
    { status: "written", threadId: "thread-writer-1" },
  );

  assert.deepEqual(
    await writeRuntimeMessageToSubstrate({
      dbPath,
      receivedAt: "2026-03-25T10:00:04.000Z",
      message: {
        method: "item/completed",
        params: {
          threadId: "thread-writer-1",
          turnId: "turn-live-activity-2",
          item: {
            changes: [
              { kind: "modified", path: "/tmp/project/src/app.ts" },
              { kind: "modified", path: "/tmp/project/src/app.ts" },
              { kind: "created", path: "/tmp/project/README.md" },
            ],
            id: "file-activity-1",
            type: "fileChange",
            status: "completed",
          },
        },
      },
      onRuntimeActivity: async (activity) => runtimeActivities.push(activity),
      onSessionRecordUpdate: async (update) => sessionRecordUpdates.push(update),
      resolveSessionContextByThreadId,
    }),
    { status: "written", threadId: "thread-writer-1" },
  );

  assert.deepEqual(
    await writeRuntimeMessageToSubstrate({
      dbPath,
      receivedAt: "2026-03-25T10:00:05.000Z",
      message: {
        method: "item/completed",
        params: {
          threadId: "thread-writer-1",
          turnId: "turn-live-activity-3",
          item: {
            content: [
              { text: "Read /tmp/project/src/app.ts before editing it." },
              { text: "Then inspect /tmp/project/README.md." },
            ],
            id: "agent-activity-1",
            type: "agentMessage",
            text: "Read /tmp/project/src/app.ts before editing it.",
          },
        },
      },
      onRuntimeActivity: async (activity) => runtimeActivities.push(activity),
      onSessionRecordUpdate: async (update) => sessionRecordUpdates.push(update),
      resolveSessionContextByThreadId,
    }),
    {
      status: "written",
      suggestedThreadTitle: "Read /tmp/project/src/app.ts before editing it",
      threadId: "thread-writer-1",
    },
  );

  assert.deepEqual(
    runtimeActivities.map((activity) => ({
      detail: activity.detail,
      kind: activity.kind,
      subjectId: activity.subjectId,
      subjectType: activity.subjectType,
    })),
    [
      {
        detail: {
          command: ["git", "status"],
          cwd: "/tmp/project",
          durationMs: 18,
          exitCode: 0,
          itemId: "cmd-activity-1",
          itemStatus: "completed",
        },
        kind: "command.execute",
        subjectId: "cmd-activity-1",
        subjectType: "command",
      },
      {
        detail: {
          action: "modified",
          itemId: "file-activity-1",
          itemStatus: "completed",
          path: "/tmp/project/src/app.ts",
        },
        kind: "file.write",
        subjectId: "/tmp/project/src/app.ts",
        subjectType: "file",
      },
      {
        detail: {
          action: "created",
          itemId: "file-activity-1",
          itemStatus: "completed",
          path: "/tmp/project/README.md",
        },
        kind: "file.write",
        subjectId: "/tmp/project/README.md",
        subjectType: "file",
      },
      {
        detail: {
          itemId: "agent-activity-1",
          path: "/tmp/project/src/app.ts",
          source: "item/completed",
        },
        kind: "file.read",
        subjectId: "/tmp/project/src/app.ts",
        subjectType: "file",
      },
      {
        detail: {
          itemId: "agent-activity-1",
          path: "/tmp/project/README.md",
          source: "item/completed",
        },
        kind: "file.read",
        subjectId: "/tmp/project/README.md",
        subjectType: "file",
      },
    ],
  );

  assert.deepEqual(sessionRecordUpdates, [
    {
      logCursor: {
        toTs: "2026-03-25T10:00:04.000Z",
      },
      pathsWritten: ["/tmp/project/src/app.ts", "/tmp/project/README.md"],
      sessionId: session.id,
      threadId: "thread-writer-1",
    },
  ]);

  const db = new DatabaseSync(dbPath);
  try {
    const commandEvent = db.prepare(
      "SELECT verb, detail FROM events WHERE subject_type = 'command' ORDER BY rowid DESC LIMIT 1",
    ).get();
    assert.equal(commandEvent.verb, "command.execute");
    assert.equal(JSON.parse(commandEvent.detail).command[0], "git");

    const fileReadEvents = db.prepare(
      "SELECT verb, subject_id, detail FROM events WHERE verb = 'file.read' ORDER BY rowid ASC",
    ).all().map((row) => ({ ...row }));
    assert.deepEqual(fileReadEvents.map((event) => ({
      detail: JSON.parse(event.detail),
      subject_id: event.subject_id,
      verb: event.verb,
    })), [
      {
        detail: {
          itemId: "agent-activity-1",
          path: "/tmp/project/src/app.ts",
          source: "item/completed",
        },
        subject_id: "/tmp/project/src/app.ts",
        verb: "file.read",
      },
      {
        detail: {
          itemId: "agent-activity-1",
          path: "/tmp/project/README.md",
          source: "item/completed",
        },
        subject_id: "/tmp/project/README.md",
        verb: "file.read",
      },
    ]);
  } finally {
    db.close();
  }

  await fs.rm(runtimeRoot, { recursive: true, force: true });
});
