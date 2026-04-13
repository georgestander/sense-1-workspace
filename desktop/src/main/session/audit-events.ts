import type { DesktopAuditEvent, DesktopRunContext } from "../contracts.ts";

function firstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function cloneRunContext(runContext: DesktopRunContext | null | undefined): DesktopRunContext | null {
  if (!runContext) {
    return null;
  }

  return {
    actor: { ...runContext.actor },
    scope: { ...runContext.scope },
    grants: runContext.grants.map((grant) => ({ ...grant })),
    policy: { ...runContext.policy },
  };
}

export function createDesktopAuditEvent({
  details = {},
  eventType,
  happenedAt,
  id,
  runContext,
  threadId = null,
  turnId = null,
}: {
  details?: Record<string, unknown>;
  eventType?: DesktopAuditEvent["eventType"] | null;
  happenedAt?: string | null;
  id?: string | null;
  runContext?: DesktopRunContext | null;
  threadId?: string | null;
  turnId?: string | null;
}): DesktopAuditEvent | null {
  const context = cloneRunContext(runContext);
  const normalizedEventType = firstString(eventType) as DesktopAuditEvent["eventType"] | null;
  if (!context || !normalizedEventType) {
    return null;
  }

  const grantRoots = context.grants
    .map((grant) => firstString(grant.rootPath))
    .filter((value): value is string => Boolean(value));

  return {
    id: firstString(id) ?? `audit-${Date.now()}`,
    eventType: normalizedEventType,
    happenedAt: firstString(happenedAt) ?? new Date().toISOString(),
    threadId: firstString(threadId),
    turnId: firstString(turnId),
    actor: context.actor,
    scope: context.scope,
    authority: {
      scopeId: context.scope.id,
      executionPolicyMode: context.policy.executionPolicyMode,
      approvalPolicy: context.policy.approvalPolicy,
      sandboxPolicy: context.policy.sandboxPolicy,
      trustLevel: context.policy.trustLevel,
      grantRoots,
    },
    details: { ...details },
  };
}
