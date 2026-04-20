import type { DesktopCompleteDisplayNameResult, DesktopIdentityState } from "../contracts";

export interface DesktopIdentityAuthSnapshot {
  readonly isSignedIn?: boolean;
  readonly name?: string | null;
  readonly email?: string | null;
}

export interface DesktopIdentityProfileSnapshot {
  readonly id: string;
}

export function inferDisplayNameFromAuth(
  auth: DesktopIdentityAuthSnapshot | null | undefined,
): string | null;

export function buildDesktopIdentityState(
  profile: DesktopIdentityProfileSnapshot,
  auth: DesktopIdentityAuthSnapshot | null | undefined,
  env?: NodeJS.ProcessEnv,
): Promise<DesktopIdentityState>;

export function completeDesktopDisplayName(options: {
  profileId: string;
  displayName: string;
  env?: NodeJS.ProcessEnv;
}): Promise<DesktopCompleteDisplayNameResult>;
