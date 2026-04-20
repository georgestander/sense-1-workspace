import os from "node:os";

import type { DesktopLogEntry } from "../logging/desktop-log-buffer.ts";

const SECRET_ASSIGNMENT_PATTERN = /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY)[A-Z0-9_]*)=([^\s]+)/gi;
const BEARER_PATTERN = /\bBearer\s+[^\s]+/gi;
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]+\b/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function firstNonEmptyString(...values: Array<unknown>): string | null {
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

export function resolveRedactionHomeDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const windowsHome = firstNonEmptyString(env.HOMEDRIVE) && firstNonEmptyString(env.HOMEPATH)
    ? `${firstNonEmptyString(env.HOMEDRIVE)}${firstNonEmptyString(env.HOMEPATH)}`
    : null;
  const configuredHome = firstNonEmptyString(env.HOME, env.USERPROFILE, windowsHome);
  if (configuredHome) {
    return configuredHome;
  }

  try {
    return firstNonEmptyString(os.homedir());
  } catch {
    return null;
  }
}

export function redactSensitiveText(input: string): string {
  return input
    .replace(SECRET_ASSIGNMENT_PATTERN, "$1=[REDACTED]")
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(OPENAI_KEY_PATTERN, "sk-[REDACTED]");
}

export function redactSensitivePath(filePath: string, homeDir: string | null = resolveRedactionHomeDir()): string {
  const trimmed = String(filePath || "").trim();
  if (!trimmed) {
    return "";
  }
  if (homeDir) {
    const escapedHomeDir = escapeRegExp(homeDir);
    return trimmed.replace(new RegExp(escapedHomeDir, "g"), "~");
  }
  return trimmed;
}

export function redactLogEntries(entries: DesktopLogEntry[], homeDir: string | null = resolveRedactionHomeDir()): DesktopLogEntry[] {
  return entries.map((entry) => ({
    ...entry,
    message: redactSensitivePath(redactSensitiveText(entry.message), homeDir),
  }));
}
