export type TenantRole = "member" | "admin";

export type TenantRecord = {
  id: string;
  displayName: string;
  scopeId: string;
  scopeDisplayName: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
};

export type TenantMembershipRecord = {
  tenantId: string;
  tenantDisplayName: string;
  scopeId: string;
  scopeDisplayName: string;
  actorId: string;
  actorDisplayName: string;
  email: string;
  role: TenantRole;
  joinedAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
};

export type SharedTenantRegistry = Record<string, TenantMembershipRecord>;

export function firstString(...values: Array<string | null | undefined>): string | null {
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

export function normalizeEmail(email: string | null | undefined): string | null {
  return firstString(email)?.toLowerCase() ?? null;
}

export function sanitizeTenantToken(value: string | null | undefined, fallback: string): string {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  return normalized || fallback;
}

export function sanitizeActorToken(value: string | null | undefined, fallback: string): string {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function mapTenantRow(row: Record<string, unknown> | undefined): TenantRecord | null {
  const id = firstString(typeof row?.id === "string" ? row.id : null);
  const displayName = firstString(typeof row?.display_name === "string" ? row.display_name : null);
  const scopeId = firstString(typeof row?.scope_id === "string" ? row.scope_id : null);
  const scopeDisplayName = firstString(typeof row?.scope_display_name === "string" ? row.scope_display_name : null);
  const createdAt = firstString(typeof row?.created_at === "string" ? row.created_at : null);
  const updatedAt = firstString(typeof row?.updated_at === "string" ? row.updated_at : null);
  if (!id || !displayName || !scopeId || !scopeDisplayName || !createdAt || !updatedAt) {
    return null;
  }
  return {
    id,
    displayName,
    scopeId,
    scopeDisplayName,
    createdAt,
    updatedAt,
    metadata: parseJsonObject(row?.metadata),
  };
}

export function mapMembershipRow(row: Record<string, unknown> | undefined): TenantMembershipRecord | null {
  const tenantId = firstString(typeof row?.tenant_id === "string" ? row.tenant_id : null);
  const tenantDisplayName = firstString(typeof row?.tenant_display_name === "string" ? row.tenant_display_name : null);
  const scopeId = firstString(typeof row?.scope_id === "string" ? row.scope_id : null);
  const scopeDisplayName = firstString(typeof row?.scope_display_name === "string" ? row.scope_display_name : null);
  const actorId = firstString(typeof row?.actor_id === "string" ? row.actor_id : null);
  const actorDisplayName = firstString(typeof row?.actor_display_name === "string" ? row.actor_display_name : null);
  const email = normalizeEmail(typeof row?.email === "string" ? row.email : null);
  const role = firstString(typeof row?.role === "string" ? row.role : null);
  const joinedAt = firstString(typeof row?.joined_at === "string" ? row.joined_at : null);
  const updatedAt = firstString(typeof row?.updated_at === "string" ? row.updated_at : null);
  if (
    !tenantId
    || !tenantDisplayName
    || !scopeId
    || !scopeDisplayName
    || !actorId
    || !actorDisplayName
    || !email
    || !role
    || !joinedAt
    || !updatedAt
  ) {
    return null;
  }
  return {
    tenantId,
    tenantDisplayName,
    scopeId,
    scopeDisplayName,
    actorId,
    actorDisplayName,
    email,
    role: role === "admin" ? "admin" : "member",
    joinedAt,
    updatedAt,
    metadata: parseJsonObject(row?.metadata),
  };
}
