import type { DesktopAuditEvent, DesktopRunContext } from "../contracts.ts";
import { appendSubstrateEvent } from "../substrate/substrate.js";

type PolicyOutcomeDetails = {
  checks: unknown[];
  matchedRule: string | null;
  reason: string | null;
  requiresApproval: boolean;
  workspaceRoot: string | null;
};

type PolicyOutcomeAuditEvent = {
  eventType: DesktopAuditEvent["eventType"];
  runContext: DesktopRunContext | null;
  threadId?: string | null;
  turnId?: string | null;
  details?: Record<string, unknown>;
};

type RecordDesktopPolicyOutcomeArgs = {
  dbPath: string;
  outcome: Record<string, unknown>;
  recordAuditEvent: (event: PolicyOutcomeAuditEvent) => void;
  runContext: DesktopRunContext | null;
  sessionId?: string | null;
  threadId?: string | null;
  workspaceRoot?: string | null;
};

function normalizePolicyOutcomeDetails({
  outcome,
  workspaceRoot = null,
}: {
  outcome: Record<string, unknown>;
  workspaceRoot?: string | null;
}): PolicyOutcomeDetails {
  return {
    checks: Array.isArray(outcome?.checks) ? outcome.checks : [],
    matchedRule: typeof outcome?.matchedRule === "string" ? outcome.matchedRule : null,
    reason: typeof outcome?.reason === "string" ? outcome.reason : null,
    requiresApproval: Boolean(outcome?.requiresApproval),
    workspaceRoot: workspaceRoot?.trim() || null,
  };
}

function resolvePolicyDecision(outcome: Record<string, unknown>): string {
  return typeof outcome?.decision === "string" ? outcome.decision : "block";
}

function resolvePolicyOutcomeAuditEventType(decision: string): DesktopAuditEvent["eventType"] {
  if (decision === "allow") {
    return "run.policy.allowed";
  }

  if (decision === "escalate") {
    return "run.policy.escalated";
  }

  return "run.policy.blocked";
}

async function appendPolicyOutcomeEvent({
  dbPath,
  decision,
  details,
  runContext,
  sessionId = null,
  threadId = null,
}: {
  dbPath: string;
  decision: string;
  details: PolicyOutcomeDetails;
  runContext: DesktopRunContext | null;
  sessionId?: string | null;
  threadId?: string | null;
}): Promise<void> {
  const actorId = runContext?.actor?.id?.trim() || null;
  const scopeId = runContext?.scope?.id?.trim() || null;
  const profileId = runContext?.scope?.profileId?.trim() || null;
  if (!actorId || !scopeId || !profileId || !decision) {
    return;
  }

  await appendSubstrateEvent({
    actorId,
    afterState: {
      decision,
    },
    correlationId: threadId,
    dbPath,
    detail: details,
    profileId,
    scopeId,
    sessionId,
    subjectId: "run.start",
    subjectType: "policy",
    verb: `policy.${decision}`,
  });
}

export async function recordDesktopPolicyOutcome({
  dbPath,
  outcome,
  recordAuditEvent,
  runContext,
  sessionId = null,
  threadId = null,
  workspaceRoot = null,
}: RecordDesktopPolicyOutcomeArgs): Promise<void> {
  const decision = resolvePolicyDecision(outcome);
  const details = normalizePolicyOutcomeDetails({ outcome, workspaceRoot });
  recordAuditEvent({
    eventType: resolvePolicyOutcomeAuditEventType(decision),
    runContext,
    threadId,
    details,
  });
  await appendPolicyOutcomeEvent({
    dbPath,
    decision,
    details,
    runContext,
    sessionId,
    threadId,
  });
}
