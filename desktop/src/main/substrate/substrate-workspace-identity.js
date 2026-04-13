import { normalizeWorkspaceRootPath, readWorkspaceRootIdentitySync } from "../workspace/workspace-root.ts";

export function workspaceIdentityKeyFromMetadata(metadata) {
  const identityKey =
    metadata && typeof metadata.identityKey === "string" ? metadata.identityKey.trim() : "";
  return identityKey || null;
}

export function workspaceComparableRootFromMetadata(metadata) {
  const comparableRootPath =
    metadata && typeof metadata.comparableRootPath === "string"
      ? metadata.comparableRootPath.trim()
      : "";
  return comparableRootPath ? normalizeWorkspaceRootPath(comparableRootPath) : null;
}

export function withWorkspaceIdentityMetadata(metadata, workspaceRoot) {
  const nextMetadata =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...metadata }
      : {};
  const identity = readWorkspaceRootIdentitySync(workspaceRoot);

  if (identity?.identityKey) {
    nextMetadata.identityKey = identity.identityKey;
  } else {
    delete nextMetadata.identityKey;
  }

  if (identity?.comparablePath) {
    nextMetadata.comparableRootPath = identity.comparablePath;
  } else {
    delete nextMetadata.comparableRootPath;
  }

  if (identity?.deviceId) {
    nextMetadata.deviceId = identity.deviceId;
  } else {
    delete nextMetadata.deviceId;
  }

  if (identity?.inode) {
    nextMetadata.inode = identity.inode;
  } else {
    delete nextMetadata.inode;
  }

  return nextMetadata;
}

export function resolveWorkspaceRowIdentity(workspace) {
  if (!workspace) {
    return {
      comparableRootPath: null,
      identityKey: null,
      metadata: {},
    };
  }

  const metadata = withWorkspaceIdentityMetadata(workspace.metadata ?? {}, workspace.root_path);
  return {
    comparableRootPath: workspaceComparableRootFromMetadata(metadata),
    identityKey: workspaceIdentityKeyFromMetadata(metadata),
    metadata,
  };
}
