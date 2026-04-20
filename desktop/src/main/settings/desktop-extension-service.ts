import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

import type { AppServerProcessManager } from "../runtime/app-server-process-manager.js";
import { resolveProfileCodexHome } from "../profile/profile-state.js";
import { classifyMcpServerEntry } from "./mcp-server-classification.ts";
import {
  quarantineInvalidPluginMcpEntries,
  readQuarantinedPluginMcpEntries,
} from "./plugin-mcp-quarantine.ts";
import { sanitizeRenderableUrl } from "./renderable-url.ts";
import type {
  DesktopAppRemoveRequest,
  DesktopAppInstallRequest,
  DesktopAppEnabledRequest,
  DesktopAppRecord,
  DesktopExtensionBackendFailure,
  DesktopExtensionHealth,
  DesktopExtensionOverviewRequest,
  DesktopExtensionOverviewResult,
  DesktopExtensionPluginMcpIssue,
  DesktopManagedExtensionAuthState,
  DesktopManagedExtensionHealthState,
  DesktopManagedExtensionOwnership,
  DesktopManagedExtensionRecord,
  DesktopMcpServerAuthRequest,
  DesktopMcpServerAuthResult,
  DesktopMcpServerEnabledRequest,
  DesktopMcpServerRecord,
  DesktopPluginDetailRequest,
  DesktopPluginDetailResult,
  DesktopPluginDetailSkillRecord,
  DesktopPluginInstallRequest,
  DesktopPluginUninstallRequest,
  DesktopPluginEnabledRequest,
  DesktopPluginRecord,
  DesktopProviderId,
  DesktopProviderOption,
  DesktopProviderState,
  DesktopSkillEnabledRequest,
  DesktopSkillDetailRequest,
  DesktopSkillDetailResult,
  DesktopSkillUninstallRequest,
  DesktopSkillRecord,
} from "../contracts";

