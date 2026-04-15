import path from "node:path";
import { resolveWorkspaceComparablePathSync } from "./workspace-root.ts";

interface AppServerNotification {
  method?: unknown;
  params?: unknown;
}

function firstString(...values: Array<unknown>): string | null {
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

const ABSOLUTE_PATH_PATTERN = /(^|[\s"'`(])((?:\/(?!\/)[^\s"'`)]+)+)/g;

function sanitizePathToken(value: string): string {
  return value.replace(/[.,;:]+$/g, "");
}

function toWorkspaceCandidateRoot(targetPath: unknown): string | null {
  const resolvedPath = firstString(targetPath);
  if (!resolvedPath) {
    return null;
  }

  const absolutePath = path.resolve(resolvedPath);
  const basename = path.basename(absolutePath);
  if (resolvedPath.endsWith(path.sep) || resolvedPath.endsWith("/")) {
    return absolutePath;
  }

  if (path.extname(basename)) {
    return path.dirname(absolutePath);
  }

  return absolutePath;
}

function commonParentPath(paths: Array<unknown>): string | null {
  const resolvedPaths = paths
    .map((value) => firstString(value))
    .filter((value): value is string => Boolean(value))
    .map((value) => path.resolve(value));
  if (resolvedPaths.length === 0) {
    return null;
  }

  let current = resolvedPaths[0];
  for (const candidate of resolvedPaths.slice(1)) {
    while (current !== path.dirname(current) && !isPathWithinRoot(candidate, current)) {
      current = path.dirname(current);
    }
    if (!isPathWithinRoot(candidate, current) && candidate !== current) {
      return path.parse(current).root;
    }
  }

  return current;
}

export function isPathWithinRoot(
  targetPath: string | null | undefined,
  rootPath: string | null | undefined,
): boolean {
  const resolvedTarget = firstString(targetPath);
  const resolvedRoot = firstString(rootPath);
  if (!resolvedTarget || !resolvedRoot) {
    return false;
  }

  const absoluteTarget = resolveWorkspaceComparablePathSync(resolvedTarget);
  const absoluteRoot = resolveWorkspaceComparablePathSync(resolvedRoot);
  if (!absoluteTarget || !absoluteRoot) {
    return false;
  }

  if (absoluteTarget === absoluteRoot) {
    return true;
  }

  const relativePath = path.relative(absoluteRoot, absoluteTarget);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

export function isPathWithinAnyRoot(
  targetPath: string | null | undefined,
  rootPaths: Array<string | null | undefined> | null | undefined,
): boolean {
  return (Array.isArray(rootPaths) ? rootPaths : []).some((rootPath) => isPathWithinRoot(targetPath, rootPath));
}

export function extractAbsolutePathsFromText(text: string | null | undefined): string[] {
  const source = firstString(text);
  if (!source) {
    return [];
  }

  const matches = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = ABSOLUTE_PATH_PATTERN.exec(source)) !== null) {
    const candidate = firstString(match[2]);
    if (!candidate) {
      continue;
    }
    matches.add(path.resolve(sanitizePathToken(candidate)));
  }

  return Array.from(matches);
}

export function findPromptPathsOutsideWorkspace(
  prompt: string | null | undefined,
  workspaceRoot: string | null | undefined,
): string[] {
  const resolvedRoot = firstString(workspaceRoot);
  if (!resolvedRoot) {
    return [];
  }

  return extractAbsolutePathsFromText(prompt).filter(
    (candidate) => !isPathWithinRoot(candidate, resolvedRoot),
  );
}

export function deriveWorkspaceGrantRoot(
  targetPaths: Array<string | null | undefined> | null | undefined,
): string | null {
  const candidateRoots = (Array.isArray(targetPaths) ? targetPaths : [])
    .map((targetPath) => toWorkspaceCandidateRoot(targetPath))
    .filter((value): value is string => Boolean(value));
  return commonParentPath(candidateRoots);
}

function collectItemPaths(item: unknown): string[] {
  const record = asRecord(item);
  if (!record) {
    return [];
  }

  if (record.type === "fileChange") {
    return Array.isArray(record.changes)
      ? record.changes
          .map((change) => asRecord(change))
          .map((change) => firstString(change?.path))
          .filter((value): value is string => Boolean(value))
      : [];
  }

  if (record.type === "commandExecution") {
    const cwd = firstString(record.cwd);
    return cwd ? [cwd] : [];
  }

  return [];
}

export function collectOutOfWorkspacePathsFromRuntimeMessage(
  message: AppServerNotification | Record<string, unknown> | null | undefined,
  workspaceRoot: string | null | undefined,
  allowedRoots: Array<string | null | undefined> = [],
): string[] {
  const resolvedRoot = firstString(workspaceRoot);
  const effectiveRoots = [
    resolvedRoot,
    ...allowedRoots,
  ].filter(Boolean);
  if (effectiveRoots.length === 0) {
    return [];
  }

  const method = firstString(message?.method);
  const params = asRecord(message?.params);
  const outside = new Set<string>();

  if (method === "item/started" || method === "item/completed") {
    for (const candidate of collectItemPaths(params?.item)) {
      if (!isPathWithinAnyRoot(candidate, effectiveRoots)) {
        outside.add(path.resolve(candidate));
      }
    }
  }

  if (method === "turn/diff/updated") {
    const diffs = Array.isArray(params?.diffs) ? params.diffs : [];
    for (const diff of diffs) {
      const candidate = firstString(asRecord(diff)?.path);
      if (candidate && !isPathWithinAnyRoot(candidate, effectiveRoots)) {
        outside.add(path.resolve(candidate));
      }
    }
  }

  return Array.from(outside);
}
