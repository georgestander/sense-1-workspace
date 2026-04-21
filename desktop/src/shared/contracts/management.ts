export type DesktopProviderId = "chatgpt" | "openai-api-key" | "gemini" | "ollama";

export interface DesktopProviderOption {
  readonly id: DesktopProviderId;
  readonly label: string;
  readonly description: string;
  readonly available: boolean;
  readonly configured: boolean;
  readonly requiresOpenaiAuth: boolean;
  readonly detail: string;
}

export interface DesktopProviderState {
  readonly selectedProvider: DesktopProviderId | null;
  readonly authMode: string | null;
  readonly accountType: string | null;
  readonly accountEmail: string | null;
  readonly options: DesktopProviderOption[];
}

export interface DesktopPluginRecord {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly description: string | null;
  readonly appIds: string[];
  readonly marketplaceName: string | null;
  readonly marketplacePath: string | null;
  readonly installed: boolean;
  readonly enabled: boolean;
  readonly installPolicy: string | null;
  readonly authPolicy: string | null;
  readonly category: string | null;
  readonly capabilities: string[];
  readonly sourcePath: string | null;
  readonly websiteUrl: string | null;
  readonly iconPath: string | null;
}

export type DesktopManagedExtensionKind = "plugin" | "skill" | "app" | "mcp";
export type DesktopManagedExtensionInstallState = "discoverable" | "installed";
export type DesktopManagedExtensionEnablementState = "enabled" | "disabled";
export type DesktopManagedExtensionAuthState = "not-required" | "required" | "connected" | "failed" | "unknown";
export type DesktopManagedExtensionHealthState = "healthy" | "warning" | "error";
export type DesktopManagedExtensionOwnership = "built-in" | "profile-owned" | "plugin-owned" | "marketplace-installed";

export interface DesktopManagedExtensionRecord {
  readonly id: string;
  readonly kind: DesktopManagedExtensionKind;
  readonly name: string;
  readonly displayName: string;
  readonly description: string | null;
  readonly installState: DesktopManagedExtensionInstallState;
  readonly enablementState: DesktopManagedExtensionEnablementState;
  readonly authState: DesktopManagedExtensionAuthState;
  readonly healthState: DesktopManagedExtensionHealthState;
  readonly ownership: DesktopManagedExtensionOwnership;
  readonly ownerPluginIds: string[];
  readonly includedSkillIds: string[];
  readonly includedAppIds: string[];
  readonly includedMcpServerIds: string[];
  readonly capabilities: string[];
  readonly sourcePath: string | null;
  readonly marketplaceName: string | null;
  readonly marketplacePath: string | null;
  readonly canOpen: boolean;
  readonly canUninstall: boolean;
  readonly canDisable: boolean;
  readonly canConnect: boolean;
  readonly canReload: boolean;
}

export interface DesktopAppRecord {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly installUrl: string | null;
  readonly isAccessible: boolean;
  readonly isEnabled: boolean;
  readonly pluginDisplayNames: string[];
  readonly logoUrl: string | null;
  readonly source: "runtime" | "local-fallback";
  readonly runtimeStateKnown: boolean;
}

export interface DesktopMcpServerRecord {
  readonly id: string;
  readonly enabled: boolean;
  readonly state: string | null;
  readonly authStatus: string | null;
  readonly toolsCount: number;
  readonly resourcesCount: number;
  readonly transport: string | null;
  readonly command: string | null;
  readonly url: string | null;
  readonly source: "runtime" | "local-fallback";
  readonly runtimeStateKnown: boolean;
  readonly invalidReason: string | null;
}

export interface DesktopSkillRecord {
  readonly name: string;
  readonly description: string | null;
  readonly path: string;
  readonly scope: string | null;
  readonly enabled: boolean;
  readonly cwd: string | null;
}

export interface DesktopExtensionOverviewRequest {
  readonly cwd?: string | null;
  readonly forceRefetch?: boolean;
}

export interface DesktopExtensionBackendFailure {
  readonly method: string;
  readonly message: string;
}

export interface DesktopExtensionPluginMcpIssue {
  readonly pluginName: string | null;
  readonly sourcePath: string | null;
  readonly serverId: string;
  readonly reason: string;
}

export interface DesktopExtensionHealth {
  readonly backend: {
    readonly failedReads: DesktopExtensionBackendFailure[];
    readonly lastRuntimeError: string | null;
    readonly suspectedMcpServerIds: string[];
  };
  readonly pluginMcp: {
    readonly invalidEntries: DesktopExtensionPluginMcpIssue[];
  };
}

export interface DesktopExtensionOverviewResult {
  readonly contractVersion: 1;
  readonly provider: DesktopProviderState;
  readonly managedExtensions: DesktopManagedExtensionRecord[];
  readonly plugins: DesktopPluginRecord[];
  readonly apps: DesktopAppRecord[];
  readonly mcpServers: DesktopMcpServerRecord[];
  readonly skills: DesktopSkillRecord[];
  readonly health: DesktopExtensionHealth;
}

export interface DesktopPluginEnabledRequest {
  readonly pluginId: string;
  readonly enabled: boolean;
}

export interface DesktopPluginInstallRequest {
  readonly marketplacePath: string;
  readonly pluginId: string;
  readonly pluginName: string;
}

export interface DesktopPluginUninstallRequest {
  readonly pluginId: string;
}

export interface DesktopPluginDetailRequest {
  readonly pluginId: string;
}

export interface DesktopPluginDetailSkillRecord {
  readonly name: string;
  readonly description: string | null;
  readonly path: string | null;
}

export interface DesktopPluginDetailResult {
  readonly pluginId: string;
  readonly name: string;
  readonly displayName: string;
  readonly description: string | null;
  readonly marketplaceName: string | null;
  readonly marketplacePath: string | null;
  readonly sourcePath: string | null;
  readonly websiteUrl: string | null;
  readonly capabilities: string[];
  readonly skills: DesktopPluginDetailSkillRecord[];
  readonly apps: string[];
  readonly mcpServers: string[];
}

export interface DesktopAppEnabledRequest {
  readonly appId: string;
  readonly enabled: boolean;
}

export interface DesktopAppInstallRequest {
  readonly appId: string;
  readonly installUrl: string;
}

export interface DesktopAppRemoveRequest {
  readonly appId: string;
}

export interface DesktopMcpServerEnabledRequest {
  readonly serverId: string;
  readonly enabled: boolean;
}

export interface DesktopMcpServerAuthRequest {
  readonly serverId: string;
}

export interface DesktopMcpServerAuthResult {
  readonly authorizationUrl: string;
  readonly overview: DesktopExtensionOverviewResult;
}

export interface DesktopSkillEnabledRequest {
  readonly path: string;
  readonly enabled: boolean;
}

export interface DesktopSkillUninstallRequest {
  readonly path: string;
}

export interface DesktopSkillDetailRequest {
  readonly path: string;
}

export interface DesktopSkillDetailResult {
  readonly path: string;
  readonly name: string;
  readonly description: string | null;
  readonly scope: string | null;
  readonly cwd: string | null;
  readonly content: string;
}
