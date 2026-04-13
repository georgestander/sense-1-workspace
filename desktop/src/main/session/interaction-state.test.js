import test from "node:test";
import assert from "node:assert/strict";

import { resolveDesktopInteractionState } from "./interaction-state.ts";

test("resolveDesktopInteractionState defaults chat threads to conversation", () => {
  assert.equal(
    resolveDesktopInteractionState({
      threadState: "idle",
    }),
    "conversation",
  );
});

test("resolveDesktopInteractionState keeps running workspace chat conversational until planning state exists", () => {
  assert.equal(
    resolveDesktopInteractionState({
      threadState: "running",
      workspaceRoot: "/tmp/project",
    }),
    "conversation",
  );
});

test("resolveDesktopInteractionState keeps workspace runs conversational even when native plan data exists", () => {
  assert.equal(
    resolveDesktopInteractionState({
      planState: { text: "1. Inspect files", steps: ["Inspect files"] },
      planStateVisible: true,
      threadState: "running",
      workspaceRoot: "/tmp/project",
    }),
    "conversation",
  );
});

test("resolveDesktopInteractionState ignores hidden turn-level plan metadata while work stays conversational", () => {
  assert.equal(
    resolveDesktopInteractionState({
      planState: { text: "1. Inspect files", steps: ["Inspect files"] },
      planStateVisible: false,
      threadState: "running",
      workspaceRoot: "/tmp/project",
    }),
    "conversation",
  );
});

test("resolveDesktopInteractionState exposes clarification when input is pending", () => {
  assert.equal(
    resolveDesktopInteractionState({
      inputRequestState: {
        requestId: 1,
        prompt: "Choose a target folder",
      },
      threadState: "running",
      workspaceRoot: "/tmp/project",
    }),
    "clarification",
  );
});

test("resolveDesktopInteractionState treats runtime approvals as execution work instead of a separate plan gate", () => {
  assert.equal(
    resolveDesktopInteractionState({
      pendingApprovals: [{ kind: "command" }],
      planState: { text: "1. Ship it", steps: ["Ship it"] },
      planStateVisible: true,
      threadState: "idle",
      workspaceRoot: "/tmp/project",
    }),
    "executing",
  );
});

test("resolveDesktopInteractionState keeps completed execution conversational until review is explicitly entered", () => {
  assert.equal(
    resolveDesktopInteractionState({
      entries: [{ id: "cmd-1", kind: "command", title: "Command", body: "done", command: "ls", cwd: null, status: "completed", exitCode: 0, durationMs: 5 }],
      threadState: "idle",
      workspaceRoot: "/tmp/project",
    }),
    "conversation",
  );
});

test("resolveDesktopInteractionState stays in review only when review mode is explicit", () => {
  assert.equal(
    resolveDesktopInteractionState({
      entries: [{ id: "review-1", kind: "review", title: "Review", body: "Done" }],
      previousInteractionState: "review",
      threadState: "idle",
      workspaceRoot: "/tmp/project",
    }),
    "review",
  );
});
