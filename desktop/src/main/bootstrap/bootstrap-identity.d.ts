import type { DesktopCompleteDisplayNameResult, DesktopIdentityState } from "../contracts";

export interface DesktopIdentityAuthSnapshot {
  readonly isSignedIn?: boolean;
}

export interface DesktopIdentityProfileSnapshot {
  readonly id: string;
}

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
