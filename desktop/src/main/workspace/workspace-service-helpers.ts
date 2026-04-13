import os from "node:os";
import path from "node:path";

import type {
  DesktopWorkspacePolicyRecord,
  DesktopWorkspaceStructureEntry,
} from "../contracts.ts";

const KEY_WORKSPACE_CONTEXT_PATHS = [
  "README.md",
  "package.json",
  "CLAUDE.md",
  "AGENTS.md",
  ".codex/config.toml",
  "tsconfig.json",
  "Cargo.toml",
  "pyproject.toml",
  "go.mod",
  "Makefile",
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

export function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return null;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function normalizeComparablePath(filePath: string): string {
  const resolvedPath = path.resolve(filePath);
  if (process.platform === "darwin" && resolvedPath.startsWith("/private/")) {
    return resolvedPath.slice("/private".length);
  }

  return resolvedPath;
}

export function isSenseGeneratedTempWorkspaceRoot(
  workspaceRoot: string | null | undefined,
): boolean {
  const resolvedWorkspaceRoot = firstString(workspaceRoot);
  if (!resolvedWorkspaceRoot) {
    return false;
  }

  const normalizedWorkspaceRoot = normalizeComparablePath(resolvedWorkspaceRoot);
  const normalizedTempRoot = normalizeComparablePath(os.tmpdir());
  if (
    normalizedWorkspaceRoot !== normalizedTempRoot
    && !normalizedWorkspaceRoot.startsWith(`${normalizedTempRoot}${path.sep}`)
  ) {
    return false;
  }

  const candidateNames = [
    path.basename(normalizedWorkspaceRoot),
    path.basename(path.dirname(normalizedWorkspaceRoot)),
  ];
  return candidateNames.some((name) => /^sense(?:-|\d)/i.test(name));
}

export function isWithinPath(
  parentPath: string | null | undefined,
  childPath: string | null | undefined,
): boolean {
  const resolvedParentPath = firstString(parentPath);
  const resolvedChildPath = firstString(childPath);
  if (!resolvedParentPath || !resolvedChildPath) {
    return false;
  }

  const normalizedParentPath = normalizeComparablePath(resolvedParentPath);
  const normalizedChildPath = normalizeComparablePath(resolvedChildPath);
  return (
    normalizedChildPath === normalizedParentPath
    || normalizedChildPath.startsWith(`${normalizedParentPath}${path.sep}`)
  );
}

export function isLikelyLegacySenseSessionRoot(
  candidatePath: string | null | undefined,
): boolean {
  const resolvedCandidatePath = firstString(candidatePath);
  if (!resolvedCandidatePath) {
    return false;
  }

  const normalizedCandidatePath = normalizeComparablePath(resolvedCandidatePath);
  const homeDir = normalizeComparablePath(os.homedir());
  for (const appFolderName of ["Sense-1 Workspace", "sense-1-workspace", "Sense-1", "sense-1"]) {
    const legacyRoot = path.join(homeDir, appFolderName);
    if (!isWithinPath(legacyRoot, normalizedCandidatePath)) {
      continue;
    }

    const relativePath = path.relative(legacyRoot, normalizedCandidatePath);
    const parts = relativePath.split(path.sep).filter(Boolean);
    if (parts[0] === "sessions" && /^sess[_-]/i.test(parts[1] ?? "")) {
      return true;
    }
  }

  return false;
}

function collectWorkspaceDirectoryEntries(
  value: unknown,
  output: DesktopWorkspaceStructureEntry[],
): void {
  if (!Array.isArray(value)) {
    return;
  }

  for (const rawEntry of value) {
    const entry = asRecord(rawEntry);
    const name = firstString(entry?.name);
    const type = firstString(entry?.type);
    const entryPath = firstString(entry?.path);
    if (name && type && entryPath) {
      output.push({
        name,
        path: entryPath,
        type,
      });
    }

    collectWorkspaceDirectoryEntries(entry?.children, output);
    collectWorkspaceDirectoryEntries(entry?.entries, output);
  }
}

export function normalizeWorkspaceDirectoryEntries(
  workspaceRoot: string,
  value: unknown,
): DesktopWorkspaceStructureEntry[] {
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const collected: DesktopWorkspaceStructureEntry[] = [];
  const entries = Array.isArray(value) ? value : asRecord(value)?.entries;
  collectWorkspaceDirectoryEntries(entries, collected);

  const deduped = new Map<string, DesktopWorkspaceStructureEntry>();
  for (const entry of collected) {
    const entryPath = path.resolve(entry.path);
    const relativePath = path.relative(resolvedWorkspaceRoot, entryPath);
    if (
      !relativePath
      || relativePath.startsWith("..")
      || path.isAbsolute(relativePath)
    ) {
      continue;
    }

    const depth = relativePath.split(path.sep).filter(Boolean).length;
    if (depth > 2) {
      continue;
    }

    deduped.set(entryPath, {
      name: entry.name,
      path: entryPath,
      type: entry.type,
    });
  }

  return [...deduped.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export function collectWorkspaceContextPaths(
  workspaceRoot: string,
  entries: DesktopWorkspaceStructureEntry[],
): string[] {
  const normalizedWorkspaceRoot = path.resolve(workspaceRoot);
  const matches = new Map<string, string>();
  for (const entry of entries) {
    if (entry.type !== "file") {
      continue;
    }

    const relativePath = path
      .relative(normalizedWorkspaceRoot, path.resolve(entry.path))
      .replace(/\\/g, "/");
    if (!relativePath || relativePath.startsWith("..")) {
      continue;
    }

    const normalizedRelativePath = relativePath.replace(/^\.\//, "");
    const normalizedKey = normalizedRelativePath.toLowerCase();
    const isTopLevelFile = !normalizedRelativePath.includes("/");
    const isContextPath =
      (isTopLevelFile
        && KEY_WORKSPACE_CONTEXT_PATHS.some(
          (candidate) => !candidate.includes("/") && candidate.toLowerCase() === normalizedKey,
        ))
      || normalizedKey === ".codex/config.toml";
    if (!isContextPath) {
      continue;
    }

    matches.set(normalizedKey, path.resolve(entry.path));
  }

  return KEY_WORKSPACE_CONTEXT_PATHS
    .map((fileName) => matches.get(fileName.toLowerCase()) ?? null)
    .filter((entry): entry is string => Boolean(entry));
}

export function detectWorkspaceProjectType(contextPaths: string[]): string {
  const fileNames = new Set(contextPaths.map((entry) => path.basename(entry).toLowerCase()));
  if (fileNames.has("package.json")) {
    return "Node.js";
  }
  if (fileNames.has("cargo.toml")) {
    return "Rust";
  }
  if (fileNames.has("pyproject.toml")) {
    return "Python";
  }
  if (fileNames.has("go.mod")) {
    return "Go";
  }
  if (fileNames.has("makefile")) {
    return "Make-based";
  }
  return "Unknown";
}

export function shouldSeedWorkspaceOperatingMode(
  policy: DesktopWorkspacePolicyRecord | null,
): boolean {
  if (!policy) {
    return true;
  }

  return (
    policy.read_granted === 0
    && policy.read_granted_at == null
    && policy.read_grant_mode == null
    && policy.operating_mode === "auto"
  );
}

export function isSafeMissingThreadError(error: unknown): boolean {
  const message = formatError(error).toLowerCase();
  return (
    message.includes("invalid thread id")
    || message.includes("not found")
    || message.includes("unknown thread")
    || /rollout .* is empty/.test(message)
  );
}

export function isRuntimeUnavailableDeleteError(error: unknown): boolean {
  const message = formatError(error).toLowerCase();
  return (
    message.includes("app server is not ready yet")
    || message.includes("timed out waiting")
    || message.includes("failed to initialize")
    || message.includes("transport closed")
    || message.includes("transport ended")
    || message.includes("connection closed")
    || message.includes("broken pipe")
  );
}
