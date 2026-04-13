import type {
  DesktopAuditEvent,
  DesktopRuntimeEvent,
  DesktopRunContext,
} from "../contracts";
import { resolveDesktopProfile } from "../bootstrap/desktop-bootstrap.js";
import { resolveProfileSubstrateDbPath } from "../profile/profile-state.js";
import {
  ensureProfileSubstrate,
  loadAllWorkspacePolicies,
  setSubstrateSessionStatus,
  upsertWorkspacePolicy,
} from "../substrate/substrate.js";
import type { DesktopApprovalService } from "./desktop-approval-service.ts";
import type { SessionSubstrateSync } from "./session-substrate-sync.ts";
import { createDesktopAuditEvent } from "./audit-events.ts";
import { firstString } from "./session-controller-support.ts";
import type { DesktopWorkspaceService } from "../workspace/desktop-workspace-service.ts";

export async function restoreWorkspacePermissionModes(
  env: NodeJS.ProcessEnv,
  resolveProfile: () => Promise<{ id: string }> = async () => await resolveDesktopProfile(env),
): Promise<void> {
  const profile = await resolveProfile();
  const dbPath = resolveProfileSubstrateDbPath(profile.id, env);
  await ensureProfileSubstrate({
    dbPath,
    profileId: profile.id,
  });

  const workspacePolicies = await loadAllWorkspacePolicies({ dbPath });
  for (const policy of workspacePolicies) {
    if (policy.read_granted !== 1 || policy.read_grant_mode !== "once") {
      continue;
    }

    await upsertWorkspacePolicy({
      dbPath,
      readGrantMode: "once",
      readGranted: false,
      readGrantedAt: null,
      workspaceRoot: policy.workspace_root,
    });
  }
}

export function appendAuditEvent({
  auditEvents,
  details,
  eventType,
  nextAuditEventId,
  runContext,
  threadId = null,
  turnId = null,
}: {
  auditEvents: DesktopAuditEvent[];
  details?: Record<string, unknown>;
  eventType: DesktopAuditEvent["eventType"];
  nextAuditEventId: number;
  runContext: DesktopRunContext | null;
  threadId?: string | null;
  turnId?: string | null;
}): number {
  const event = createDesktopAuditEvent({
    details,
    eventType,
    happenedAt: new Date().toISOString(),
    id: `audit-${nextAuditEventId}`,
    runContext,
    threadId,
    turnId,
  });
  if (!event) {
    return nextAuditEventId;
  }

  auditEvents.unshift(event);
  if (auditEvents.length > 100) {
    auditEvents.length = 100;
  }

  return nextAuditEventId + 1;
}

export function handleRuntimeEvent({
  approvals,
  event,
  recordAuditEvent,
  runContextByThreadId,
}: {
  approvals: DesktopApprovalService;
  event: DesktopRuntimeEvent;
  recordAuditEvent: (input: {
    details?: Record<string, unknown>;
    eventType: DesktopAuditEvent["eventType"];
    runContext: DesktopRunContext | null;
    threadId?: string | null;
    turnId?: string | null;
  }) => void;
  runContextByThreadId: Map<string, DesktopRunContext | null>;
}): void {
  const fallbackRunContext =
    event.kind === "approvalRequested"
      ? runContextByThreadId.get(event.approval.threadId) ?? null
      : null;
  if (approvals.handleRuntimeEvent(event, fallbackRunContext)) {
    return;
  }

  if (event.kind === "threadContentChanged" || event.kind === "threadListChanged") {
    const runContext = event.threadId ? runContextByThreadId.get(event.threadId) ?? null : null;
    recordAuditEvent({
      eventType:
        event.kind === "threadContentChanged"
          ? "run.thread.content.changed"
          : "run.thread.list.changed",
      runContext,
      threadId: event.threadId,
    });
  }
}

export function handleRuntimeMessage({
  env,
  message,
  resolveProfile = async () => await resolveDesktopProfile(env),
  substrateSync,
  workspaceService,
}: {
  env: NodeJS.ProcessEnv;
  message: unknown;
  resolveProfile?: () => Promise<{ id: string }>;
  substrateSync: SessionSubstrateSync;
  workspaceService: DesktopWorkspaceService;
}): void {
  const method = firstString((message as { method?: unknown } | null)?.method);
  const params = typeof message === "object" && message !== null
    ? (message as { params?: { threadId?: unknown } | null }).params
    : null;
  const runtimeThreadId = firstString(params?.threadId);
  if (runtimeThreadId) {
    if (method === "thread/archived") {
      workspaceService.markRuntimeThreadArchived(runtimeThreadId);
      substrateSync.enqueueWrite(async () => {
        const session = await workspaceService.resolveSubstrateSessionByThreadId(runtimeThreadId);
        if (!session?.id || session.status === "archived") {
          return;
        }
        const profile = await resolveProfile();
        await setSubstrateSessionStatus({
          dbPath: resolveProfileSubstrateDbPath(profile.id, env),
          sessionId: session.id,
          status: "archived",
        });
      });
    } else if (method === "thread/unarchived" || method === "thread/started") {
      workspaceService.unmarkRuntimeThreadArchived(runtimeThreadId);
    }
  }

  substrateSync.enqueueWrite(async () => {
    await substrateSync.writeRuntimeMessageForCurrentProfile(message);
  });
}
