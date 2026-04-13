import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

function firstString(...values) {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveRuntimeIsolationPaths(codexHome) {
  const profileRoot = path.resolve(codexHome, "..");
  const xdgRoot = path.join(profileRoot, "xdg");

  return {
    profileRoot,
    runtimeHome: path.join(profileRoot, "runtime-home"),
    xdgConfigHome: path.join(xdgRoot, "config"),
    xdgDataHome: path.join(xdgRoot, "data"),
    xdgStateHome: path.join(xdgRoot, "state"),
    xdgCacheHome: path.join(xdgRoot, "cache"),
  };
}

export async function ensureRuntimeConfigDefaults(codexHome, defaultRuntimeConfig) {
  const configPath = path.join(codexHome, "config.toml");
  const existed = await pathExists(configPath);
  if (!existed) {
    await fs.writeFile(configPath, defaultRuntimeConfig, "utf8");
  }

  return {
    configPath,
    created: !existed,
  };
}

export async function ensureRuntimeIsolationDirectories(codexHome) {
  const isolationPaths = resolveRuntimeIsolationPaths(codexHome);
  await Promise.all(
    Object.values(isolationPaths).map(async (targetPath) => {
      await fs.mkdir(targetPath, { recursive: true });
    }),
  );
  return isolationPaths;
}

function applyOptionalEnvValue(target, key, ...sources) {
  const value = firstString(...sources.map((source) => source?.[key]));
  if (value) {
    target[key] = value;
  }
}

export function buildIsolatedRuntimeEnv({
  codexHome,
  defaultRuntimeOriginator,
  envOverrides = {},
  processEnv = process.env,
  runtimePath,
}) {
  const isolationPaths = resolveRuntimeIsolationPaths(codexHome);
  const nextEnv = {
    CODEX_HOME: codexHome,
    CODEX_INTERNAL_ORIGINATOR_OVERRIDE:
      firstString(envOverrides?.CODEX_INTERNAL_ORIGINATOR_OVERRIDE, processEnv?.CODEX_INTERNAL_ORIGINATOR_OVERRIDE) ||
      defaultRuntimeOriginator,
    HOME: isolationPaths.runtimeHome,
    PATH: runtimePath,
    XDG_CACHE_HOME: isolationPaths.xdgCacheHome,
    XDG_CONFIG_HOME: isolationPaths.xdgConfigHome,
    XDG_DATA_HOME: isolationPaths.xdgDataHome,
    XDG_STATE_HOME: isolationPaths.xdgStateHome,
  };

  [
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "SSL_CERT_DIR",
    "SSL_CERT_FILE",
    "TERM",
    "TMP",
    "TMPDIR",
    "TEMP",
    "TZ",
  ].forEach((key) => applyOptionalEnvValue(nextEnv, key, envOverrides, processEnv));

  if (process.platform === "win32") {
    ["COMSPEC", "PATHEXT", "SystemRoot", "WINDIR"].forEach((key) =>
      applyOptionalEnvValue(nextEnv, key, envOverrides, processEnv),
    );
  }

  return nextEnv;
}
