export interface DesktopWorkspacePermissionRequest {
  readonly rootPath: string;
  readonly displayName: string;
}

export type FilePickerResult =
  | {
      readonly canceled: true;
      readonly paths: [];
    }
  | {
      readonly canceled: false;
      readonly paths: string[];
    };

export interface DesktopWorkspaceStructureEntry {
  readonly name: string;
  readonly type: string;
  readonly path: string;
}

export type DesktopOperatingMode = "preview" | "auto" | "apply";

export interface DesktopWorkspacePolicyRecord {
  readonly workspace_root: string;
  readonly read_granted: number;
  readonly read_granted_at: string | null;
  readonly read_grant_mode: "once" | "always" | null;
  readonly write_mode: "conversation" | "trusted";
  readonly operating_mode: DesktopOperatingMode;
  readonly context_paths: string[];
  readonly pinned_paths: string[];
  readonly known_structure: DesktopWorkspaceStructureEntry[];
  readonly last_hydrated_at: string | null;
}

export type DesktopWorkspacePermissionMode = "once" | "always";

export interface DesktopWorkspacePolicyRequest {
  readonly rootPath: string;
}

export interface DesktopWorkspacePolicyResult {
  readonly policy: DesktopWorkspacePolicyRecord;
}

export interface DesktopWorkspacePermissionGrantRequest {
  readonly rootPath: string;
  readonly mode: DesktopWorkspacePermissionMode;
}

export interface DesktopWorkspaceOperatingModeRequest {
  readonly rootPath: string;
  readonly mode: DesktopOperatingMode;
}

export interface DesktopWorkspaceHydrateResult {
  readonly rootPath: string;
  readonly displayName: string;
  readonly fileCount: number;
  readonly keyFiles: string[];
  readonly projectType: string;
  readonly lastHydrated: string | null;
}

export interface DesktopLastSelectedThreadRequest {
  readonly threadId: string | null;
}

export interface DesktopThreadRenameRequest {
  readonly threadId: string;
  readonly title: string;
}

export interface DesktopThreadArchiveRequest {
  readonly threadId: string;
}

export interface DesktopThreadRestoreRequest {
  readonly threadId: string;
}

export interface DesktopThreadDeleteRequest {
  readonly threadId: string;
}

export interface DesktopWorkspaceArchiveRequest {
  readonly workspaceId: string;
}

export interface DesktopWorkspaceRestoreRequest {
  readonly workspaceId: string;
}

export interface DesktopWorkspaceDeleteRequest {
  readonly workspaceId: string;
}

export interface DesktopThreadWorkspaceRootRequest {
  readonly threadId: string;
  readonly workspaceRoot: string;
}

export interface DesktopWorkspaceSidebarOrderRequest {
  readonly rootPaths: string[];
}
