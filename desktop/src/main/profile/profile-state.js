import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import {
  APP_NAME,
  DEFAULT_PROFILE_ID,
  ensureProfileDirectories,
  fileExists,
  resolveActiveProfileFile,
  resolveDefaultArtifactRoot,
  resolveProfileCodexHome,
  resolveProfileRoot,
  resolveProfileSubstrateDbPath,
  resolveProfilesDir,
  resolveRuntimeStateRoot,
  resolveSessionArtifactRoot,
  sanitizeProfileId,
} from "./profile-paths.js";
import { loadDesktopSettings, persistDesktopSettings } from "./profile-settings-state.js";
import {
  loadLastSelectedThreadId,
  loadPendingApprovals,
  loadThreadInteractionStates,
  persistLastSelectedThreadId,
  persistPendingApprovals,
  rememberThreadInteractionState,
} from "./profile-session-state.js";
import {
  loadRecentWorkspaceFolders,
  loadThreadWorkspaceBindings,
  loadWorkspaceSidebarOrder,
  rememberRecentWorkspaceFolder,
  rememberThreadWorkspaceRoot,
  rememberWorkspaceSidebarOrder,
} from "./profile-state-storage.js";
import { openDatabase } from "../substrate/substrate-store-core.js";
import { rebuildSubstrateProjections } from "../substrate/substrate-projections.js";

export {
  APP_NAME,
  DEFAULT_PROFILE_ID,
  ensureProfileDirectories,
  fileExists,
  resolveDefaultArtifactRoot,
  resolveProfileCodexHome,
  resolveProfileRoot,
  resolveProfileSubstrateDbPath,
  resolveProfilesDir,
  resolveRuntimeStateRoot,
  resolveSessionArtifactRoot,
  sanitizeProfileId,
} from "./profile-paths.js";
export {
  clearLastSelectedThreadId,
  clearLastSelectedThreadIdIfMatches,
  forgetPendingApprovalsForThread,
  forgetRecentWorkspaceFolder,
  forgetThreadInteractionState,
  forgetThreadWorkspaceRoot,
  forgetWorkspaceSidebarRoot,
  loadDesktopSettings,
  loadLastSelectedThreadId,
  loadPendingApprovals,
  loadRecentWorkspaceFolders,
  loadThreadInteractionStates,
  loadThreadWorkspaceBindings,
  loadThreadWorkspaceRoot,
  loadWorkspaceSidebarOrder,
  persistDesktopSettings,
  persistLastSelectedThreadId,
  persistPendingApprovals,
  rememberRecentWorkspaceFolder,
  rememberThreadInteractionState,
  rememberThreadWorkspaceRoot,
  rememberWorkspaceSidebarOrder,
} from "./profile-state-storage.js";

const ARTIFACT_ROOT_FILE = "artifact-root.json";
const PROFILE_METADATA_FILE = "profile-metadata.json";
const SUBSTRATE_TABLES_WITH_PROFILE = [
  "scopes",
  "actors",
  "workspaces",
  "workspace_policies",
  "sessions",
  "plans",
  "questions",
  "events",
  "object_refs",
];

function resolveProfileMetadataFile(profileId, env = process.env) {
  return path.join(resolveProfileRoot(profileId, env), PROFILE_METADATA_FILE);
}

function normalizeProfileMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {
      email: null,
      displayName: null,
      mergedIntoProfileId: null,
      legacyProfileIds: [],
      updatedAt: null,
    };
  }

  const email = typeof metadata.email === "string" ? metadata.email.trim().toLowerCase() : "";
  const displayName = typeof metadata.displayName === "string" ? metadata.displayName.trim() : "";
  const mergedIntoProfileId =
    typeof metadata.mergedIntoProfileId === "string" ? sanitizeProfileId(metadata.mergedIntoProfileId) : null;
  const legacyProfileIds = Array.isArray(metadata.legacyProfileIds)
    ? [...new Set(metadata.legacyProfileIds.map((value) => sanitizeProfileId(value)).filter(Boolean))]
    : [];
  const updatedAt = typeof metadata.updatedAt === "string" && metadata.updatedAt.trim()
    ? metadata.updatedAt.trim()
    : typeof metadata.updated_at === "string" && metadata.updated_at.trim()
      ? metadata.updated_at.trim()
      : null;

  return {
    email: email || null,
    displayName: displayName || null,
    mergedIntoProfileId,
    legacyProfileIds,
    updatedAt,
  };
}

