import { resolveThreadWorkspaceRoot } from "../bootstrap/desktop-bootstrap.js";
import { resolveProfileArtifactRoot, resolveProfileSubstrateDbPath } from "../profile/profile-state.js";
import type {
  DesktopWorkspaceHydrateResult,
  DesktopWorkspacePermissionGrantRequest,
  DesktopWorkspacePolicyRecord,
  DesktopWorkspacePolicyResult,
  DesktopWorkspaceOperatingModeRequest,
} from "../contracts.ts";
import {
  ensureProfileSubstrate,
  loadWorkspacePolicy,
  rememberSubstrateWorkspace,
  upsertWorkspacePolicy,
} from "../substrate/substrate.js";
import { DesktopWorkspaceStateService } from "./workspace-state-service.ts";
import {
  hydrateWorkspacePolicyRecord,
  summarizeHydratedWorkspace,
  type WorkspaceHydrationOptions,
} from "./workspace-policy-hydrator.ts";

type DesktopWorkspacePolicyServiceOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly resolveProfile: () => Promise<{ id: string }>;
  readonly workspaceState: DesktopWorkspaceStateService;
};

function shouldLogWorkspacePolicy(env: NodeJS.ProcessEnv): boolean {
  return env.SENSE1_DEBUG_WORKSPACE_POLICY === "1";
}

export class DesktopWorkspacePolicyService {
  readonly #env: NodeJS.ProcessEnv;
  readonly #resolveProfile: () => Promise<{ id: string }>;
  readonly #workspaceState: DesktopWorkspaceStateService;

  constructor(options: DesktopWorkspacePolicyServiceOptions) {
    this.#env = options.env ?? process.env;
    this.#resolveProfile = options.resolveProfile;
    this.#workspaceState = options.workspaceState;
  }

  async rememberWorkspaceFolder(folderPath: string): Promise<void> {
    const profile = await this.#resolveProfile();
    const dbPath = resolveProfileSubstrateDbPath(profile.id, this.#env);
    const substrate = await ensureProfileSubstrate({
      dbPath,
      profileId: profile.id,
    });

    await rememberSubstrateWorkspace({
      actorId: substrate.actorId,
      dbPath,
      profileId: profile.id,
      scopeId: substrate.scopeId,
      workspaceRoot: folderPath,
    });
    await this.#workspaceState.rememberWorkspaceFolder(folderPath);
  }

  async getWorkspacePolicy(rootPath: string): Promise<DesktopWorkspacePolicyResult> {
    const profile = await this.#resolveProfile();
    const dbPath = resolveProfileSubstrateDbPath(profile.id, this.#env);
    await ensureProfileSubstrate({
      dbPath,
      profileId: profile.id,
    });
    let policy = await loadWorkspacePolicy({
      dbPath,
      workspaceRoot: rootPath,
    });

    const artifactRoot = await resolveProfileArtifactRoot(profile.id, this.#env);
    if (policy.read_granted !== 1 && rootPath.startsWith(artifactRoot)) {
      policy = await this.#hydrateWorkspacePolicyRecord(rootPath, {
        force: true,
        readGrantMode: "always",
        readGranted: true,
        readGrantedAt: new Date().toISOString(),
        suppressErrors: true,
      });
    }

    if (shouldLogWorkspacePolicy(this.#env)) {
      console.log("[sense1:workspace-policy]", rootPath, JSON.stringify(policy));
    }
    return { policy };
  }

  async grantWorkspacePermission({
    mode,
    rootPath,
  }: DesktopWorkspacePermissionGrantRequest): Promise<DesktopWorkspacePolicyResult> {
    await this.#workspaceState.rememberWorkspaceFolder(rootPath);
    const now = new Date().toISOString();
    const policy = await this.#hydrateWorkspacePolicyRecord(rootPath, {
      force: true,
      readGrantMode: mode,
      readGranted: true,
      readGrantedAt: now,
      suppressErrors: true,
    });
    return { policy };
  }

  async setWorkspaceOperatingMode({
    mode,
    rootPath,
  }: DesktopWorkspaceOperatingModeRequest): Promise<DesktopWorkspacePolicyResult> {
    const profile = await this.#resolveProfile();
    const dbPath = resolveProfileSubstrateDbPath(profile.id, this.#env);
    await ensureProfileSubstrate({
      dbPath,
      profileId: profile.id,
    });
    const policy = await upsertWorkspacePolicy({
      dbPath,
      operatingMode: mode,
      workspaceRoot: rootPath,
    });
    return { policy };
  }

  async hydrateWorkspace(rootPath: string): Promise<DesktopWorkspaceHydrateResult> {
    const profile = await this.#resolveProfile();
    const dbPath = resolveProfileSubstrateDbPath(profile.id, this.#env);
    await ensureProfileSubstrate({
      dbPath,
      profileId: profile.id,
    });
    const existingPolicy = await loadWorkspacePolicy({
      dbPath,
      workspaceRoot: rootPath,
    });
    if (existingPolicy.read_granted !== 1) {
      throw new Error("Grant workspace read permission before refreshing this folder.");
    }
    const policy = await this.#hydrateWorkspacePolicyRecord(rootPath, { force: true });
    return summarizeHydratedWorkspace(policy);
  }

  async resolveThreadWorkspaceRoot(threadId: string | null | undefined): Promise<string | null> {
    const resolvedThreadId = threadId?.trim();
    if (!resolvedThreadId) {
      return null;
    }

    const profile = await this.#resolveProfile();
    return await resolveThreadWorkspaceRoot(profile.id, resolvedThreadId, {}, this.#env);
  }

  async #hydrateWorkspacePolicyRecord(
    workspaceRoot: string,
    options: WorkspaceHydrationOptions = {},
  ): Promise<DesktopWorkspacePolicyRecord> {
    const profile = await this.#resolveProfile();
    return await hydrateWorkspacePolicyRecord(profile.id, this.#env, workspaceRoot, options);
  }
}
