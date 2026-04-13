import type {
  DesktopBootstrapTeamSetup,
  DesktopBootstrapTenant,
  DesktopCreateFirstTeamRequest,
  DesktopSaveTeamMemberRequest,
  DesktopTeamMemberRecord,
  DesktopTeamStateResult,
} from "../contracts.ts";
import {
  addTenantMember,
  createTenant,
  getTenant,
  listTenantMembers,
  persistActiveTenantMembership,
  resolveTenantMembershipForProfile,
  sanitizeTenantId,
  type TenantMembershipRecord,
} from "./tenant-state.ts";

type DesktopTenantServiceOptions = {
  env?: NodeJS.ProcessEnv;
  resolveProfile: () => Promise<{ id: string }>;
  resolveSignedInEmail: (profileId: string) => Promise<string | null>;
};

function fallbackActorDisplayName(email: string | null): string {
  return email?.split("@")[0]?.trim() || "Owner";
}

export function toDesktopBootstrapTenant(
  membership: TenantMembershipRecord | null,
): DesktopBootstrapTenant | null {
  if (!membership) {
    return null;
  }

  return {
    id: membership.tenantId,
    displayName: membership.tenantDisplayName,
    role: membership.role,
    scopeId: membership.scopeId,
    scopeDisplayName: membership.scopeDisplayName,
    actorId: membership.actorId,
    actorDisplayName: membership.actorDisplayName,
  };
}

export function buildDesktopTeamSetupState({
  accountEmail,
  tenant,
}: {
  accountEmail: string | null;
  tenant: TenantMembershipRecord | null;
}): DesktopBootstrapTeamSetup {
  const signedIn = typeof accountEmail === "string" && accountEmail.trim().length > 0;
  const hasTenant = tenant !== null;

  return {
    mode: hasTenant ? "team" : "local",
    source: "desktopLocal",
    canWorkLocally: signedIn,
    canCreateFirstTeam: signedIn && !hasTenant,
    canManageTeam: tenant?.role === "admin",
  };
}

function toDesktopTeamMemberRecord(membership: TenantMembershipRecord): DesktopTeamMemberRecord {
  return {
    tenantId: membership.tenantId,
    tenantDisplayName: membership.tenantDisplayName,
    scopeId: membership.scopeId,
    scopeDisplayName: membership.scopeDisplayName,
    actorId: membership.actorId,
    actorDisplayName: membership.actorDisplayName,
    email: membership.email,
    role: membership.role,
    joinedAt: membership.joinedAt,
    updatedAt: membership.updatedAt,
  };
}

export class DesktopTenantService {
  readonly #env: NodeJS.ProcessEnv;
  readonly #resolveProfile: () => Promise<{ id: string }>;
  readonly #resolveSignedInEmail: (profileId: string) => Promise<string | null>;

  constructor(options: DesktopTenantServiceOptions) {
    this.#env = options.env ?? process.env;
    this.#resolveProfile = options.resolveProfile;
    this.#resolveSignedInEmail = options.resolveSignedInEmail;
  }

  async #resolveIdentity(): Promise<{
    profileId: string;
    accountEmail: string | null;
    membership: TenantMembershipRecord | null;
  }> {
    const profile = await this.#resolveProfile();
    const accountEmail = await this.#resolveSignedInEmail(profile.id);
    const membership = await resolveTenantMembershipForProfile({
      profileId: profile.id,
      email: accountEmail,
      env: this.#env,
    });
    return {
      profileId: profile.id,
      accountEmail,
      membership,
    };
  }

  async #resolveCreateTenantId(name: string): Promise<string> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("A team name is required.");
    }

    const baseId = sanitizeTenantId(trimmed);
    let candidate = baseId;
    let attempt = 2;
    while (await getTenant({ tenantId: candidate, env: this.#env })) {
      candidate = `${baseId}-${attempt}`;
      attempt += 1;
    }
    return candidate;
  }

  async #buildState(
    accountEmail: string | null,
    membership: TenantMembershipRecord | null,
  ): Promise<DesktopTeamStateResult> {
    const members = membership
      ? (await listTenantMembers({ tenantId: membership.tenantId, env: this.#env })).map(toDesktopTeamMemberRecord)
      : [];

    return {
      accountEmail,
      teamSetup: buildDesktopTeamSetupState({
        accountEmail,
        tenant: membership,
      }),
      tenant: toDesktopBootstrapTenant(membership),
      members,
    };
  }

  async getTeamState(): Promise<DesktopTeamStateResult> {
    const { accountEmail, membership } = await this.#resolveIdentity();
    return await this.#buildState(accountEmail, membership);
  }

  async createFirstTeam(request: DesktopCreateFirstTeamRequest): Promise<DesktopTeamStateResult> {
    const { profileId, accountEmail, membership } = await this.#resolveIdentity();
    if (!accountEmail) {
      throw new Error("Sign in with ChatGPT before creating a team.");
    }
    if (membership) {
      throw new Error("Sense-1 already has an active team for this profile.");
    }

    const teamName = request.name.trim();
    if (!teamName) {
      throw new Error("Enter a team name to continue.");
    }

    const tenantId = await this.#resolveCreateTenantId(teamName);
    await createTenant({
      tenantId,
      displayName: teamName,
      env: this.#env,
    });
    const createdMembership = await addTenantMember({
      tenantId,
      email: accountEmail,
      role: "admin",
      displayName: fallbackActorDisplayName(accountEmail),
      env: this.#env,
    });
    await persistActiveTenantMembership(profileId, createdMembership, this.#env);

    return await this.#buildState(accountEmail, createdMembership);
  }

  async saveTeamMember(request: DesktopSaveTeamMemberRequest): Promise<DesktopTeamStateResult> {
    const { accountEmail, membership } = await this.#resolveIdentity();
    if (!accountEmail || !membership) {
      throw new Error("Create or restore a team before managing members.");
    }
    if (membership.role !== "admin") {
      throw new Error("Only admins can manage team members.");
    }

    const email = request.email.trim();
    if (!email) {
      throw new Error("A member email is required.");
    }

    await addTenantMember({
      tenantId: membership.tenantId,
      email,
      role: request.role,
      displayName: request.displayName?.trim() || null,
      env: this.#env,
    });

    return await this.getTeamState();
  }
}
