import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { DesktopTenantService } from "./desktop-tenant-service.ts";
import { createTenant, addTenantMember, persistActiveTenantMembership } from "./tenant-state.ts";

function createEnv(runtimeRoot, tenantRoot = null) {
  return {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
    ...(tenantRoot ? { SENSE1_TENANT_STATE_ROOT: tenantRoot } : {}),
  };
}

test("DesktopTenantService returns local mode for signed-in profiles with no team", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-tenant-service-runtime-"));
  const tenantRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-tenant-service-cloud-"));
  const env = createEnv(runtimeRoot, tenantRoot);
  const service = new DesktopTenantService({
    env,
    resolveProfile: async () => ({ id: "default" }),
    resolveSignedInEmail: async () => "george@example.com",
  });

  const result = await service.getTeamState();

  assert.equal(result.tenant, null);
  assert.equal(result.members.length, 0);
  assert.deepEqual(result.teamSetup, {
    mode: "local",
    source: "desktopLocal",
    canWorkLocally: true,
    canCreateFirstTeam: true,
    canManageTeam: false,
  });
});

test("DesktopTenantService can create the first team and promote the creator to admin", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-tenant-service-runtime-"));
  const tenantRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-tenant-service-cloud-"));
  const env = createEnv(runtimeRoot, tenantRoot);
  const service = new DesktopTenantService({
    env,
    resolveProfile: async () => ({ id: "default" }),
    resolveSignedInEmail: async () => "george@example.com",
  });

  const result = await service.createFirstTeam({ name: "Sense-1" });

  assert.equal(result.tenant?.id, "sense-1");
  assert.equal(result.tenant?.displayName, "Sense-1");
  assert.equal(result.tenant?.role, "admin");
  assert.equal(result.members.length, 1);
  assert.equal(result.members[0]?.email, "george@example.com");
  assert.deepEqual(result.teamSetup, {
    mode: "team",
    source: "desktopLocal",
    canWorkLocally: true,
    canCreateFirstTeam: false,
    canManageTeam: true,
  });
});

test("DesktopTenantService lets admins add local team members", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-tenant-service-runtime-"));
  const tenantRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-tenant-service-cloud-"));
  const env = createEnv(runtimeRoot, tenantRoot);

  await createTenant({
    tenantId: "ops-team",
    displayName: "Ops Team",
    env,
    now: "2026-04-09T09:00:00.000Z",
  });
  const adminMembership = await addTenantMember({
    tenantId: "ops-team",
    email: "george@example.com",
    role: "admin",
    displayName: "George",
    env,
    now: "2026-04-09T09:01:00.000Z",
  });
  await persistActiveTenantMembership("default", adminMembership, env);

  const service = new DesktopTenantService({
    env,
    resolveProfile: async () => ({ id: "default" }),
    resolveSignedInEmail: async () => "george@example.com",
  });

  const result = await service.saveTeamMember({
    email: "teammate@example.com",
    role: "member",
  });

  assert.equal(result.tenant?.id, "ops-team");
  assert.equal(result.members.length, 2);
  assert.deepEqual(
    result.members.map((member) => `${member.email}:${member.role}`),
    ["george@example.com:admin", "teammate@example.com:member"],
  );
});