function compareIsoDates(left, right) {
  const leftTime = left ? Date.parse(left) : Number.NaN;
  const rightTime = right ? Date.parse(right) : Number.NaN;
  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
    return 0;
  }
  if (Number.isNaN(leftTime)) {
    return -1;
  }
  if (Number.isNaN(rightTime)) {
    return 1;
  }
  return leftTime - rightTime;
}

function mergeSettingsWithTargetPriority(targetSettings, sourceSettings) {
  const merged = { ...sourceSettings };
  for (const [key, value] of Object.entries(targetSettings ?? {})) {
    if (value !== null && value !== undefined && value !== "") {
      merged[key] = value;
    } else if (!(key in merged)) {
      merged[key] = value;
    }
  }
  return merged;
}

function mergePendingApprovals(targetApprovals, sourceApprovals) {
  const deduped = new Map();
  for (const entry of [...(targetApprovals ?? []), ...(sourceApprovals ?? [])]) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const key =
      (typeof entry.id === "string" && entry.id.trim()) ||
      (typeof entry.requestId === "number" ? `request:${entry.requestId}` : null) ||
      (typeof entry.threadId === "string" && entry.threadId.trim() ? `thread:${entry.threadId.trim()}` : null);
    if (!key || deduped.has(key)) {
      continue;
    }
    deduped.set(key, entry);
  }
  return [...deduped.values()];
}

function escapeSqlIdentifier(value) {
  return `"${String(value).replaceAll("\"", "\"\"")}"`;
}

async function seedProfileRootFromSource(sourceProfileId, targetProfileId, env = process.env) {
  const sourceId = sanitizeProfileId(sourceProfileId);
  const targetId = sanitizeProfileId(targetProfileId);
  if (!sourceId || !targetId || sourceId === targetId) {
    return;
  }

  const sourceRoot = resolveProfileRoot(sourceId, env);
  const targetRoot = resolveProfileRoot(targetId, env);
  if (!(await fileExists(sourceRoot))) {
    return;
  }

  await fs.mkdir(targetRoot, { recursive: true });
  for (const entry of await fs.readdir(sourceRoot, { withFileTypes: true })) {
    const sourcePath = path.join(sourceRoot, entry.name);
    const targetPath = path.join(targetRoot, entry.name);
    if (await fileExists(targetPath)) {
      continue;
    }
    await fs.cp(sourcePath, targetPath, { recursive: true });
  }
}

async function mergeRecentFoldersIntoProfile(targetProfileId, sourceProfileId, env = process.env) {
  const targetFolders = await loadRecentWorkspaceFolders(targetProfileId, env);
  const sourceFolders = await loadRecentWorkspaceFolders(sourceProfileId, env);
  const merged = [...sourceFolders, ...targetFolders]
    .sort((left, right) => compareIsoDates(left?.lastUsedAt ?? null, right?.lastUsedAt ?? null));
  for (const entry of merged) {
    if (!entry?.path) {
      continue;
    }
    await rememberRecentWorkspaceFolder(targetProfileId, entry.path, env);
  }
}

async function mergeThreadBindingsIntoProfile(targetProfileId, sourceProfileId, env = process.env) {
  const targetBindings = await loadThreadWorkspaceBindings(targetProfileId, env);
  const sourceBindings = await loadThreadWorkspaceBindings(sourceProfileId, env);
  const merged = [...sourceBindings, ...targetBindings]
    .sort((left, right) => compareIsoDates(left?.lastUsedAt ?? null, right?.lastUsedAt ?? null));
  for (const entry of merged) {
    if (!entry?.threadId || !entry?.workspaceRoot) {
      continue;
    }
    await rememberThreadWorkspaceRoot(targetProfileId, entry.threadId, entry.workspaceRoot, env);
  }
}

