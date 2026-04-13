import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_TEAM_SETUP_IDENTITY,
  buildSidebarIdentity,
  buildStartSurfaceIdentity,
  buildThreadComposerIdentity,
  formatTenantRole,
  resolveEffectiveTeamSetup,
  resolveEffectiveTenant,
} from "./tenant-identity.ts";

const tenant = {
  id: "ops-team",
  displayName: "Ops Team",
  role: "admin",
  scopeId: "team:ops-team",
  scopeDisplayName: "Ops Team",
  actorId: "actor-1",
  actorDisplayName: "George",
};

const localTeamSetup = {
  ...DEFAULT_TEAM_SETUP_IDENTITY,
  canWorkLocally: true,
  canCreateFirstTeam: true,
};

const teamModeSetup = {
  ...DEFAULT_TEAM_SETUP_IDENTITY,
  mode: "team",
  canWorkLocally: true,
  canManageTeam: true,
};

test("formatTenantRole returns human-readable role labels", () => {
  assert.equal(formatTenantRole("admin"), "Admin");
  assert.equal(formatTenantRole("member"), "Member");
});

test("resolveEffectiveTenant preserves current team identity during transient shell restore", () => {
  assert.deepEqual(
    resolveEffectiveTenant({
      bootstrapTenant: null,
      preserveSignedInShell: true,
      currentTenant: tenant,
    }),
    tenant,
  );
  assert.equal(
    resolveEffectiveTenant({
      bootstrapTenant: null,
      preserveSignedInShell: false,
      currentTenant: tenant,
    }),
    null,
  );
});

test("resolveEffectiveTeamSetup preserves the current team mode during transient shell restore", () => {
  assert.deepEqual(
    resolveEffectiveTeamSetup({
      bootstrapTeamSetup: DEFAULT_TEAM_SETUP_IDENTITY,
      preserveSignedInShell: true,
      currentTeamSetup: teamModeSetup,
    }),
    teamModeSetup,
  );
  assert.deepEqual(
    resolveEffectiveTeamSetup({
      bootstrapTeamSetup: localTeamSetup,
      preserveSignedInShell: false,
      currentTeamSetup: teamModeSetup,
    }),
    localTeamSetup,
  );
});

test("buildStartSurfaceIdentity explains team mode and local mode truthfully", () => {
  const provisioned = buildStartSurfaceIdentity({
    accountEmail: "george@example.com",
    tenant,
    teamSetup: teamModeSetup,
    recentFolderCount: 0,
    threadCount: 0,
  });
  const local = buildStartSurfaceIdentity({
    accountEmail: "george@example.com",
    tenant: null,
    teamSetup: localTeamSetup,
    recentFolderCount: 0,
    threadCount: 0,
  });

  assert.equal(provisioned.canStartWork, true);
  assert.equal(provisioned.roleLabel, "Admin");
  assert.match(provisioned.supportingCopy, /Ops Team/);
  assert.equal(local.canStartWork, true);
  assert.equal(local.mode, "local");
  assert.equal(local.canCreateFirstTeam, true);
  assert.match(local.statusTitle, /Local mode/);
});

test("buildSidebarIdentity keeps role visible for team users and local mode visible otherwise", () => {
  assert.deepEqual(buildSidebarIdentity(tenant, teamModeSetup), {
    summary: "Ops Team · Admin",
    detail: "Ops Team",
  });
  assert.deepEqual(buildSidebarIdentity(null, localTeamSetup), {
    summary: "Local mode",
    detail: "Working on this Mac only until you create or join a team.",
  });
});

test("buildThreadComposerIdentity keeps local mode threads available", () => {
  assert.deepEqual(buildThreadComposerIdentity(tenant, teamModeSetup), {
    canContinueThread: true,
    message: null,
  });
  assert.deepEqual(buildThreadComposerIdentity(null, localTeamSetup), {
    canContinueThread: true,
    message: "Local mode keeps this thread on this Mac until you create or join a team.",
  });
});
