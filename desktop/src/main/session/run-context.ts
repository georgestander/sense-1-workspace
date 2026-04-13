import type { DesktopRunContext } from "../contracts";
import { buildDesktopActorPolicyProfile } from "../settings/policy.js";
import {
  resolveDefaultScopeId,
  resolvePrimaryActorId,
  resolvePrivateScopeDisplayName,
} from "../substrate/substrate.js";

type DesktopRunContextActorInput = Record<string, unknown> & {
  display_name?: string | null;
  id?: string | null;
  kind?: string | null;
  metadata?: Record<string, unknown> | null;
  role?: string | null;
  scope_id?: string | null;
};

type DesktopRunContextSettingsInput = Record<string, unknown> & {
  approvalPosture?: string | null;
  defaultOperatingMode?: string | null;
  sandboxPosture?: string | null;
};

type DesktopRunContextTenantInput = {
  actorDisplayName: string;
  actorId: string;
  role: string;
  scopeDisplayName: string;
  scopeId: string;
  tenantDisplayName: string;
  tenantId: string;
};

type BuildDesktopRunContextOptions = {
  actor?: DesktopRunContextActorInput | null;
  email?: string | null;
  operatingMode?: string | null;
  profileId?: string | null;
  settings?: DesktopRunContextSettingsInput | null;
  tenant?: DesktopRunContextTenantInput | null;
  workspaceRoot?: string | null;
};

function firstString(...values: Array<string | null | undefined>): string | null {
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

function toDisplayName(email: string | null | undefined): string {
  const localPart = firstString(email)?.split("@")[0] ?? "";
  const normalized = localPart.replace(/[._-]+/g, " ").trim();
  if (!normalized) {
    return "Signed-in user";
  }

  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildDesktopRunContext({
  actor = null,
  email,
  operatingMode = null,
  profileId,
  settings = null,
  tenant = null,
  workspaceRoot = null,
}: BuildDesktopRunContextOptions): DesktopRunContext | null {
  const resolvedEmail = firstString(email);
  const resolvedProfileId = firstString(profileId);
  if (!resolvedEmail) {
    return null;
  }

  if (!resolvedProfileId) {
    return null;
  }

  const actorId = resolvePrimaryActorId(resolvedProfileId);
  const fallbackScopeId = resolveDefaultScopeId(resolvedProfileId);
  const resolvedTenantId = firstString(tenant?.tenantId);
  const resolvedTenantScopeId = firstString(tenant?.scopeId);
  const resolvedTenantScopeDisplayName = firstString(tenant?.scopeDisplayName);
  const resolvedTenantDisplayName = firstString(tenant?.tenantDisplayName);
  const actorRecord = tenant
    ? {
        ...(actor ?? {}),
        capabilities: undefined,
        role: firstString(tenant?.role, actor?.role) ?? undefined,
        scope_id: resolvedTenantScopeId ?? actor?.scope_id ?? fallbackScopeId,
        trust_level: undefined,
        trustLevel: undefined,
        metadata: {
          ...(actor?.metadata && typeof actor.metadata === "object" && !Array.isArray(actor.metadata)
            ? actor.metadata
            : {}),
          homeScopeDisplayName: resolvedTenantScopeDisplayName ?? null,
          homeScopeId: resolvedTenantScopeId ?? fallbackScopeId,
          homeScopeKind: "team",
          primary: false,
          role: firstString(tenant?.role) ?? null,
          sharedTenantId: resolvedTenantId ?? null,
        },
      }
    : actor;
  const actorProfile = buildDesktopActorPolicyProfile(
    actorRecord ?? {
      id: actorId,
      kind: "user",
      scope_id: fallbackScopeId,
      metadata: {
        email: resolvedEmail,
        primary: true,
      },
    },
  );
  const scopeId = firstString(actorProfile.homeScopeId) || fallbackScopeId;
  const resolvedScopeId = resolvedTenantScopeId || scopeId;
  const resolvedWorkspaceRoot = firstString(workspaceRoot);
  const isWorkspaceRun = Boolean(resolvedWorkspaceRoot);
  const resolvedOperatingMode = (firstString(
    operatingMode,
    settings?.defaultOperatingMode ?? null,
    "auto",
  ) || "auto") as DesktopRunContext["policy"]["executionPolicyMode"];
  const resolvedApprovalPolicy =
    resolvedOperatingMode === "preview"
      ? "onRequest"
      : ((firstString(settings?.approvalPosture ?? null) || "onRequest") as DesktopRunContext["policy"]["approvalPolicy"]);
  const resolvedSandboxPolicy =
    resolvedOperatingMode === "preview"
      ? "readOnly"
      : ((isWorkspaceRun
          ? "workspaceWrite"
          : firstString(settings?.sandboxPosture ?? null) || "readOnly") as DesktopRunContext["policy"]["sandboxPolicy"]);
  const grants = resolvedWorkspaceRoot
    ? [
        {
          kind: "workspaceRoot" as const,
          rootPath: resolvedWorkspaceRoot,
          access: "workspaceWrite" as const,
        },
      ]
    : [];

  return {
    actor: {
      id: firstString(tenant?.actorId, actor?.id, actorId) ?? actorId,
      kind: actorProfile.kind,
      displayName: firstString(tenant?.actorDisplayName, actor?.display_name, toDisplayName(resolvedEmail)) ?? "Signed-in user",
      email: resolvedEmail,
      homeScopeId: resolvedScopeId,
      role: firstString(tenant?.role, actorProfile.role) ?? actorProfile.role,
      capabilities: actorProfile.capabilities,
      trustLevel: actorProfile.trustLevel,
    },
    scope: {
      id: resolvedScopeId,
      kind: resolvedTenantId ? "team" : "private",
      displayName: resolvedTenantScopeDisplayName ?? resolvePrivateScopeDisplayName(resolvedProfileId),
      profileId: resolvedProfileId,
      ...(resolvedTenantId ? { tenantId: resolvedTenantId } : {}),
      ...(resolvedTenantDisplayName ? { tenantDisplayName: resolvedTenantDisplayName } : {}),
    },
    grants,
    policy: {
      executionPolicyMode: resolvedOperatingMode,
      approvalPolicy: resolvedApprovalPolicy,
      sandboxPolicy: resolvedSandboxPolicy,
      trustLevel: actorProfile.trustLevel,
    },
  };
}
