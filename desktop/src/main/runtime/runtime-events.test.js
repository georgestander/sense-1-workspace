import test from "node:test";
import assert from "node:assert/strict";

import { mapDesktopRuntimeEvent, normalizeDesktopApprovalEvent } from "./runtime-events.ts";

test("mapDesktopRuntimeEvent translates approval requests into desktop approval events", () => {
  const event = mapDesktopRuntimeEvent({
    id: 17,
    method: "item/commandExecution/requestApproval",
    params: {
      threadId: "thread-1",
      reason: "Needs approval",
      command: ["git", "status"],
      cwd: "/tmp/project",
      grantRoot: "/tmp/project",
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
        grants: [
          {
            kind: "workspaceRoot",
            rootPath: "/tmp/project",
            access: "workspaceWrite",
          },
        ],
        policy: {
          executionPolicyMode: "defaultProfilePrivateScope",
          approvalPolicy: "onRequest",
          sandboxPolicy: "workspaceWrite",
          trustLevel: "medium",
        },
      },
    },
  });

  assert.deepEqual(event, {
    kind: "approvalRequested",
    approval: {
      id: 17,
      kind: "command",
      threadId: "thread-1",
      reason: "Needs approval",
      command: ["git", "status"],
      cwd: "/tmp/project",
      grantRoot: "/tmp/project",
      permissions: null,
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
        grants: [
          {
            kind: "workspaceRoot",
            rootPath: "/tmp/project",
            access: "workspaceWrite",
          },
        ],
        policy: {
          executionPolicyMode: "defaultProfilePrivateScope",
          approvalPolicy: "onRequest",
          sandboxPolicy: "workspaceWrite",
          trustLevel: "medium",
        },
      },
    },
  });
});

test("mapDesktopRuntimeEvent translates file-change approval requests into desktop approval events", () => {
  const event = mapDesktopRuntimeEvent({
    id: 18,
    method: "item/fileChange/requestApproval",
    params: {
      threadId: "thread-file-1",
      reason: "Needs approval before writing files",
      grantRoot: "/tmp/project",
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
          sandboxPolicy: "workspaceWrite",
          trustLevel: "medium",
        },
      },
    },
  });

  assert.deepEqual(event, {
    kind: "approvalRequested",
    approval: {
      id: 18,
      kind: "file",
      threadId: "thread-file-1",
      reason: "Needs approval before writing files",
      command: [],
      cwd: null,
      grantRoot: "/tmp/project",
      permissions: null,
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
          sandboxPolicy: "workspaceWrite",
          trustLevel: "medium",
        },
      },
    },
  });
});

test("mapDesktopRuntimeEvent translates permissions approval requests into desktop approval events", () => {
  const event = mapDesktopRuntimeEvent({
    id: 29,
    method: "item/permissions/requestApproval",
    params: {
      threadId: "thread-2",
      turnId: "turn-2",
      itemId: "item-2",
      reason: null,
      permissions: {
        fileSystem: {
          write: ["/tmp/project/hello.txt"],
        },
      },
    },
  });

  assert.deepEqual(event, {
    kind: "approvalRequested",
    approval: {
      id: 29,
      kind: "permissions",
      threadId: "thread-2",
      reason: "Additional permissions needed for /tmp/project/hello.txt",
      command: [],
      cwd: null,
      grantRoot: null,
      permissions: {
        fileSystem: {
          write: ["/tmp/project/hello.txt"],
        },
      },
      runContext: null,
    },
  });
});

test("mapDesktopRuntimeEvent translates network approval requests into desktop approval events", () => {
  const event = mapDesktopRuntimeEvent({
    id: 31,
    method: "item/permissions/requestApproval",
    params: {
      threadId: "thread-3",
      reason: null,
      permissions: {
        network: {
          enabled: true,
        },
      },
    },
  });

  assert.deepEqual(event, {
    kind: "approvalRequested",
    approval: {
      id: 31,
      kind: "network",
      threadId: "thread-3",
      reason: "Network access required.",
      command: [],
      cwd: null,
      grantRoot: null,
      permissions: {
        network: {
          enabled: true,
        },
      },
      runContext: null,
    },
  });
});

