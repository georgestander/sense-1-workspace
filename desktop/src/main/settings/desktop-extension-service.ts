import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

import type { AppServerProcessManager } from "../runtime/app-server-process-manager.js";
import { resolveProfileCodexHome } from "../profile/profile-state.js";
import type {
  DesktopAppRemoveRequest,
  DesktopAppInstallRequest,
  DesktopAppEnabledRequest,
  DesktopAppRecord,
  DesktopExtensionOverviewRequest,
  DesktopExtensionOverviewResult,
  DesktopMcpServerEnabledRequest,
  DesktopMcpServerRecord,
  DesktopPluginInstallRequest,
  DesktopPluginUninstallRequest,
  DesktopPluginEnabledRequest,
  DesktopPluginRecord,
  DesktopProviderId,
  DesktopProviderOption,
  DesktopProviderState,
  DesktopSkillEnabledRequest,
  DesktopSkillUninstallRequest,
  DesktopSkillRecord,
} from "../contracts";

type DesktopExtensionServiceOptions = {
  env?: NodeJS.ProcessEnv;
  manager: AppServerProcessManager;
  openExternal: (url: string) => Promise<void>;
  resolveProfile: () => Promise<{ id: string }>;
};

type ConfigReadResult = {
  config?: {
    apps?: Record<string, unknown> | null;
    features?: Record<string, unknown> | null;
    mcp_servers?: Record<string, unknown> | null;
    model_provider?: string | null;
    oss_provider?: string | null;
    plugins?: Record<string, unknown> | null;
  } | null;
};

type AccountReadResult = {
  account?: {
    email?: string | null;
    type?: string | null;
  } | null;
  authMode?: string | null;
  requiresOpenaiAuth?: boolean;
};

type PluginInstallResult = {
  appsNeedingAuth?: Array<{
    id?: string | null;
    installUrl?: string | null;
  }> | null;
};

type LocalPluginMetadata = {
  readonly appIds: string[];
  readonly sourcePath: string | null;
  readonly skills: DesktopSkillRecord[];
};

type LocalConfigToggles = {
  readonly apps: Record<string, { enabled?: boolean }>;
  readonly features: Record<string, unknown>;
  readonly plugins: Record<string, { enabled?: boolean }>;
};

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const resolved = firstString(value);
    if (!resolved || seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);
    unique.push(resolved);
  }
  return unique;
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isSubpath(parentPath: string, candidatePath: string): boolean {
  const resolvedParent = path.resolve(parentPath);
  const resolvedCandidate = path.resolve(candidatePath);
  return resolvedCandidate === resolvedParent || resolvedCandidate.startsWith(`${resolvedParent}${path.sep}`);
}

function parseTomlBooleanToken(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return null;
}

function mergeToggleSections(
  baseSection: Record<string, unknown>,
  localSection: Record<string, { enabled?: boolean }>,
): Record<string, unknown> {
  const merged = { ...baseSection };
  for (const [key, value] of Object.entries(localSection)) {
    merged[key] = {
      ...asRecord(baseSection[key]),
      ...value,
    };
  }
  return merged;
}

