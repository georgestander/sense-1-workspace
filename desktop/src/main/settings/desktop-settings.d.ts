import type { DesktopSettings } from "../contracts";

type DesktopApprovalPosture = DesktopSettings["approvalPosture"];
type DesktopSandboxPosture = DesktopSettings["sandboxPosture"];

export type DesktopSettingsPatch = Partial<
  Pick<
    DesktopSettings,
    | "model"
    | "reasoningEffort"
    | "serviceTier"
    | "personality"
    | "defaultOperatingMode"
    | "runtimeInstructions"
    | "approvalPosture"
    | "sandboxPosture"
    | "adminApprovalPosture"
    | "roleApprovalLevel"
    | "workspaceReadonly"
    | "workspaceFolderBinding"
    | "approvalOperationPosture"
    | "approvalTrustedWorkspaces"
  >
> & {
  readonly workspaceDefaults?: Partial<DesktopWorkspaceDefaults>;
  readonly approvalDefaults?: Partial<DesktopApprovalDefaults>;
  readonly generalDefaults?: Partial<DesktopGeneralDefaults>;
  readonly modelRestrictions?: Partial<DesktopModelRestrictions>;
};

export interface DesktopWorkspaceDefaults {
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly serviceTier?: DesktopSettings["serviceTier"];
  readonly personality?: string;
}

export interface DesktopApprovalDefaults {
  readonly approvalPosture?: DesktopApprovalPosture;
  readonly sandboxPosture?: DesktopSandboxPosture;
  readonly approvalOperationPosture?: DesktopSettings["approvalOperationPosture"];
  readonly approvalTrustedWorkspaces?: DesktopSettings["approvalTrustedWorkspaces"];
}

export interface DesktopGeneralDefaults {
  readonly defaultOperatingMode?: DesktopSettings["defaultOperatingMode"];
  readonly runtimeInstructions?: DesktopSettings["runtimeInstructions"];
  readonly adminApprovalPosture?: DesktopSettings["adminApprovalPosture"];
  readonly roleApprovalLevel?: DesktopSettings["roleApprovalLevel"];
  readonly workspaceReadonly?: DesktopSettings["workspaceReadonly"];
  readonly workspaceFolderBinding?: DesktopSettings["workspaceFolderBinding"];
}

export interface DesktopModelRestrictions {
  readonly allowedModels?: string[] | null;
}

export interface DesktopSettingsLayer {
  readonly workspaceDefaults?: DesktopWorkspaceDefaults;
  readonly approvalDefaults?: DesktopApprovalDefaults;
  readonly generalDefaults?: DesktopGeneralDefaults;
  readonly modelRestrictions?: DesktopModelRestrictions;
}

export interface StoredDesktopSettings {
  readonly version: 2;
  readonly policy: {
    readonly system: DesktopSettingsLayer | null;
    readonly organization: DesktopSettingsLayer | null;
    readonly profile: DesktopSettingsLayer | null;
    readonly workspaces: Record<string, DesktopSettingsLayer>;
  };
}

export interface ResolvedDesktopSettingsState {
  readonly effectiveSettings: DesktopSettings;
  readonly settingsLayers: {
    readonly system: Partial<DesktopSettings>;
    readonly organization: Partial<DesktopSettings>;
    readonly profile: Partial<DesktopSettings>;
    readonly workspace: Partial<DesktopSettings>;
  };
  readonly modelRestrictions: {
    readonly allowedModels: string[] | null;
  };
  readonly storedSettings: StoredDesktopSettings;
}

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings;

export function flattenDesktopSettingsLayer(layer?: DesktopSettingsLayer | null): Partial<DesktopSettings>;
export function normalizeStoredDesktopSettings(raw?: Record<string, unknown>): StoredDesktopSettings;
export function resolveDesktopSettingsState(
  raw?: Record<string, unknown>,
  workspaceRoot?: string | null,
): ResolvedDesktopSettingsState;
export function resolveDesktopSettings(raw?: Record<string, unknown>, workspaceRoot?: string | null): DesktopSettings;
export function applyDesktopSettingsPatch(
  raw?: Record<string, unknown>,
  patch?: DesktopSettingsPatch,
): StoredDesktopSettings;