type DesktopExtensionServiceOptions = {
  env?: NodeJS.ProcessEnv;
  manager: AppServerProcessManager;
  openExternal: (url: string) => Promise<void>;
  openManagedAuth?: (url: string) => Promise<void>;
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

type PluginReadResult = {
  plugin?: Record<string, unknown> | null;
};

type MpcOAuthLoginResult = {
  authorizationUrl?: string | null;
  url?: string | null;
};

type LocalPluginMcpMetadata = {
  readonly id: string;
  readonly transport: string | null;
  readonly command: string | null;
  readonly url: string | null;
  readonly invalidReason: string | null;
};

type LocalPluginMetadata = {
  readonly appIds: string[];
  readonly mcpServerIds: string[];
  readonly mcpServers: LocalPluginMcpMetadata[];
  readonly sourcePath: string | null;
  readonly skills: DesktopSkillRecord[];
  readonly invalidMcpEntries: DesktopExtensionPluginMcpIssue[];
};

type LocalConfigToggles = {
  readonly apps: Record<string, { enabled?: boolean }>;
  readonly features: Record<string, unknown>;
  readonly mcp_servers: Record<string, { enabled?: boolean }>;
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

function normalizeStoredPath(value: string | null | undefined): string {
  return typeof value === "string" ? value.replaceAll("\\", "/") : "";
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

function canonicalAppKey(id: string | null | undefined): string {
  const resolved = firstString(id);
  if (!resolved) {
    return "";
  }
  return resolved.replace(/^connector_/iu, "").trim().toLowerCase();
}

function humanizeAppId(id: string): string {
  const base = firstString(id)?.replace(/^connector_/iu, "") ?? id;
  const parts = base.split(/[_-]+/u).filter(Boolean);
  if (parts.length === 0) {
    return id;
  }
  return parts
    .map((part) => (part.length <= 3 ? part.toUpperCase() : `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`))
    .join(" ");
}

function firstNamedString(value: unknown): string | null {
  const record = asRecord(value);
  return firstString(record.id, record.name, record.displayName, typeof value === "string" ? value : null);
}

function normalizeConfigIdentifier(value: string | null | undefined): string | null {
  let normalized = firstString(value);
  while (normalized && normalized.length >= 2) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
      normalized = normalized.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return normalized || null;
}

function quoteTomlKeyIfNeeded(key: string): string {
  return /^[A-Za-z0-9_-]+$/u.test(key) ? key : JSON.stringify(key);
}

function configSectionKeyPath(section: "plugins" | "apps" | "mcp_servers", id: string): string {
  return `${section}.${quoteTomlKeyIfNeeded(normalizeConfigIdentifier(id) ?? id)}`;
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

const ICON_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

async function readIconAsDataUri(filePath: string | null): Promise<string | null> {
  if (!filePath) {
    return null;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = ICON_MIME[ext];
  if (!mime) {
    return null;
  }
  try {
    const data = await fs.readFile(filePath);
    return `data:${mime};base64,${data.toString("base64")}`;
  } catch {
    return null;
  }
}

async function resolvePluginIcons(plugins: DesktopPluginRecord[]): Promise<DesktopPluginRecord[]> {
  return Promise.all(
    plugins.map(async (plugin) => {
      if (!plugin.iconPath) {
        return plugin;
      }
      const iconDataUri = await readIconAsDataUri(plugin.iconPath);
      if (iconDataUri) {
        return { ...plugin, iconPath: iconDataUri };
      }
      // If the icon could not be turned into a data URI (missing file, unknown
      // mime, or a raw upstream URL), only keep it when the remaining value is
      // safe to render. This prevents bare filesystem paths or unregistered
      // schemes like `connectors://` from reaching <img src>.
      return { ...plugin, iconPath: sanitizeRenderableUrl(plugin.iconPath) };
    }),
  );
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
    mcp_servers: {},
    plugins: {},
  };

  let activeSection: "apps" | "features" | "mcp_servers" | "plugins" | null = null;
  let activeKey: string | null = null;

  for (const rawLine of rawConfig.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

      const tableMatch = line.match(/^\[(plugins|apps|mcp_servers)\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9._@:-]+))\]$/u);
    if (tableMatch) {
      activeSection = tableMatch[1] as "apps" | "mcp_servers" | "plugins";
      activeKey = normalizeConfigIdentifier(firstString(tableMatch[2], tableMatch[3], tableMatch[4]));
      continue;
    }

    if (line === "[features]") {
      activeSection = "features";
      activeKey = null;
      continue;
    }

    const dottedEnabledMatch = line.match(
      /^(plugins|apps|mcp_servers)\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9._@:-]+))\.enabled\s*=\s*(true|false)$/iu,
    );
    if (dottedEnabledMatch) {
      const section = dottedEnabledMatch[1] as "apps" | "mcp_servers" | "plugins";
      const key = normalizeConfigIdentifier(firstString(dottedEnabledMatch[2], dottedEnabledMatch[3], dottedEnabledMatch[4]));
      const enabled = parseTomlBooleanToken(dottedEnabledMatch[5]);
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
      mcp_servers: {},
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
    mcp_servers: mergeToggleSections(asRecord(config?.mcp_servers), localToggles.mcp_servers),
    plugins: mergeToggleSections(asRecord(config?.plugins), localToggles.plugins),
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const MCP_SERVER_ERROR_PATTERN = /mcp_servers[.\[]"?([A-Za-z0-9._@:-]+)"?\]?/gu;

function extractSuspectedMcpServerIds(errorMessage: string | null): string[] {
  if (!errorMessage) {
    return [];
  }
  const seen = new Set<string>();
  for (const match of errorMessage.matchAll(MCP_SERVER_ERROR_PATTERN)) {
    const id = firstString(match[1]);
    if (id) {
      seen.add(id);
    }
  }
  return [...seen];
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
  const isApiKeyAuth = accountType === "apikey" || authMode === "apikey";
  const chatgptAccountEmail = accountType === "chatgpt" ? accountEmail : null;
  const apiKeyAccountEmail = isApiKeyAuth ? accountEmail : null;
  return [
    {
      id: "chatgpt",
      label: "ChatGPT",
      description: "Use native Codex-managed ChatGPT sign-in.",
      available: true,
      configured: selectedProvider === "chatgpt" || accountType === "chatgpt",
      requiresOpenaiAuth,
      detail: chatgptAccountEmail
        ? `Signed in as ${chatgptAccountEmail}.`
        : "Use your ChatGPT account and keep the Sense-1 Workspace shell unchanged after sign-in.",
    },
    {
      id: "openai-api-key",
      label: "OpenAI API key",
      description: "Paste an OpenAI API key to use Sense-1 with your own credits.",
      available: true,
      configured: selectedProvider === "openai-api-key" || isApiKeyAuth,
      requiresOpenaiAuth,
      detail: apiKeyAccountEmail
        ? `Signed in with an OpenAI API key for ${apiKeyAccountEmail}.`
        : "Your key stays on this machine and lands you on the desktop shell.",
    },
    {
      id: "gemini",
      label: "Gemini",
      description: "Gemini sign-in is not part of this alpha.",
      available: false,
      configured: selectedProvider === "gemini",
      requiresOpenaiAuth: false,
      detail: detectedGemini
        ? "Gemini tooling was detected locally, but alpha sign-in is coming soon."
        : "Gemini sign-in is coming soon.",
    },
    {
      id: "ollama",
      label: "Ollama",
      description: "Ollama sign-in is not part of this alpha.",
      available: false,
      configured: selectedProvider === "ollama",
      requiresOpenaiAuth: false,
      detail: detectedOllama
        ? "Ollama was detected locally, but alpha sign-in is coming soon."
        : "Ollama sign-in is coming soon.",
    },
  ];
}

function resolveSelectedProvider({
  accountType,
  authMode,
  config,
}: {
  accountType: string | null;
  authMode: string | null;
  config: ConfigReadResult["config"];
}): DesktopProviderId | null {
  if (accountType === "chatgpt") {
    return "chatgpt";
  }
  const ossProvider = firstString(config?.oss_provider);
  if (ossProvider === "ollama") {
    return "ollama";
  }
  const modelProvider = firstString(config?.model_provider);
  if (modelProvider?.toLowerCase().includes("gemini")) {
    return "gemini";
  }
  if (accountType === "apikey" || authMode === "apikey") {
    return "openai-api-key";
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
      const pluginId = normalizeConfigIdentifier(firstString(summary.id));
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
        iconPath: firstString(interfaceRecord.logo, interfaceRecord.composerIcon),
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
      const marketplacePluginId = normalizeConfigIdentifier(firstString(marketplacePlugin.id, marketplacePlugin.name));
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
    .map<DesktopAppRecord | null>((entry) => {
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
        logoUrl: sanitizeRenderableUrl(firstString(record.logoUrl)),
        source: "runtime",
        runtimeStateKnown: true,
      } satisfies DesktopAppRecord;
    })
    .filter((entry): entry is DesktopAppRecord => entry !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function buildFallbackAppsFromPluginMetadata(
  apps: DesktopAppRecord[],
  plugins: DesktopPluginRecord[],
  metadataByPluginId: Map<string, LocalPluginMetadata>,
  appConfig: Record<string, unknown>,
): DesktopAppRecord[] {
  const recordByKey = new Map<string, DesktopAppRecord>();
  const configByCanonicalKey = new Map<string, Record<string, unknown>>();

  for (const [configAppId, rawConfig] of Object.entries(appConfig)) {
    const key = canonicalAppKey(configAppId);
    if (!key) {
      continue;
    }
    configByCanonicalKey.set(key, {
      ...(configByCanonicalKey.get(key) ?? {}),
      ...asRecord(rawConfig),
    });
  }

  for (const app of apps) {
    const key = canonicalAppKey(app.id);
    if (!key || recordByKey.has(key)) {
      continue;
    }
    recordByKey.set(key, app);
  }

  for (const plugin of plugins) {
    if (!plugin.installed) {
      continue;
    }
    const metadata = metadataByPluginId.get(plugin.id);
    if (!metadata) {
      continue;
    }

    for (const appId of metadata.appIds) {
      const key = canonicalAppKey(appId);
      if (!key || recordByKey.has(key)) {
        continue;
      }
      const config = configByCanonicalKey.get(key) ?? asRecord(appConfig[appId]);
      recordByKey.set(key, {
        id: appId,
        name: humanizeAppId(appId),
        description: "Plugin app connector",
        installUrl: null,
        isAccessible: false,
        isEnabled: asBoolean(config.enabled, plugin.enabled),
        pluginDisplayNames: uniqueStrings([plugin.displayName, plugin.name]),
        logoUrl: null,
        source: "local-fallback",
        runtimeStateKnown: false,
      });
    }
  }

  for (const [appId, rawConfig] of Object.entries(appConfig)) {
    const key = canonicalAppKey(appId);
    if (!key || recordByKey.has(key)) {
      continue;
    }
    const config = configByCanonicalKey.get(key) ?? asRecord(rawConfig);
    recordByKey.set(key, {
      id: appId,
      name: humanizeAppId(appId),
      description: "Configured app connector",
      installUrl: null,
      isAccessible: false,
      isEnabled: asBoolean(config.enabled, false),
      pluginDisplayNames: [],
      logoUrl: null,
      source: "local-fallback",
      runtimeStateKnown: false,
    });
  }

  return [...recordByKey.values()].sort((left, right) => left.name.localeCompare(right.name));
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
      mcpServerIds: [],
      mcpServers: [],
      sourcePath: null,
      skills: [],
      invalidMcpEntries: [],
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

  let mcpServerIds: string[] = [];
  const mcpServers: LocalPluginMcpMetadata[] = [];
  const invalidMcpEntries: DesktopExtensionPluginMcpIssue[] = [];
  try {
    const mcpJson = JSON.parse(await fs.readFile(path.join(sourcePath, ".mcp.json"), "utf8")) as { mcpServers?: Record<string, unknown> };
    const serverEntries = Object.entries(asRecord(mcpJson?.mcpServers));
    mcpServerIds = uniqueStrings(serverEntries.map(([id]) => id));
    for (const [serverId, serverConfig] of serverEntries) {
      const serverRecord = asRecord(serverConfig);
      const classification = classifyMcpServerEntry(serverConfig);
      mcpServers.push({
        id: serverId,
        transport: firstString(
          serverRecord.type,
          serverRecord.transport,
          serverRecord.command ? "stdio" : serverRecord.url ? "http" : null,
        ),
        command: firstString(serverRecord.command),
        url: firstString(serverRecord.url),
        invalidReason: classification.ok ? null : classification.reason,
      });
      if (!classification.ok) {
        invalidMcpEntries.push({
          pluginName: plugin.name,
          sourcePath,
          serverId,
          reason: classification.reason,
        });
      }
    }
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
    mcpServerIds,
    mcpServers,
    sourcePath,
    skills,
    invalidMcpEntries,
  };
}

async function readLocalPluginDetail(
  plugin: DesktopPluginRecord,
  profileCodexHome: string,
): Promise<DesktopPluginDetailResult> {
  const metadata = await readPluginLocalMetadata(plugin, profileCodexHome);
  let manifestInterface: Record<string, unknown> = {};
  try {
    manifestInterface = asRecord(
      asRecord(JSON.parse(await fs.readFile(path.join(metadata.sourcePath ?? "", ".codex-plugin", "plugin.json"), "utf8"))).interface,
    );
  } catch {}

  return {
    pluginId: plugin.id,
    name: plugin.name,
    displayName: firstString(manifestInterface.displayName, plugin.displayName, plugin.name, plugin.id) ?? plugin.id,
    description: firstString(manifestInterface.shortDescription, plugin.description),
    marketplaceName: plugin.marketplaceName,
    marketplacePath: plugin.marketplacePath,
    sourcePath: metadata.sourcePath ?? plugin.sourcePath,
    websiteUrl: firstString(manifestInterface.websiteUrl, plugin.websiteUrl),
    capabilities: uniqueStrings([
      ...asStringArray(manifestInterface.capabilities),
      ...plugin.capabilities,
    ]),
    skills: metadata.skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      path: skill.path,
    })),
    apps: metadata.appIds,
    mcpServers: metadata.mcpServerIds,
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
    if (!plugin.installed) {
      continue;
    }
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
      const key = canonicalAppKey(appId);
      pluginKeysByAppId.set(
        key,
        uniqueStrings([
          ...(pluginKeysByAppId.get(key) ?? []),
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
      ...(pluginKeysByAppId.get(canonicalAppKey(app.id)) ?? []),
    ]),
  }));
}