function parseLocalConfigToggles(rawConfig: string): LocalConfigToggles {
  const toggles: LocalConfigToggles = {
    apps: {},
    features: {},
    plugins: {},
  };

  let activeSection: "apps" | "features" | "plugins" | null = null;
  let activeKey: string | null = null;

  for (const rawLine of rawConfig.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const tableMatch = line.match(/^\[(plugins|apps)\.(?:"([^"]+)"|([A-Za-z0-9._@:-]+))\]$/u);
    if (tableMatch) {
      activeSection = tableMatch[1] as "apps" | "plugins";
      activeKey = firstString(tableMatch[2], tableMatch[3]);
      continue;
    }

    if (line === "[features]") {
      activeSection = "features";
      activeKey = null;
      continue;
    }

    const dottedEnabledMatch = line.match(
      /^(plugins|apps)\.(?:"([^"]+)"|([A-Za-z0-9._@:-]+))\.enabled\s*=\s*(true|false)$/iu,
    );
    if (dottedEnabledMatch) {
      const section = dottedEnabledMatch[1] as "apps" | "plugins";
      const key = firstString(dottedEnabledMatch[2], dottedEnabledMatch[3]);
      const enabled = parseTomlBooleanToken(dottedEnabledMatch[4]);
      if (key && enabled !== null) {
        toggles[section][key] = {
          ...asRecord(toggles[section][key]),
          enabled,
        };
      }
      activeSection = null;
      activeKey = null;
      continue;
    }

    const dottedFeatureMatch = line.match(/^features\.apps\s*=\s*(true|false)$/iu);
    if (dottedFeatureMatch) {
      const enabled = parseTomlBooleanToken(dottedFeatureMatch[1]);
      if (enabled !== null) {
        toggles.features.apps = enabled;
      }
      activeSection = null;
      activeKey = null;
      continue;
    }

    if (activeSection === "features") {
      const featureMatch = line.match(/^apps\s*=\s*(true|false)$/iu);
      const enabled = featureMatch ? parseTomlBooleanToken(featureMatch[1]) : null;
      if (enabled !== null) {
        toggles.features.apps = enabled;
      }
      continue;
    }

    if (!activeSection || !activeKey) {
      continue;
    }

    const enabledMatch = line.match(/^enabled\s*=\s*(true|false)$/iu);
    const enabled = enabledMatch ? parseTomlBooleanToken(enabledMatch[1]) : null;
    if (enabled === null) {
      continue;
    }

    toggles[activeSection][activeKey] = {
      ...asRecord(toggles[activeSection][activeKey]),
      enabled,
    };
  }

  return toggles;
}

async function readLocalConfigToggles(profileCodexHome: string): Promise<LocalConfigToggles> {
  try {
    const rawConfig = await fs.readFile(path.join(profileCodexHome, "config.toml"), "utf8");
    return parseLocalConfigToggles(rawConfig);
  } catch {
    return {
      apps: {},
      features: {},
      plugins: {},
    };
  }
}

