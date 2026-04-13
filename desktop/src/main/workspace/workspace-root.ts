import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export type WorkspaceRootIdentity = {
  readonly requestedPath: string;
  readonly comparablePath: string;
  readonly deviceId: string | null;
  readonly inode: string | null;
  readonly identityKey: string | null;
};

function firstString(...values: unknown[]): string | null {
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

export function normalizeWorkspaceRootPath(value: string | null | undefined): string | null {
  const resolved = firstString(value);
  return resolved ? path.resolve(resolved) : null;
}

function readRealpathSync(resolvedPath: string): string {
  try {
    return typeof fs.realpathSync.native === "function"
      ? fs.realpathSync.native(resolvedPath)
      : fs.realpathSync(resolvedPath);
  } catch {
    return resolvedPath;
  }
}

async function readRealpath(resolvedPath: string): Promise<string> {
  try {
    return await fsp.realpath(resolvedPath);
  } catch {
    return resolvedPath;
  }
}

function buildWorkspaceIdentity(
  requestedPath: string | null,
  comparablePath: string | null,
  stats: fs.BigIntStats | null = null,
): WorkspaceRootIdentity | null {
  if (!requestedPath || !comparablePath) {
    return null;
  }

  const deviceId = stats ? String(stats.dev) : null;
  const inode = stats ? String(stats.ino) : null;

  return {
    requestedPath,
    comparablePath,
    deviceId,
    inode,
    identityKey: deviceId && inode ? `${deviceId}:${inode}` : null,
  };
}

export function resolveWorkspaceComparablePathSync(value: string | null | undefined): string | null {
  const requestedPath = normalizeWorkspaceRootPath(value);
  if (!requestedPath) {
    return null;
  }

  return readRealpathSync(requestedPath);
}

export async function resolveWorkspaceComparablePath(
  value: string | null | undefined,
): Promise<string | null> {
  const requestedPath = normalizeWorkspaceRootPath(value);
  if (!requestedPath) {
    return null;
  }

  return await readRealpath(requestedPath);
}

export function readWorkspaceRootIdentitySync(
  value: string | null | undefined,
): WorkspaceRootIdentity | null {
  const requestedPath = normalizeWorkspaceRootPath(value);
  if (!requestedPath) {
    return null;
  }

  const comparablePath = readRealpathSync(requestedPath);
  try {
    const stats = fs.statSync(comparablePath, { bigint: true });
    return buildWorkspaceIdentity(requestedPath, comparablePath, stats);
  } catch {
    return buildWorkspaceIdentity(requestedPath, comparablePath);
  }
}

export async function readWorkspaceRootIdentity(
  value: string | null | undefined,
): Promise<WorkspaceRootIdentity | null> {
  const requestedPath = normalizeWorkspaceRootPath(value);
  if (!requestedPath) {
    return null;
  }

  const comparablePath = await readRealpath(requestedPath);
  try {
    const stats = await fsp.stat(comparablePath, { bigint: true });
    return buildWorkspaceIdentity(requestedPath, comparablePath, stats);
  } catch {
    return buildWorkspaceIdentity(requestedPath, comparablePath);
  }
}
