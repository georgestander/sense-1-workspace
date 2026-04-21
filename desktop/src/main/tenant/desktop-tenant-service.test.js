import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { DesktopTenantService } from "./desktop-tenant-service.ts";
import { createTenant, addTenantMember, listTenantMembers, persistActiveTenantMembership } from "./tenant-state.ts";

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
    resolveSignedInAccount: async () => ({
      accountType: "chatgpt",
      authMode: "chatgpt",
      email: "george@example.com",
      isSignedIn: true,
      requiresOpenaiAuth: false,
    }),
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

test("DesktopTenantService unlocks local mode for api-key sessions without allowing team creation", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-tenant-service-runtime-"));
  const tenantRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-tenant-service-cloud-"));
  const env = createEnv(runtimeRoot, tenantRoot);
  const service = new DesktopTenantService({
    env,
    resolveProfile: async () => ({ id: "default" }),
    resolveSignedInAccount: async () => ({
      accountType: "apiKey",
      authMode: "apikey",
      email: null,
      isSignedIn: true,
      requiresOpenaiAuth: false,
    }),
  });

  const result = await service.getTeamState();

  assert.equal(result.accountEmail, null);
  assert.deepEqual(result.teamSetup, {
    mode: "local",
    source: "desktopLocal",
    canWorkLocally: true,
    canCreateFirstTeam: false,
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
    resolveSignedInAccount: async () => ({
      accountType: "chatgpt",
      authMode: "chatgpt",
      email: "george@example.com",
      isSignedIn: true,
      requiresOpenaiAuth: false,
    }),
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

test("DesktopTenantService lets admins update an existing local member's role", async () => {
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
  await addTenantMember({
    tenantId: "ops-team",
    email: "teammate@example.com",
    role: "member",
    displayName: "Teammate",
    env,
    now: "2026-04-09T09:02:00.000Z",
  });
  await persistActiveTenantMembership("default", adminMembership, env);

  const service = new DesktopTenantService({
    env,
    resolveProfile: async () => ({ id: "default" }),
    resolveSignedInAccount: async () => ({
      accountType: "chatgpt",
      authMode: "chatgpt",
      email: "george@example.com",
      isSignedIn: true,
      requiresOpenaiAuth: false,
    }),
  });

  const result = await service.saveTeamMember({
    email: "teammate@example.com",
    role: "admin",
  });

  const updated = result.members.find((member) => member.email === "teammate@example.com");
  assert.equal(updated?.role, "admin");
  assert.equal(result.members.length, 2);
});

test("DesktopTenantService renames an existing member when previousEmail differs", async () => {
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
  await addTenantMember({
    tenantId: "ops-team",
    email: "rian@example.com",
    role: "member",
    displayName: "Rian",
    env,
    now: "2026-04-09T09:02:00.000Z",
  });
  await persistActiveTenantMembership("default", adminMembership, env);

  const service = new DesktopTenantService({
    env,
    resolveProfile: async () => ({ id: "default" }),
    resolveSignedInAccount: async () => ({
      accountType: "chatgpt",
      authMode: "chatgpt",
      email: "george@example.com",
      isSignedIn: true,
      requiresOpenaiAuth: false,
    }),
  });

  const result = await service.saveTeamMember({
    previousEmail: "rian@example.com",
    email: "riana@example.com",
    role: "member",
  });

  const emails = result.members.map((member) => member.email).sort();
  assert.deepEqual(emails, ["george@example.com", "riana@example.com"]);
  assert.equal(result.members.length, 2);
});

test("DesktopTenantService rolls the rename back when the new email collides so the old row survives", async () => {
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
  await addTenantMember({
    tenantId: "ops-team",
    email: "one@example.com",
    role: "member",
    displayName: "One",
    env,
    now: "2026-04-09T09:02:00.000Z",
  });
  await addTenantMember({
    tenantId: "ops-team",
    email: "two@example.com",
    role: "member",
    displayName: "Two",
    env,
    now: "2026-04-09T09:03:00.000Z",
  });
  await persistActiveTenantMembership("default", adminMembership, env);

  const service = new DesktopTenantService({
    env,
    resolveProfile: async () => ({ id: "default" }),
    resolveSignedInAccount: async () => ({
      accountType: "chatgpt",
      authMode: "chatgpt",
      email: "george@example.com",
      isSignedIn: true,
      requiresOpenaiAuth: false,
    }),
  });

  await assert.rejects(
    () => service.saveTeamMember({
      previousEmail: "one@example.com",
      email: "two@example.com",
      role: "member",
    }),
    /already uses/,
  );

  const survivors = await listTenantMembers({ tenantId: "ops-team", env });
  const emails = survivors.map((member) => member.email).sort();
  assert.deepEqual(emails, ["george@example.com", "one@example.com", "two@example.com"]);
});

test("DesktopTenantService refuses to rename the signed-in admin's own email", async () => {
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
    resolveSignedInAccount: async () => ({
      accountType: "chatgpt",
      authMode: "chatgpt",
      email: "george@example.com",
      isSignedIn: true,
      requiresOpenaiAuth: false,
    }),
  });

  await assert.rejects(
    () => service.saveTeamMember({
      previousEmail: "george@example.com",
      email: "george.stander@example.com",
      role: "admin",
    }),
    /your own membership/,
  );
});

test("DesktopTenantService lets admins remove local team members", async () => {
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
  await addTenantMember({
    tenantId: "ops-team",
    email: "teammate@example.com",
    role: "member",
    displayName: "Teammate",
    env,
    now: "2026-04-09T09:02:00.000Z",
  });
  await persistActiveTenantMembership("default", adminMembership, env);

  const service = new DesktopTenantService({
    env,
    resolveProfile: async () => ({ id: "default" }),
    resolveSignedInAccount: async () => ({
      accountType: "chatgpt",
      authMode: "chatgpt",
      email: "george@example.com",
      isSignedIn: true,
      requiresOpenaiAuth: false,
    }),
  });

  const result = await service.removeTeamMember({ email: "teammate@example.com" });

  assert.equal(result.members.length, 1);
  assert.equal(result.members[0]?.email, "george@example.com");
});

test("DesktopTenantService refuses to let an admin remove themselves", async () => {
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
    resolveSignedInAccount: async () => ({
      accountType: "chatgpt",
      authMode: "chatgpt",
      email: "george@example.com",
      isSignedIn: true,
      requiresOpenaiAuth: false,
    }),
  });

  await assert.rejects(
    () => service.removeTeamMember({ email: "george@example.com" }),
    /yourself/,
  );
});

