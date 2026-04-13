import type { DesktopApprovalEvent } from "../contracts";
import { resolveDesktopProfile } from "../bootstrap/desktop-bootstrap.js";
import { resolveProfileSubstrateDbPath } from "../profile/profile-state.js";
import {
  appendSubstrateEvent,
  getSubstrateSessionByThreadId,
} from "../substrate/substrate.js";

type AppendApprovalEventArgs = {
  afterState?: Record<string, unknown> | null;
  approval: DesktopApprovalEvent | null;
  beforeState?: Record<string, unknown> | null;
  decision?: string | null;
  env: NodeJS.ProcessEnv;
  requestId: number;
  resolveProfile?: () => Promise<{ id: string }>;
  verb: string;
};

export async function appendApprovalEventRecord({
  afterState,
  approval,
  beforeState,
  decision = null,
  env,
  requestId,
  resolveProfile = async () => await resolveDesktopProfile(env),
  verb,
}: AppendApprovalEventArgs): Promise<void> {
  const profile = await resolveProfile();
  const dbPath = resolveProfileSubstrateDbPath(profile.id, env);
  const session = approval?.threadId
    ? await getSubstrateSessionByThreadId({
        codexThreadId: approval.threadId,
        dbPath,
      })
    : null;
  const actorId = session?.actor_id ?? approval?.runContext?.actor?.id ?? null;
  const scopeId = session?.scope_id ?? approval?.runContext?.scope?.id ?? null;
  const profileId = session?.profile_id ?? approval?.runContext?.scope?.profileId ?? profile.id;
  if (!actorId || !scopeId) {
    return;
  }

  await appendSubstrateEvent({
    actorId,
    afterState: afterState ?? null,
    beforeState: beforeState ?? null,
    correlationId: approval?.threadId ?? null,
    dbPath,
    detail: {
      approvalKind: approval?.kind ?? null,
      command: approval?.command ?? [],
      cwd: approval?.cwd ?? null,
      decision,
      grantRoot: approval?.grantRoot ?? null,
      permissions: approval?.permissions ?? null,
      reason: approval?.reason ?? null,
      requestId,
    },
    profileId,
    scopeId,
    sessionId: session?.id ?? null,
    subjectId: String(requestId),
    subjectType: "approval",
    verb,
  });
}
