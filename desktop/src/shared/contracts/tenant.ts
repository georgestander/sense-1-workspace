import type { DesktopBootstrapTeamSetup, DesktopBootstrapTenant } from "./bootstrap.js";

export interface DesktopTeamMemberRecord {
  readonly tenantId: string;
  readonly tenantDisplayName: string;
  readonly scopeId: string;
  readonly scopeDisplayName: string;
  readonly actorId: string;
  readonly actorDisplayName: string;
  readonly email: string;
  readonly role: "member" | "admin";
  readonly joinedAt: string;
  readonly updatedAt: string;
}

export interface DesktopTeamStateResult {
  readonly accountEmail: string | null;
  readonly teamSetup: DesktopBootstrapTeamSetup;
  readonly tenant: DesktopBootstrapTenant | null;
  readonly members: DesktopTeamMemberRecord[];
}

export interface DesktopCreateFirstTeamRequest {
  readonly name: string;
}

export interface DesktopSaveTeamMemberRequest {
  readonly email: string;
  readonly role: "member" | "admin";
  readonly displayName?: string | null;
}
