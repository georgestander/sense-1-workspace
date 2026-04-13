import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import nodePath from "node:path";

import {
  DEFAULT_DESKTOP_RUNTIME_INSTRUCTIONS,
  buildDesktopThreadSnapshot,
  describePolicyRules,
  normalizeDesktopThreadSummary,
  readDesktopThread,
  runDesktopTask,
} from "./live-thread-runtime.js";

function buildSettings(overrides = {}) {
  return {
    personality: "friendly",
    defaultOperatingMode: "auto",
    runtimeInstructions: DEFAULT_DESKTOP_RUNTIME_INSTRUCTIONS,
    approvalPosture: "onRequest",
    sandboxPosture: "workspaceWrite",
    ...overrides,
  };
}

function buildExpectedInstructions({
  cwd = null,
  contextPaths = [],
  runContext = null,
  runtimeInstructions = DEFAULT_DESKTOP_RUNTIME_INSTRUCTIONS,
  settings = buildSettings(),
  workspaceRoot = null,
}) {
  const actorLabel = runContext?.actor?.displayName ?? runContext?.actor?.email ?? "the signed-in user";
  const scopeLabel = runContext?.scope?.displayName ?? runContext?.scope?.id ?? "the private profile scope";
  const contextInstruction = workspaceRoot && Array.isArray(contextPaths) && contextPaths.length > 0
    ? `Key files in this workspace: ${contextPaths
      .slice(0, 10)
      .map((entry) => entry.startsWith(`${workspaceRoot}/`) ? entry.slice(workspaceRoot.length + 1) : entry.split("/").at(-1))
      .join(", ")}. Read these first to understand the project before making changes.`
    : null;
  return {
    baseInstructions: [
      "You are Sense-1, the native desktop product assistant.",
      "Work calmly, directly, and explain outcomes in plain English.",
      `You are acting on behalf of ${actorLabel} working inside ${scopeLabel}.`,
      workspaceRoot
        ? `The user explicitly chose this local folder for the current run: ${workspaceRoot}. Treat it as the active workspace.`
        : "No user workspace folder is currently selected for this run.",
      cwd && !workspaceRoot
        ? `Use this chat's artifact folder for notes, generated files, and scratch work: ${cwd}.`
        : null,
    ]
      .filter(Boolean)
      .join(" "),
    developerInstructions: [
      runtimeInstructions.trim() || DEFAULT_DESKTOP_RUNTIME_INSTRUCTIONS,
      workspaceRoot
        ? `Work inside the granted workspace folder at ${workspaceRoot}. Do not create, modify, or delete files outside this folder. If the user asks to write to a path outside ${workspaceRoot}, refuse and explain that the current session is bound to this folder.`
        : "Do not describe the run as workspace-bound unless a workspaceRoot is explicitly provided.",
      "When creating documents, spreadsheets, or reports for knowledge workers, prefer professional formats: CSV for tabular data, HTML for formatted documents, plain text for notes. Do not default to Markdown unless the user explicitly asks for it or the workspace is a code project.",
      "Name output files descriptively using the topic and type, for example: startup_runway_budget.csv, project_summary.html, meeting_notes.txt. Avoid generic names like output.md or result.txt.",
      "Files you create are saved in the user's workspace or session folder. The user can see them in the sidebar. Create clean, final deliverables - not drafts or intermediate files. NEVER run 'open' or any command that launches files in external applications after creating them. The user opens files from the sidebar when ready.",
      "For final deliverables like documents, spreadsheets, presentations, and reports, follow this destination order: (1) an explicit output path the user asked for, (2) the selected workspace root, (3) the chat's session artifact folder when no workspace is selected. Do not auto-create repo-style buckets like output/doc, output/spreadsheet, output/pptx, or similar unless the user explicitly asks for that folder. Do not invent type-specific subfolders on your own.",
      contextInstruction,
      cwd && !workspaceRoot
        ? `When you need to create local files without a user-selected workspace, keep them inside ${cwd}. Do not write to paths outside this directory.`
        : null,
      !workspaceRoot
        ? "If the user asks you to work in another local folder, ask them to choose that folder first."
        : null,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

test("describePolicyRules returns stable grouped rules for the default desktop settings", () => {
  const groups = describePolicyRules(buildSettings());

  assert.deepEqual(groups.map((group) => group.topic), [
    "Identity & personality",
    "File handling",
    "Workspace boundaries",
    "Permissions & approvals",
  ]);
  assert.equal(groups[0]?.rules[0]?.currentValue, "Default");
  assert.equal(groups[0]?.rules[1]?.currentValue, "Friendly");
  assert.equal(groups[3]?.rules[0]?.currentValue, "Ask on request");
  assert.equal(groups[2]?.rules.at(-1)?.currentValue, "Auto");
});

test("describePolicyRules reflects behavior-affecting settings changes in plain English", () => {
  const groups = describePolicyRules(buildSettings({
    personality: "pragmatic",
    runtimeInstructions: "Use the operator tone from the desktop playbook.",
    approvalPosture: "unlessTrusted",
    sandboxPosture: "readOnly",
    defaultOperatingMode: "preview",
  }));

  const approvals = groups.find((group) => group.id === "permissions-approvals");
  const identity = groups.find((group) => group.id === "identity");
  const workspace = groups.find((group) => group.id === "workspace-boundaries");

  assert.equal(identity?.rules[0]?.currentValue, "Custom");
  assert.equal(identity?.rules[1]?.currentValue, "Pragmatic");
  assert.match(approvals?.rules[0]?.description ?? "", /trusted contexts/i);
  assert.match(approvals?.rules[1]?.description ?? "", /read-only posture/i);
  assert.equal(workspace?.rules.at(-1)?.currentValue, "Preview");
});

test("describePolicyRules does not expose synthetic planning sections", () => {
  const groups = describePolicyRules(buildSettings());

  assert.equal(groups.some((group) => group.id === "planning"), false);
  assert.equal(groups.some((group) => group.id === "clarification"), false);
});

test("normalizeDesktopThreadSummary maps app-server thread metadata into desktop summaries", () => {
  assert.deepEqual(
    normalizeDesktopThreadSummary({
      id: "thread-1",
      name: "Plan desktop launcher",
      preview: "Replace fake thread flow",
      updatedAt: 1_742_367_200,
      status: {
        type: "active",
        activeFlags: ["running"],
      },
    }),
    {
      id: "thread-1",
      title: "Plan desktop launcher",
      subtitle: "Replace fake thread flow",
      state: "running",
      interactionState: "conversation",
      updatedAt: "2025-03-19T06:53:20.000Z",
      workspaceRoot: null,
      cwd: null,
    },
  );
});

test("buildDesktopThreadSnapshot shapes transcript, progress, and file groups for renderer use", () => {
  const snapshot = buildDesktopThreadSnapshot(
    {
      id: "thread-1",
      name: "Plan desktop launcher",
      preview: "Replace fake thread flow",
      updatedAt: 1_742_367_200,
      status: {
        type: "active",
        activeFlags: ["running"],
      },
      turns: [
        {
          id: "turn-1",
          items: [
            {
              id: "user-1",
              type: "userMessage",
              content: [{ type: "text", text: "Fix the desktop task flow" }],
            },
            {
              id: "file-1",
              type: "fileChange",
              status: "completed",
              changes: [{ path: "/tmp/project/src/App.tsx", kind: "modified" }],
            },
          ],
        },
      ],
    },
    "/tmp/project",
  );

  assert.equal(snapshot.id, "thread-1");
  assert.equal(snapshot.workspaceRoot, "/tmp/project");
  assert.equal(snapshot.cwd, "/tmp/project");
  assert.equal(snapshot.interactionState, "executing");
  assert.equal(snapshot.entries.length, 2);
  assert.equal(snapshot.changeGroups.length, 1);
  assert.match(snapshot.progressSummary[0], /actively working/i);
  assert.equal(snapshot.reviewSummary, null);
  assert.equal(snapshot.hasLoadedDetails, true);
});

test("buildDesktopThreadSnapshot maps native plan items into plan entries", () => {
  const snapshot = buildDesktopThreadSnapshot({
    id: "thread-plan-1",
    turns: [
      {
        id: "turn-plan-1",
        items: [
          {
            id: "plan-1",
            type: "plan",
            explanation: "Inspect the selected workspace before changing anything.",
            plan: [
              { step: "Inspect the workspace", status: "completed" },
              { step: "Draft the changes", status: "inProgress" },
            ],
          },
        ],
      },
    ],
  });

  assert.deepEqual(snapshot.entries, [
    {
      id: "plan-1",
      kind: "plan",
      title: "Plan",
      body: "Inspect the selected workspace before changing anything.\n\n1. Inspect the workspace\n2. Draft the changes",
      steps: ["Inspect the workspace", "Draft the changes"],
    },
  ]);
});

test("buildDesktopThreadSnapshot keeps session cwd separate from workspaceRoot", () => {
  const snapshot = buildDesktopThreadSnapshot({
    id: "thread-session-1",
    name: "Scratch note",
    cwd: "/Users/georgestander/Sense-1/sessions/sess_123",
    turns: [
      {
        id: "turn-1",
        items: [
          {
            id: "file-1",
            type: "fileChange",
            status: "completed",
            changes: [{ path: "note.txt", kind: "created" }],
          },
        ],
      },
    ],
  });

  assert.equal(snapshot.workspaceRoot, null);
  assert.equal(snapshot.cwd, "/Users/georgestander/Sense-1/sessions/sess_123");
  assert.equal(snapshot.changeGroups[0]?.files[0], "note.txt");
});

test("buildDesktopThreadSnapshot prefers persisted review data when it is available", () => {
  const snapshot = buildDesktopThreadSnapshot(
    {
      id: "thread-1",
      name: "Review task",
      preview: "Summarize the changes",
      turns: [
        {
          id: "turn-1",
          items: [
            {
              id: "review-1",
              type: "exitedReviewMode",
              review: {
                text: "Fallback transcript review",
              },
            },
          ],
        },
      ],
    },
    "/tmp/project",
    {
      summary: "Persisted structured review",
      updatedAt: "2026-03-26T15:00:00.000Z",
      objectRefs: [
        {
          id: "obj-1",
          ref_type: "file",
          ref_path: "src/generated-report.md",
          ref_id: "file-1",
          action: "created",
          ts: "2026-03-26T15:01:00.000Z",
          metadata: {
            source: "item/completed",
          },
        },
        {
          id: "obj-2",
          ref_type: "file",
          ref_path: "src/App.tsx",
          ref_id: "file-2",
          action: "modified",
          ts: "2026-03-26T15:00:00.000Z",
          metadata: {
            source: "item/completed",
          },
        },
      ],
    },
  );

  assert.deepEqual(snapshot.reviewSummary, {
    summary: "Persisted structured review",
    outputArtifacts: [
      {
        id: "obj-1",
        refType: "file",
        path: "src/generated-report.md",
        refId: "file-1",
        action: "created",
        recordedAt: "2026-03-26T15:01:00.000Z",
        metadata: {
          source: "item/completed",
        },
      },
    ],
    createdFiles: [
      {
        id: "obj-1",
        refType: "file",
        path: "src/generated-report.md",
        refId: "file-1",
        action: "created",
        recordedAt: "2026-03-26T15:01:00.000Z",
        metadata: {
          source: "item/completed",
        },
      },
    ],
    modifiedFiles: [
      {
        id: "obj-2",
        refType: "file",
        path: "src/App.tsx",
        refId: "file-2",
        action: "modified",
        recordedAt: "2026-03-26T15:00:00.000Z",
        metadata: {
          source: "item/completed",
        },
      },
    ],
    changedArtifacts: [
      {
        id: "obj-1",
        refType: "file",
        path: "src/generated-report.md",
        refId: "file-1",
        action: "created",
        recordedAt: "2026-03-26T15:01:00.000Z",
        metadata: {
          source: "item/completed",
        },
      },
      {
        id: "obj-2",
        refType: "file",
        path: "src/App.tsx",
        refId: "file-2",
        action: "modified",
        recordedAt: "2026-03-26T15:00:00.000Z",
        metadata: {
          source: "item/completed",
        },
      },
    ],
    updatedAt: "2026-03-26T15:00:00.000Z",
  });
});

test("readDesktopThread requests a renderer-ready thread snapshot and preserves the stored workspace root", async () => {
  const calls = [];
  const manager = {
    request: async (method, params) => {
      calls.push({ method, params });
      return {
        thread: {
          id: "thread-1",
          turns: [{ id: "turn-1", items: [] }],
        },
      };
    },
  };

  const result = await readDesktopThread(manager, "thread-1", "/tmp/project");
  assert.deepEqual(calls, [
    {
      method: "thread/read",
      params: {
        threadId: "thread-1",
        includeTurns: true,
      },
    },
  ]);
  assert.equal(result.thread?.id, "thread-1");
  assert.equal(result.thread?.workspaceRoot, "/tmp/project");
  assert.equal(result.thread?.interactionState, "conversation");
  assert.deepEqual(result.thread?.entries, []);
  assert.equal(result.thread?.reviewSummary, null);
  assert.equal(result.thread?.hasLoadedDetails, true);
});

test("readDesktopThread treats empty rollout reads as not ready yet", async () => {
  const manager = {
    request: async () => {
      throw new Error("rollout at /tmp/thread.jsonl is empty");
    },
  };

  const result = await readDesktopThread(manager, "thread-1");
  assert.equal(result.thread, null);
});

test("readDesktopThread derives the workspace root from live command activity when nothing is persisted", async () => {
  const manager = {
    request: async () => {
      return {
        thread: {
          id: "thread-1",
          turns: [
            {
              id: "turn-1",
              items: [
                {
                  id: "cmd-1",
                  type: "commandExecution",
                  cwd: "/tmp/live-project",
                },
              ],
            },
          ],
        },
      };
    },
  };

  const result = await readDesktopThread(manager, "thread-1");
  assert.equal(result.thread?.workspaceRoot, "/tmp/live-project");
});

test("readDesktopThread does not treat the desktop process cwd as a chat workspace root by itself", async () => {
  const manager = {
    request: async () => {
      return {
        thread: {
          id: "thread-1",
          cwd: "/Users/georgestander/dev/tools/sense-1/desktop",
          turns: [],
        },
      };
    },
  };

  const result = await readDesktopThread(manager, "thread-1");
  assert.equal(result.thread?.workspaceRoot, null);
});

test("runDesktopTask starts a new thread then starts a turn with prompt and cwd", async () => {
  const calls = [];
  const workspaceRoot = "/tmp/workspace";
  const executionIntent = {
    kind: "executionIntent",
    matchedRule: "execution-keyword",
    reason: "This prompt clearly asks Sense-1 to perform work in the selected workspace.",
    workspaceBound: true,
  };
  const runContext = {
    actor: {
      id: "actor_george",
      kind: "user",
      displayName: "George",
      email: "george@example.com",
      homeScopeId: "scope_ops-team_private",
      trustLevel: "medium",
    },
    scope: {
      id: "scope_ops-team_private",
      kind: "private",
      displayName: "ops-team private",
      profileId: "ops-team",
    },
    grants: [
      {
        kind: "workspaceRoot",
        rootPath: workspaceRoot,
        access: "workspaceWrite",
      },
    ],
    policy: {
      executionPolicyMode: "defaultProfilePrivateScope",
      approvalPolicy: "onRequest",
      sandboxPolicy: "workspaceWrite",
      trustLevel: "medium",
    },
  };
  const instructions = buildExpectedInstructions({
    cwd: workspaceRoot,
    runContext,
    workspaceRoot,
  });
  const manager = {
    request: async (method, params) => {
      calls.push({ method, params });

      if (method === "thread/start") {
        return {
          cwd: "/tmp/workspace",
          thread: {
            id: "thread-1",
            name: "New thread",
            preview: "Replace fake flow",
            updatedAt: 1_742_367_200,
            status: { type: "idle" },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const result = await runDesktopTask(manager, {
    prompt: "Replace the fake desktop task flow",
    cwd: workspaceRoot,
    model: "gpt-5.4",
    runContext,
    workspaceRoot,
  });

  assert.deepEqual(calls, [
    {
      method: "thread/start",
      params: {
        baseInstructions: instructions.baseInstructions,
        config: {
          developer_instructions: instructions.developerInstructions,
          instructions: instructions.baseInstructions,
          model: "gpt-5.4",
          tools: {
            view_image: true,
          },
          web_search: "live",
        },
        approvalPolicy: {
          granular: {
            mcp_elicitations: true,
            request_permissions: true,
            rules: true,
            sandbox_approval: true,
            skill_approval: true,
          },
        },
        developerInstructions: instructions.developerInstructions,
        model: "gpt-5.4",
        personality: "friendly",
        sandbox: "workspace-write",
        serviceName: "sense_1",
        cwd: workspaceRoot,
        settings: {
          sense1: {
            runContext,
          },
        },
      },
    },
    {
      method: "turn/start",
      params: {
        approvalPolicy: {
          granular: {
            mcp_elicitations: true,
            request_permissions: true,
            rules: true,
            sandbox_approval: true,
            skill_approval: true,
          },
        },
        threadId: "thread-1",
        cwd: workspaceRoot,
        collaborationMode: {
          mode: "default",
          settings: {
            developer_instructions: null,
            model: "gpt-5.4",
            reasoning_effort: null,
          },
        },
        model: "gpt-5.4",
        personality: "friendly",
        reasoningEffort: undefined,
        sandboxPolicy: {
          type: "workspaceWrite",
          networkAccess: true,
          writableRoots: [workspaceRoot],
        },
        input: [
          {
            type: "text",
            text: "Replace the fake desktop task flow",
          },
        ],
        settings: {
          sense1: {
            executionIntent,
            runContext,
          },
        },
      },
    },
  ]);
  assert.equal(result.threadId, "thread-1");
  assert.equal(result.turnId, "turn-1");
  assert.equal(result.cwd, workspaceRoot);
  assert.equal(result.workspaceRoot, workspaceRoot);
  assert.deepEqual(result.runContext, runContext);
  assert.equal(result.thread.state, "running");
  assert.equal(result.thread.title, "New thread");
  assert.equal(result.thread.workspaceRoot, workspaceRoot);
});

test("runDesktopTask sends attachments as turn/start input items", async () => {
  const calls = [];
  const workspaceRoot = "/tmp/workspace";
  const runContext = {
    actor: {
      id: "actor_george",
      kind: "user",
      displayName: "George",
      email: "george@example.com",
      homeScopeId: "scope_ops-team_private",
      trustLevel: "medium",
    },
    scope: {
      id: "scope_ops-team_private",
      kind: "private",
      displayName: "ops-team private",
      profileId: "ops-team",
    },
    grants: [
      {
        kind: "workspaceRoot",
        rootPath: workspaceRoot,
        access: "workspaceWrite",
      },
    ],
    policy: {
      executionPolicyMode: "defaultProfilePrivateScope",
      approvalPolicy: "onRequest",
      sandboxPolicy: "workspaceWrite",
      trustLevel: "medium",
    },
  };
  const manager = {
    request: async (method, params) => {
      calls.push({ method, params });

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-attachments-1",
            name: "Attachment thread",
            preview: "Review these files",
            updatedAt: 1_742_367_200,
            status: { type: "idle" },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-attachments-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  await runDesktopTask(manager, {
    attachments: ["/tmp/workspace/notes.txt", "  ", "/tmp/workspace/design.png"],
    cwd: workspaceRoot,
    prompt: "Review these files",
    runContext,
    workspaceRoot,
  });

  const turnStart = calls.find((entry) => entry.method === "turn/start");
  assert.deepEqual(turnStart?.params.input, [
    {
      type: "mention",
      name: "notes.txt",
      path: "/tmp/workspace/notes.txt",
    },
    {
      type: "localImage",
      path: "/tmp/workspace/design.png",
    },
    {
      type: "text",
      text: "Review these files",
    },
  ]);
  assert.equal("attachments" in (turnStart?.params ?? {}), false);
});

test("runDesktopTask includes resolved shortcut mentions before attachments and prompt text", async () => {
  const calls = [];
  const workspaceRoot = "/tmp/workspace";
  const runContext = {
    actor: {
      id: "actor_george",
      kind: "user",
      displayName: "George",
      email: "george@example.com",
      homeScopeId: "scope_ops-team_private",
      trustLevel: "medium",
    },
    scope: {
      id: "scope_ops-team_private",
      kind: "private",
      displayName: "ops-team private",
      profileId: "ops-team",
    },
    grants: [
      {
        kind: "workspaceRoot",
        rootPath: workspaceRoot,
        access: "workspaceWrite",
      },
    ],
    policy: {
      executionPolicyMode: "defaultProfilePrivateScope",
      approvalPolicy: "onRequest",
      sandboxPolicy: "workspaceWrite",
      trustLevel: "medium",
    },
  };
  const manager = {
    request: async (method, params) => {
      calls.push({ method, params });

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-shortcuts-1",
            name: "Shortcut thread",
            preview: "Use the shortcuts",
            updatedAt: 1_742_367_200,
            status: { type: "idle" },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-shortcuts-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  await runDesktopTask(manager, {
    attachments: ["/tmp/workspace/design.png"],
    cwd: workspaceRoot,
    inputItems: [
      {
        type: "mention",
        name: "autopilot",
        path: "/Users/george/.codex/skills/autopilot/SKILL.md",
      },
      {
        type: "mention",
        name: "Linear",
        path: "app://linear",
      },
    ],
    prompt: "$autopilot use $linear",
    runContext,
    workspaceRoot,
  });

  const turnStart = calls.find((entry) => entry.method === "turn/start");
  assert.deepEqual(turnStart?.params.input, [
    {
      type: "mention",
      name: "autopilot",
      path: "/Users/george/.codex/skills/autopilot/SKILL.md",
    },
    {
      type: "mention",
      name: "Linear",
      path: "app://linear",
    },
    {
      type: "localImage",
      path: "/tmp/workspace/design.png",
    },
    {
      type: "text",
      text: "$autopilot use $linear",
    },
  ]);
});

test("runDesktopTask does not bind a new chat-only thread to the desktop cwd", async () => {
  const calls = [];
  const artifactRoot = "/tmp/sense-1/sessions/sess-chat";
  const runContext = {
    actor: {
      id: "actor_george",
      kind: "user",
      displayName: "George",
      email: "george@example.com",
      homeScopeId: "scope_ops-team_private",
      trustLevel: "medium",
    },
    scope: {
      id: "scope_ops-team_private",
      kind: "private",
      displayName: "ops-team private",
      profileId: "ops-team",
    },
    grants: [],
    policy: {
      executionPolicyMode: "defaultProfilePrivateScope",
      approvalPolicy: "onRequest",
      sandboxPolicy: "readOnly",
      trustLevel: "medium",
    },
  };
  const instructions = buildExpectedInstructions({ cwd: artifactRoot, runContext });
  const manager = {
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/start") {
        return {
          cwd: "/Users/georgestander/dev/tools/sense-1/desktop",
          thread: {
            id: "thread-chat",
            name: "New thread",
            preview: "Chat only task",
            updatedAt: 1_742_367_200,
            cwd: "/Users/georgestander/dev/tools/sense-1/desktop",
            status: { type: "idle" },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-chat",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const result = await runDesktopTask(manager, {
    prompt: "Chat without a folder",
    cwd: artifactRoot,
    model: "gpt-5.4",
    runContext,
  });

  assert.equal(result.cwd, artifactRoot);
  assert.equal(result.workspaceRoot, null);
  assert.deepEqual(calls, [
    {
      method: "thread/start",
      params: {
        approvalPolicy: {
          granular: {
            mcp_elicitations: true,
            request_permissions: true,
            rules: true,
            sandbox_approval: true,
            skill_approval: true,
          },
        },
        baseInstructions: instructions.baseInstructions,
        config: {
          developer_instructions: instructions.developerInstructions,
          instructions: instructions.baseInstructions,
          model: "gpt-5.4",
          tools: {
            view_image: true,
          },
          web_search: "live",
        },
        cwd: artifactRoot,
        developerInstructions: instructions.developerInstructions,
        model: "gpt-5.4",
        personality: "friendly",
        sandbox: "read-only",
        serviceName: "sense_1",
        settings: {
          sense1: {
            runContext,
          },
        },
      },
    },
    {
      method: "turn/start",
      params: {
        approvalPolicy: {
          granular: {
            mcp_elicitations: true,
            request_permissions: true,
            rules: true,
            sandbox_approval: true,
            skill_approval: true,
          },
        },
        threadId: "thread-chat",
        cwd: artifactRoot,
        collaborationMode: {
          mode: "default",
          settings: {
            developer_instructions: null,
            model: "gpt-5.4",
            reasoning_effort: null,
          },
        },
        model: "gpt-5.4",
        personality: "friendly",
        reasoningEffort: undefined,
        sandboxPolicy: {
          type: "workspaceWrite",
          networkAccess: true,
          writableRoots: [artifactRoot],
        },
        input: [
          {
            type: "text",
            text: "Chat without a folder",
          },
        ],
        settings: {
          sense1: {
            executionIntent: {
              kind: "lightweightConversation",
              matchedRule: "chat-default",
              reason: "Chat-only turns default to lightweight conversation unless they clearly imply execution.",
              workspaceBound: false,
            },
            runContext,
          },
        },
      },
    },
  ]);
  assert.deepEqual(result.runContext, runContext);
  assert.equal(result.thread.workspaceRoot, null);
});

test("runDesktopTask uses custom runtime instructions while keeping workspace safeguards", async () => {
  const calls = [];
  const workspaceRoot = "/tmp/project";
  const customRuntimeInstructions = "Use the operator tone from the desktop playbook.";
  const runContext = {
    actor: {
      id: "actor_george",
      kind: "user",
      displayName: "George",
      email: "george@example.com",
      homeScopeId: "scope_ops-team_private",
      trustLevel: "medium",
    },
    scope: {
      id: "scope_ops-team_private",
      kind: "private",
      displayName: "ops-team private",
      profileId: "ops-team",
    },
    grants: [],
    policy: {
      approvalPolicy: "onRequest",
      sandboxPolicy: "workspaceWrite",
    },
  };
  const instructions = buildExpectedInstructions({
    runContext,
    runtimeInstructions: customRuntimeInstructions,
    workspaceRoot,
  });

  const manager = {
    request: async (method, params) => {
      calls.push({ method, params });

      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-custom-instructions-1",
            name: "Custom instructions thread",
            preview: "Custom instructions thread",
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
            id: "turn-custom-instructions-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  await runDesktopTask(manager, {
    prompt: "Review the selected workspace",
    cwd: workspaceRoot,
    runContext,
    runtimeInstructions: customRuntimeInstructions,
    workspaceRoot,
  });

  assert.equal(calls[0]?.method, "thread/start");
  assert.equal(calls[0]?.params.developerInstructions, instructions.developerInstructions);
  assert.equal(calls[0]?.params.config.developer_instructions, instructions.developerInstructions);
  assert.match(calls[0]?.params.developerInstructions ?? "", /^Use the operator tone from the desktop playbook\./);
  assert.match(calls[0]?.params.developerInstructions ?? "", /Work inside the granted workspace folder at \/tmp\/project\./);
});

test("runDesktopTask mentions workspace context paths in developer instructions", async () => {
  const calls = [];
  const workspaceRoot = "/tmp/project";
  const contextPaths = [
    "/tmp/project/README.md",
    "/tmp/project/package.json",
    "/tmp/project/.codex/config.toml",
  ];
  const runContext = {
    actor: {
      id: "actor_george",
      kind: "user",
      displayName: "George",
      email: "george@example.com",
      homeScopeId: "scope_ops-team_private",
      trustLevel: "medium",
    },
    scope: {
      id: "scope_ops-team_private",
      kind: "private",
      displayName: "ops-team private",
      profileId: "ops-team",
    },
    grants: [],
    policy: {
      approvalPolicy: "onRequest",
      sandboxPolicy: "workspaceWrite",
    },
  };
  const instructions = buildExpectedInstructions({
    contextPaths,
    runContext,
    workspaceRoot,
  });
  const manager = {
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-context-paths-1",
            name: "Context paths thread",
            preview: "Context paths thread",
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
            id: "turn-context-paths-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  await runDesktopTask(manager, {
    contextPaths,
    cwd: workspaceRoot,
    prompt: "Review the selected workspace",
    runContext,
    workspaceRoot,
  });

  assert.equal(calls[0]?.params.developerInstructions, instructions.developerInstructions);
  assert.match(
    calls[0]?.params.developerInstructions ?? "",
    /Key files in this workspace: README\.md, package\.json, \.codex\/config\.toml\. Read these first to understand the project before making changes\./,
  );
});

test("runDesktopTask omits workspace context instructions when no context paths are available", async () => {
  const calls = [];
  const workspaceRoot = "/tmp/project";
  const runContext = {
    actor: {
      id: "actor_george",
      kind: "user",
      displayName: "George",
      email: "george@example.com",
      homeScopeId: "scope_ops-team_private",
      trustLevel: "medium",
    },
    scope: {
      id: "scope_ops-team_private",
      kind: "private",
      displayName: "ops-team private",
      profileId: "ops-team",
    },
    grants: [],
    policy: {
      approvalPolicy: "onRequest",
      sandboxPolicy: "workspaceWrite",
    },
  };
  const instructions = buildExpectedInstructions({
    contextPaths: [],
    runContext,
    workspaceRoot,
  });
  const manager = {
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-no-context-paths-1",
            name: "No context paths thread",
            preview: "No context paths thread",
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
            id: "turn-no-context-paths-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  await runDesktopTask(manager, {
    contextPaths: [],
    cwd: workspaceRoot,
    prompt: "Review the selected workspace",
    runContext,
    workspaceRoot,
  });

  assert.equal(calls[0]?.params.developerInstructions, instructions.developerInstructions);
  assert.doesNotMatch(calls[0]?.params.developerInstructions ?? "", /Key files in this workspace:/);
});

test("runDesktopTask limits workspace context path instructions to ten entries", async () => {
  const calls = [];
  const workspaceRoot = "/tmp/project";
  const contextPaths = Array.from({ length: 12 }, (_, index) => `/tmp/project/file-${index + 1}.md`);
  const runContext = {
    actor: {
      id: "actor_george",
      kind: "user",
      displayName: "George",
      email: "george@example.com",
      homeScopeId: "scope_ops-team_private",
      trustLevel: "medium",
    },
    scope: {
      id: "scope_ops-team_private",
      kind: "private",
      displayName: "ops-team private",
      profileId: "ops-team",
    },
    grants: [],
    policy: {
      approvalPolicy: "onRequest",
      sandboxPolicy: "workspaceWrite",
    },
  };
  const manager = {
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-context-limit-1",
            name: "Context path limit thread",
            preview: "Context path limit thread",
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
            id: "turn-context-limit-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  await runDesktopTask(manager, {
    contextPaths,
    cwd: workspaceRoot,
    prompt: "Review the selected workspace",
    runContext,
    workspaceRoot,
  });

  assert.match(calls[0]?.params.developerInstructions ?? "", /file-10\.md/);
  assert.doesNotMatch(calls[0]?.params.developerInstructions ?? "", /file-11\.md/);
  assert.doesNotMatch(calls[0]?.params.developerInstructions ?? "", /file-12\.md/);
});

test("runDesktopTask keeps the same chat artifact instructions when it has to restart after a missing thread turn", async () => {
  const calls = [];
  const artifactRoot = "/tmp/sense-1/sessions/sess-retry";
  const runContext = {
    actor: {
      id: "actor_george",
      kind: "user",
      displayName: "George",
      email: "george@example.com",
      homeScopeId: "scope_ops-team_private",
      trustLevel: "medium",
    },
    scope: {
      id: "scope_ops-team_private",
      kind: "private",
      displayName: "ops-team private",
      profileId: "ops-team",
    },
    grants: [],
    policy: {
      executionPolicyMode: "defaultProfilePrivateScope",
      approvalPolicy: "onRequest",
      sandboxPolicy: "readOnly",
      trustLevel: "medium",
    },
  };
  const instructions = buildExpectedInstructions({ cwd: artifactRoot, runContext });
  const manager = {
    request: async (method, params) => {
      calls.push({ method, params });

      if (method === "thread/start") {
        return {
          thread: {
            id: calls.filter((entry) => entry.method === "thread/start").length === 1 ? "thread-initial" : "thread-restarted",
            name: "New thread",
            preview: "Chat only task",
            updatedAt: 1_742_367_200,
            status: { type: "idle" },
          },
        };
      }

      if (method === "turn/start") {
        if (calls.filter((entry) => entry.method === "turn/start").length === 1) {
          throw new Error("thread not found: thread-initial");
        }

        return {
          turn: {
            id: "turn-restarted",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const result = await runDesktopTask(manager, {
    prompt: "Chat without a folder",
    cwd: artifactRoot,
    model: "gpt-5.4",
    runContext,
  });

  assert.deepEqual(
    calls.map(({ method }) => method),
    ["thread/start", "turn/start", "thread/start", "turn/start"],
  );
  assert.equal(calls[0].params.baseInstructions, instructions.baseInstructions);
  assert.equal(calls[0].params.developerInstructions, instructions.developerInstructions);
  assert.equal(calls[2].params.baseInstructions, instructions.baseInstructions);
  assert.equal(calls[2].params.developerInstructions, instructions.developerInstructions);
  assert.equal(calls[1].params.cwd, artifactRoot);
  assert.deepEqual(calls[1].params.collaborationMode, {
    mode: "default",
    settings: {
      developer_instructions: null,
      model: "gpt-5.4",
      reasoning_effort: null,
    },
  });
  assert.deepEqual(calls[1].params.sandboxPolicy, {
    type: "workspaceWrite",
    networkAccess: true,
    writableRoots: [artifactRoot],
  });
  assert.deepEqual(calls[1].params.settings.sense1.executionIntent, {
    kind: "lightweightConversation",
    matchedRule: "chat-default",
    reason: "Chat-only turns default to lightweight conversation unless they clearly imply execution.",
    workspaceBound: false,
  });
  assert.equal(calls[3].params.cwd, artifactRoot);
  assert.deepEqual(calls[3].params.collaborationMode, {
    mode: "default",
    settings: {
      developer_instructions: null,
      model: "gpt-5.4",
      reasoning_effort: null,
    },
  });
  assert.deepEqual(calls[3].params.sandboxPolicy, {
    type: "workspaceWrite",
    networkAccess: true,
    writableRoots: [artifactRoot],
  });
  assert.deepEqual(calls[3].params.settings.sense1.executionIntent, {
    kind: "lightweightConversation",
    matchedRule: "chat-default",
    reason: "Chat-only turns default to lightweight conversation unless they clearly imply execution.",
    workspaceBound: false,
  });
  assert.equal(result.threadId, "thread-restarted");
  assert.equal(result.turnId, "turn-restarted");
  assert.equal(result.cwd, artifactRoot);
  assert.equal(result.workspaceRoot, null);
});

test("runDesktopTask resumes an existing thread before starting a turn", async () => {
  const calls = [];
  const artifactRoot = "/tmp/sense-1/sessions/sess-existing";
  const runContext = {
    actor: {
      id: "actor_george",
      kind: "user",
      displayName: "George",
      email: "george@example.com",
      homeScopeId: "scope_ops-team_private",
      trustLevel: "medium",
    },
    scope: {
      id: "scope_ops-team_private",
      kind: "private",
      displayName: "ops-team private",
      profileId: "ops-team",
    },
    grants: [],
    policy: {
      executionPolicyMode: "defaultProfilePrivateScope",
      approvalPolicy: "onRequest",
      sandboxPolicy: "readOnly",
      trustLevel: "medium",
    },
  };
  const instructions = buildExpectedInstructions({ cwd: artifactRoot, runContext });
  const manager = {
    request: async (method, params) => {
      calls.push({ method, params });

      if (method === "thread/resume") {
        return {
          thread: {
            id: "thread-existing",
            name: "Existing thread",
            preview: "Earlier context",
            updatedAt: 1_742_367_200,
            status: { type: "idle" },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-existing",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const result = await runDesktopTask(manager, {
    cwd: artifactRoot,
    prompt: "Continue the old thread",
    threadId: "thread-existing",
    model: "gpt-5.4",
    runContext,
  });

  assert.deepEqual(calls, [
    {
      method: "thread/resume",
      params: {
        baseInstructions: instructions.baseInstructions,
        config: {
          developer_instructions: instructions.developerInstructions,
          instructions: instructions.baseInstructions,
          model: "gpt-5.4",
          tools: {
            view_image: true,
          },
          web_search: "live",
        },
        approvalPolicy: {
          granular: {
            mcp_elicitations: true,
            request_permissions: true,
            rules: true,
            sandbox_approval: true,
            skill_approval: true,
          },
        },
        cwd: artifactRoot,
        developerInstructions: instructions.developerInstructions,
        model: "gpt-5.4",
        personality: "friendly",
        sandbox: "read-only",
        serviceName: "sense_1",
        threadId: "thread-existing",
      },
    },
    {
      method: "turn/start",
      params: {
        approvalPolicy: {
          granular: {
            mcp_elicitations: true,
            request_permissions: true,
            rules: true,
            sandbox_approval: true,
            skill_approval: true,
          },
        },
        threadId: "thread-existing",
        cwd: artifactRoot,
        collaborationMode: {
          mode: "default",
          settings: {
            developer_instructions: null,
            model: "gpt-5.4",
            reasoning_effort: null,
          },
        },
        model: "gpt-5.4",
        personality: "friendly",
        reasoningEffort: undefined,
        sandboxPolicy: {
          type: "workspaceWrite",
          networkAccess: true,
          writableRoots: [artifactRoot],
        },
        input: [
          {
            type: "text",
            text: "Continue the old thread",
          },
        ],
        settings: {
          sense1: {
            executionIntent: {
              kind: "lightweightConversation",
              matchedRule: "chat-default",
              reason: "Chat-only turns default to lightweight conversation unless they clearly imply execution.",
              workspaceBound: false,
            },
            runContext,
          },
        },
      },
    },
  ]);
  assert.equal(result.threadId, "thread-existing");
  assert.equal(result.turnId, "turn-existing");
  assert.equal(result.cwd, artifactRoot);
  assert.equal(result.workspaceRoot, null);
  assert.equal(result.thread.title, "Existing thread");
});

test("runDesktopTask classifies executable chat-only turns without injecting synthetic planning instructions", async () => {
  const calls = [];
  const artifactRoot = "/tmp/sense-1/sessions/sess-build";
  const executionIntent = {
    kind: "executionIntent",
    matchedRule: "execution-keyword",
    reason: "This prompt clearly asks Sense-1 to perform work rather than only discuss it.",
    workspaceBound: false,
  };
  const runContext = {
    actor: {
      id: "actor_george",
      kind: "user",
      displayName: "George",
      email: "george@example.com",
      homeScopeId: "scope_ops-team_private",
      trustLevel: "medium",
    },
    scope: {
      id: "scope_ops-team_private",
      kind: "private",
      displayName: "ops-team private",
      profileId: "ops-team",
    },
    grants: [],
    policy: {
      executionPolicyMode: "defaultProfilePrivateScope",
      approvalPolicy: "onRequest",
      sandboxPolicy: "readOnly",
      trustLevel: "medium",
    },
  };
  const instructions = buildExpectedInstructions({
    cwd: artifactRoot,
    runContext,
  });

  const manager = {
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-build",
            name: "Build thread",
            preview: "Build thread",
            updatedAt: 1_742_367_200,
            status: { type: "idle" },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-build",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const result = await runDesktopTask(manager, {
    prompt: "Build a landing page",
    cwd: artifactRoot,
    model: "gpt-5.4",
    runContext,
  });

  assert.equal(calls[0].params.developerInstructions, instructions.developerInstructions);
  assert.deepEqual(calls[1].params.settings.sense1.executionIntent, executionIntent);
  assert.equal(result.threadId, "thread-build");
  assert.equal(result.turnId, "turn-build");
});

test("runDesktopTask keeps plainly read-only workspace conversation out of the plan-first path", async () => {
  const calls = [];
  const workspaceRoot = "/tmp/workspace-readonly";
  const executionIntent = {
    kind: "lightweightConversation",
    matchedRule: "lightweight-keyword",
    reason: "This prompt asks for discussion, explanation, or ideation without clearly requesting execution.",
    workspaceBound: true,
  };
  const runContext = {
    actor: {
      id: "actor_george",
      kind: "user",
      displayName: "George",
      email: "george@example.com",
      homeScopeId: "scope_ops-team_private",
      trustLevel: "medium",
    },
    scope: {
      id: "scope_ops-team_private",
      kind: "private",
      displayName: "ops-team private",
      profileId: "ops-team",
    },
    grants: [
      {
        kind: "workspaceRoot",
        rootPath: workspaceRoot,
        access: "workspaceWrite",
      },
    ],
    policy: {
      executionPolicyMode: "defaultProfilePrivateScope",
      approvalPolicy: "onRequest",
      sandboxPolicy: "workspaceWrite",
      trustLevel: "medium",
    },
  };
  const instructions = buildExpectedInstructions({
    cwd: workspaceRoot,
    runContext,
    workspaceRoot,
  });
  const manager = {
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-readonly",
            name: "Read-only thread",
            preview: "Read-only thread",
            updatedAt: 1_742_367_200,
            status: { type: "idle" },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-readonly",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const result = await runDesktopTask(manager, {
    prompt: "Summarize the current project structure",
    cwd: workspaceRoot,
    model: "gpt-5.4",
    runContext,
    workspaceRoot,
  });

  assert.equal(calls[0].params.developerInstructions, instructions.developerInstructions);
  assert.deepEqual(calls[1].params.collaborationMode, {
    mode: "default",
    settings: {
      developer_instructions: null,
      model: "gpt-5.4",
      reasoning_effort: null,
    },
  });
  assert.deepEqual(calls[1].params.sandboxPolicy, {
    type: "workspaceWrite",
    networkAccess: true,
    writableRoots: [workspaceRoot],
  });
  assert.deepEqual(calls[1].params.settings.sense1.executionIntent, executionIntent);
  assert.equal(result.threadId, "thread-readonly");
  assert.equal(result.turnId, "turn-readonly");
});

test("runDesktopTask ignores legacy always-plan settings when building native runtime instructions", async () => {
  const calls = [];
  const artifactRoot = "/tmp/sense-1/sessions/sess-always";
  const settings = buildSettings();
  const runContext = {
    actor: {
      id: "actor_george",
      kind: "user",
      displayName: "George",
      email: "george@example.com",
      homeScopeId: "scope_ops-team_private",
      trustLevel: "medium",
    },
    scope: {
      id: "scope_ops-team_private",
      kind: "private",
      displayName: "ops-team private",
      profileId: "ops-team",
    },
    grants: [],
    policy: {
      executionPolicyMode: "defaultProfilePrivateScope",
      approvalPolicy: "onRequest",
      sandboxPolicy: "readOnly",
      trustLevel: "medium",
    },
  };
  const instructions = buildExpectedInstructions({
    cwd: artifactRoot,
    runContext,
    settings,
  });
  const manager = {
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-always",
            name: "Always plan thread",
            preview: "Always plan thread",
            updatedAt: 1_742_367_200,
            status: { type: "idle" },
          },
        };
      }

      if (method === "turn/start") {
        return { turn: { id: "turn-always" } };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  await runDesktopTask(manager, {
    prompt: "Tell me what changed in this session",
    cwd: artifactRoot,
    model: "gpt-5.4",
    runContext,
    settings,
  });

  assert.equal(calls[0].params.developerInstructions, instructions.developerInstructions);
  assert.equal(calls[0].params.developerInstructions, instructions.developerInstructions);
});

test("runDesktopTask ignores legacy no-plan settings when building native runtime instructions", async () => {
  const calls = [];
  const artifactRoot = "/tmp/sense-1/sessions/sess-no-plan";
  const settings = buildSettings();
  const runContext = {
    actor: {
      id: "actor_george",
      kind: "user",
      displayName: "George",
      email: "george@example.com",
      homeScopeId: "scope_ops-team_private",
      trustLevel: "medium",
    },
    scope: {
      id: "scope_ops-team_private",
      kind: "private",
      displayName: "ops-team private",
      profileId: "ops-team",
    },
    grants: [],
    policy: {
      executionPolicyMode: "defaultProfilePrivateScope",
      approvalPolicy: "onRequest",
      sandboxPolicy: "readOnly",
      trustLevel: "medium",
    },
  };
  const instructions = buildExpectedInstructions({
    cwd: artifactRoot,
    runContext,
    settings,
  });
  const manager = {
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-no-plan",
            name: "No plan thread",
            preview: "No plan thread",
            updatedAt: 1_742_367_200,
            status: { type: "idle" },
          },
        };
      }

      if (method === "turn/start") {
        return { turn: { id: "turn-no-plan" } };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  await runDesktopTask(manager, {
    prompt: "Build a pricing sheet",
    cwd: artifactRoot,
    model: "gpt-5.4",
    runContext,
    settings,
  });

  assert.equal(calls[0].params.developerInstructions, instructions.developerInstructions);
});

test("runDesktopTask maps preview mode to read-only sandbox on the next turn", async () => {
  const calls = [];
  const workspaceRoot = "/tmp/workspace-preview";
  const runContext = {
    actor: {
      id: "actor_george",
      kind: "user",
      displayName: "George",
      email: "george@example.com",
      homeScopeId: "scope_ops-team_private",
      trustLevel: "medium",
    },
    scope: {
      id: "scope_ops-team_private",
      kind: "private",
      displayName: "ops-team private",
      profileId: "ops-team",
    },
    grants: [
      {
        kind: "workspaceRoot",
        rootPath: workspaceRoot,
        access: "workspaceWrite",
      },
    ],
    policy: {
      executionPolicyMode: "preview",
      trustLevel: "medium",
    },
  };
  const manager = {
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-preview",
            name: "Preview thread",
            preview: "Preview thread",
            updatedAt: 1_742_367_200,
            status: { type: "idle" },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-preview",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  await runDesktopTask(manager, {
    prompt: "Inspect the current workspace and summarize the structure",
    cwd: workspaceRoot,
    model: "gpt-5.4",
    runContext,
    workspaceRoot,
  });

  assert.deepEqual(calls[1].params.approvalPolicy, {
    granular: {
      mcp_elicitations: true,
      request_permissions: true,
      rules: true,
      sandbox_approval: true,
      skill_approval: true,
    },
  });
  assert.deepEqual(calls[1].params.sandboxPolicy, {
    type: "readOnly",
  });
});

test("runDesktopTask maps auto and apply modes to workspace-write turns", async () => {
  for (const executionPolicyMode of ["auto", "apply"]) {
    const calls = [];
    const workspaceRoot = `/tmp/workspace-${executionPolicyMode}`;
    const runContext = {
      actor: {
        id: "actor_george",
        kind: "user",
        displayName: "George",
        email: "george@example.com",
        homeScopeId: "scope_ops-team_private",
        trustLevel: "medium",
      },
      scope: {
        id: "scope_ops-team_private",
        kind: "private",
        displayName: "ops-team private",
        profileId: "ops-team",
      },
      grants: [
        {
          kind: "workspaceRoot",
          rootPath: workspaceRoot,
          access: "workspaceWrite",
        },
      ],
      policy: {
        executionPolicyMode,
        trustLevel: "medium",
      },
    };
    const manager = {
      request: async (method, params) => {
        calls.push({ method, params });
        if (method === "thread/start") {
          return {
            thread: {
              id: `thread-${executionPolicyMode}`,
              name: `${executionPolicyMode} thread`,
              preview: `${executionPolicyMode} thread`,
              updatedAt: 1_742_367_200,
              status: { type: "idle" },
            },
          };
        }

        if (method === "turn/start") {
          return {
            turn: {
              id: `turn-${executionPolicyMode}`,
            },
          };
        }

        throw new Error(`Unexpected method: ${method}`);
      },
    };

    await runDesktopTask(manager, {
      prompt: "Apply the requested changes inside the selected workspace",
      cwd: workspaceRoot,
      model: "gpt-5.4",
      runContext,
      workspaceRoot,
    });

    assert.deepEqual(calls[1].params.sandboxPolicy, {
      type: "workspaceWrite",
      networkAccess: true,
      writableRoots: [workspaceRoot],
    });
  }
});

test("runDesktopTask resolves symlinked workspace paths before passing writable roots", async () => {
  const calls = [];
  const tempRoot = await fs.mkdtemp(nodePath.join(os.tmpdir(), "sense-1-workspace-root-"));
  const realWorkspaceRoot = nodePath.join(tempRoot, "real-workspace");
  const symlinkWorkspaceRoot = nodePath.join(tempRoot, "workspace-link");
  await fs.mkdir(realWorkspaceRoot, { recursive: true });
  await fs.symlink(realWorkspaceRoot, symlinkWorkspaceRoot);
  const runtimeWorkspaceRoot = await fs.realpath(realWorkspaceRoot);

  const runContext = {
    actor: {
      id: "actor_george",
      kind: "user",
      displayName: "George",
      email: "george@example.com",
      homeScopeId: "scope_ops-team_private",
      trustLevel: "medium",
    },
    scope: {
      id: "scope_ops-team_private",
      kind: "private",
      displayName: "ops-team private",
      profileId: "ops-team",
    },
    grants: [
      {
        kind: "workspaceRoot",
        rootPath: symlinkWorkspaceRoot,
        access: "workspaceWrite",
      },
    ],
    policy: {
      executionPolicyMode: "auto",
      trustLevel: "medium",
    },
  };
  const manager = {
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-symlinked-workspace",
            name: "Symlinked workspace thread",
            preview: "Symlinked workspace thread",
            updatedAt: 1_742_367_200,
            status: { type: "idle" },
          },
        };
      }

      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-symlinked-workspace",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  try {
    await runDesktopTask(manager, {
      prompt: "Write the requested change inside the workspace",
      cwd: symlinkWorkspaceRoot,
      model: "gpt-5.4",
      runContext,
      workspaceRoot: symlinkWorkspaceRoot,
    });

    assert.equal(calls[0].params.cwd, runtimeWorkspaceRoot);
    assert.equal(
      calls[0].params.settings.sense1.runContext.grants[0].rootPath,
      runtimeWorkspaceRoot,
    );
    assert.equal(calls[1].params.cwd, runtimeWorkspaceRoot);
    assert.equal(
      calls[1].params.settings.sense1.runContext.grants[0].rootPath,
      runtimeWorkspaceRoot,
    );
    assert.deepEqual(calls[1].params.sandboxPolicy, {
      type: "workspaceWrite",
      networkAccess: true,
      writableRoots: [runtimeWorkspaceRoot],
    });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("runDesktopTask can start the first real turn on an approval-created thread shell", async () => {
  const calls = [];
  const workspaceRoot = "/tmp";
  const runtimeWorkspaceRoot = await fs.realpath(workspaceRoot);
  const runContext = {
    actor: {
      id: "actor_george",
      kind: "user",
      displayName: "George",
      email: "george@example.com",
      homeScopeId: "scope_ops-team_private",
      trustLevel: "medium",
    },
    scope: {
      id: "scope_ops-team_private",
      kind: "private",
      displayName: "ops-team private",
      profileId: "ops-team",
    },
    grants: [
      {
        kind: "workspaceRoot",
        rootPath: workspaceRoot,
        access: "workspaceWrite",
      },
    ],
    policy: {
      executionPolicyMode: "defaultProfilePrivateScope",
      approvalPolicy: "onRequest",
      sandboxPolicy: "workspaceWrite",
      trustLevel: "medium",
    },
  };

  const manager = {
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/resume") {
        throw new Error("no rollout found for thread id thread-shell-1");
      }
      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-shell-1",
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  const result = await runDesktopTask(manager, {
    prompt: "Write the approved file",
    threadId: "thread-shell-1",
    cwd: workspaceRoot,
    runContext,
    workspaceRoot,
  });

  assert.deepEqual(
    calls.map((entry) => entry.method),
    ["thread/resume", "turn/start"],
  );
  assert.deepEqual(calls[1].params.collaborationMode, {
    mode: "default",
    settings: {
      developer_instructions: null,
      model: "",
      reasoning_effort: null,
    },
  });
  assert.deepEqual(calls[1].params.sandboxPolicy, {
    type: "workspaceWrite",
    networkAccess: true,
    writableRoots: [runtimeWorkspaceRoot],
  });
  assert.deepEqual(calls[1].params.settings.sense1.executionIntent, {
    kind: "executionIntent",
    matchedRule: "execution-keyword",
    reason: "This prompt clearly asks Sense-1 to perform work in the selected workspace.",
    workspaceBound: true,
  });
  assert.equal(result.status, "started");
  assert.equal(result.threadId, "thread-shell-1");
  assert.equal(result.turnId, "turn-shell-1");
});

test("runDesktopTask surfaces a clear error when an explicit existing thread is gone", async () => {
  const manager = {
    request: async (method) => {
      if (method === "thread/resume") {
        return {
          thread: {
            id: "thread-missing",
            name: "Missing thread",
            preview: "Missing thread",
            updatedAt: 1_742_367_200,
            status: { type: "idle" },
          },
        };
      }

      if (method === "turn/start") {
        throw new Error("thread not found: thread-missing");
      }

      throw new Error(`Unexpected method: ${method}`);
    },
  };

  await assert.rejects(
    runDesktopTask(manager, {
      prompt: "Try to continue",
      threadId: "thread-missing",
      model: "gpt-5.4",
      runContext: {
        actor: {
          id: "actor_george",
          kind: "user",
          displayName: "George",
          email: "george@example.com",
          homeScopeId: "scope_ops-team_private",
          trustLevel: "medium",
        },
        scope: {
          id: "scope_ops-team_private",
          kind: "private",
          displayName: "ops-team private",
          profileId: "ops-team",
        },
        grants: [],
        policy: {
          executionPolicyMode: "defaultProfilePrivateScope",
          approvalPolicy: "onRequest",
          sandboxPolicy: "readOnly",
          trustLevel: "medium",
        },
      },
    }),
    /This thread is no longer available/,
  );
});
