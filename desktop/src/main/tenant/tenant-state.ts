import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  ensureProfileDirectories,
  resolveProfileRoot,
  resolveRuntimeStateRoot,
  sanitizeProfileId,
} from "../profile/profile-state.js";
import { normalizeActorCapabilities } from "../settings/policy.js";
import {
  firstString,
  mapMembershipRow,
  mapTenantRow,
  normalizeEmail,
  sanitizeActorToken,
  sanitizeTenantToken,
  type SharedTenantRegistry,
  type TenantMembershipRecord,
  type TenantRecord,
  type TenantRole,
} from "./tenant-state-support.ts";
export type {
  SharedTenantRegistry,
  TenantMembershipRecord,
  TenantRecord,
  TenantRole,
} from "./tenant-state-support.ts";

const TENANT_STORE_DIR = "tenants";
const TENANT_STORE_DB_FILE = "sense1-tenants.db";
const TENANT_REGISTRY_FILE = "tenant-registry.json";
const ACTIVE_TENANT_MEMBERSHIP_FILE = "active-tenant-membership.json";

const TENANT_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    scope_display_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}'
  )`,
  `CREATE TABLE IF NOT EXISTS memberships (
    tenant_id TEXT NOT NULL,
    email TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (tenant_id, email)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_memberships_email ON memberships(email)`,
  `CREATE INDEX IF NOT EXISTS idx_memberships_role ON memberships(role)`,
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function openTenantStore(env = process.env): DatabaseSync {
  const dbPath = resolveTenantStoreDbPath(env);
  const db = new DatabaseSync(dbPath);
  for (const statement of TENANT_SCHEMA_STATEMENTS) {
    db.exec(statement);
  }
  return db;
}

function buildScopeId(tenantId: string): string { return `scope_${tenantId}_team`; }

function buildActorId(tenantId: string, email: string): string {
  return `actor_${sanitizeActorToken(tenantId, "tenant")}_${sanitizeActorToken(email, "member")}`;
}

function normalizeTenantDisplayName(displayName: string | null | undefined, tenantId: string): string {
  return firstString(displayName) ?? tenantId.replace(/[-_.]+/g, " ");
}

function normalizeScopeDisplayName(displayName: string): string { return `${displayName} team`; }

function resolveMembershipFile(profileId: string, env = process.env): string {
  return path.join(resolveProfileRoot(profileId, env), ACTIVE_TENANT_MEMBERSHIP_FILE);
}

function resolveSharedTenantRegistryFile(env = process.env): string {
  return path.join(resolveTenantStateRoot(env), TENANT_REGISTRY_FILE);
}

async function loadSharedTenantRegistry(env = process.env): Promise<SharedTenantRegistry> {
  const registryFile = resolveSharedTenantRegistryFile(env);
  try {
    const raw = JSON.parse(await fs.readFile(registryFile, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(raw)
        .map(([email, membership]) => {
          const membershipRecord = asRecord(membership);
          return [
            normalizeEmail(email),
          mapMembershipRow({
            tenant_id: membershipRecord.tenantId,
            tenant_display_name: membershipRecord.tenantDisplayName,
            scope_id: membershipRecord.scopeId,
            scope_display_name: membershipRecord.scopeDisplayName,
            actor_id: membershipRecord.actorId,
            actor_display_name: membershipRecord.actorDisplayName,
            email: membershipRecord.email ?? email,
            role: membershipRecord.role,
            joined_at: membershipRecord.joinedAt,
            updated_at: membershipRecord.updatedAt ?? membershipRecord.updated_at,
            metadata: JSON.stringify(membershipRecord.metadata ?? {}),
          }),
          ];
        })
        .filter(([email, membership]) => Boolean(email && membership)),
    );
  } catch {
    return {};
  }
}

async function persistSharedTenantRegistryEntry(
  membership: TenantMembershipRecord | null,
  env = process.env,
): Promise<void> {
  if (!membership) {
    return;
  }

  const registryFile = resolveSharedTenantRegistryFile(env);
  await fs.mkdir(path.dirname(registryFile), { recursive: true });
  const registry = await loadSharedTenantRegistry(env);
  registry[membership.email] = membership;
  await fs.writeFile(registryFile, JSON.stringify(registry, null, 2), "utf8");
}

async function clearSharedTenantRegistryEntry(
  { email, tenantId }: { email: string; tenantId: string },
  env = process.env,
): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return;
  }
  const registry = await loadSharedTenantRegistry(env);
  const existing = registry[normalizedEmail];
  if (!existing || existing.tenantId !== tenantId) {
    return;
  }
  delete registry[normalizedEmail];
  const registryFile = resolveSharedTenantRegistryFile(env);
  await fs.mkdir(path.dirname(registryFile), { recursive: true });
  await fs.writeFile(registryFile, JSON.stringify(registry, null, 2), "utf8");
}

export function sanitizeTenantId(value: string | null | undefined): string {
  return sanitizeTenantToken(value, "team");
}

export function resolveTenantStateRoot(env = process.env): string {
  const explicitRoot = env.SENSE1_TENANT_STATE_ROOT?.trim();
  if (explicitRoot) {
    return path.resolve(explicitRoot);
  }
  return path.join(resolveRuntimeStateRoot(env), TENANT_STORE_DIR);
}

export function resolveTenantStoreDbPath(env = process.env): string {
  return path.join(resolveTenantStateRoot(env), TENANT_STORE_DB_FILE);
}

export async function ensureTenantStore(env = process.env): Promise<string> {
  const root = resolveTenantStateRoot(env);
  await fs.mkdir(root, { recursive: true });
  const db = openTenantStore(env);
  db.close();
  return root;
}

export async function createTenant({
  tenantId,
  displayName,
  now = new Date().toISOString(),
  metadata = {},
  env = process.env,
}: { tenantId: string; displayName: string; now?: string; metadata?: Record<string, unknown>; env?: NodeJS.ProcessEnv; }): Promise<TenantRecord> {
  const resolvedTenantId = sanitizeTenantId(tenantId);
  const resolvedDisplayName = normalizeTenantDisplayName(displayName, resolvedTenantId);
  const scopeId = buildScopeId(resolvedTenantId);
  const scopeDisplayName = normalizeScopeDisplayName(resolvedDisplayName);
  await ensureTenantStore(env);
  const db = openTenantStore(env);
  try {
    db.prepare(
      `INSERT INTO tenants (
        id,
        display_name,
        scope_id,
        scope_display_name,
        created_at,
        updated_at,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        scope_id = excluded.scope_id,
        scope_display_name = excluded.scope_display_name,
        updated_at = excluded.updated_at,
        metadata = excluded.metadata`,
    ).run(
      resolvedTenantId,
      resolvedDisplayName,
      scopeId,
      scopeDisplayName,
      now,
      now,
      JSON.stringify(metadata ?? {}),
    );

    const row = db.prepare(
      `SELECT id, display_name, scope_id, scope_display_name, created_at, updated_at, metadata
      FROM tenants
      WHERE id = ?`,
    ).get(resolvedTenantId);
    const tenant = mapTenantRow(row);
    if (!tenant) {
      throw new Error(`Could not load tenant "${resolvedTenantId}" after creation.`);
    }
    return tenant;
  } finally {
    db.close();
  }
}

export async function getTenant({
  tenantId,
  env = process.env,
}: { tenantId: string; env?: NodeJS.ProcessEnv; }): Promise<TenantRecord | null> {
  const resolvedTenantId = sanitizeTenantId(tenantId);
  await ensureTenantStore(env);
  const db = openTenantStore(env);
  try {
    return mapTenantRow(
      db.prepare(
        `SELECT id, display_name, scope_id, scope_display_name, created_at, updated_at, metadata
        FROM tenants
        WHERE id = ?`,
      ).get(resolvedTenantId),
    );
  } finally {
    db.close();
  }
}

export async function addTenantMember({
  tenantId,
  email,
  role = "member",
  displayName = null,
  now = new Date().toISOString(),
  metadata = {},
  env = process.env,
}: { tenantId: string; email: string; role?: TenantRole; displayName?: string | null; now?: string; metadata?: Record<string, unknown>; env?: NodeJS.ProcessEnv; }): Promise<TenantMembershipRecord> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("A member email is required to add tenant membership.");
  }
  const resolvedTenantId = sanitizeTenantId(tenantId);
  await ensureTenantStore(env);
  let tenant: TenantRecord | null = null;
  const db = openTenantStore(env);
  try {
    tenant = mapTenantRow(
      db.prepare(
        `SELECT id, display_name, scope_id, scope_display_name, created_at, updated_at, metadata
        FROM tenants
        WHERE id = ?`,
      ).get(resolvedTenantId),
    );
  } finally {
    db.close();
  }
  if (!tenant) {
    throw new Error(`Create tenant "${resolvedTenantId}" before adding members.`);
  }
  const actorDisplayName = firstString(displayName) ?? normalizedEmail.split("@")[0] ?? "Team member";
  const actorId = buildActorId(tenant.id, normalizedEmail);
  const normalizedRole: TenantRole = role === "admin" ? "admin" : "member";

  const nextMetadata = { ...metadata, tenantDisplayName: tenant.displayName };
  const writeDb = openTenantStore(env);
  try {
    writeDb.prepare(
      `INSERT INTO memberships (
        tenant_id,
        email,
        actor_id,
        actor_display_name,
        role,
        joined_at,
        updated_at,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, email) DO UPDATE SET
        actor_id = excluded.actor_id,
        actor_display_name = excluded.actor_display_name,
        role = excluded.role,
        updated_at = excluded.updated_at,
        metadata = excluded.metadata`,
    ).run(
      resolvedTenantId,
      normalizedEmail,
      actorId,
      actorDisplayName,
      normalizedRole,
      now,
      now,
      JSON.stringify(nextMetadata),
    );

    const row = writeDb.prepare(
      `SELECT
        memberships.tenant_id,
        tenants.display_name AS tenant_display_name,
        tenants.scope_id,
        tenants.scope_display_name,
        memberships.actor_id,
        memberships.actor_display_name,
        memberships.email,
        memberships.role,
        memberships.joined_at,
        memberships.updated_at,
        memberships.metadata
      FROM memberships
      JOIN tenants ON tenants.id = memberships.tenant_id
      WHERE memberships.tenant_id = ? AND memberships.email = ?`,
    ).get(resolvedTenantId, normalizedEmail);
    const membership = mapMembershipRow(row);
    if (!membership) {
      throw new Error(`Could not load membership for "${normalizedEmail}" in tenant "${tenant.id}".`);
    }
    return membership;
  } finally {
    writeDb.close();
  }
}

export async function removeTenantMember({
  tenantId,
  email,
  env = process.env,
}: { tenantId: string; email: string; env?: NodeJS.ProcessEnv; }): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("A member email is required to remove tenant membership.");
  }
  const resolvedTenantId = sanitizeTenantId(tenantId);
  await ensureTenantStore(env);
  const db = openTenantStore(env);
  let deleted = false;
  try {
    const result = db.prepare(
      `DELETE FROM memberships WHERE tenant_id = ? AND email = ?`,
    ).run(resolvedTenantId, normalizedEmail);
    deleted = (result.changes ?? 0) > 0;
  } finally {
    db.close();
  }
  if (deleted) {
    await clearSharedTenantRegistryEntry({ email: normalizedEmail, tenantId: resolvedTenantId }, env);
  }
  return deleted;
}

export async function listTenantMembershipsByEmail({
  email,
  env = process.env,
}: { email: string; env?: NodeJS.ProcessEnv; }): Promise<TenantMembershipRecord[]> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return [];
  }
  await ensureTenantStore(env);
  const db = openTenantStore(env);
  try {
    return db.prepare(
      `SELECT
        memberships.tenant_id,
        tenants.display_name AS tenant_display_name,
        tenants.scope_id,
        tenants.scope_display_name,
        memberships.actor_id,
        memberships.actor_display_name,
        memberships.email,
        memberships.role,
        memberships.joined_at,
        memberships.updated_at,
        memberships.metadata
      FROM memberships
      JOIN tenants ON tenants.id = memberships.tenant_id
      WHERE memberships.email = ?
      ORDER BY memberships.updated_at DESC, memberships.tenant_id ASC`,
    ).all(normalizedEmail).map((row) => mapMembershipRow(row)).filter(Boolean) as TenantMembershipRecord[];
  } finally {
    db.close();
  }
}

export async function listTenantMembers({
  tenantId,
  env = process.env,
}: { tenantId: string; env?: NodeJS.ProcessEnv; }): Promise<TenantMembershipRecord[]> {
  const resolvedTenantId = sanitizeTenantId(tenantId);
  await ensureTenantStore(env);
  const db = openTenantStore(env);
  try {
    return db.prepare(
      `SELECT
        memberships.tenant_id,
        tenants.display_name AS tenant_display_name,
        tenants.scope_id,
        tenants.scope_display_name,
        memberships.actor_id,
        memberships.actor_display_name,
        memberships.email,
        memberships.role,
        memberships.joined_at,
        memberships.updated_at,
        memberships.metadata
      FROM memberships
      JOIN tenants ON tenants.id = memberships.tenant_id
      WHERE memberships.tenant_id = ?
      ORDER BY
        CASE memberships.role WHEN 'admin' THEN 0 ELSE 1 END,
        memberships.updated_at ASC,
        memberships.email ASC`,
    ).all(resolvedTenantId).map((row) => mapMembershipRow(row)).filter(Boolean) as TenantMembershipRecord[];
  } finally {
    db.close();
  }
}

export async function persistActiveTenantMembership(
  profileId: string,
  membership: TenantMembershipRecord | null,
  env = process.env,
): Promise<TenantMembershipRecord | null> {
  const resolvedProfileId = sanitizeProfileId(profileId);
  await ensureProfileDirectories(resolvedProfileId, env);
  const targetFile = resolveMembershipFile(resolvedProfileId, env);
  if (!membership) {
    await fs.rm(targetFile, { force: true });
    return null;
  }

  await fs.writeFile(targetFile, JSON.stringify({ ...membership, updated_at: membership.updatedAt }, null, 2), "utf8");
  await persistSharedTenantRegistryEntry(membership, env);
  return membership;
}

export async function loadActiveTenantMembership(
  profileId: string,
  env = process.env,
): Promise<TenantMembershipRecord | null> {
  const resolvedProfileId = sanitizeProfileId(profileId);
  const targetFile = resolveMembershipFile(resolvedProfileId, env);
  try {
    const raw = JSON.parse(await fs.readFile(targetFile, "utf8"));
    const record = asRecord(raw);
    return mapMembershipRow({
      tenant_id: record.tenantId,
      tenant_display_name: record.tenantDisplayName,
      scope_id: record.scopeId,
      scope_display_name: record.scopeDisplayName,
      actor_id: record.actorId,
      actor_display_name: record.actorDisplayName,
      email: record.email,
      role: record.role,
      joined_at: record.joinedAt,
      updated_at: record.updatedAt ?? record.updated_at,
      metadata: JSON.stringify(record.metadata ?? {}),
    });
  } catch {
    return null;
  }
}

export async function resolveTenantMembershipForProfile({
  profileId,
  email,
  env = process.env,
}: { profileId: string; email: string | null | undefined; env?: NodeJS.ProcessEnv; }): Promise<TenantMembershipRecord | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    await persistActiveTenantMembership(profileId, null, env);
    return null;
  }

  const persisted = await loadActiveTenantMembership(profileId, env);
  if (persisted && persisted.email === normalizedEmail) {
    const memberships = await listTenantMembershipsByEmail({ email: normalizedEmail, env });
    const matching = memberships.find((membership) => (
      membership.tenantId === persisted.tenantId
      && membership.actorId === persisted.actorId
    ));
    if (matching) {
      await persistActiveTenantMembership(profileId, matching, env);
      return matching;
    }
  }

  const sharedRegistry = await loadSharedTenantRegistry(env);
  const sharedSelection = sharedRegistry[normalizedEmail];
  if (sharedSelection) {
    const memberships = await listTenantMembershipsByEmail({ email: normalizedEmail, env });
    const matching = memberships.find((membership) => (
      membership.tenantId === sharedSelection.tenantId
      && membership.actorId === sharedSelection.actorId
    ));
    if (matching) {
      await persistActiveTenantMembership(profileId, matching, env);
      return matching;
    }
  }

  const memberships = await listTenantMembershipsByEmail({ email: normalizedEmail, env });
  const nextMembership = memberships[0] ?? null;
  await persistActiveTenantMembership(profileId, nextMembership, env);
  return nextMembership;
}

export function applyTenantMembershipToActor<T extends Record<string, unknown> | null>(
  actor: T,
  membership: TenantMembershipRecord | null,
): T {
  if (!actor || !membership) {
    return actor;
  }

  const actorMetadata =
    actor.metadata && typeof actor.metadata === "object" && !Array.isArray(actor.metadata)
      ? actor.metadata as Record<string, unknown>
      : {};

  const trustLevel = membership.role === "admin" ? "high" : "medium";
  const capabilities = normalizeActorCapabilities(undefined, membership.role);
  return {
    ...actor,
    capabilities,
    display_name: membership.actorDisplayName,
    id: membership.actorId,
    metadata: {
      ...actorMetadata,
      capabilities,
      homeScopeDisplayName: membership.scopeDisplayName,
      homeScopeId: membership.scopeId,
      homeScopeKind: "team",
      primary: false,
      role: membership.role,
      sharedTenantId: membership.tenantId,
      tenantDisplayName: membership.tenantDisplayName,
      trustLevel,
    },
    role: membership.role,
    scope_id: membership.scopeId,
    trust_level: trustLevel,
  };
}