function normalizeMcpServers(rawMcpStatus: unknown, mcpConfig: Record<string, unknown>): DesktopMcpServerRecord[] {
  return normalizeMcpServersWithOptions(rawMcpStatus, mcpConfig, { runtimeStateKnown: true });
}

function normalizeMcpServersWithOptions(
  rawMcpStatus: unknown,
  mcpConfig: Record<string, unknown>,
  options: { runtimeStateKnown: boolean },
): DesktopMcpServerRecord[] {
  const data = Array.isArray((rawMcpStatus as { data?: unknown[] } | null)?.data)
    ? (rawMcpStatus as { data: unknown[] }).data
    : [];
  const statusById = new Map<string, Record<string, unknown>>();
  const runtimeStateKnown = options.runtimeStateKnown;
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
        source: runtimeStateKnown ? "runtime" : "local-fallback",
        runtimeStateKnown,
        invalidReason: null,
      } satisfies DesktopMcpServerRecord;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function buildFallbackMcpServersFromPluginMetadata(
  mcpServers: DesktopMcpServerRecord[],
  plugins: DesktopPluginRecord[],
  metadataByPluginId: Map<string, LocalPluginMetadata>,
  mcpConfig: Record<string, unknown>,
): DesktopMcpServerRecord[] {
  const recordById = new Map<string, DesktopMcpServerRecord>(
    mcpServers.map((server) => [server.id, server] as const),
  );

  for (const plugin of plugins) {
    if (!plugin.installed) {
      continue;
    }
    const metadata = metadataByPluginId.get(plugin.id);
    if (!metadata) {
      continue;
    }

    for (const server of metadata.mcpServers) {
      const existing = recordById.get(server.id);
      if (existing?.runtimeStateKnown) {
        continue;
      }

      const config = asRecord(mcpConfig[server.id]);
      recordById.set(server.id, {
        id: server.id,
        enabled: asBoolean(config.enabled, existing?.enabled ?? (plugin.enabled && !server.invalidReason)),
        state: server.invalidReason ? "quarantined" : null,
        authStatus: existing?.authStatus ?? null,
        toolsCount: existing?.toolsCount ?? 0,
        resourcesCount: existing?.resourcesCount ?? 0,
        transport: server.transport ?? existing?.transport ?? null,
        command: server.command ?? existing?.command ?? null,
        url: server.url ?? existing?.url ?? null,
        source: "local-fallback",
        runtimeStateKnown: false,
        invalidReason: server.invalidReason ?? existing?.invalidReason ?? null,
      });
    }
  }

  return [...recordById.values()].sort((left, right) => left.id.localeCompare(right.id));
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

function pluginOwnership(plugin: DesktopPluginRecord): DesktopManagedExtensionOwnership {
  const normalizedSourcePath = normalizeStoredPath(plugin.sourcePath);
  if (!plugin.installed) {
    return "marketplace-installed";
  }
  if (normalizedSourcePath.includes("/codex-home/plugins/") && !normalizedSourcePath.includes("/codex-home/plugins/cache/")) {
    return "profile-owned";
  }
  if (plugin.marketplacePath || normalizedSourcePath.includes("/codex-home/plugins/cache/")) {
    return "marketplace-installed";
  }
  return "built-in";
}

function skillOwnership(skill: DesktopSkillRecord, ownerPluginIds: string[]): DesktopManagedExtensionOwnership {
  if (ownerPluginIds.length > 0 || skill.scope === "plugin") {
    return "plugin-owned";
  }
  if (normalizeStoredPath(skill.path).includes("/codex-home/skills/")) {
    return "profile-owned";
  }
  return "built-in";
}

function appOwnership(ownerPluginIds: string[]): DesktopManagedExtensionOwnership {
  return ownerPluginIds.length > 0 ? "plugin-owned" : "built-in";
}

function mcpOwnership(ownerPluginIds: string[]): DesktopManagedExtensionOwnership {
  return ownerPluginIds.length > 0 ? "plugin-owned" : "profile-owned";
}

function appAuthState(app: DesktopAppRecord): DesktopManagedExtensionAuthState {
  if (!app.runtimeStateKnown) {
    return "unknown";
  }
  if (!app.installUrl) {
    return "not-required";
  }
  return app.isAccessible ? "connected" : "required";
}

function pluginAuthState(plugin: DesktopPluginRecord, apps: DesktopAppRecord[]): DesktopManagedExtensionAuthState {
  const relatedApps = apps.filter((app) =>
    plugin.appIds.some((appId) => canonicalAppKey(appId) === canonicalAppKey(app.id)));
  if (relatedApps.some((app) => !app.runtimeStateKnown)) {
    return "unknown";
  }
  if (relatedApps.some((app) => app.installUrl && !app.isAccessible)) {
    return "required";
  }
  if (relatedApps.some((app) => app.installUrl && app.isAccessible)) {
    return "connected";
  }
  return "not-required";
}

function mcpAuthState(server: DesktopMcpServerRecord): DesktopManagedExtensionAuthState {
  if (!server.runtimeStateKnown) {
    return "unknown";
  }
  const normalized = firstString(server.authStatus)?.toLowerCase() ?? "";
  if (!normalized) {
    return "not-required";
  }
  if (
    normalized.includes("connected")
    || normalized.includes("authenticated")
    || normalized.includes("authorized")
    || normalized.includes("ready")
    || normalized.includes("ok")
  ) {
    return "connected";
  }
  if (normalized.includes("failed") || normalized.includes("error")) {
    return "failed";
  }
  return "required";
}

function healthStateForAuth(authState: DesktopManagedExtensionAuthState): DesktopManagedExtensionHealthState {
  if (authState === "failed") {
    return "error";
  }
  if (authState === "required" || authState === "unknown") {
    return "warning";
  }
  return "healthy";
}

function mcpHealthState(server: DesktopMcpServerRecord, authState: DesktopManagedExtensionAuthState): DesktopManagedExtensionHealthState {
  const normalizedState = firstString(server.state)?.toLowerCase() ?? "";
  if (server.invalidReason || normalizedState.includes("error") || normalizedState.includes("failed") || authState === "failed") {
    return "error";
  }
  if (!server.runtimeStateKnown) {
    return "warning";
  }
  if (authState === "required") {
    return "warning";
  }
  return "healthy";
}

function appHealthState(app: DesktopAppRecord, authState: DesktopManagedExtensionAuthState): DesktopManagedExtensionHealthState {
  if (!app.runtimeStateKnown) {
    return "warning";
  }
  return healthStateForAuth(authState);
}

function authActionAvailable(authState: DesktopManagedExtensionAuthState): boolean {
  return authState === "required" || authState === "failed" || authState === "connected";
}

function findManagedExtension(
  overview: DesktopExtensionOverviewResult,
  kind: DesktopManagedExtensionRecord["kind"],
  id: string,
): DesktopManagedExtensionRecord | null {
  return overview.managedExtensions.find((entry) => entry.kind === kind && entry.id === id) ?? null;
}

function claimedPluginCompositions(
  overview: DesktopExtensionOverviewResult,
  excludedPluginId: string,
): { appIds: Set<string>; mcpServerIds: Set<string> } {
  const appIds = new Set<string>();
  const mcpServerIds = new Set<string>();

  for (const entry of overview.managedExtensions) {
    if (entry.kind !== "plugin" || entry.id === excludedPluginId || entry.enablementState !== "enabled") {
      continue;
    }
    for (const appId of entry.includedAppIds) {
      appIds.add(appId);
    }
    for (const mcpServerId of entry.includedMcpServerIds) {
      mcpServerIds.add(mcpServerId);
    }
  }

  return { appIds, mcpServerIds };
}

function pluginCascadeDisableEdits(
  overview: DesktopExtensionOverviewResult,
  pluginId: string,
  appIds: string[],
  mcpServerIds: string[],
): Array<{ keyPath: string; mergeStrategy: "upsert"; value: boolean }> {
  const edits: Array<{ keyPath: string; mergeStrategy: "upsert"; value: boolean }> = [];
  const claimed = claimedPluginCompositions(overview, pluginId);

  for (const appId of appIds) {
    if (claimed.appIds.has(appId)) {
      continue;
    }
    edits.push({
      keyPath: `${configSectionKeyPath("apps", appId)}.enabled`,
      mergeStrategy: "upsert",
      value: false,
    });
  }

  for (const serverId of mcpServerIds) {
    if (claimed.mcpServerIds.has(serverId)) {
      continue;
    }
    edits.push({
      keyPath: `${configSectionKeyPath("mcp_servers", serverId)}.enabled`,
      mergeStrategy: "upsert",
      value: false,
    });
  }

  return edits;
}

function pluginDetailSkillsFromRaw(rawSkills: unknown): DesktopPluginDetailSkillRecord[] {
  if (!Array.isArray(rawSkills)) {
    return [];
  }

  return rawSkills
    .map((skill) => {
      const name = firstNamedString(skill);
      if (!name) {
        return null;
      }
      const record = asRecord(skill);
      return {
        name,
        description: firstString(record.description),
        path: firstString(record.path),
      } satisfies DesktopPluginDetailSkillRecord;
    })
    .filter((skill): skill is DesktopPluginDetailSkillRecord => skill !== null);
}

function buildManagedExtensions({
  plugins,
  apps,
  mcpServers,
  skills,
  metadataByPluginId,
}: {
  plugins: DesktopPluginRecord[];
  apps: DesktopAppRecord[];
  mcpServers: DesktopMcpServerRecord[];
  skills: DesktopSkillRecord[];
  metadataByPluginId: Map<string, LocalPluginMetadata>;
}): DesktopManagedExtensionRecord[] {
  const pluginById = new Map(plugins.map((plugin) => [plugin.id, plugin] as const));
  const skillOwnersByPath = new Map<string, string[]>();
  const appOwnersById = new Map<string, string[]>();
  const mcpOwnersById = new Map<string, string[]>();

  for (const [pluginId, metadata] of metadataByPluginId.entries()) {
    for (const skill of metadata.skills) {
      skillOwnersByPath.set(skill.path, uniqueStrings([...(skillOwnersByPath.get(skill.path) ?? []), pluginId]));
    }
    for (const appId of metadata.appIds) {
      appOwnersById.set(appId, uniqueStrings([...(appOwnersById.get(appId) ?? []), pluginId]));
    }
    for (const mcpServerId of metadata.mcpServerIds) {
      mcpOwnersById.set(mcpServerId, uniqueStrings([...(mcpOwnersById.get(mcpServerId) ?? []), pluginId]));
    }
  }

  for (const app of apps) {
    const matchedPluginIds = plugins
      .filter((plugin) =>
        plugin.installed
        && (
          plugin.appIds.some((appId) => canonicalAppKey(appId) === canonicalAppKey(app.id))
        || app.pluginDisplayNames.includes(plugin.displayName)
        || app.pluginDisplayNames.includes(plugin.name)
        || app.pluginDisplayNames.includes(plugin.id)))
      .map((plugin) => plugin.id);
    if (matchedPluginIds.length === 0) {
      continue;
    }
    appOwnersById.set(app.id, uniqueStrings([...(appOwnersById.get(app.id) ?? []), ...matchedPluginIds]));
  }

  const managedExtensions: DesktopManagedExtensionRecord[] = [];

  for (const plugin of plugins) {
    const authState = pluginAuthState(plugin, apps);
    const metadata = metadataByPluginId.get(plugin.id);
    managedExtensions.push({
      id: plugin.id,
      kind: "plugin",
      name: plugin.name,
      displayName: plugin.displayName,
      description: plugin.description,
      installState: plugin.installed ? "installed" : "discoverable",
      enablementState: plugin.enabled ? "enabled" : "disabled",
      authState,
      healthState: healthStateForAuth(authState),
      ownership: pluginOwnership(plugin),
      ownerPluginIds: [],
      includedSkillIds: metadata?.skills.map((skill) => skill.path) ?? [],
      includedAppIds: metadata?.appIds ?? [],
      includedMcpServerIds: metadata?.mcpServerIds ?? [],
      capabilities: plugin.capabilities,
      sourcePath: plugin.sourcePath,
      marketplaceName: plugin.marketplaceName,
      marketplacePath: plugin.marketplacePath,
      canOpen: Boolean(plugin.sourcePath),
      canUninstall: pluginOwnership(plugin) === "profile-owned",
      canDisable: plugin.installed,
      canConnect: authActionAvailable(authState),
      canReload: false,
    });
  }

  for (const app of apps) {
    const authState = appAuthState(app);
    const ownerPluginIds = uniqueStrings(appOwnersById.get(app.id) ?? []);
    managedExtensions.push({
      id: app.id,
      kind: "app",
      name: app.name,
      displayName: app.name,
      description: app.description,
      installState: app.isAccessible || app.isEnabled || ownerPluginIds.length > 0 ? "installed" : "discoverable",
      enablementState: app.isEnabled ? "enabled" : "disabled",
      authState,
      healthState: appHealthState(app, authState),
      ownership: appOwnership(ownerPluginIds),
      ownerPluginIds,
      includedSkillIds: [],
      includedAppIds: [],
      includedMcpServerIds: [],
      capabilities: [],
      sourcePath: null,
      marketplaceName: null,
      marketplacePath: null,
      canOpen: false,
      canUninstall: false,
      canDisable: app.runtimeStateKnown && app.isAccessible,
      canConnect: app.runtimeStateKnown && authActionAvailable(authState),
      canReload: false,
    });
  }

  for (const skill of skills) {
    const ownerPluginIds = uniqueStrings(skillOwnersByPath.get(skill.path) ?? []);
    const ownership = skillOwnership(skill, ownerPluginIds);
    managedExtensions.push({
      id: skill.path,
      kind: "skill",
      name: skill.name,
      displayName: skill.name,
      description: skill.description,
      installState: "installed",
      enablementState: skill.enabled ? "enabled" : "disabled",
      authState: "not-required",
      healthState: "healthy",
      ownership,
      ownerPluginIds,
      includedSkillIds: [],
      includedAppIds: [],
      includedMcpServerIds: [],
      capabilities: [],
      sourcePath: skill.path,
      marketplaceName: ownerPluginIds.length === 1 ? pluginById.get(ownerPluginIds[0])?.marketplaceName ?? null : null,
      marketplacePath: ownerPluginIds.length === 1 ? pluginById.get(ownerPluginIds[0])?.marketplacePath ?? null : null,
      canOpen: true,
      canUninstall: ownership === "profile-owned",
      canDisable: true,
      canConnect: false,
      canReload: false,
    });
  }

  for (const server of mcpServers) {
    const authState = mcpAuthState(server);
    const ownerPluginIds = uniqueStrings(mcpOwnersById.get(server.id) ?? []);
    const ownership = mcpOwnership(ownerPluginIds);
    managedExtensions.push({
      id: server.id,
      kind: "mcp",
      name: server.id,
      displayName: server.id,
      description: firstString(server.command, server.url),
      installState: "installed",
      enablementState: server.enabled ? "enabled" : "disabled",
      authState,
      healthState: mcpHealthState(server, authState),
      ownership,
      ownerPluginIds,
      includedSkillIds: [],
      includedAppIds: [],
      includedMcpServerIds: [],
      capabilities: [],
      sourcePath: null,
      marketplaceName: ownerPluginIds.length === 1 ? pluginById.get(ownerPluginIds[0])?.marketplaceName ?? null : null,
      marketplacePath: ownerPluginIds.length === 1 ? pluginById.get(ownerPluginIds[0])?.marketplacePath ?? null : null,
      canOpen: false,
      canUninstall: false,
      canDisable: server.runtimeStateKnown && !server.invalidReason,
      canConnect: server.runtimeStateKnown && !server.invalidReason && authActionAvailable(authState),
      canReload: server.runtimeStateKnown && !server.invalidReason,
    });
  }

  return managedExtensions.sort((left, right) => {
    if (left.kind === right.kind) {
      return left.displayName.localeCompare(right.displayName);
    }
    return left.kind.localeCompare(right.kind);
  });
}

export class DesktopExtensionService {
  readonly #env: NodeJS.ProcessEnv;
  readonly #manager: AppServerProcessManager;
  readonly #openExternal: (url: string) => Promise<void>;
  readonly #openManagedAuth: (url: string) => Promise<void>;
  readonly #resolveProfile: () => Promise<{ id: string }>;

  constructor(options: DesktopExtensionServiceOptions) {
    this.#env = options.env ?? process.env;
    this.#manager = options.manager;
    this.#openExternal = options.openExternal;
    this.#openManagedAuth = options.openManagedAuth ?? options.openExternal;
    this.#resolveProfile = options.resolveProfile;
  }

  async #requestOrFallback<T>(
    method: string,
    params: unknown,
    fallback: T,
    failures?: DesktopExtensionBackendFailure[],
  ): Promise<T> {
    try {
      return await this.#manager.request(method, params) as T;
    } catch (error) {
      const message = formatError(error);
      console.warn(`[desktop:extensions] ${method} failed; continuing with fallback. ${message}`);
      failures?.push({ method, message });
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

  async #safeRuntimeRefresh(
    reason: string,
    opts: { reloadMcpServers: boolean },
  ): Promise<string | null> {
    try {
      await this.#restartRuntimeIfSupported(reason);
    } catch (error) {
      const message = formatError(error);
      console.warn(`[desktop:extensions] runtime refresh for "${reason}" failed. ${message}`);
      return message;
    }
    if (opts.reloadMcpServers) {
      try {
        await this.#manager.request("config/mcpServer/reload", {});
      } catch (error) {
        const message = formatError(error);
        console.warn(`[desktop:extensions] config/mcpServer/reload for "${reason}" failed. ${message}`);
        return message;
      }
    }
    return null;
  }

  async getOverview(
    request: DesktopExtensionOverviewRequest = {},
  ): Promise<DesktopExtensionOverviewResult> {
    return this.#buildOverview(request, null);
  }

  async #buildOverview(
    request: DesktopExtensionOverviewRequest,
    runtimeError: string | null,
  ): Promise<DesktopExtensionOverviewResult> {
    const profile = await this.#resolveProfile();
    const profileCodexHome = resolveProfileCodexHome(profile.id, this.#env);
    const failedReads: DesktopExtensionBackendFailure[] = [];

    try {
      await quarantineInvalidPluginMcpEntries(profileCodexHome);
    } catch (error) {
      console.warn(`[desktop:extensions] plugin MCP quarantine (canonical sweep) failed. ${formatError(error)}`);
    }
    const [configResult, pluginResult, appResult, mcpResult, skillResult, accountResult] = await Promise.all([
      this.#requestOrFallback<ConfigReadResult>("config/read", { includeLayers: false }, { config: null }, failedReads),
      this.#requestOrFallback<unknown>("plugin/list", {
        cwds: [profileCodexHome],
        forceRemoteSync: Boolean(request.forceRefetch),
      }, { marketplaces: [] }, failedReads),
      this.#requestOrFallback<unknown>("app/list", {
        cursor: null,
        forceRefetch: Boolean(request.forceRefetch),
        limit: 100,
      }, { data: [] }, failedReads),
      this.#requestOrFallback<unknown>("mcpServerStatus/list", {
        cursor: null,
        limit: 100,
      }, { data: [] }, failedReads),
      this.#requestOrFallback<unknown>("skills/list", {
        cwds: [profileCodexHome],
        forceReload: Boolean(request.forceRefetch),
      }, { data: [] }, failedReads),
      this.#requestOrFallback<AccountReadResult>("account/read", { refreshToken: false }, {}, failedReads),
    ]);

    const localConfigToggles = await readLocalConfigToggles(profileCodexHome);
    const config = mergeConfigWithLocalToggles(configResult?.config ?? null, localConfigToggles);
    const selectedProvider = resolveSelectedProvider({
      accountType: firstString(accountResult?.account?.type),
      authMode: firstString(accountResult?.authMode),
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

    const normalizedPlugins = normalizePlugins(pluginResult, asRecord(config?.plugins));
    const pluginSourcePaths = uniqueStrings(normalizedPlugins.map((plugin) => plugin.sourcePath));
    if (pluginSourcePaths.length > 0) {
      try {
        await quarantineInvalidPluginMcpEntries(profileCodexHome, pluginSourcePaths);
      } catch (error) {
        console.warn(`[desktop:extensions] plugin MCP quarantine (per-plugin sweep) failed. ${formatError(error)}`);
      }
    }
    const enriched = await enrichPluginsWithLocalMetadata(normalizedPlugins, profileCodexHome);
    const plugins = await resolvePluginIcons(enriched.plugins);
    const metadataByPluginId = enriched.metadataByPluginId;
    const appListFailed = failedReads.some((entry) => entry.method === "app/list");
    const mcpStatusFailed = failedReads.some((entry) => entry.method === "mcpServerStatus/list");
    const apps = backfillAppPluginDisplayNames(
      appListFailed
        ? buildFallbackAppsFromPluginMetadata(
            normalizeApps(appResult, asRecord(config?.apps)),
            plugins,
            metadataByPluginId,
            asRecord(config?.apps),
          )
        : normalizeApps(appResult, asRecord(config?.apps)),
      plugins,
    );
    const skills = mergeSkills(
      normalizeSkills(skillResult),
      plugins,
      metadataByPluginId,
    );
    const mcpServers = mcpStatusFailed
      ? buildFallbackMcpServersFromPluginMetadata(
          normalizeMcpServersWithOptions(mcpResult, asRecord(config?.mcp_servers), { runtimeStateKnown: false }),
          plugins,
          metadataByPluginId,
          asRecord(config?.mcp_servers),
        )
      : normalizeMcpServers(mcpResult, asRecord(config?.mcp_servers));
    const managedExtensions = buildManagedExtensions({
      plugins,
      apps,
      mcpServers,
      skills,
      metadataByPluginId,
    });

    const invalidMcpEntries: DesktopExtensionPluginMcpIssue[] = [];
    const seenInvalidKeys = new Set<string>();
    const addInvalidEntry = (entry: DesktopExtensionPluginMcpIssue) => {
      const key = `${entry.sourcePath ?? ""}\u0000${entry.serverId}`;
      if (seenInvalidKeys.has(key)) {
        return;
      }
      seenInvalidKeys.add(key);
      invalidMcpEntries.push(entry);
    };
    const pluginNameBySourcePath = new Map<string, string>();
    for (const plugin of normalizedPlugins) {
      const resolved = plugin.sourcePath ? path.resolve(plugin.sourcePath) : null;
      if (resolved) {
        pluginNameBySourcePath.set(resolved, plugin.name);
      }
    }
    try {
      for (const entry of await readQuarantinedPluginMcpEntries(profileCodexHome, pluginSourcePaths)) {
        const resolved = entry.sourcePath ? path.resolve(entry.sourcePath) : null;
        const friendlyName = resolved ? pluginNameBySourcePath.get(resolved) ?? null : null;
        addInvalidEntry(friendlyName ? { ...entry, pluginName: friendlyName } : entry);
      }
    } catch (error) {
      console.warn(`[desktop:extensions] reading quarantine manifests failed. ${formatError(error)}`);
    }
    for (const metadata of metadataByPluginId.values()) {
      for (const entry of metadata.invalidMcpEntries) {
        addInvalidEntry(entry);
      }
    }

    const health: DesktopExtensionHealth = {
      backend: {
        failedReads,
        lastRuntimeError: runtimeError,
        suspectedMcpServerIds: extractSuspectedMcpServerIds(runtimeError),
      },
      pluginMcp: {
        invalidEntries: invalidMcpEntries,
      },
    };

    return {
      contractVersion: 1,
      provider,
      managedExtensions,
      plugins,
      apps,
      mcpServers,
      skills,
      health,
    };
  }

  async readPluginDetail(request: DesktopPluginDetailRequest): Promise<DesktopPluginDetailResult> {
    const profile = await this.#resolveProfile();
    const profileCodexHome = resolveProfileCodexHome(profile.id, this.#env);
    const overview = await this.getOverview({ forceRefetch: true });
    const plugin = overview.plugins.find((entry) => entry.id === request.pluginId) ?? null;
    if (!plugin) {
      throw new Error("Sense-1 could not find that plugin in the current profile.");
    }

    if (!plugin.marketplacePath) {
      return await readLocalPluginDetail(plugin, profileCodexHome);
    }

    const readResult = await this.#requestOrFallback<PluginReadResult | null>(
      "plugin/read",
      {
        marketplacePath: plugin.marketplacePath,
        pluginId: plugin.id,
        pluginName: plugin.name,
      },
      null,
    );
    const readPlugin = asRecord(readResult?.plugin);
    if (Object.keys(readPlugin).length === 0) {
      return await readLocalPluginDetail(plugin, profileCodexHome);
    }

    const interfaceRecord = asRecord(readPlugin.interface);
    const metadata = await readPluginLocalMetadata(plugin, profileCodexHome);
    const skills = pluginDetailSkillsFromRaw(readPlugin.skills);
    const apps = uniqueStrings([
      ...asStringArray(readPlugin.apps).map((entry) => firstString(entry)),
      ...((Array.isArray(readPlugin.apps) ? readPlugin.apps : []).map((entry) => firstNamedString(entry))),
      ...metadata.appIds,
    ]);
    const mcpServers = uniqueStrings([
      ...asStringArray(readPlugin.mcpServers).map((entry) => firstString(entry)),
      ...((Array.isArray(readPlugin.mcpServers) ? readPlugin.mcpServers : []).map((entry) => firstNamedString(entry))),
      ...metadata.mcpServerIds,
    ]);

    return {
      pluginId: plugin.id,
      name: plugin.name,
      displayName: firstString(interfaceRecord.displayName, plugin.displayName, plugin.name, plugin.id) ?? plugin.id,
      description: firstString(interfaceRecord.shortDescription, plugin.description),
      marketplaceName: plugin.marketplaceName,
      marketplacePath: plugin.marketplacePath,
      sourcePath: firstString(asRecord(readPlugin.source).path, metadata.sourcePath, plugin.sourcePath),
      websiteUrl: firstString(interfaceRecord.websiteUrl, plugin.websiteUrl),
      capabilities: uniqueStrings([
        ...asStringArray(interfaceRecord.capabilities),
        ...plugin.capabilities,
      ]),
      skills: skills.length > 0 ? skills : metadata.skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        path: skill.path,
      })),
      apps,
      mcpServers,
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
    const installedManagedPlugin =
      installedPlugin ? findManagedExtension(postInstallOverview, "plugin", installedPlugin.id) : null;
    const installedPluginId = firstString(installedPlugin?.id, request.pluginId) ?? request.pluginId;
    const appIdsToEnable = new Set<string>(installedPlugin?.appIds ?? []);
    const mcpServerIdsToEnable = new Set<string>(installedManagedPlugin?.includedMcpServerIds ?? []);
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
      keyPath: `${configSectionKeyPath("plugins", installedPluginId)}.enabled`,
      mergeStrategy: "upsert",
      value: true,
    });

    for (const appId of appIdsToEnable) {
      batchEdits.push({
        keyPath: `${configSectionKeyPath("apps", appId)}.enabled`,
        mergeStrategy: "upsert",
        value: true,
      });
    }

    for (const serverId of mcpServerIdsToEnable) {
      batchEdits.push({
        keyPath: `${configSectionKeyPath("mcp_servers", serverId)}.enabled`,
        mergeStrategy: "upsert",
        value: true,
      });
    }

    await this.#manager.request("config/batchWrite", {
      edits: batchEdits,
    });
    const runtimeError = await this.#safeRuntimeRefresh("plugin-install", {
      reloadMcpServers: mcpServerIdsToEnable.size > 0,
    });

    const finalOverview = await this.#buildOverview({ forceRefetch: true }, runtimeError);
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
      await this.#openManagedAuth(installUrl);
    }

    return finalOverview;
  }

  async uninstallPlugin(request: DesktopPluginUninstallRequest): Promise<DesktopExtensionOverviewResult> {
    const profile = await this.#resolveProfile();
    const profileCodexHome = resolveProfileCodexHome(profile.id, this.#env);
    const currentOverview = await this.getOverview({ forceRefetch: true });
    const plugin = currentOverview.plugins.find((entry) => entry.id === request.pluginId) ?? null;
    const managedPlugin = findManagedExtension(currentOverview, "plugin", request.pluginId);
    if (!plugin) {
      throw new Error("Sense-1 could not find that plugin in the current profile.");
    }

    const removablePluginRoot = firstString(plugin.sourcePath);
    const profileOwnedPlugin = Boolean(removablePluginRoot && isSubpath(profileCodexHome, removablePluginRoot));
    let uninstalledViaRuntime = false;

    if (plugin.marketplacePath) {
      try {
        await this.#manager.request("plugin/uninstall", {
          marketplacePath: plugin.marketplacePath,
          pluginId: plugin.id,
          pluginName: plugin.name,
        });
        uninstalledViaRuntime = true;
      } catch (error) {
        if (!profileOwnedPlugin) {
          throw error;
        }
      }
    }

    if (!uninstalledViaRuntime) {
      if (!profileOwnedPlugin || !removablePluginRoot) {
        throw new Error("This plugin is not profile-owned, so Sense-1 could not remove it locally.");
      }
      await fs.rm(removablePluginRoot, { force: true, recursive: true });
      const marketplacePath = firstString(plugin.marketplacePath);
      if (marketplacePath && isSubpath(profileCodexHome, marketplacePath)) {
        await removeProfileMarketplacePluginEntry(marketplacePath, plugin);
      }
    }
    await this.#manager.request("config/batchWrite", {
      edits: [
        {
          keyPath: `${configSectionKeyPath("plugins", request.pluginId)}.enabled`,
          mergeStrategy: "upsert",
          value: false,
        },
        ...pluginCascadeDisableEdits(
          currentOverview,
          request.pluginId,
          plugin.appIds,
          managedPlugin?.includedMcpServerIds ?? [],
        ),
      ],
    });
    const runtimeError = await this.#safeRuntimeRefresh("plugin-uninstall", {
      reloadMcpServers: (managedPlugin?.includedMcpServerIds.length ?? 0) > 0,
    });
    return await this.#buildOverview({ forceRefetch: true }, runtimeError);
  }

  async setPluginEnabled(request: DesktopPluginEnabledRequest): Promise<DesktopExtensionOverviewResult> {
    const currentOverview = await this.getOverview();
    const plugin = currentOverview.plugins.find((entry) => entry.id === request.pluginId) ?? null;
    const managedPlugin = findManagedExtension(currentOverview, "plugin", request.pluginId);
    const includedMcpServerIds = managedPlugin?.includedMcpServerIds ?? [];

    const edits: Array<{ keyPath: string; mergeStrategy: "upsert"; value: unknown }> = [
      {
        keyPath: `${configSectionKeyPath("plugins", request.pluginId)}.enabled`,
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
          keyPath: `${configSectionKeyPath("apps", appId)}.enabled`,
          mergeStrategy: "upsert",
          value: true,
        });
      }
    }

    if (request.enabled) {
      for (const serverId of includedMcpServerIds) {
        edits.push({
          keyPath: `${configSectionKeyPath("mcp_servers", serverId)}.enabled`,
          mergeStrategy: "upsert",
          value: true,
        });
      }
    }

    if (!request.enabled) {
      edits.push(
        ...pluginCascadeDisableEdits(
          currentOverview,
          request.pluginId,
          plugin?.appIds ?? [],
          includedMcpServerIds,
        ),
      );
    }

    await this.#manager.request("config/batchWrite", {
      edits,
    });
    const runtimeError = await this.#safeRuntimeRefresh("plugin-enabled", {
      reloadMcpServers: includedMcpServerIds.length > 0,
    });
    return await this.#buildOverview({ forceRefetch: true }, runtimeError);
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
          keyPath: `${configSectionKeyPath("apps", request.appId)}.enabled`,
          mergeStrategy: "upsert",
          value: true,
        },
      ],
    });
    const runtimeError = await this.#safeRuntimeRefresh("app-install", { reloadMcpServers: false });
    await this.#openManagedAuth(request.installUrl);
    return await this.#buildOverview({ forceRefetch: true }, runtimeError);
  }

  async removeApp(request: DesktopAppRemoveRequest): Promise<DesktopExtensionOverviewResult> {
    await this.#manager.request("config/batchWrite", {
      edits: [
        {
          keyPath: `${configSectionKeyPath("apps", request.appId)}.enabled`,
          mergeStrategy: "upsert",
          value: false,
        },
      ],
    });
    const runtimeError = await this.#safeRuntimeRefresh("app-remove", { reloadMcpServers: false });
    return await this.#buildOverview({ forceRefetch: true }, runtimeError);
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
          keyPath: `${configSectionKeyPath("apps", request.appId)}.enabled`,
          mergeStrategy: "upsert",
          value: request.enabled,
        },
      ],
    });
    const runtimeError = await this.#safeRuntimeRefresh("app-enabled", { reloadMcpServers: false });
    return await this.#buildOverview({ forceRefetch: true }, runtimeError);
  }

  async startMcpServerAuth(request: DesktopMcpServerAuthRequest): Promise<DesktopMcpServerAuthResult> {
    const result = await this.#manager.request("mcpServer/oauth/login", {
      id: request.serverId,
      serverId: request.serverId,
    }) as MpcOAuthLoginResult;
    const authorizationUrl = firstString(result.authorizationUrl, result.url);
    if (!authorizationUrl) {
      throw new Error("Sense-1 could not start MCP authentication for that server.");
    }

    await this.#openExternal(authorizationUrl);
    return {
      authorizationUrl,
      overview: await this.getOverview({ forceRefetch: true }),
    };
  }

  async setMcpServerEnabled(request: DesktopMcpServerEnabledRequest): Promise<DesktopExtensionOverviewResult> {
    await this.#manager.request("config/value/write", {
      keyPath: `${configSectionKeyPath("mcp_servers", request.serverId)}.enabled`,
      mergeStrategy: "upsert",
      value: request.enabled,
    });
    let runtimeError: string | null = null;
    try {
      await this.#manager.request("config/mcpServer/reload", {});
    } catch (error) {
      runtimeError = formatError(error);
      console.warn(`[desktop:extensions] config/mcpServer/reload for "mcp-enabled" failed. ${runtimeError}`);
    }
    return await this.#buildOverview({ forceRefetch: true }, runtimeError);
  }

  async readSkillDetail(request: DesktopSkillDetailRequest): Promise<DesktopSkillDetailResult> {
    const overview = await this.getOverview();
    const skill = overview.skills.find((entry) => path.resolve(entry.path) === path.resolve(request.path)) ?? null;
    if (!skill) {
      throw new Error("Sense-1 could not find that skill in the current profile.");
    }

    return {
      path: skill.path,
      name: skill.name,
      description: skill.description,
      scope: skill.scope,
      cwd: skill.cwd,
      content: await fs.readFile(skill.path, "utf8"),
    };
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
    const runtimeError = await this.#safeRuntimeRefresh("skill-uninstall", { reloadMcpServers: false });
    return await this.#buildOverview({ forceRefetch: true }, runtimeError);
  }
}