test("DesktopTenantService refuses to remove the last admin", async () => {
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
    email: "lead@example.com",
    role: "admin",
    displayName: "Lead",
    env,
    now: "2026-04-09T09:01:00.000Z",
  });
  await addTenantMember({
    tenantId: "ops-team",
    email: "founder@example.com",
    role: "admin",
    displayName: "Founder",
    env,
    now: "2026-04-09T09:02:00.000Z",
  });
  await persistActiveTenantMembership("default", adminMembership, env);

  const service = new DesktopTenantService({
    env,
    resolveProfile: async () => ({ id: "default" }),
    resolveSignedInAccount: async () => ({
      accountType: "chatgpt",
      authMode: "chatgpt",
      email: "lead@example.com",
      isSignedIn: true,
      requiresOpenaiAuth: false,
    }),
  });

  // Removing the other admin leaves only "lead" as admin.
  const afterOne = await service.removeTeamMember({ email: "founder@example.com" });
  assert.equal(afterOne.members.length, 1);

  // Now the sole admin cannot be removed by anyone (including self-guard, which also blocks this).
  await assert.rejects(
    () => service.removeTeamMember({ email: "lead@example.com" }),
    /yourself|last admin/,
  );
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
    resolveSignedInAccount: async () => ({
      accountType: "chatgpt",
      authMode: "chatgpt",
      email: "george@example.com",
      isSignedIn: true,
      requiresOpenaiAuth: false,
    }),
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
