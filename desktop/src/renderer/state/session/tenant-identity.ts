import type { DesktopBootstrapTeamSetup, DesktopBootstrapTenant } from "../../../main/contracts";

export type TenantIdentity = DesktopBootstrapTenant | null;
export type TeamSetupIdentity = DesktopBootstrapTeamSetup;

export const DEFAULT_TEAM_SETUP_IDENTITY: TeamSetupIdentity = {
  mode: "local",
  source: "desktopLocal",
  canWorkLocally: false,
  canCreateFirstTeam: false,
  canManageTeam: false,
};

export function formatTenantRole(role: DesktopBootstrapTenant["role"]): string {
  return role === "admin" ? "Admin" : "Member";
}

export function resolveEffectiveTenant({
  bootstrapTenant,
  preserveSignedInShell,
  currentTenant,
}: {
  bootstrapTenant: TenantIdentity;
  preserveSignedInShell: boolean;
  currentTenant: TenantIdentity;
}): TenantIdentity {
  if (!preserveSignedInShell) {
    return bootstrapTenant;
  }

  return bootstrapTenant ?? currentTenant;
}

export function resolveEffectiveTeamSetup({
  bootstrapTeamSetup,
  preserveSignedInShell,
  currentTeamSetup,
}: {
  bootstrapTeamSetup: TeamSetupIdentity;
  preserveSignedInShell: boolean;
  currentTeamSetup: TeamSetupIdentity;
}): TeamSetupIdentity {
  if (!preserveSignedInShell) {
    return bootstrapTeamSetup;
  }

  return currentTeamSetup;
}

export function buildStartSurfaceIdentity({
  accountEmail,
  tenant,
  teamSetup,
  recentFolderCount,
  threadCount,
}: {
  accountEmail: string | null;
  tenant: TenantIdentity;
  teamSetup: TeamSetupIdentity;
  recentFolderCount: number;
  threadCount: number;
}) {
  const greetingName = accountEmail ? accountEmail.split("@")[0] : null;
  const isFirstTime = recentFolderCount === 0 && threadCount === 0;

  if (!teamSetup.canWorkLocally) {
    return {
      canStartWork: false,
      mode: "local" as const,
      heading: "Sign in to start working locally.",
      supportingCopy: "Sense-1 will keep your work on this Mac and can attach a team later when one exists.",
      statusTitle: "Sign-in required",
      statusBody: "Local chat and folder work unlock after sign-in succeeds.",
      canCreateFirstTeam: false,
      roleLabel: null,
      scopeLabel: null,
    };
  }

  if (!tenant) {
    return {
      canStartWork: true,
      mode: "local" as const,
      heading: isFirstTime
        ? (greetingName ? `Welcome, ${greetingName}.` : "Welcome to Sense-1.")
        : (greetingName ? `Welcome back, ${greetingName}.` : "Welcome back."),
      supportingCopy: isFirstTime
        ? "Sense-1 is ready on this Mac. Start chatting now or choose a local folder to work from. Create your first team when you want a shared workspace identity."
        : "Working locally on this Mac. Start a chat, attach a folder, or create a team when you want shared scope and membership.",
      statusTitle: "Local mode",
      statusBody: "Your chats and folder work stay local to this Mac until you create or join a team.",
      canCreateFirstTeam: teamSetup.canCreateFirstTeam,
      roleLabel: null,
      scopeLabel: "This Mac only",
    };
  }

  const roleLabel = formatTenantRole(tenant.role);

  return {
    canStartWork: true,
    mode: "team" as const,
    heading: isFirstTime
      ? (greetingName ? `Welcome, ${greetingName}.` : "Welcome to Sense-1.")
      : (greetingName ? `Welcome back, ${greetingName}.` : "Welcome back."),
    supportingCopy: isFirstTime
      ? `Sense-1 is ready for ${tenant.displayName}. Pick a local folder to work in — your files stay on your machine — or just start a conversation.`
      : `Working inside ${tenant.displayName} as ${roleLabel.toLowerCase()}.`,
    statusTitle: "Team workspace",
    statusBody: `Desktop team context is active for ${tenant.displayName}.`,
    canCreateFirstTeam: false,
    roleLabel,
    scopeLabel: tenant.scopeDisplayName,
  };
}

export function buildSidebarIdentity(tenant: TenantIdentity, teamSetup: TeamSetupIdentity) {
  if (!teamSetup.canWorkLocally) {
    return {
      summary: "Sign in required",
      detail: "Sign-in unlocks local chats, folder work, and team setup.",
    };
  }

  if (!tenant) {
    return {
      summary: "Local mode",
      detail: "Working on this Mac only until you create or join a team.",
    };
  }

  return {
    summary: `${tenant.displayName} · ${formatTenantRole(tenant.role)}`,
    detail: tenant.scopeDisplayName,
  };
}

export function buildThreadComposerIdentity(tenant: TenantIdentity, teamSetup: TeamSetupIdentity) {
  if (!teamSetup.canWorkLocally) {
    return {
      canContinueThread: false,
      message: "Sign in before continuing this thread.",
    };
  }

  return {
    canContinueThread: true,
    message: null,
  };
}
