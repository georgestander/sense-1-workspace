import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDraftRunRequest,
  buildSelectedThreadRunRequest,
} from "./app-composer-utils.ts";

test("buildSelectedThreadRunRequest trims prompt and forwards thread context", () => {
  assert.deepEqual(
    buildSelectedThreadRunRequest({
      attachedFiles: ["/tmp/notes.txt"],
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

test("buildDraftRunRequest asks for folder selection before folder-bound work", () => {
  assert.deepEqual(
    buildDraftRunRequest({
      attachedFiles: [],
      draftPrompt: "Build the landing page",
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
