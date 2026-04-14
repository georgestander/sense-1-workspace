export type DesktopProviderId = "chatgpt" | "gemini" | "ollama";

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

export interface DesktopAppRecord {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly installUrl: string | null;
  readonly isAccessible: boolean;
  readonly isEnabled: boolean;
  readonly pluginDisplayNames: string[];
  readonly logoUrl: string | null;
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

export interface DesktopExtensionOverviewResult {
  readonly provider: DesktopProviderState;
  readonly plugins: DesktopPluginRecord[];
  readonly apps: DesktopAppRecord[];
  readonly mcpServers: DesktopMcpServerRecord[];
  readonly skills: DesktopSkillRecord[];
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

export interface DesktopSkillEnabledRequest {
  readonly path: string;
  readonly enabled: boolean;
}

export interface DesktopSkillUninstallRequest {
  readonly path: string;
}
