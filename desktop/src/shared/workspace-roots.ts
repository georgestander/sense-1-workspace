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

const APP_ARTIFACT_ROOT_NAMES = [
  "Sense-1 Workspace",
  "sense-1-workspace",
  "Sense-1",
  "sense-1",
];

export function normalizeWorkspaceRootPath(workspaceRoot: string | null | undefined): string | null {
  const resolvedWorkspaceRoot = firstString(workspaceRoot);
  if (!resolvedWorkspaceRoot) {
    return null;
  }

  return resolvedWorkspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function isSessionArtifactWorkspaceRoot(workspaceRoot: string | null | undefined): boolean {
  const normalizedWorkspaceRoot = normalizeWorkspaceRootPath(workspaceRoot);
  if (!normalizedWorkspaceRoot) {
    return false;
  }

  return APP_ARTIFACT_ROOT_NAMES.some((rootName) => {
    const escapedRootName = rootName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|/)${escapedRootName}/sessions/sess[_-][^/]+(?:/|$)`, "i").test(normalizedWorkspaceRoot);
  });
}

export function normalizeUserFacingWorkspaceRoot(workspaceRoot: string | null | undefined): string | null {
  const normalizedWorkspaceRoot = normalizeWorkspaceRootPath(workspaceRoot);
  if (!normalizedWorkspaceRoot || isSessionArtifactWorkspaceRoot(normalizedWorkspaceRoot)) {
    return null;
  }

  return normalizedWorkspaceRoot;
}
