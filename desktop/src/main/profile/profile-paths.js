import { existsSync, readdirSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const APP_NAME = "sense-1-workspace";
export const DEFAULT_PROFILE_ID = "default";
const DARWIN_RUNTIME_STATE_ROOT_NAMES = ["Sense-1 Workspace", APP_NAME, "Sense-1", "sense-1"];

const ACTIVE_PROFILE_FILE = "_active.json";
const ARTIFACT_ROOT_FILE = "artifact-root.json";
const SUBSTRATE_DB_FILE = "sense1.db";
const AUTH_FILE = "auth.json";
const ensuredProfileDirectoriesCache = new Map();
const runtimeStateRootCache = new Map();
const SENSE1_SKILL_CREATOR_OVERRIDE_MARKER = "## Sense-1 Workspace Desktop Override";
const SENSE1_SKILL_CREATOR_OVERRIDE = [
  SENSE1_SKILL_CREATOR_OVERRIDE_MARKER,
  "",
  "When Sense-1 Workspace asks you to create a profile skill and the request already specifies the skill name, install location, intended behavior, and trigger conditions:",
  "- do not stop after running `init_skill.py`",
  "- inspect the generated skill files in the same turn",
  "- replace every generated TODO or placeholder before you finish",
  "- leave a finished, callable skill in the user's Sense-1 Skills library so it appears in the Skills page unless the user explicitly asked for scaffold-only output",
  "- when talking to the user, never mention `$CODEX_HOME`, `codex-home`, or raw filesystem install paths for skills; say `Sense-1 Skills library`, `installed skills`, or `Skills page` instead",
].join("\n");

function resolveSharedCodexHome(env = process.env) {
  const explicitCodexHome = env.CODEX_HOME?.trim();
  if (explicitCodexHome) {
    return path.resolve(explicitCodexHome);
  }

  return path.join(os.homedir(), ".codex");
}

function scoreRuntimeStateRoot(candidateRoot) {
  let score = 0;
  const profilesDir = path.join(candidateRoot, "profiles");
  const activeProfileFile = path.join(profilesDir, ACTIVE_PROFILE_FILE);

  if (existsSync(activeProfileFile)) {
    score += 8;
  }

  if (existsSync(profilesDir)) {
    score += 4;
    try {
      const profileEntries = readdirSync(profilesDir, { withFileTypes: true });
      if (profileEntries.some((entry) => entry.isDirectory())) {
        score += 3;
      }
      if (profileEntries.some((entry) => !entry.name.startsWith("."))) {
        score += 1;
      }
    } catch {
      // Ignore unreadable roots and keep the lower score.
    }
  }

  try {
    const rootEntries = readdirSync(candidateRoot, { withFileTypes: true });
    if (rootEntries.some((entry) => entry.name === "profiles" || entry.name === "tenant-store")) {
      score += 2;
    }
    if (rootEntries.length > 0) {
      score += 1;
    }
  } catch {
    // Ignore unreadable roots and keep the lower score.
  }

  return score;
}

export function selectPreferredDarwinRuntimeStateRoot(candidateRoots) {
  const normalizedCandidates = [...new Set(
    candidateRoots
      .map((candidateRoot) => String(candidateRoot || "").trim())
      .filter(Boolean)
      .map((candidateRoot) => path.resolve(candidateRoot)),
  )];
  if (normalizedCandidates.length === 0) {
    return null;
  }

  return normalizedCandidates.sort((left, right) => {
    const scoreDelta = scoreRuntimeStateRoot(right) - scoreRuntimeStateRoot(left);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    const leftName = path.basename(left);
    const rightName = path.basename(right);
    const leftIndex = DARWIN_RUNTIME_STATE_ROOT_NAMES.indexOf(leftName);
    const rightIndex = DARWIN_RUNTIME_STATE_ROOT_NAMES.indexOf(rightName);
    return rightIndex - leftIndex;
  })[0];
}

export function sanitizeProfileId(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  return cleaned || DEFAULT_PROFILE_ID;
}

function buildRuntimeStateRootCacheKey(env = process.env) {
  const explicitRoot = env.SENSE1_RUNTIME_STATE_ROOT?.trim();
  if (explicitRoot) {
    return `explicit:${process.platform}:${path.resolve(explicitRoot)}`;
  }

  return JSON.stringify({
    home: env.HOME?.trim() || os.homedir(),
    localAppData: env.LOCALAPPDATA?.trim() || "",
    platform: process.platform,
    xdgDataHome: env.XDG_DATA_HOME?.trim() || "",
  });
}

export function resolveRuntimeStateRoot(env = process.env) {
  const cacheKey = buildRuntimeStateRootCacheKey(env);
  const cachedRoot = runtimeStateRootCache.get(cacheKey);
  if (cachedRoot) {
    return cachedRoot;
  }

  const explicitRoot = env.SENSE1_RUNTIME_STATE_ROOT?.trim();
  if (explicitRoot) {
    const resolvedRoot = path.resolve(explicitRoot);
    runtimeStateRootCache.set(cacheKey, resolvedRoot);
    return resolvedRoot;
  }

  if (process.platform === "darwin") {
    const appSupportRoot = path.join(os.homedir(), "Library", "Application Support");
    if (existsSync(appSupportRoot)) {
      const directoryEntries = readdirSync(appSupportRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

      const exactMatches = DARWIN_RUNTIME_STATE_ROOT_NAMES
        .map((candidateName) => directoryEntries.find((entryName) => entryName === candidateName) ?? null)
        .filter((entryName) => Boolean(entryName));
      if (exactMatches.length > 0) {
        const preferredExactMatch = selectPreferredDarwinRuntimeStateRoot(
          exactMatches.map((entryName) => path.join(appSupportRoot, entryName)),
        );
        if (preferredExactMatch) {
          runtimeStateRootCache.set(cacheKey, preferredExactMatch);
          return preferredExactMatch;
        }
      }

      for (const candidateName of DARWIN_RUNTIME_STATE_ROOT_NAMES) {
        const looseMatch = directoryEntries.find(
          (entryName) => entryName.toLowerCase() === candidateName.toLowerCase(),
        );
        if (looseMatch) {
          const resolvedRoot = path.join(appSupportRoot, looseMatch);
          runtimeStateRootCache.set(cacheKey, resolvedRoot);
          return resolvedRoot;
        }
      }
    }

    const resolvedRoot = path.join(appSupportRoot, DARWIN_RUNTIME_STATE_ROOT_NAMES[0]);
    runtimeStateRootCache.set(cacheKey, resolvedRoot);
    return resolvedRoot;
  }

  if (process.platform === "win32") {
    const localAppData = env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const resolvedRoot = path.join(localAppData, APP_NAME);
    runtimeStateRootCache.set(cacheKey, resolvedRoot);
    return resolvedRoot;
  }

  const xdgDataHome = env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  const resolvedRoot = path.join(xdgDataHome, APP_NAME);
  runtimeStateRootCache.set(cacheKey, resolvedRoot);
  return resolvedRoot;
}

export function resolveProfilesDir(env = process.env) {
  return path.join(resolveRuntimeStateRoot(env), "profiles");
}

export function resolveProfileRoot(profileId, env = process.env) {
  return path.join(resolveProfilesDir(env), sanitizeProfileId(profileId));
}

export function resolveProfileCodexHome(profileId, env = process.env) {
  return path.join(resolveProfileRoot(profileId, env), "codex-home");
}

export function resolveProfileSubstrateDbPath(profileId, env = process.env) {
  return path.join(resolveProfileRoot(profileId, env), SUBSTRATE_DB_FILE);
}

export function resolveDefaultArtifactRoot(env = process.env) {
  const explicitRoot = env.SENSE1_ARTIFACT_ROOT?.trim();
  if (explicitRoot) {
    return path.resolve(explicitRoot);
  }

  return path.join(os.homedir(), "Sense-1 Workspace");
}

export function resolveSessionArtifactRoot(artifactRoot, sessionId) {
  const resolvedArtifactRoot = String(artifactRoot || "").trim();
  const resolvedSessionId = String(sessionId || "").trim();
  if (!resolvedArtifactRoot || !resolvedSessionId) {
    throw new Error("An artifact root and session id are required to resolve a session artifact directory.");
  }

  return path.join(path.resolve(resolvedArtifactRoot), "sessions", resolvedSessionId);
}

export function resolveActiveProfileFile(env = process.env) {
  return path.join(resolveProfilesDir(env), ACTIVE_PROFILE_FILE);
}

export async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isMissingPathError(error) {
  return error?.code === "ENOENT";
}

async function copyDirectoryEntriesIfMissing(sourceDir, targetDir) {
  if (!(await fileExists(sourceDir))) {
    return;
  }

  await fs.mkdir(targetDir, { recursive: true });

  let entries;
  try {
    entries = await fs.readdir(sourceDir, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    try {
      if (entry.isDirectory()) {
        await copyDirectoryEntriesIfMissing(sourcePath, targetPath);
        continue;
      }

      if (await fileExists(targetPath)) {
        continue;
      }

      await fs.copyFile(sourcePath, targetPath);
    } catch (error) {
      if (isMissingPathError(error)) {
        continue;
      }
      throw error;
    }
  }
}

async function syncProfileSystemSkills(codexHome, env = process.env) {
  const sourceSystemSkillsDir = path.join(resolveSharedCodexHome(env), "skills", ".system");
  const targetSystemSkillsDir = path.join(codexHome, "skills", ".system");
  if (path.resolve(sourceSystemSkillsDir) === path.resolve(targetSystemSkillsDir)) {
    return;
  }

  await copyDirectoryEntriesIfMissing(sourceSystemSkillsDir, targetSystemSkillsDir);
  await applySense1SystemSkillOverrides(targetSystemSkillsDir);
}

async function applySense1SystemSkillOverrides(targetSystemSkillsDir) {
  const skillCreatorPath = path.join(targetSystemSkillsDir, "skill-creator", "SKILL.md");
  if (!(await fileExists(skillCreatorPath))) {
    return;
  }

  const currentContent = await fs.readFile(skillCreatorPath, "utf8");
  if (currentContent.includes(SENSE1_SKILL_CREATOR_OVERRIDE_MARKER)) {
    return;
  }

  const normalizedContent = currentContent.trimEnd();
  await fs.writeFile(
    skillCreatorPath,
    `${normalizedContent}\n\n${SENSE1_SKILL_CREATOR_OVERRIDE}\n`,
    "utf8",
  );
}

function resolveLegacyDesktopAuthCandidates(env = process.env) {
  const runtimeStateRoot = resolveRuntimeStateRoot(env);
  return [
    path.join(runtimeStateRoot, "codex-home", AUTH_FILE),
    path.join(runtimeStateRoot, "runtime", "app-server", AUTH_FILE),
  ];
}

async function isValidJsonObjectFile(targetPath) {
  if (!(await fileExists(targetPath))) {
    return false;
  }

  try {
    const parsed = JSON.parse(await fs.readFile(targetPath, "utf8"));
    return Boolean(parsed) && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

async function healProfileAuthFromLegacyDesktopRoot(profileId, env = process.env) {
  const targetAuthPath = path.join(resolveProfileCodexHome(profileId, env), AUTH_FILE);
  if (await isValidJsonObjectFile(targetAuthPath)) {
    return;
  }

  for (const sourceAuthPath of resolveLegacyDesktopAuthCandidates(env)) {
    if (path.resolve(sourceAuthPath) === path.resolve(targetAuthPath)) {
      continue;
    }
    if (!(await isValidJsonObjectFile(sourceAuthPath))) {
      continue;
    }

    await fs.mkdir(path.dirname(targetAuthPath), { recursive: true });
    await fs.copyFile(sourceAuthPath, targetAuthPath);
    return;
  }
}

export async function ensureProfileDirectories(profileId, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  const profileRoot = resolveProfileRoot(profile, env);
  const codexHome = resolveProfileCodexHome(profile, env);
  const cacheKey = `${profileRoot}::${codexHome}`;
  const cached = ensuredProfileDirectoriesCache.get(cacheKey);
  if (cached) {
    return await cached;
  }

  const ensurePromise = (async () => {
    await fs.mkdir(profileRoot, { recursive: true });
    await fs.mkdir(codexHome, { recursive: true });
    await healProfileAuthFromLegacyDesktopRoot(profile, env);
    try {
      await syncProfileSystemSkills(codexHome, env);
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error;
      }
      console.warn(
        `[desktop:profile] Skipping transient system skill sync failure for profile "${profile}". ${error.message}`,
      );
    }

    return {
      profileId: profile,
      profileRoot,
      codexHome,
    };
  })().catch((error) => {
    ensuredProfileDirectoriesCache.delete(cacheKey);
    throw error;
  });

  ensuredProfileDirectoriesCache.set(cacheKey, ensurePromise);
  return await ensurePromise;
}

function resolveArtifactRootFile(profileId, env = process.env) {
  return path.join(resolveProfileRoot(profileId, env), ARTIFACT_ROOT_FILE);
}

export async function loadProfileArtifactRoot(profileId, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  await ensureProfileDirectories(profile, env);
  const artifactRootFile = resolveArtifactRootFile(profile, env);

  if (!(await fileExists(artifactRootFile))) {
    return null;
  }

  try {
    const raw = await fs.readFile(artifactRootFile, "utf8");
    const parsed = JSON.parse(raw);
    const artifactRoot = typeof parsed?.artifactRoot === "string" ? parsed.artifactRoot.trim() : "";
    return artifactRoot ? path.resolve(artifactRoot) : null;
  } catch {
    return null;
  }
}

export async function persistProfileArtifactRoot(profileId, artifactRoot, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  const resolvedArtifactRoot = String(artifactRoot || "").trim();
  if (!resolvedArtifactRoot) {
    throw new Error("An artifact root is required to persist the profile artifact location.");
  }

  await ensureProfileDirectories(profile, env);
  const artifactRootFile = resolveArtifactRootFile(profile, env);
  const normalizedArtifactRoot = path.resolve(resolvedArtifactRoot);
  await fs.mkdir(normalizedArtifactRoot, { recursive: true });
  await fs.writeFile(
    artifactRootFile,
    JSON.stringify(
      {
        artifactRoot: normalizedArtifactRoot,
        updated_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );

  return normalizedArtifactRoot;
}

export async function resolveProfileArtifactRoot(profileId, env = process.env) {
  const storedArtifactRoot = await loadProfileArtifactRoot(profileId, env);
  if (storedArtifactRoot) {
    await fs.mkdir(storedArtifactRoot, { recursive: true });
    return storedArtifactRoot;
  }

  const defaultArtifactRoot = resolveDefaultArtifactRoot(env);
  return await persistProfileArtifactRoot(profileId, defaultArtifactRoot, env);
}

export async function loadActiveProfileId(env = process.env) {
  const activeProfileFile = resolveActiveProfileFile(env);
  if (!(await fileExists(activeProfileFile))) {
    return null;
  }

  try {
    const raw = await fs.readFile(activeProfileFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.profile_id !== "string") {
      return null;
    }

    return sanitizeProfileId(parsed.profile_id);
  } catch {
    return null;
  }
}

export function loadActiveProfileIdSync(env = process.env) {
  const activeProfileFile = resolveActiveProfileFile(env);

  try {
    const raw = readFileSync(activeProfileFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.profile_id !== "string") {
      return null;
    }

    return sanitizeProfileId(parsed.profile_id);
  } catch {
    return null;
  }
}

export async function persistActiveProfileId(profileId, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  const profilesDir = resolveProfilesDir(env);
  await fs.mkdir(profilesDir, { recursive: true });
  await fs.writeFile(
    resolveActiveProfileFile(env),
    JSON.stringify(
      {
        profile_id: profile,
        updated_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );

  return profile;
}

export async function listProfileIds(env = process.env) {
  const profilesDir = resolveProfilesDir(env);
  await fs.mkdir(profilesDir, { recursive: true });

  const entries = await fs.readdir(profilesDir, { withFileTypes: true });
  const ids = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => sanitizeProfileId(entry.name));

  return [...new Set(ids)].sort();
}
