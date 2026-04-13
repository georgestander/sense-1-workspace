export const APP_NAME: "sense-1";
export const DEFAULT_PROFILE_ID: "default";

export interface RecentWorkspaceFolderEntry {
  readonly path: string;
  readonly name: string;
  readonly lastUsedAt: string | null;
}

export interface ThreadWorkspaceBindingEntry {
  readonly threadId: string;
  readonly workspaceRoot: string;
  readonly lastUsedAt: string | null;
}

export interface ThreadInteractionStateEntry {
  readonly threadId: string;
  readonly interactionState: string;
  readonly updatedAt: string | null;
}

export interface ProfileIdentityRecord {
  readonly email: string | null;
  readonly displayName: string | null;
  readonly lastSignedInAt: string | null;
  readonly mergedIntoProfileId: string | null;
  readonly legacyProfileIds: string[];
  readonly updatedAt: string | null;
}

export function sanitizeProfileId(value: unknown): string;
export function resolveEmailProfileId(email: unknown): string | null;
export function resolveRuntimeStateRoot(env?: NodeJS.ProcessEnv): string;
export function resolveProfilesDir(env?: NodeJS.ProcessEnv): string;
export function resolveProfileRoot(profileId: string, env?: NodeJS.ProcessEnv): string;
export function resolveProfileCodexHome(profileId: string, env?: NodeJS.ProcessEnv): string;
export function resolveProfileSubstrateDbPath(profileId: string, env?: NodeJS.ProcessEnv): string;
export function resolveDefaultArtifactRoot(env?: NodeJS.ProcessEnv): string;
export function resolveSessionArtifactRoot(artifactRoot: string, sessionId: string): string;
export function ensureProfileDirectories(
  profileId: string,
  env?: NodeJS.ProcessEnv,
): Promise<{
  profileId: string;
  profileRoot: string;
  codexHome: string;
}>;
export function loadProfileArtifactRoot(
  profileId: string,
  env?: NodeJS.ProcessEnv,
): Promise<string | null>;
export function persistProfileArtifactRoot(
  profileId: string,
  artifactRoot: string,
  env?: NodeJS.ProcessEnv,
): Promise<string>;
export function resolveProfileArtifactRoot(
  profileId: string,
  env?: NodeJS.ProcessEnv,
): Promise<string>;
export function loadProfileIdentity(
  profileId: string,
  env?: NodeJS.ProcessEnv,
): Promise<ProfileIdentityRecord | null>;
export function persistProfileIdentity(
  profileId: string,
  identity?: {
    displayName?: string | null;
    email?: string | null;
    lastSignedInAt?: string | null;
    mergedIntoProfileId?: string | null;
    legacyProfileIds?: string[] | null;
  },
  env?: NodeJS.ProcessEnv,
): Promise<ProfileIdentityRecord>;
export function loadActiveProfileId(env?: NodeJS.ProcessEnv): Promise<string | null>;
export function loadActiveProfileIdSync(env?: NodeJS.ProcessEnv): string | null;
export function persistActiveProfileId(profileId: string, env?: NodeJS.ProcessEnv): Promise<string>;
export function loadLastSelectedThreadId(
  profileId: string,
  env?: NodeJS.ProcessEnv,
): Promise<string | null>;
export function persistLastSelectedThreadId(
  profileId: string,
  threadId: string | null,
  env?: NodeJS.ProcessEnv,
): Promise<string | null>;
export function loadThreadInteractionStates(
  profileId: string,
  env?: NodeJS.ProcessEnv,
): Promise<ThreadInteractionStateEntry[]>;
export function rememberThreadInteractionState(
  profileId: string,
  threadId: string,
  interactionState: string,
  env?: NodeJS.ProcessEnv,
): Promise<ThreadInteractionStateEntry[]>;
export function forgetThreadInteractionState(
  profileId: string,
  threadId: string,
  env?: NodeJS.ProcessEnv,
): Promise<ThreadInteractionStateEntry[]>;
export function listProfileIds(env?: NodeJS.ProcessEnv): Promise<string[]>;
export function loadRecentWorkspaceFolders(
  profileId: string,
  env?: NodeJS.ProcessEnv,
): Promise<RecentWorkspaceFolderEntry[]>;
export function rememberRecentWorkspaceFolder(
  profileId: string,
  folderPath: string,
  env?: NodeJS.ProcessEnv,
): Promise<RecentWorkspaceFolderEntry[]>;
export function forgetRecentWorkspaceFolder(
  profileId: string,
  folderPath: string,
  env?: NodeJS.ProcessEnv,
): Promise<RecentWorkspaceFolderEntry[]>;
export function loadThreadWorkspaceBindings(
  profileId: string,
  env?: NodeJS.ProcessEnv,
): Promise<ThreadWorkspaceBindingEntry[]>;
export function loadThreadWorkspaceRoot(
  profileId: string,
  threadId: string,
  env?: NodeJS.ProcessEnv,
): Promise<string | null>;
export function rememberThreadWorkspaceRoot(
  profileId: string,
  threadId: string,
  workspaceRoot: string,
  env?: NodeJS.ProcessEnv,
): Promise<ThreadWorkspaceBindingEntry[]>;
export function forgetThreadWorkspaceRoot(
  profileId: string,
  threadId: string,
  env?: NodeJS.ProcessEnv,
): Promise<ThreadWorkspaceBindingEntry[]>;
export function loadWorkspaceSidebarOrder(
  profileId: string,
  env?: NodeJS.ProcessEnv,
): Promise<string[]>;
export function rememberWorkspaceSidebarOrder(
  profileId: string,
  rootPaths: string[],
  env?: NodeJS.ProcessEnv,
): Promise<string[]>;
export function forgetWorkspaceSidebarRoot(
  profileId: string,
  rootPath: string,
  env?: NodeJS.ProcessEnv,
): Promise<string[]>;
export function clearLastSelectedThreadIdIfMatches(
  profileId: string,
  threadId: string,
  env?: NodeJS.ProcessEnv,
): Promise<string | null>;
export function loadPendingApprovals(
  profileId: string,
  env?: NodeJS.ProcessEnv,
): Promise<unknown[]>;
export function persistPendingApprovals(
  profileId: string,
  approvals: unknown[],
  env?: NodeJS.ProcessEnv,
): Promise<void>;
export function forgetPendingApprovalsForThread(
  profileId: string,
  threadId: string,
  env?: NodeJS.ProcessEnv,
): Promise<unknown[]>;

export interface DesktopSettings {
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly personality?: string;
  readonly runtimeInstructions?: string;
  readonly approvalPosture?: string;
  readonly sandboxPosture?: string;
  readonly [key: string]: unknown;
}

export function loadDesktopSettings(
  profileId: string,
  env?: NodeJS.ProcessEnv,
): Promise<DesktopSettings>;
export function persistDesktopSettings(
  profileId: string,
  settings: DesktopSettings,
  env?: NodeJS.ProcessEnv,
): Promise<void>;
