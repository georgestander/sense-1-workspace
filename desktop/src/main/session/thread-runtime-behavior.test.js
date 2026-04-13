import test from "node:test";
import assert from "node:assert/strict";

import { resolveBootstrapVisibleThreadId, shouldRestoreQueuedFollowUp } from "./thread-runtime-behavior.ts";

test("shouldRestoreQueuedFollowUp only restores when permission is required before the follow-up can start", () => {
  assert.equal(
    shouldRestoreQueuedFollowUp({
      status: "permissionRequired",
      cwd: "/tmp/project",
      workspaceRoot: "/tmp/project",
      runContext: null,
      permissionRequest: {
        rootPath: "/tmp/project",
        displayName: "project",
      },
      thread: null,
      threadId: null,
      turnId: null,
    }),
    true,
  );

  assert.equal(
    shouldRestoreQueuedFollowUp({
      status: "started",
      cwd: "/tmp/project",
      workspaceRoot: "/tmp/project",
      runContext: null,
      permissionRequest: null,
      thread: {
        id: "thread-1",
        title: "Thread",
        subtitle: null,
        updatedAt: new Date().toISOString(),
        state: "running",
        interactionState: "executing",
        workspaceRoot: "/tmp/project",
        cwd: "/tmp/project",
        runContext: null,
        threadInputState: null,
      },
      threadId: "thread-1",
      turnId: "turn-1",
    }),
    false,
  );

  assert.equal(
    shouldRestoreQueuedFollowUp({
      status: "approvalRequired",
      cwd: "/tmp/project",
      workspaceRoot: "/tmp/project",
      runContext: null,
      permissionRequest: null,
      thread: {
        id: "thread-2",
        title: "Thread",
        subtitle: null,
        updatedAt: new Date().toISOString(),
        state: "running",
        interactionState: "executing",
        workspaceRoot: "/tmp/project",
        cwd: "/tmp/project",
        runContext: null,
        threadInputState: null,
      },
      threadId: "thread-2",
      turnId: "turn-2",
    }),
    false,
  );
});

test("resolveBootstrapVisibleThreadId returns the trimmed selected thread id from bootstrap", () => {
  assert.equal(
    resolveBootstrapVisibleThreadId({
      profile: {
        id: "profile-1",
        source: "stored",
        rootPath: "/tmp/profile",
        codexHome: "/tmp/profile/.codex",
      },
      auth: {
        isSignedIn: true,
        email: "dev@example.com",
        accountType: "chatgpt",
        requiresOpenaiAuth: false,
      },
      currentInput: "",
      selectedThread: {
        id: "  thread-1  ",
        title: "Thread",
        subtitle: null,
        entries: [],
        updatedAt: new Date().toISOString(),
        state: "idle",
        interactionState: "conversation",
        workspaceRoot: null,
        cwd: null,
        runContext: null,
        pendingApproval: null,
        pendingInputRequest: null,
        threadInputState: null,
        planState: null,
        diffState: null,
      },
      recentThreads: [],
      pendingApprovals: [],
      profileSelectorOpen: false,
    }),
    "thread-1",
  );

  assert.equal(
    resolveBootstrapVisibleThreadId({
      profile: {
        id: "profile-1",
        source: "stored",
        rootPath: "/tmp/profile",
        codexHome: "/tmp/profile/.codex",
      },
      auth: {
        isSignedIn: true,
        email: "dev@example.com",
        accountType: "chatgpt",
        requiresOpenaiAuth: false,
      },
      currentInput: "",
      selectedThread: null,
      recentThreads: [],
      pendingApprovals: [],
      profileSelectorOpen: false,
    }),
    null,
  );
});
