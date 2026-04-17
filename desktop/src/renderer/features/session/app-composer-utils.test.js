import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDraftRunRequest,
  buildSelectedThreadRunRequest,
  shouldUseSelectedThreadBusyActions,
} from "./app-composer-utils.ts";

test("buildSelectedThreadRunRequest trims prompt and forwards thread context", () => {
  assert.deepEqual(
    buildSelectedThreadRunRequest({
      attachedFiles: ["/tmp/notes.txt"],
      inputItems: [],
      selectedThread: {
        cwd: "/tmp/workspace",
        id: "thread-1",
        workspaceRoot: "/tmp/workspace",
      },
      threadPrompt: "  Ship it  ",
    }),
    {
      attachments: ["/tmp/notes.txt"],
      cwd: "/tmp/workspace",
      prompt: "Ship it",
      threadId: "thread-1",
      workspaceRoot: "/tmp/workspace",
    },
  );
});

test("buildSelectedThreadRunRequest falls back to session cwd when the thread is not workspace-bound", () => {
  assert.deepEqual(
    buildSelectedThreadRunRequest({
      attachedFiles: [],
      inputItems: [],
      selectedThread: {
        cwd: "/Users/georgestander/Sense-1/sessions/sess_123",
        id: "thread-1",
        workspaceRoot: null,
      },
      threadPrompt: "  Read the attached spreadsheet  ",
    }),
    {
      attachments: undefined,
      cwd: "/Users/georgestander/Sense-1/sessions/sess_123",
      prompt: "Read the attached spreadsheet",
      threadId: "thread-1",
      workspaceRoot: null,
    },
  );
});

test("buildSelectedThreadRunRequest returns null for empty prompts", () => {
  assert.equal(
    buildSelectedThreadRunRequest({
      attachedFiles: [],
      inputItems: [],
      selectedThread: {
        cwd: null,
        id: "thread-1",
        workspaceRoot: null,
      },
      threadPrompt: "   ",
    }),
    null,
  );
});

test("shouldUseSelectedThreadBusyActions keeps restored running threads on the steer/queue path", () => {
  assert.equal(
    shouldUseSelectedThreadBusyActions({
      canSteerSelectedThread: false,
      effectiveThreadBusy: true,
    }),
    true,
  );
  assert.equal(
    shouldUseSelectedThreadBusyActions({
      canSteerSelectedThread: true,
      effectiveThreadBusy: false,
    }),
    true,
  );
  assert.equal(
    shouldUseSelectedThreadBusyActions({
      canSteerSelectedThread: false,
      effectiveThreadBusy: false,
    }),
    false,
  );
});

test("buildDraftRunRequest asks for folder selection before folder-bound work", () => {
  assert.deepEqual(
    buildDraftRunRequest({
      attachedFiles: [],
      draftPrompt: "Build the landing page",
      inputItems: [],
      workInFolder: true,
      workspaceFolder: null,
    }),
    { needsFolderSelection: true },
  );
});

test("buildDraftRunRequest trims prompt and clones attachments", () => {
  assert.deepEqual(
    buildDraftRunRequest({
      attachedFiles: ["/tmp/design.png"],
      draftPrompt: "  Review this  ",
      inputItems: [],
      workInFolder: false,
      workspaceFolder: "/tmp/workspace",
    }),
    {
      attachments: ["/tmp/design.png"],
      prompt: "Review this",
      workspaceRoot: null,
    },
  );
});

test("buildSelectedThreadRunRequest keeps seeded shortcut mentions only while their token remains in the prompt", () => {
  assert.deepEqual(
    buildSelectedThreadRunRequest({
      attachedFiles: [],
      inputItems: [
        {
          type: "mention",
          name: "sentry:sentry",
          path: "/Users/georgestander/.codex/plugins/sentry/skills/sentry/SKILL.md",
        },
      ],
      selectedThread: {
        cwd: "/tmp/workspace",
        id: "thread-1",
        workspaceRoot: "/tmp/workspace",
      },
      threadPrompt: "  $sentry summarize the latest errors  ",
    }),
    {
      attachments: undefined,
      cwd: "/tmp/workspace",
      inputItems: [
        {
          type: "mention",
          name: "sentry:sentry",
          path: "/Users/georgestander/.codex/plugins/sentry/skills/sentry/SKILL.md",
        },
      ],
      prompt: "$sentry summarize the latest errors",
      threadId: "thread-1",
      workspaceRoot: "/tmp/workspace",
    },
  );

  assert.deepEqual(
    buildSelectedThreadRunRequest({
      attachedFiles: [],
      inputItems: [
        {
          type: "mention",
          name: "sentry:sentry",
          path: "/Users/georgestander/.codex/plugins/sentry/skills/sentry/SKILL.md",
        },
      ],
      selectedThread: {
        cwd: "/tmp/workspace",
        id: "thread-1",
        workspaceRoot: "/tmp/workspace",
      },
      threadPrompt: "Explain what this plugin does",
    }),
    {
      attachments: undefined,
      cwd: "/tmp/workspace",
      prompt: "Explain what this plugin does",
      threadId: "thread-1",
      workspaceRoot: "/tmp/workspace",
    },
  );
});
