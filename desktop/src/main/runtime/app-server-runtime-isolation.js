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

function normalizeConfigIdentifier(value) {
  let normalized = firstString(value);
  while (normalized && normalized.length >= 2) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
      normalized = normalized.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return normalized || null;
}

function quoteTomlKeyIfNeeded(key) {
  return /^[A-Za-z0-9_-]+$/u.test(key) ? key : JSON.stringify(key);
}

const MANAGED_INVENTORY_TABLE_PATTERN =
  /^(\s*)\[(plugins|apps|mcp_servers)\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9._@:-]+))\](\s*(?:#.*)?)$/u;
const MANAGED_INVENTORY_DOTTED_PATTERN =
  /^(\s*)(plugins|apps|mcp_servers)\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9._@:-]+))(.*)$/u;

function canonicalizeManagedInventoryConfig(rawConfig) {
  if (typeof rawConfig !== "string" || rawConfig.length === 0) {
    return rawConfig;
  }

  const newline = rawConfig.includes("\r\n") ? "\r\n" : "\n";
  const hasTrailingNewline = rawConfig.endsWith("\n");
  let changed = false;
  const normalizedLines = rawConfig.split(/\r?\n/u).map((line) => {
    const tableMatch = line.match(MANAGED_INVENTORY_TABLE_PATTERN);
    if (tableMatch) {
      const normalizedKey = normalizeConfigIdentifier(firstString(tableMatch[3], tableMatch[4], tableMatch[5]));
      if (!normalizedKey) {
        return line;
      }
      const nextLine = `${tableMatch[1]}[${tableMatch[2]}.${quoteTomlKeyIfNeeded(normalizedKey)}]${tableMatch[6] ?? ""}`;
      if (nextLine !== line) {
        changed = true;
      }
      return nextLine;
    }

    const dottedMatch = line.match(MANAGED_INVENTORY_DOTTED_PATTERN);
    if (!dottedMatch) {
      return line;
    }

    const normalizedKey = normalizeConfigIdentifier(firstString(dottedMatch[3], dottedMatch[4], dottedMatch[5]));
    if (!normalizedKey) {
      return line;
    }
    const nextLine = `${dottedMatch[1]}${dottedMatch[2]}.${quoteTomlKeyIfNeeded(normalizedKey)}${dottedMatch[6] ?? ""}`;
    if (nextLine !== line) {
      changed = true;
    }
    return nextLine;
  });

  if (!changed) {
    return rawConfig;
  }

  if (hasTrailingNewline && normalizedLines.at(-1) === "") {
    normalizedLines.pop();
  }

  return `${normalizedLines.join(newline)}${hasTrailingNewline ? newline : ""}`;
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

  const currentConfig = await fs.readFile(configPath, "utf8");
  const canonicalConfig = canonicalizeManagedInventoryConfig(currentConfig);
  if (canonicalConfig !== currentConfig) {
    await fs.writeFile(configPath, canonicalConfig, "utf8");
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

export async function resolveRealtimeAuthToken(codexHome, envOverrides = {}) {
  const explicitRealtimeToken = firstString(envOverrides?.SENSE1_REALTIME_OPENAI_API_KEY);
  if (explicitRealtimeToken) {
    return explicitRealtimeToken;
  }

  const authPath = path.join(codexHome, "auth.json");
  try {
    const parsed = JSON.parse(await fs.readFile(authPath, "utf8"));
    const authMode = firstString(parsed?.auth_mode);
    const accessToken = firstString(parsed?.tokens?.access_token);
    if (authMode !== "chatgpt" || !accessToken) {
      return null;
    }

    return accessToken;
  } catch {
    return null;
  }
}

export async function resolveRealtimeAuthEnvOverrides(codexHome, envOverrides = {}) {
  const token = await resolveRealtimeAuthToken(codexHome, envOverrides);
  if (!token) {
    return {};
  }

  return {
    SENSE1_REALTIME_OPENAI_API_KEY: token,
  };
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

  applyOptionalEnvValue(nextEnv, "OPENAI_API_KEY", {
    OPENAI_API_KEY: envOverrides?.SENSE1_REALTIME_OPENAI_API_KEY,
  });

  return nextEnv;
}