test("normalizeDesktopApprovalEvent attaches the product run context to approval output", () => {
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

  assert.deepEqual(
    normalizeDesktopApprovalEvent(
      {
        id: 42,
        kind: "command",
        threadId: "thread-1",
        reason: "Needs approval",
        command: ["git", "status"],
        cwd: "/tmp/project",
        grantRoot: "/tmp/project",
        runContext: null,
      },
      runContext,
    ),
    {
      id: 42,
      kind: "command",
      threadId: "thread-1",
      reason: "Needs approval",
      command: ["git", "status"],
      cwd: "/tmp/project",
      grantRoot: "/tmp/project",
      runContext,
    },
  );
});

test("mapDesktopRuntimeEvent translates resolved approvals", () => {
  const event = mapDesktopRuntimeEvent({
    method: "serverRequest/resolved",
    params: {
      requestId: 42,
    },
  });

  assert.deepEqual(event, {
    kind: "approvalResolved",
    requestId: 42,
  });
});

test("mapDesktopRuntimeEvent translates thread content activity into thread-content-changed events", () => {
  const event = mapDesktopRuntimeEvent({
    method: "turn/completed",
    params: {
      threadId: "thread-9",
    },
  });

  assert.deepEqual(event, {
    kind: "threadContentChanged",
    threadId: "thread-9",
  });
});

test("mapDesktopRuntimeEvent translates thread list activity into thread-list-changed events", () => {
  const event = mapDesktopRuntimeEvent({
    method: "thread/archived",
    params: {
      threadId: "thread-3",
    },
  });

  assert.deepEqual(event, {
    kind: "threadListChanged",
    threadId: "thread-3",
  });
});

test("mapDesktopRuntimeEvent translates realtime transcript notifications", () => {
  const event = mapDesktopRuntimeEvent({
    method: "thread/realtime/transcriptUpdated",
    params: {
      role: "user",
      text: "open the README",
      threadId: "thread-voice-1",
    },
  });

  assert.deepEqual(event, {
    kind: "voiceTranscriptUpdated",
    role: "user",
    text: "open the README",
    threadId: "thread-voice-1",
  });
});

test("mapDesktopRuntimeEvent translates realtime lifecycle notifications", () => {
  const started = mapDesktopRuntimeEvent({
    method: "thread/realtime/started",
    params: {
      sessionId: "session-voice-1",
      threadId: "thread-voice-2",
    },
  });
  const closed = mapDesktopRuntimeEvent({
    method: "thread/realtime/closed",
    params: {
      reason: "client_stop",
      threadId: "thread-voice-2",
    },
  });
  const failed = mapDesktopRuntimeEvent({
    method: "thread/realtime/error",
    params: {
      message: "microphone stream ended",
      threadId: "thread-voice-2",
    },
  });

  assert.deepEqual(started, {
    kind: "voiceStateChanged",
    reason: null,
    sessionId: "session-voice-1",
    state: "active",
    threadId: "thread-voice-2",
  });
  assert.deepEqual(closed, {
    kind: "voiceStateChanged",
    reason: "client_stop",
    sessionId: null,
    state: "stopped",
    threadId: "thread-voice-2",
  });
  assert.deepEqual(failed, {
    kind: "voiceError",
    message: "microphone stream ended",
    threadId: "thread-voice-2",
  });
});

test("mapDesktopRuntimeEvent still reports list changes even without a thread id", () => {
  const event = mapDesktopRuntimeEvent({
    method: "thread/started",
    params: {},
  });

  assert.deepEqual(event, {
    kind: "threadListChanged",
    threadId: null,
  });
});

test("mapDesktopRuntimeEvent ignores unrelated notifications", () => {
  assert.equal(
    mapDesktopRuntimeEvent({
      method: "server/status",
      params: {
        state: "ready",
      },
    }),
    null,
  );
});
