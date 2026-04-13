import type {
  DesktopOperatingMode,
  DesktopWorkspacePolicyRecord,
  ProjectedWorkspaceRecord,
  SubstrateWorkspaceRecord,
} from "../../../main/contracts";

export function resolveActiveWorkspaceRoot({
  selectedThreadWorkspaceRoot,
  workInFolder,
  workspaceFolder,
}: {
  selectedThreadWorkspaceRoot: string | null | undefined;
  workInFolder: boolean;
  workspaceFolder: string | null;
}): string | null {
  return selectedThreadWorkspaceRoot ?? (workInFolder ? workspaceFolder : null);
}

export function buildWorkspaceIdByRoot({
  knownWorkspaces,
  projectedWorkspaces,
}: {
  knownWorkspaces: SubstrateWorkspaceRecord[];
  projectedWorkspaces: ProjectedWorkspaceRecord[];
}): Record<string, string> {
  return Object.fromEntries(
    [
      ...knownWorkspaces.map((workspace) => [workspace.root_path, workspace.id] as const),
      ...projectedWorkspaces.map((workspace) => [workspace.root_path, workspace.workspace_id] as const),
    ],
  );
}

export function shouldUseDefaultWorkspaceOperatingMode(
  workspacePolicy: DesktopWorkspacePolicyRecord | null,
): boolean {
  return Boolean(
    workspacePolicy
      && workspacePolicy.read_granted === 0
      && workspacePolicy.read_granted_at == null
      && workspacePolicy.read_grant_mode == null
      && workspacePolicy.operating_mode === "auto"
      && workspacePolicy.context_paths.length === 0
      && workspacePolicy.pinned_paths.length === 0
      && workspacePolicy.known_structure.length === 0
      && workspacePolicy.last_hydrated_at == null,
  );
}

export function resolveActiveWorkspaceOperatingMode({
  defaultOperatingMode,
  selectedThreadWorkspaceRoot,
  workspacePolicy,
}: {
  defaultOperatingMode: DesktopOperatingMode | null | undefined;
  selectedThreadWorkspaceRoot: string | null | undefined;
  workspacePolicy: DesktopWorkspacePolicyRecord | null;
}): DesktopOperatingMode | null {
  if (!selectedThreadWorkspaceRoot) {
    return null;
  }

  const fallbackMode = defaultOperatingMode ?? workspacePolicy?.operating_mode ?? "auto";
  if (shouldUseDefaultWorkspaceOperatingMode(workspacePolicy)) {
    return fallbackMode;
  }

  return workspacePolicy?.operating_mode ?? fallbackMode;
}
