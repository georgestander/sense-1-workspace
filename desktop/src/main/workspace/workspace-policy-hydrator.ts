import fs from "node:fs/promises";
import path from "node:path";

import {
  loadDesktopSettings,
  resolveProfileSubstrateDbPath,
} from "../profile/profile-state.js";
import { resolveDesktopSettings as resolveStoredDesktopSettings } from "../settings/desktop-settings.js";
import type {
  DesktopOperatingMode,
  DesktopWorkspacePermissionGrantRequest,
  DesktopWorkspacePolicyRecord,
} from "../contracts.ts";
import {
  ensureProfileSubstrate,
  loadWorkspacePolicy,
  upsertWorkspacePolicy,
} from "../substrate/substrate.js";
import {
  collectWorkspaceContextPaths,
  detectWorkspaceProjectType,
  formatError,
  normalizeWorkspaceDirectoryEntries,
  shouldSeedWorkspaceOperatingMode,
} from "./workspace-service-helpers.ts";

export type WorkspaceHydrationOptions = {
  readonly force?: boolean;
  readonly readGrantMode?: DesktopWorkspacePermissionGrantRequest["mode"] | null;
  readonly readGranted?: boolean;
  readonly readGrantedAt?: string | null;
  readonly suppressErrors?: boolean;
};

async function loadDefaultOperatingMode(profileId: string, env: NodeJS.ProcessEnv): Promise<DesktopOperatingMode> {
  const storedSettings = await loadDesktopSettings(profileId, env);
  return resolveStoredDesktopSettings(storedSettings as unknown as Record<string, unknown>).defaultOperatingMode ?? "auto";
}

async function readWorkspaceDirectoryFallback(workspaceRoot: string): Promise<unknown> {
  const skipDirs = new Set(["node_modules", "dist", "build", ".git", "__pycache__", ".next", ".nuxt", ".cache", "coverage"]);
  const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
  const result: Array<{ name: string; type: string; path: string; children?: unknown[] }> = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || skipDirs.has(entry.name)) continue;
    const entryPath = path.join(workspaceRoot, entry.name);
    if (entry.isDirectory()) {
      try {
        const children = await fs.readdir(entryPath, { withFileTypes: true });
        result.push({
          name: entry.name,
          type: "directory",
          path: entryPath,
          children: children
            .filter((child) => !child.name.startsWith(".") && !skipDirs.has(child.name))
            .slice(0, 50)
            .map((child) => ({
              name: child.name,
              type: child.isDirectory() ? "directory" : "file",
              path: path.join(entryPath, child.name),
            })),
        });
      } catch {
        result.push({ name: entry.name, type: "directory", path: entryPath });
      }
    } else {
      result.push({ name: entry.name, type: "file", path: entryPath });
    }
  }
  return result;
}

async function readWorkspaceDirectory(workspaceRoot: string): Promise<unknown> {
  return await readWorkspaceDirectoryFallback(workspaceRoot);
}

export async function hydrateWorkspacePolicyRecord(
  profileId: string,
  env: NodeJS.ProcessEnv,
  workspaceRoot: string,
  options: WorkspaceHydrationOptions = {},
): Promise<DesktopWorkspacePolicyRecord> {
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const dbPath = resolveProfileSubstrateDbPath(profileId, env);
  await ensureProfileSubstrate({
    dbPath,
    profileId,
  });

  const existingPolicy = await loadWorkspacePolicy({
    dbPath,
    workspaceRoot: resolvedWorkspaceRoot,
  });
  const seededOperatingMode = shouldSeedWorkspaceOperatingMode(existingPolicy)
    ? await loadDefaultOperatingMode(profileId, env)
    : undefined;
  const shouldHydrate = options.force === true || existingPolicy.known_structure.length === 0;
  if (!shouldHydrate) {
    if (
      options.readGranted === undefined
      && options.readGrantedAt === undefined
      && options.readGrantMode === undefined
    ) {
      return existingPolicy;
    }

    return await upsertWorkspacePolicy({
      dbPath,
      operatingMode: seededOperatingMode,
      readGrantMode: options.readGrantMode,
      readGranted: options.readGranted,
      readGrantedAt: options.readGrantedAt,
      workspaceRoot: resolvedWorkspaceRoot,
    });
  }

  try {
    const directoryResult = await readWorkspaceDirectory(resolvedWorkspaceRoot);
    const knownStructure = normalizeWorkspaceDirectoryEntries(resolvedWorkspaceRoot, directoryResult);
    const now = new Date().toISOString();
    return await upsertWorkspacePolicy({
      contextPaths: collectWorkspaceContextPaths(resolvedWorkspaceRoot, knownStructure),
      dbPath,
      knownStructure,
      lastHydratedAt: now,
      operatingMode: seededOperatingMode,
      readGrantMode: options.readGrantMode,
      readGranted: options.readGranted,
      readGrantedAt: options.readGrantedAt,
      workspaceRoot: resolvedWorkspaceRoot,
    });
  } catch (error) {
    if (options.suppressErrors === true) {
      console.warn(
        `[desktop:workspace] Failed to hydrate "${resolvedWorkspaceRoot}": ${formatError(error)}`,
      );
      if (
        options.readGranted === undefined
        && options.readGrantedAt === undefined
        && options.readGrantMode === undefined
      ) {
        return existingPolicy;
      }

      return await upsertWorkspacePolicy({
        dbPath,
        operatingMode: seededOperatingMode,
        readGrantMode: options.readGrantMode,
        readGranted: options.readGranted,
        readGrantedAt: options.readGrantedAt,
        workspaceRoot: resolvedWorkspaceRoot,
      });
    }
    throw error;
  }
}

export function summarizeHydratedWorkspace(
  policy: DesktopWorkspacePolicyRecord,
): {
  displayName: string;
  fileCount: number;
  keyFiles: string[];
  lastHydrated: string | null;
  projectType: string;
  rootPath: string;
} {
  return {
    displayName: path.basename(policy.workspace_root),
    fileCount: policy.known_structure.length,
    keyFiles: policy.context_paths,
    lastHydrated: policy.last_hydrated_at,
    projectType: detectWorkspaceProjectType(policy.context_paths),
    rootPath: policy.workspace_root,
  };
}