function mergeConfigWithLocalToggles(
  config: ConfigReadResult["config"],
  localToggles: LocalConfigToggles,
): NonNullable<ConfigReadResult["config"]> {
  return {
    ...(config ?? {}),
    apps: mergeToggleSections(asRecord(config?.apps), localToggles.apps),
    features: {
      ...asRecord(config?.features),
      ...localToggles.features,
    },
    mcp_servers: asRecord(config?.mcp_servers),
    plugins: mergeToggleSections(asRecord(config?.plugins), localToggles.plugins),
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function commandExists(command: string): boolean {
  const result = spawnSync("which", [command], { stdio: "ignore" });
  return result.status === 0;
}

function buildProviderOptions({
  accountEmail,
  accountType,
  authMode,
  detectedGemini,
  detectedOllama,
  requiresOpenaiAuth,
  selectedProvider,
}: {
  accountEmail: string | null;
  accountType: string | null;
  authMode: string | null;
  detectedGemini: boolean;
  detectedOllama: boolean;
  requiresOpenaiAuth: boolean;
  selectedProvider: DesktopProviderId | null;
}): DesktopProviderOption[] {
  return [
    {
      id: "chatgpt",
      label: "ChatGPT",
      description: "Use native Codex-managed ChatGPT sign-in.",
      available: true,
      configured: selectedProvider === "chatgpt" || accountType === "chatgpt" || Boolean(accountEmail),
      requiresOpenaiAuth,
      detail: accountEmail
        ? `Signed in as ${accountEmail}.`
        : "Use your ChatGPT account and keep the Sense-1 Workspace shell unchanged after sign-in.",
    },
    {
      id: "gemini",
      label: "Gemini",
      description: "Use a Gemini CLI-backed local provider path when available.",
      available: detectedGemini,
      configured: selectedProvider === "gemini",
      requiresOpenaiAuth: false,
      detail: detectedGemini
        ? "Gemini tooling is available on this machine."
        : "Gemini CLI was not detected on this machine.",
    },
    {
      id: "ollama",
      label: "Ollama",
      description: "Use a local Ollama model provider.",
      available: detectedOllama,
      configured: selectedProvider === "ollama" || authMode === "apikey",
      requiresOpenaiAuth: false,
      detail: detectedOllama
        ? "Ollama was detected locally."
        : "Ollama was not detected on this machine.",
    },
  ];
}

function resolveSelectedProvider({
  accountType,
  config,
}: {
  accountType: string | null;
  config: ConfigReadResult["config"];
}): DesktopProviderId | null {
  if (accountType === "chatgpt") {
    return "chatgpt";
  }
  const modelProvider = firstString(config?.model_provider);
  const ossProvider = firstString(config?.oss_provider);
  if (ossProvider === "ollama") {
    return "ollama";
  }
  if (modelProvider?.toLowerCase().includes("gemini")) {
    return "gemini";
  }
  return null;
}

function normalizePlugins(rawPlugins: unknown, pluginConfig: Record<string, unknown>): DesktopPluginRecord[] {
  const marketplaces = Array.isArray((rawPlugins as { marketplaces?: unknown[] } | null)?.marketplaces)
    ? (rawPlugins as { marketplaces: Array<{ plugins?: unknown[] }> }).marketplaces
    : [];
  const records: DesktopPluginRecord[] = [];

  for (const marketplace of marketplaces) {
    const marketplaceRecord = asRecord(marketplace);
    const marketplaceName = firstString(marketplaceRecord.name);
    const marketplacePath = firstString(marketplaceRecord.path);
    const plugins = Array.isArray(marketplace?.plugins) ? marketplace.plugins : [];
    for (const plugin of plugins) {
      const summary = asRecord(plugin);
      const pluginId = firstString(summary.id);
      const pluginSettings = pluginId ? asRecord(pluginConfig[pluginId]) : {};
      const interfaceRecord = asRecord(summary.interface);
      if (!pluginId) {
        continue;
      }
      records.push({
        id: pluginId,
        name: firstString(summary.name) ?? pluginId,
        displayName: firstString(interfaceRecord.displayName, summary.name, pluginId) ?? pluginId,
        description: firstString(interfaceRecord.shortDescription, summary.description),
        appIds: [],
        marketplaceName,
        marketplacePath,
        installed: asBoolean(summary.installed),
        enabled: asBoolean(pluginSettings.enabled, asBoolean(summary.enabled)),
        installPolicy: firstString(summary.installPolicy),
        authPolicy: firstString(summary.authPolicy),
        category: firstString(interfaceRecord.category),
        capabilities: asStringArray(interfaceRecord.capabilities),
        sourcePath: firstString(asRecord(summary.source).path),
        websiteUrl: firstString(interfaceRecord.websiteUrl),
      });
    }
  }

  return records.sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function resolveMarketplacePluginSourcePath(
  marketplacePath: string,
  marketplacePlugin: Record<string, unknown>,
): string | null {
  const sourcePath = firstString(asRecord(marketplacePlugin.source).path);
  if (!sourcePath) {
    return null;
  }

  return path.resolve(path.dirname(marketplacePath), sourcePath);
}

function isMatchingMarketplacePluginEntry(
  marketplacePath: string,
  marketplacePlugin: Record<string, unknown>,
  plugin: DesktopPluginRecord,
): boolean {
  const marketplacePluginId = firstString(marketplacePlugin.id, marketplacePlugin.name);
  if (marketplacePluginId && (marketplacePluginId === plugin.id || marketplacePluginId === plugin.name)) {
    return true;
  }

  const pluginSourcePath = firstString(plugin.sourcePath);
  const marketplaceSourcePath = resolveMarketplacePluginSourcePath(marketplacePath, marketplacePlugin);
  return Boolean(pluginSourcePath && marketplaceSourcePath && path.resolve(pluginSourcePath) === marketplaceSourcePath);
}

async function removeProfileMarketplacePluginEntry(
  marketplacePath: string,
  plugin: DesktopPluginRecord,
): Promise<void> {
  if (!(await fileExists(marketplacePath))) {
    return;
  }

  let parsedMarketplace: Record<string, unknown>;
  try {
    parsedMarketplace = asRecord(JSON.parse(await fs.readFile(marketplacePath, "utf8")));
  } catch {
    return;
  }

  const existingPlugins = Array.isArray(parsedMarketplace.plugins) ? parsedMarketplace.plugins : [];
  const nextPlugins = existingPlugins.filter((entry) => {
    const pluginRecord = asRecord(entry);
    return !isMatchingMarketplacePluginEntry(marketplacePath, pluginRecord, plugin);
  });
  if (nextPlugins.length === existingPlugins.length) {
    return;
  }

  await fs.mkdir(path.dirname(marketplacePath), { recursive: true });
  await fs.writeFile(
    marketplacePath,
    `${JSON.stringify(
      {
        ...parsedMarketplace,
        plugins: nextPlugins,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function normalizeApps(rawApps: unknown, appConfig: Record<string, unknown>): DesktopAppRecord[] {
  const data = Array.isArray((rawApps as { data?: unknown[] } | null)?.data)
    ? (rawApps as { data: unknown[] }).data
    : [];
  return data
    .map((entry) => {
      const record = asRecord(entry);
      const appId = firstString(record.id);
      if (!appId) {
        return null;
      }
      const settings = asRecord(appConfig[appId]);
      return {
        id: appId,
        name: firstString(record.name, appId) ?? appId,
        description: firstString(record.description),
        installUrl: firstString(record.installUrl),
        isAccessible: asBoolean(record.isAccessible),
        isEnabled: asBoolean(settings.enabled, asBoolean(record.isEnabled, true)),
        pluginDisplayNames: asStringArray(record.pluginDisplayNames),
      } satisfies DesktopAppRecord;
    })
    .filter((entry): entry is DesktopAppRecord => entry !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function resolveInstalledPluginSourcePath(
  plugin: DesktopPluginRecord,
  profileCodexHome: string,
): Promise<string | null> {
  const existingSourcePath = firstString(plugin.sourcePath);
  if (existingSourcePath) {
    return existingSourcePath;
  }

  const fallbackSourcePath = path.join(profileCodexHome, ".tmp", "plugins", "plugins", plugin.name);
  try {
    await fs.access(path.join(fallbackSourcePath, ".codex-plugin", "plugin.json"));
    return fallbackSourcePath;
  } catch {
    return null;
  }
}

async function readPluginLocalMetadata(
  plugin: DesktopPluginRecord,
  profileCodexHome: string,
): Promise<LocalPluginMetadata> {
  const sourcePath = await resolveInstalledPluginSourcePath(plugin, profileCodexHome);
  if (!sourcePath) {
    return {
      appIds: [],
      sourcePath: null,
      skills: [],
    };
  }

  const appJsonPath = path.join(sourcePath, ".app.json");
  let appIds: string[] = [];
  try {
    const appJson = JSON.parse(await fs.readFile(appJsonPath, "utf8")) as { apps?: Record<string, unknown> };
    appIds = uniqueStrings(
      Object.values(appJson?.apps ?? {}).map((appRecord) => firstString(asRecord(appRecord).id)),
    );
  } catch {}

  const skillsRoot = path.join(sourcePath, "skills");
  const skills: DesktopSkillRecord[] = [];
  try {
    const skillEntries = await fs.readdir(skillsRoot, { withFileTypes: true });
    await Promise.all(skillEntries.map(async (entry) => {
      if (!entry.isDirectory()) {
        return;
      }

      const skillPath = path.join(skillsRoot, entry.name, "SKILL.md");
      try {
        await fs.access(skillPath);
      } catch {
        return;
      }

      skills.push({
        name: `${plugin.name}:${entry.name}`,
        description: null,
        path: skillPath,
        scope: "plugin",
        enabled: plugin.enabled,
        cwd: null,
      });
    }));
  } catch {}

  return {
    appIds,
    sourcePath,
    skills,
  };
}

async function enrichPluginsWithLocalMetadata(
  plugins: DesktopPluginRecord[],
  profileCodexHome: string,
): Promise<{ metadataByPluginId: Map<string, LocalPluginMetadata>; plugins: DesktopPluginRecord[] }> {
  const metadataEntries = await Promise.all(
    plugins.map(async (plugin) => [plugin.id, await readPluginLocalMetadata(plugin, profileCodexHome)] as const),
  );
  const metadataByPluginId = new Map<string, LocalPluginMetadata>(metadataEntries);
  return {
    metadataByPluginId,
    plugins: plugins.map((plugin) => ({
      ...plugin,
      installed: plugin.installed || Boolean(metadataByPluginId.get(plugin.id)?.sourcePath),
      appIds: metadataByPluginId.get(plugin.id)?.appIds ?? [],
      sourcePath: metadataByPluginId.get(plugin.id)?.sourcePath ?? plugin.sourcePath,
    })),
  };
}

function mergeSkills(
  runtimeSkills: DesktopSkillRecord[],
  plugins: DesktopPluginRecord[],
  metadataByPluginId: Map<string, LocalPluginMetadata>,
): DesktopSkillRecord[] {
  const merged = new Map<string, DesktopSkillRecord>();

  for (const skill of runtimeSkills) {
    merged.set(skill.path, skill);
  }

  for (const plugin of plugins) {
    const metadata = metadataByPluginId.get(plugin.id);
    if (!metadata) {
      continue;
    }

    for (const skill of metadata.skills) {
      if (merged.has(skill.path)) {
        continue;
      }
      merged.set(skill.path, {
        ...skill,
        enabled: plugin.enabled,
      });
    }
  }

  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function backfillAppPluginDisplayNames(
  apps: DesktopAppRecord[],
  plugins: DesktopPluginRecord[],
): DesktopAppRecord[] {
  const pluginKeysByAppId = new Map<string, string[]>();

  for (const plugin of plugins) {
    for (const appId of plugin.appIds) {
      pluginKeysByAppId.set(
        appId,
        uniqueStrings([
          ...(pluginKeysByAppId.get(appId) ?? []),
          plugin.displayName,
          plugin.name,
          plugin.id,
        ]),
      );
    }
  }

  return apps.map((app) => ({
    ...app,
    pluginDisplayNames: uniqueStrings([
      ...app.pluginDisplayNames,
      ...(pluginKeysByAppId.get(app.id) ?? []),
    ]),
  }));
}

function normalizeMcpServers(rawMcpStatus: unknown, mcpConfig: Record<string, unknown>): DesktopMcpServerRecord[] {
  const data = Array.isArray((rawMcpStatus as { data?: unknown[] } | null)?.data)
    ? (rawMcpStatus as { data: unknown[] }).data
    : [];
  const statusById = new Map<string, Record<string, unknown>>();
  for (const entry of data) {
    const record = asRecord(entry);
    const id = firstString(record.id, record.name);
    if (id) {
      statusById.set(id, record);
    }
  }

  const ids = new Set<string>([...Object.keys(mcpConfig), ...statusById.keys()]);
  return [...ids]
    .map((id) => {
      const config = asRecord(mcpConfig[id]);
      const status = statusById.get(id) ?? {};
      return {
        id,
        enabled: asBoolean(config.enabled, true),
        state: firstString(status.state, status.status),
        authStatus: firstString(status.authStatus, status.oauthStatus),
        toolsCount: Array.isArray(status.tools) ? status.tools.length : 0,
        resourcesCount: Array.isArray(status.resources) ? status.resources.length : 0,
        transport: firstString(config.transport, config.command ? "stdio" : config.url ? "http" : null),
        command: firstString(config.command),
        url: firstString(config.url),
      } satisfies DesktopMcpServerRecord;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeSkills(rawSkills: unknown): DesktopSkillRecord[] {
  const cwdEntries = Array.isArray((rawSkills as { data?: unknown[] } | null)?.data)
    ? (rawSkills as { data: unknown[] }).data
    : [];
  const records: DesktopSkillRecord[] = [];
  for (const cwdEntry of cwdEntries) {
    const record = asRecord(cwdEntry);
    const cwd = firstString(record.cwd);
    const skills = Array.isArray(record.skills) ? record.skills : [];
    for (const skill of skills) {
      const skillRecord = asRecord(skill);
      const path = firstString(skillRecord.path);
      const name = firstString(skillRecord.name);
      if (!path || !name) {
        continue;
      }
      records.push({
        name,
        description: firstString(skillRecord.description),
        path,
        scope: firstString(skillRecord.scope),
        enabled: asBoolean(skillRecord.enabled, true),
        cwd,
      });
    }
  }

  return records.sort((left, right) => left.name.localeCompare(right.name));
}

export class DesktopExtensionService {
  readonly #env: NodeJS.ProcessEnv;
  readonly #manager: AppServerProcessManager;
  readonly #openExternal: (url: string) => Promise<void>;
  readonly #resolveProfile: () => Promise<{ id: string }>;

  constructor(options: DesktopExtensionServiceOptions) {
    this.#env = options.env ?? process.env;
    this.#manager = options.manager;
    this.#openExternal = options.openExternal;
    this.#resolveProfile = options.resolveProfile;
  }

  async #requestOrFallback<T>(method: string, params: unknown, fallback: T): Promise<T> {
    try {
      return await this.#manager.request(method, params) as T;
    } catch (error) {
      console.warn(`[desktop:extensions] ${method} failed; continuing with fallback. ${formatError(error)}`);
      return fallback;
    }
  }

  async #restartRuntimeIfSupported(reason: string): Promise<void> {
    const manager = this.#manager as AppServerProcessManager & {
      restart?: (reason?: string) => Promise<void>;
      start?: () => Promise<void>;
      stop?: () => Promise<void>;
    };
    if (typeof manager.stop === "function" && typeof manager.start === "function") {
      await manager.stop();
      await manager.start();
      return;
    }

    if (typeof manager.restart !== "function") {
      return;
    }

    await manager.restart(reason);
  }

  async getOverview(
    request: DesktopExtensionOverviewRequest = {},
  ): Promise<DesktopExtensionOverviewResult> {
    const profile = await this.#resolveProfile();
    const profileCodexHome = resolveProfileCodexHome(profile.id, this.#env);
    const [configResult, pluginResult, appResult, mcpResult, skillResult, accountResult] = await Promise.all([
      this.#requestOrFallback<ConfigReadResult>("config/read", { includeLayers: false }, { config: null }),
      this.#requestOrFallback<unknown>("plugin/list", {
        cwds: [profileCodexHome],
        forceRemoteSync: Boolean(request.forceRefetch),
      }, { marketplaces: [] }),
      this.#requestOrFallback<unknown>("app/list", {
        cursor: null,
        forceRefetch: Boolean(request.forceRefetch),
        limit: 100,
      }, { data: [] }),
      this.#requestOrFallback<unknown>("mcpServerStatus/list", {
        cursor: null,
        limit: 100,
      }, { data: [] }),
      this.#requestOrFallback<unknown>("skills/list", {
        cwds: [profileCodexHome],
        forceReload: Boolean(request.forceRefetch),
      }, { data: [] }),
      this.#requestOrFallback<AccountReadResult>("account/read", { refreshToken: false }, {}),
    ]);

    const localConfigToggles = await readLocalConfigToggles(profileCodexHome);
    const config = mergeConfigWithLocalToggles(configResult?.config ?? null, localConfigToggles);
    const selectedProvider = resolveSelectedProvider({
      accountType: firstString(accountResult?.account?.type),
      config,
    });
    const provider: DesktopProviderState = {
      selectedProvider,
      authMode: firstString(accountResult?.authMode),
      accountType: firstString(accountResult?.account?.type),
      accountEmail: firstString(accountResult?.account?.email),
      options: buildProviderOptions({
        accountEmail: firstString(accountResult?.account?.email),
        accountType: firstString(accountResult?.account?.type),
        authMode: firstString(accountResult?.authMode),
        detectedGemini: commandExists("gemini"),
        detectedOllama: commandExists("ollama"),
        requiresOpenaiAuth: asBoolean(accountResult?.requiresOpenaiAuth, true),
        selectedProvider,
      }),
    };

    const { metadataByPluginId, plugins } = await enrichPluginsWithLocalMetadata(
      normalizePlugins(pluginResult, asRecord(config?.plugins)),
      profileCodexHome,
    );
    const apps = backfillAppPluginDisplayNames(
      normalizeApps(appResult, asRecord(config?.apps)),
      plugins,
    );
    const skills = mergeSkills(
      normalizeSkills(skillResult),
      plugins,
      metadataByPluginId,
    );

    return {
      provider,
      plugins,
      apps,
      mcpServers: normalizeMcpServers(mcpResult, asRecord(config?.mcp_servers)),
      skills,
    };
  }

  async installPlugin(request: DesktopPluginInstallRequest): Promise<DesktopExtensionOverviewResult> {
    const result = await this.#manager.request("plugin/install", {
      marketplacePath: request.marketplacePath,
      pluginName: request.pluginName,
    }) as PluginInstallResult;

    const postInstallOverview = await this.getOverview({ forceRefetch: true });
    const installedPlugin =
      postInstallOverview.plugins.find((plugin) => plugin.id === request.pluginId)
      ?? postInstallOverview.plugins.find((plugin) => plugin.name === request.pluginName)
      ?? null;
    const installedPluginId = firstString(installedPlugin?.id, request.pluginId);
    const appIdsToEnable = new Set<string>(installedPlugin?.appIds ?? []);
    const batchEdits: Array<{ keyPath: string; mergeStrategy: "upsert"; value: unknown }> = [];
    const authUrls = new Set<string>();

    for (const app of Array.isArray(result?.appsNeedingAuth) ? result.appsNeedingAuth : []) {
      const appId = firstString(app?.id);
      if (appId) {
        appIdsToEnable.add(appId);
      }

      const installUrl = firstString(app?.installUrl);
      if (installUrl) {
        authUrls.add(installUrl);
      }
    }

    if (appIdsToEnable.size > 0) {
      batchEdits.unshift({
        keyPath: "features.apps",
        mergeStrategy: "upsert",
        value: true,
      });
    }

    batchEdits.push({
      keyPath: `plugins.${installedPluginId}.enabled`,
      mergeStrategy: "upsert",
      value: true,
    });

    for (const appId of appIdsToEnable) {
      batchEdits.push({
        keyPath: `apps.${appId}.enabled`,
        mergeStrategy: "upsert",
        value: true,
      });
    }

    await this.#manager.request("config/batchWrite", {
      edits: batchEdits,
    });
    await this.#restartRuntimeIfSupported("plugin-install");

    const finalOverview = await this.getOverview({ forceRefetch: true });
    if (authUrls.size === 0 && appIdsToEnable.size > 0) {
      for (const app of finalOverview.apps) {
        if (!appIdsToEnable.has(app.id)) {
          continue;
        }
        const installUrl = firstString(app.installUrl);
        if (!app.isAccessible && installUrl) {
          authUrls.add(installUrl);
        }
      }
    }

    for (const installUrl of authUrls) {
      await this.#openExternal(installUrl);
    }

    return finalOverview;
  }

  async uninstallPlugin(request: DesktopPluginUninstallRequest): Promise<DesktopExtensionOverviewResult> {
    const profile = await this.#resolveProfile();
    const profileCodexHome = resolveProfileCodexHome(profile.id, this.#env);
    const currentOverview = await this.getOverview({ forceRefetch: true });
    const plugin = currentOverview.plugins.find((entry) => entry.id === request.pluginId) ?? null;
    if (!plugin) {
      throw new Error("Sense-1 could not find that plugin in the current profile.");
    }

    const removablePluginRoot = firstString(plugin.sourcePath);
    if (!removablePluginRoot || !isSubpath(profileCodexHome, removablePluginRoot)) {
      throw new Error("This plugin is not profile-owned, so Sense-1 can only disable it right now.");
    }

    await fs.rm(removablePluginRoot, { force: true, recursive: true });
    const marketplacePath = firstString(plugin.marketplacePath);
    if (marketplacePath && isSubpath(profileCodexHome, marketplacePath)) {
      await removeProfileMarketplacePluginEntry(marketplacePath, plugin);
    }
    await this.#manager.request("config/batchWrite", {
      edits: [
        {
          keyPath: `plugins.${request.pluginId}.enabled`,
          mergeStrategy: "upsert",
          value: false,
        },
        ...plugin.appIds.map((appId) => ({
          keyPath: `apps.${appId}.enabled`,
          mergeStrategy: "upsert" as const,
          value: false,
        })),
      ],
    });
    await this.#restartRuntimeIfSupported("plugin-uninstall");
    return await this.getOverview({ forceRefetch: true });
  }

  async setPluginEnabled(request: DesktopPluginEnabledRequest): Promise<DesktopExtensionOverviewResult> {
    const currentOverview = await this.getOverview();
    const plugin = currentOverview.plugins.find((entry) => entry.id === request.pluginId) ?? null;

    const edits: Array<{ keyPath: string; mergeStrategy: "upsert"; value: unknown }> = [
      {
        keyPath: `plugins.${request.pluginId}.enabled`,
        mergeStrategy: "upsert",
        value: request.enabled,
      },
    ];

    if (request.enabled && plugin?.appIds.length) {
      edits.unshift({
        keyPath: "features.apps",
        mergeStrategy: "upsert",
        value: true,
      });
      for (const appId of plugin.appIds) {
        edits.push({
          keyPath: `apps.${appId}.enabled`,
          mergeStrategy: "upsert",
          value: true,
        });
      }
    }

    if (!request.enabled && plugin?.appIds.length) {
      const claimedAppIds = new Set(
        currentOverview.plugins
          .filter((entry) => entry.id !== request.pluginId && entry.enabled)
          .flatMap((entry) => entry.appIds),
      );
      for (const appId of plugin.appIds) {
        if (claimedAppIds.has(appId)) {
          continue;
        }
        edits.push({
          keyPath: `apps.${appId}.enabled`,
          mergeStrategy: "upsert",
          value: false,
        });
      }
    }

    await this.#manager.request("config/batchWrite", {
      edits,
    });
    await this.#restartRuntimeIfSupported("plugin-enabled");
    return await this.getOverview({ forceRefetch: true });
  }

  async openAppInstall(request: DesktopAppInstallRequest): Promise<DesktopExtensionOverviewResult> {
    await this.#manager.request("config/batchWrite", {
      edits: [
        {
          keyPath: "features.apps",
          mergeStrategy: "upsert",
          value: true,
        },
        {
          keyPath: `apps.${request.appId}.enabled`,
          mergeStrategy: "upsert",
          value: true,
        },
      ],
    });
    await this.#restartRuntimeIfSupported("app-install");
    await this.#openExternal(request.installUrl);
    return await this.getOverview({ forceRefetch: true });
  }

  async removeApp(request: DesktopAppRemoveRequest): Promise<DesktopExtensionOverviewResult> {
    await this.#manager.request("config/batchWrite", {
      edits: [
        {
          keyPath: `apps.${request.appId}.enabled`,
          mergeStrategy: "upsert",
          value: false,
        },
      ],
    });
    await this.#restartRuntimeIfSupported("app-remove");
    return await this.getOverview({ forceRefetch: true });
  }

  async setAppEnabled(request: DesktopAppEnabledRequest): Promise<DesktopExtensionOverviewResult> {
    await this.#manager.request("config/batchWrite", {
      edits: [
        {
          keyPath: "features.apps",
          mergeStrategy: "upsert",
          value: true,
        },
        {
          keyPath: `apps.${request.appId}.enabled`,
          mergeStrategy: "upsert",
          value: request.enabled,
        },
      ],
    });
    await this.#restartRuntimeIfSupported("app-enabled");
    return await this.getOverview({ forceRefetch: true });
  }

  async setMcpServerEnabled(request: DesktopMcpServerEnabledRequest): Promise<DesktopExtensionOverviewResult> {
    await this.#manager.request("config/value/write", {
      keyPath: `mcp_servers.${request.serverId}.enabled`,
      mergeStrategy: "upsert",
      value: request.enabled,
    });
    await this.#manager.request("config/mcpServer/reload", {});
    return await this.getOverview({ forceRefetch: true });
  }

  async setSkillEnabled(request: DesktopSkillEnabledRequest): Promise<DesktopExtensionOverviewResult> {
    await this.#manager.request("skills/config/write", request);
    return await this.getOverview({ forceRefetch: true });
  }

  async uninstallSkill(request: DesktopSkillUninstallRequest): Promise<DesktopExtensionOverviewResult> {
    const profile = await this.#resolveProfile();
    const profileCodexHome = resolveProfileCodexHome(profile.id, this.#env);
    const skillPath = path.resolve(request.path);
    if (!isSubpath(profileCodexHome, skillPath)) {
      throw new Error("This skill is not profile-owned, so Sense-1 can only disable it right now.");
    }

    const skillStats = await fs.stat(skillPath).catch(() => null);
    const skillDirectory =
      skillStats?.isDirectory()
        ? skillPath
        : skillStats?.isFile() || path.basename(skillPath).toLowerCase() === "skill.md"
          ? path.dirname(skillPath)
          : skillPath;
    const markerPath = path.join(skillDirectory, "SKILL.md");
    if (!isSubpath(profileCodexHome, skillDirectory) || !(await fileExists(markerPath))) {
      throw new Error("Sense-1 could not find a profile-owned skill to uninstall at that path.");
    }

    await fs.rm(skillDirectory, { force: true, recursive: true });
    await this.#restartRuntimeIfSupported("skill-uninstall");
    return await this.getOverview({ forceRefetch: true });
  }
}