async function mergeInteractionStatesIntoProfile(targetProfileId, sourceProfileId, env = process.env) {
  const targetStates = await loadThreadInteractionStates(targetProfileId, env);
  const sourceStates = await loadThreadInteractionStates(sourceProfileId, env);
  const merged = [...sourceStates, ...targetStates]
    .sort((left, right) => compareIsoDates(left?.updatedAt ?? null, right?.updatedAt ?? null));
  for (const entry of merged) {
    if (!entry?.threadId || !entry?.interactionState) {
      continue;
    }
    await rememberThreadInteractionState(targetProfileId, entry.threadId, entry.interactionState, env);
  }
}

async function mergeSidebarOrderIntoProfile(targetProfileId, sourceProfileId, env = process.env) {
  const targetOrder = await loadWorkspaceSidebarOrder(targetProfileId, env);
  const sourceOrder = await loadWorkspaceSidebarOrder(sourceProfileId, env);
  const nextOrder = [];
  const seen = new Set();
  for (const rootPath of [...targetOrder, ...sourceOrder]) {
    const normalized = typeof rootPath === "string" ? rootPath.trim() : "";
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    nextOrder.push(normalized);
  }
  if (nextOrder.length > 0) {
    await rememberWorkspaceSidebarOrder(targetProfileId, nextOrder, env);
  }
}

async function mergeProfileDatabaseIntoCanonical(targetProfileId, sourceProfileId, env = process.env) {
  const sourceId = sanitizeProfileId(sourceProfileId);
  const targetId = sanitizeProfileId(targetProfileId);
  if (!sourceId || !targetId || sourceId === targetId) {
    return;
  }

  const sourceDbPath = resolveProfileSubstrateDbPath(sourceId, env);
  const targetDbPath = resolveProfileSubstrateDbPath(targetId, env);
  if (!(await fileExists(sourceDbPath))) {
    return;
  }

  const db = openDatabase(targetDbPath);
  try {
    db.exec(`ATTACH DATABASE ${JSON.stringify(sourceDbPath)} AS source_profile`);
    db.exec("PRAGMA foreign_keys = OFF");
    for (const table of SUBSTRATE_TABLES_WITH_PROFILE) {
      const sourceColumns = db.prepare(`PRAGMA source_profile.table_info(${escapeSqlIdentifier(table)})`).all();
      if (!Array.isArray(sourceColumns) || sourceColumns.length === 0) {
        continue;
      }

      const columnNames = sourceColumns.map((column) => String(column.name));
      const targetColumnList = columnNames.map(escapeSqlIdentifier).join(", ");
      const selectList = columnNames
        .map((column) => (column === "profile_id" ? "? AS profile_id" : `source_profile.${escapeSqlIdentifier(table)}.${escapeSqlIdentifier(column)}`))
        .join(", ");
      db.prepare(
        `INSERT OR IGNORE INTO ${escapeSqlIdentifier(table)} (${targetColumnList})
         SELECT ${selectList}
         FROM source_profile.${escapeSqlIdentifier(table)}`,
      ).run(...(columnNames.includes("profile_id") ? [targetId] : []));
    }
  } finally {
    try {
      db.exec("PRAGMA foreign_keys = ON");
    } catch {
      // Ignore cleanup failures; the outer flow will surface any real merge issue.
    }
    try {
      db.exec("DETACH DATABASE source_profile");
    } catch {
      // Ignore cleanup failures.
    }
    db.close();
  }

  await rebuildSubstrateProjections({ dbPath: targetDbPath, profileId: targetId });
}

export function profileIdFromEmail(email) {
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  return normalizedEmail ? sanitizeProfileId(normalizedEmail) : DEFAULT_PROFILE_ID;
}
const PROFILE_IDENTITY_FILE = "profile-identity.json";

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

export async function loadProfileMetadata(profileId, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  await ensureProfileDirectories(profile, env);
  const metadataFile = resolveProfileMetadataFile(profile, env);
  if (!(await fileExists(metadataFile))) {
    return normalizeProfileMetadata(null);
  }

  try {
    const raw = await fs.readFile(metadataFile, "utf8");
    return normalizeProfileMetadata(JSON.parse(raw));
  } catch {
    return normalizeProfileMetadata(null);
  }
}

