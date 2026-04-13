import test from "node:test";
import assert from "node:assert/strict";

import { createDesktopAuditEvent } from "./audit-events.ts";

test("createDesktopAuditEvent normalizes who acted and under what authority", () => {
  const event = createDesktopAuditEvent({
    id: "audit-1",
    eventType: "run.started",
    happenedAt: "2026-03-23T09:13:00.000Z",
    threadId: "thread-1",
    turnId: "turn-1",
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
    details: {
      model: "gpt-5.4",
      workspaceRoot: "/tmp/project",
    },
  });

  assert.deepEqual(event, {
    id: "audit-1",
    eventType: "run.started",
    happenedAt: "2026-03-23T09:13:00.000Z",
    threadId: "thread-1",
    turnId: "turn-1",
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
    authority: {
      scopeId: "scope_ops-team_private",
      executionPolicyMode: "defaultProfilePrivateScope",
      approvalPolicy: "onRequest",
      sandboxPolicy: "workspaceWrite",
      trustLevel: "medium",
      grantRoots: ["/tmp/project"],
    },
    details: {
      model: "gpt-5.4",
      workspaceRoot: "/tmp/project",
    },
  });
});

test("createDesktopAuditEvent returns null when run context is missing", () => {
  assert.equal(
    createDesktopAuditEvent({
      eventType: "run.started",
      runContext: null,
    }),
    null,
  );
});
