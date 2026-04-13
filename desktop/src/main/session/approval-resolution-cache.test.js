import test from "node:test";
import assert from "node:assert/strict";

import { DesktopApprovalResolutionCache } from "./approval-resolution-cache.ts";

test("DesktopApprovalResolutionCache preserves approval authority and decision until resolution arrives", () => {
  const cache = new DesktopApprovalResolutionCache();
  const approval = {
    id: 42,
    kind: "command",
    threadId: "thread-1",
    reason: "Needs approval",
    command: ["git", "status"],
    cwd: "/tmp/project",
    grantRoot: "/tmp/project",
    runContext: {
      actor: {
        id: "actor_george_example_com",
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
  };

  cache.rememberResponse(approval, "decline");

  assert.deepEqual(cache.consume(42), {
    alreadyConsumed: false,
    approval,
    consumedResponse: true,
    decision: "decline",
  });
  assert.deepEqual(cache.consume(42), {
    alreadyConsumed: true,
    approval: null,
    consumedResponse: false,
    decision: null,
  });
});

test("DesktopApprovalResolutionCache forget drops abandoned responses", () => {
  const cache = new DesktopApprovalResolutionCache();
  cache.rememberResponse(
    {
      id: 7,
      kind: "command",
      threadId: "thread-2",
      reason: null,
      command: [],
      cwd: null,
      grantRoot: null,
      runContext: null,
    },
    "accept",
  );

  cache.forget(7);

  assert.deepEqual(cache.consume(7), {
    alreadyConsumed: false,
    approval: null,
    consumedResponse: false,
    decision: null,
  });
});