export async function persistProfileMetadata(profileId, metadata, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  await ensureProfileDirectories(profile, env);
  const nextMetadata = {
    ...normalizeProfileMetadata(metadata),
    updated_at: new Date().toISOString(),
  };
  await fs.writeFile(
    resolveProfileMetadataFile(profile, env),
    JSON.stringify(nextMetadata, null, 2),
    "utf8",
  );
  return normalizeProfileMetadata(nextMetadata);
}

function resolveProfileIdentityFile(profileId, env = process.env) {
  return path.join(resolveProfileRoot(profileId, env), PROFILE_IDENTITY_FILE);
}

export function resolveEmailProfileId(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  return sanitizeProfileId(normalizedEmail.replace(/@/g, "-at-"));
}

export async function loadProfileIdentity(profileId, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  await ensureProfileDirectories(profile, env);
  const identityFile = resolveProfileIdentityFile(profile, env);

  if (!(await fileExists(identityFile))) {
    return null;
  }

  try {
    const raw = await fs.readFile(identityFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const email = typeof parsed.email === "string" && parsed.email.trim()
      ? parsed.email.trim().toLowerCase()
      : null;
    const displayName = typeof parsed.displayName === "string" && parsed.displayName.trim()
      ? parsed.displayName.trim()
      : null;
    const legacyProfileIds = Array.isArray(parsed.legacyProfileIds)
      ? [...new Set(parsed.legacyProfileIds.map((value) => sanitizeProfileId(value)).filter(Boolean))]
      : [];
    const mergedIntoProfileId = typeof parsed.mergedIntoProfileId === "string" && parsed.mergedIntoProfileId.trim()
      ? sanitizeProfileId(parsed.mergedIntoProfileId)
      : null;
    const updatedAt = typeof parsed.updatedAt === "string" && parsed.updatedAt.trim()
      ? parsed.updatedAt.trim()
      : null;
    const lastSignedInAt = typeof parsed.lastSignedInAt === "string" && parsed.lastSignedInAt.trim()
      ? parsed.lastSignedInAt.trim()
      : null;

    return {
      displayName,
      email,
      lastSignedInAt,
      mergedIntoProfileId,
      legacyProfileIds,
      updatedAt,
    };
  } catch {
    return null;
  }
}

export async function persistProfileIdentity(
  profileId,
  {
    displayName = null,
    email = null,
    lastSignedInAt = null,
    mergedIntoProfileId = null,
    legacyProfileIds = [],
  } = {},
  env = process.env,
) {
  const profile = sanitizeProfileId(profileId);
  await ensureProfileDirectories(profile, env);
  const identityFile = resolveProfileIdentityFile(profile, env);
  const existing = await loadProfileIdentity(profile, env);
  const nextEmail = typeof email === "string" && email.trim()
    ? email.trim().toLowerCase()
    : existing?.email ?? null;
  const nextDisplayName = typeof displayName === "string" && displayName.trim()
    ? displayName.trim()
    : existing?.displayName ?? null;
  const nextLastSignedInAt = typeof lastSignedInAt === "string" && lastSignedInAt.trim()
    ? lastSignedInAt.trim()
    : existing?.lastSignedInAt ?? null;
  const nextMergedIntoProfileId = typeof mergedIntoProfileId === "string" && mergedIntoProfileId.trim()
    ? sanitizeProfileId(mergedIntoProfileId)
    : mergedIntoProfileId === null
      ? null
      : existing?.mergedIntoProfileId ?? null;
  const mergedLegacyProfileIds = [
    ...(Array.isArray(existing?.legacyProfileIds) ? existing.legacyProfileIds : []),
    ...(Array.isArray(legacyProfileIds) ? legacyProfileIds : []),
  ];
  const nextLegacyProfileIds = [...new Set(
    mergedLegacyProfileIds.map((value) => sanitizeProfileId(value)).filter((value) => value && value !== profile),
  )];
  const updatedAt = new Date().toISOString();

  await fs.writeFile(
    identityFile,
    JSON.stringify(
      {
        email: nextEmail,
        displayName: nextDisplayName,
        lastSignedInAt: nextLastSignedInAt,
        mergedIntoProfileId: nextMergedIntoProfileId,
        legacyProfileIds: nextLegacyProfileIds,
        updatedAt,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    email: nextEmail,
    displayName: nextDisplayName,
    lastSignedInAt: nextLastSignedInAt,
    mergedIntoProfileId: nextMergedIntoProfileId,
    legacyProfileIds: nextLegacyProfileIds,
    updatedAt,
  };
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

export async function mergeProfileIntoCanonical(
  targetProfileId,
  sourceProfileId,
  {
    artifactRoot = null,
    email = null,
    displayName = null,
    env = process.env,
  } = {},
) {
  const targetId = sanitizeProfileId(targetProfileId);
  const sourceId = sanitizeProfileId(sourceProfileId);
  if (!targetId) {
    throw new Error("A canonical profile id is required to merge profile state.");
  }
  if (!sourceId || sourceId === targetId) {
    if (artifactRoot) {
      await persistProfileArtifactRoot(targetId, artifactRoot, env);
    }
    if (email || displayName) {
      const existingMetadata = await loadProfileMetadata(targetId, env);
      await persistProfileMetadata(
        targetId,
        {
          ...existingMetadata,
          email: email ?? existingMetadata.email,
          displayName: displayName ?? existingMetadata.displayName,
        },
        env,
      );
    }
    return targetId;
  }

  await seedProfileRootFromSource(sourceId, targetId, env);

  const resolvedArtifactRoot =
    artifactRoot ||
    (await loadProfileArtifactRoot(targetId, env)) ||
    (await loadProfileArtifactRoot(sourceId, env));
  if (resolvedArtifactRoot) {
    await persistProfileArtifactRoot(targetId, resolvedArtifactRoot, env);
  }

  const sourceSettings = await loadDesktopSettings(sourceId, env);
  const targetSettings = await loadDesktopSettings(targetId, env);
  await persistDesktopSettings(targetId, mergeSettingsWithTargetPriority(targetSettings, sourceSettings), env);

  await mergeRecentFoldersIntoProfile(targetId, sourceId, env);
  await mergeThreadBindingsIntoProfile(targetId, sourceId, env);
  await mergeInteractionStatesIntoProfile(targetId, sourceId, env);
  await mergeSidebarOrderIntoProfile(targetId, sourceId, env);

  const targetLastSelectedThreadId = await loadLastSelectedThreadId(targetId, env);
  if (!targetLastSelectedThreadId) {
    const sourceLastSelectedThreadId = await loadLastSelectedThreadId(sourceId, env);
    if (sourceLastSelectedThreadId) {
      await persistLastSelectedThreadId(targetId, sourceLastSelectedThreadId, env);
    }
  }

  const sourceApprovals = await loadPendingApprovals(sourceId, env);
  const targetApprovals = await loadPendingApprovals(targetId, env);
  await persistPendingApprovals(targetId, mergePendingApprovals(targetApprovals, sourceApprovals), env);

  await mergeProfileDatabaseIntoCanonical(targetId, sourceId, env);

  const targetMetadata = await loadProfileMetadata(targetId, env);
  await persistProfileMetadata(
    targetId,
    {
      ...targetMetadata,
      email: email ?? targetMetadata.email,
      displayName: displayName ?? targetMetadata.displayName,
      legacyProfileIds: [...new Set([...(targetMetadata.legacyProfileIds ?? []), sourceId])],
    },
    env,
  );

  const sourceMetadata = await loadProfileMetadata(sourceId, env);
  await persistProfileMetadata(
    sourceId,
    {
      ...sourceMetadata,
      email: email ?? sourceMetadata.email,
      displayName: displayName ?? sourceMetadata.displayName,
      mergedIntoProfileId: targetId,
      legacyProfileIds: sourceMetadata.legacyProfileIds ?? [],
    },
    env,
  );

  return targetId;
}
