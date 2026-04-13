import path from "node:path";

import { resolveRuntimeStateRoot } from "../profile/profile-paths.js";

export function sanitizeProfileId(rawProfileId) {
  const trimmed = String(rawProfileId ?? "").trim();
  if (!trimmed) {
    return "default";
  }

  const sanitized = trimmed.replace(/[^A-Za-z0-9._-]/g, "-");
  return sanitized || "default";
}

function splitPathEntries(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return [];
  }

  return rawValue
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniquePathEntries(values) {
  const seen = new Set();
  const entries = [];
  for (const value of values) {
    const normalized = String(value).trim();
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    entries.push(normalized);
  }

  return entries;
}

export function defaultRuntimePathEntriesForPlatform(platform = process.platform, env = process.env) {
  if (platform === "darwin") {
    return uniquePathEntries([
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
    ]);
  }

  if (platform === "win32") {
    return uniquePathEntries([
      env.ProgramFiles ? path.join(env.ProgramFiles, "nodejs") : null,
      env.SystemRoot ? path.join(env.SystemRoot, "System32") : null,
    ].filter(Boolean));
  }

  return uniquePathEntries([
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ]);
}

export function buildRuntimePath(platform = process.platform, env = process.env) {
  return defaultRuntimePathEntriesForPlatform(platform, env).join(path.delimiter);
}

export function defaultCodexHomeForProfile(
  profileId = process.env.SENSE1_PROFILE_ID,
  _platform = process.platform,
  env = process.env,
) {
  const sanitizedProfileId = sanitizeProfileId(profileId);
  return path.join(resolveRuntimeStateRoot(env), "profiles", sanitizedProfileId, "codex-home");
}
