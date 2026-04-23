import test from "node:test";
import assert from "node:assert/strict";

import {
  buildChangeGroups,
  buildProgressSummary,
  buildThreadEntries,
  normalizeDesktopSummary,
} from "./live-thread-data.js";

test("normalizeDesktopSummary keeps session cwd without turning it into a workspace", () => {
  const summary = normalizeDesktopSummary({
    id: "thread-session-1",
    title: "Scratch note",
    subtitle: "Sense-1 thread",
    state: "running",
    interactionState: "executing",
    updatedAt: "2026-03-30T12:00:00.000Z",
    workspaceRoot: null,
    cwd: "/Users/georgestander/Sense-1/sessions/sess_123",
  });

  assert.equal(summary.workspaceRoot, null);
  assert.equal(summary.cwd, "/Users/georgestander/Sense-1/sessions/sess_123");
});

test("buildThreadEntries maps live app-server items into renderer entries", () => {
  const entries = buildThreadEntries([
    {
      id: "user-1",
      type: "userMessage",
      content: [{ type: "text", text: "Fix the desktop task flow" }],
    },
    {
      id: "assistant-1",
      type: "agentMessage",
      text: "I am wiring the live runtime now.",
      phase: "update",
    },
    {
      id: "command-1",
      type: "commandExecution",
      command: ["git", "status", "--short"],
      cwd: "/tmp/project",
      aggregatedOutput: "M App.tsx",
      status: "completed",
      exitCode: 0,
    },
  ]);

  assert.equal(entries.length, 3);
  assert.equal(entries[0].kind, "user");
  assert.equal(entries[1].kind, "assistant");
  assert.equal(entries[2].kind, "command");
  assert.equal(entries[2].command, "git status --short");
});

test("buildThreadEntries preserves commentary phase as completed progress", () => {
  const entries = buildThreadEntries([
    {
      id: "assistant-commentary-1",
      type: "agentMessage",
      text: "I am checking the runtime now.",
      phase: "commentary",
    },
  ]);

  assert.deepEqual(entries, [
    {
      id: "assistant-commentary-1",
      kind: "assistant",
      title: "Sense-1 progress",
      body: "I am checking the runtime now.",
      status: "complete",
      phase: "commentary",
    },
  ]);
});

test("buildThreadEntries treats statusless snapshot tool items as completed", () => {
  const entries = buildThreadEntries([
    {
      id: "tool-1",
      type: "webSearch",
      query: "Cape Town bookstore hours",
    },
  ]);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "tool");
  assert.equal(entries[0].status, "completed");
});

test("buildThreadEntries coerces non-string command output into safe text", () => {
  const entries = buildThreadEntries([
    {
      id: "command-2",
      type: "commandExecution",
      command: ["git", "status"],
      aggregatedOutput: { changed: ["App.tsx"] },
      status: "completed",
    },
  ]);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "command");
  assert.equal(entries[0].body, JSON.stringify({ changed: ["App.tsx"] }));
});

test("buildThreadEntries keeps shortcut mentions so the transcript can render pills", () => {
  const entries = buildThreadEntries([
    {
      id: "user-shortcuts-1",
      type: "userMessage",
      content: [
        { type: "mention", name: "skill-creator", path: "/Users/george/.codex/skills/.system/skill-creator/SKILL.md" },
        { type: "mention", name: "plugin-creator", path: "/Users/george/.codex/skills/.system/plugin-creator/SKILL.md" },
        { type: "text", text: "Create a reusable skill and plugin." },
      ],
    },
  ]);

  assert.deepEqual(entries, [
    {
      id: "user-shortcuts-1",
      kind: "user",
      title: "You",
      body: "Create a reusable skill and plugin.",
      promptShortcuts: [
        { kind: "skill", label: "skill-creator", token: "skill-creator" },
        { kind: "skill", label: "plugin-creator", token: "plugin-creator" },
      ],
    },
  ]);
});

test("buildThreadEntries counts non-shortcut mention attachments as files", () => {
  const entries = buildThreadEntries([
    {
      id: "user-file-1",
      type: "userMessage",
      content: [
        { type: "mention", name: "brief.md", path: "/tmp/session/brief.md" },
      ],
    },
  ]);

  assert.deepEqual(entries, [
    {
      id: "user-file-1",
      kind: "user",
      title: "You",
      body: "Attached 1 file.",
      attachments: [
        {
          kind: "file",
          label: "brief.md",
          path: "/tmp/session/brief.md",
        },
      ],
    },
  ]);
});

test("buildThreadEntries hides the synthetic attachment context note and preserves named attachments", () => {
  const entries = buildThreadEntries([
    {
      id: "user-file-2",
      type: "userMessage",
      content: [
        { type: "mention", name: "brief.md", path: "/tmp/session/brief.md" },
        {
          type: "text",
          text: [
            "<sense1-attachment-context>",
            "The user attached these files for this request. Treat them as part of the task even when they live outside the current workspace.",
            "- brief.md :: /tmp/session/brief.md",
            "</sense1-attachment-context>",
            "Please use the attached brief.",
          ].join("\n"),
        },
      ],
    },
  ]);

  assert.deepEqual(entries, [
    {
      id: "user-file-2",
      kind: "user",
      title: "You",
      body: "Please use the attached brief.",
      attachments: [
        {
          kind: "file",
          label: "brief.md",
          path: "/tmp/session/brief.md",
        },
      ],
    },
  ]);
});
test("buildChangeGroups and progress summary reflect live file changes", () => {
  const entries = buildThreadEntries([
    {
      id: "file-1",
      type: "fileChange",
      status: "completed",
      changes: [
        { path: "/tmp/project/src/App.tsx", kind: "modified" },
        { path: "/tmp/project/src/main.ts", kind: "modified" },
      ],
    },
    {
      id: "tool-1",
      type: "webSearch",
      tool: "search",
      query: "Sense-1 desktop thread flow",
      status: "completed",
    },
  ]);

  const groups = buildChangeGroups(entries);
  assert.deepEqual(groups, [
    {
      id: "file-1",
      title: "App.tsx and 1 more",
      status: "completed",
      files: ["/tmp/project/src/App.tsx", "/tmp/project/src/main.ts"],
    },
  ]);

  const summary = buildProgressSummary(entries, "active");
  assert.match(summary[0], /actively working/i);
  assert.ok(summary.some((line) => /1 file.*change/i.test(line)));
  assert.ok(summary.some((line) => /1 tool call/i.test(line)));
});
