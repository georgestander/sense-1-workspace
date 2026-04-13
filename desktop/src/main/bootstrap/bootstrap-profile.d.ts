import type { AppServerProcessManager } from "../runtime/app-server-process-manager.js";

export interface DesktopProfileSnapshot {
  readonly id: string;
  readonly source: "environment" | "stored" | "default";
  readonly rootPath: string;
  readonly codexHome: string;
}

export interface DesktopAuthSnapshot {
  readonly isSignedIn: boolean;
  readonly email: string | null;
  readonly name?: string | null;
  readonly accountType: string | null;
  readonly requiresOpenaiAuth: boolean;
  readonly error?: string;
}

export interface DesktopProfileOption {
  readonly id: string;
  readonly label: string;
}

export function resolveDesktopProfile(env?: NodeJS.ProcessEnv): Promise<DesktopProfileSnapshot>;
export function selectDesktopProfile(
  profileId: string,
  env?: NodeJS.ProcessEnv,
): Promise<
  | { readonly success: true; readonly profile: DesktopProfileSnapshot }
  | { readonly success: false; readonly reason: string }
>;
export function resolveChatgptSignInUrl(env?: NodeJS.ProcessEnv): string;
export function normalizeAuthState(result: unknown): DesktopAuthSnapshot;
export function canonicalizeDesktopProfile(
  profile: DesktopProfileSnapshot,
  auth: DesktopAuthSnapshot,
  env?: NodeJS.ProcessEnv,
): Promise<DesktopProfileSnapshot>;
export function buildProfileOptions(
  profile: DesktopProfileSnapshot,
  env?: NodeJS.ProcessEnv,
): Promise<DesktopProfileOption[]>;
export function resolveSignedInDesktopProfile(
  manager: AppServerProcessManager,
  env?: NodeJS.ProcessEnv,
): Promise<DesktopProfileSnapshot>;
