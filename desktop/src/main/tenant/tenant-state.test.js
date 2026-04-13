import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import {
  addTenantMember,
  createTenant,
  listTenantMembershipsByEmail,
  loadActiveTenantMembership,
  persistActiveTenantMembership,
  resolveTenantMembershipForProfile,
  resolveTenantStoreDbPath,
} from "./tenant-state.ts";

function createEnv(runtimeRoot, tenantRoot = null) {
  return {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
    ...(tenantRoot ? { SENSE1_TENANT_STATE_ROOT: tenantRoot } : {}),
  };
}

test("tenant memberships persist outside the local profile root", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-tenant-runtime-"));
  const tenantRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-tenant-cloud-"));
  const env = createEnv(runtimeRoot, tenantRoot);

  const tenant = await createTenant({
    tenantId: "cro-ops",
    displayName: "CRO Ops",
    env,
    now: "2026-04-08T09:00:00.000Z",
  });
  const membership = await addTenantMember({
    tenantId: tenant.id,
    email: "george@example.com",
    role: "admin",
    displayName: "George",
    env,
    now: "2026-04-08T09:05:00.000Z",
  });

  assert.equal(tenant.id, "cro-ops");
  assert.equal(membership.scopeId, "scope_cro-ops_team");
  assert.equal(resolveTenantStoreDbPath(env), path.join(tenantRoot, "sense1-tenants.db"));

  await fs.rm(runtimeRoot, { recursive: true, force: true });
  await fs.rm(tenantRoot, { recursive: true, force: true });
});

test("active tenant membership persists for the profile and restores on restart", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-tenant-runtime-"));
  const tenantRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-tenant-cloud-"));
  const env = createEnv(runtimeRoot, tenantRoot);

  await createTenant({
    tenantId: "ops-team",
    displayName: "Ops Team",
    env,
    now: "2026-04-08T09:00:00.000Z",
  });
  const membership = await addTenantMember({
    tenantId: "ops-team",
    email: "george@example.com",
    role: "admin",
    displayName: "George",
    env,
    now: "2026-04-08T09:01:00.000Z",
  });

  await persistActiveTenantMembership("default", membership, env);

  assert.deepEqual(await loadActiveTenantMembership("default", env), membership);
  assert.deepEqual(
    await resolveTenantMembershipForProfile({
      profileId: "default",
      email: "george@example.com",
      env,
    }),
    membership,
  );

  await fs.rm(runtimeRoot, { recursive: true, force: true });
  await fs.rm(tenantRoot, { recursive: true, force: true });
});

test("shared tenant memberships resolve for the same user across two machine roots", async () => {
  const tenantRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-tenant-cloud-"));
  const runtimeRootA = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-machine-a-"));
  const runtimeRootB = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-machine-b-"));
  const envA = createEnv(runtimeRootA, tenantRoot);
  const envB = createEnv(runtimeRootB, tenantRoot);

  await createTenant({
    tenantId: "cro-submissions",
    displayName: "CRO Submissions",
    env: envA,
    now: "2026-04-08T09:00:00.000Z",
  });
  await addTenantMember({
    tenantId: "cro-submissions",
    email: "george@example.com",
    role: "admin",
    displayName: "George",
    env: envA,
    now: "2026-04-08T09:02:00.000Z",
  });

  const machineA = await resolveTenantMembershipForProfile({
    profileId: "default",
    email: "george@example.com",
    env: envA,
  });
  const machineB = await resolveTenantMembershipForProfile({
    profileId: "default",
    email: "george@example.com",
    env: envB,
  });

  assert.equal(machineA?.tenantId, "cro-submissions");
  assert.deepEqual(machineB, machineA);
  assert.equal((await listTenantMembershipsByEmail({ email: "george@example.com", env: envB })).length, 1);

  await fs.rm(runtimeRootA, { recursive: true, force: true });
  await fs.rm(runtimeRootB, { recursive: true, force: true });
  await fs.rm(tenantRoot, { recursive: true, force: true });
});

test("shared active tenant selection survives across machines for multi-tenant members", async () => {
  const tenantRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-tenant-cloud-"));
  const runtimeRootA = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-machine-a-"));
  const runtimeRootB = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-machine-b-"));
  const envA = createEnv(runtimeRootA, tenantRoot);
  const envB = createEnv(runtimeRootB, tenantRoot);

  await createTenant({ tenantId: "cro-submissions", displayName: "CRO Submissions", env: envA });
  await createTenant({ tenantId: "ops-team", displayName: "Ops Team", env: envA });
  const selectedMembership = await addTenantMember({
    tenantId: "cro-submissions",
    email: "george@example.com",
    role: "admin",
    displayName: "George",
    env: envA,
    now: "2026-04-08T09:01:00.000Z",
  });
  await addTenantMember({
    tenantId: "ops-team",
    email: "george@example.com",
    role: "member",
    displayName: "George",
    env: envA,
    now: "2026-04-08T09:02:00.000Z",
  });

  await persistActiveTenantMembership("default", selectedMembership, envA);

  const machineB = await resolveTenantMembershipForProfile({
    profileId: "default",
    email: "george@example.com",
    env: envB,
  });

  assert.equal(machineB?.tenantId, "cro-submissions");

  await fs.rm(runtimeRootA, { recursive: true, force: true });
  await fs.rm(runtimeRootB, { recursive: true, force: true });
  await fs.rm(tenantRoot, { recursive: true, force: true });
});
