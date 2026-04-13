import { useMemo, useState } from "react";
import { Blocks, Cable, PlugZap, Sparkles, Trash2 } from "lucide-react";

import { Button } from "./ui/button";
import type { DesktopAppRecord, DesktopExtensionOverviewResult, DesktopPluginRecord, DesktopSkillRecord } from "../../main/contracts";

type PluginsPageProps = {
  error: string | null;
  installPlugin: (request: { marketplacePath: string; pluginId: string; pluginName: string }) => Promise<unknown>;
  loading: boolean;
  onCreatePlugin: () => void;
  onCreateSkill: () => void;
  openAppInstall: (request: { appId: string; installUrl: string }) => Promise<unknown>;
  onRefresh: () => void;
  overview: DesktopExtensionOverviewResult | null;
  removeApp: (request: { appId: string }) => Promise<unknown>;
  setAppEnabled: (request: { appId: string; enabled: boolean }) => Promise<unknown>;
  setMcpServerEnabled: (request: { serverId: string; enabled: boolean }) => Promise<unknown>;
  setPluginEnabled: (request: { pluginId: string; enabled: boolean }) => Promise<unknown>;
  setSkillEnabled: (request: { path: string; enabled: boolean }) => Promise<unknown>;
  uninstallPlugin: (request: { pluginId: string }) => Promise<unknown>;
  uninstallSkill: (request: { path: string }) => Promise<unknown>;
};

type PluginsTabId = "plugins" | "apps" | "mcps" | "skills";
type InventoryFilter = "all" | "enabled" | "disabled" | "available" | "needsAuth";
type SourceFilter = "all" | "profile" | "installed" | "builtIn";

const TABS: Array<{ id: PluginsTabId; label: string; icon: typeof PlugZap }> = [
  { id: "plugins", label: "Plugins", icon: PlugZap },
  { id: "apps", label: "Apps", icon: Blocks },
  { id: "mcps", label: "MCPs", icon: Cable },
  { id: "skills", label: "Skills", icon: Sparkles },
];

const INVENTORY_FILTERS: Array<{ id: InventoryFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "enabled", label: "Enabled" },
  { id: "disabled", label: "Disabled" },
  { id: "available", label: "Available" },
  { id: "needsAuth", label: "Needs auth" },
];

const SOURCE_FILTERS: Array<{ id: SourceFilter; label: string }> = [
  { id: "all", label: "Any source" },
  { id: "profile", label: "Profile" },
  { id: "installed", label: "Installed" },
  { id: "builtIn", label: "Built-in" },
];

function normalizeInventoryPath(value: string | null | undefined): string {
  return typeof value === "string" ? value.replaceAll("\\", "/") : "";
}

function EmptyState({ message }: { message: string }) {
  return <p className="rounded-2xl bg-surface-soft px-4 py-3 text-sm text-ink-soft">{message}</p>;
}

function FilterBar<T extends string>({
  active,
  items,
  onSelect,
}: {
  active: T;
  items: Array<{ id: T; label: string }>;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          className={`rounded-full px-3 py-1.5 text-xs transition-colors ${item.id === active ? "bg-ink text-white" : "bg-surface-soft text-ink hover:bg-surface-strong"}`}
          key={item.id}
          onClick={() => onSelect(item.id)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function pluginSource(plugin: DesktopPluginRecord): SourceFilter {
  if (!plugin.installed) {
    return "builtIn";
  }

  const normalizedPath = normalizeInventoryPath(plugin.sourcePath);
  if (normalizedPath.includes("/codex-home/plugins/") && !normalizedPath.includes("/codex-home/plugins/cache/")) {
    return "profile";
  }

  return "installed";
}

function skillSource(skill: DesktopSkillRecord): SourceFilter {
  if (skill.scope === "plugin") {
    return "installed";
  }
  if (normalizeInventoryPath(skill.path).includes("/codex-home/skills/")) {
    return "profile";
  }
  return "builtIn";
}

function appSource(app: DesktopAppRecord): SourceFilter {
  if (app.pluginDisplayNames.length > 0) {
    return "installed";
  }
  return "builtIn";
}

function pluginStatus(plugin: DesktopPluginRecord, authApp: DesktopAppRecord | null): InventoryFilter {
  if (!plugin.installed) {
    return "available";
  }
  if (authApp) {
    return "needsAuth";
  }
  return plugin.enabled ? "enabled" : "disabled";
}

function appStatus(app: DesktopAppRecord): InventoryFilter {
  if (!app.isAccessible && app.installUrl) {
    return "needsAuth";
  }
  return app.isEnabled ? "enabled" : "disabled";
}

function skillStatus(skill: DesktopSkillRecord): InventoryFilter {
  return skill.enabled ? "enabled" : "disabled";
}

function badgeClass(status: InventoryFilter): string {
  if (status === "enabled") {
    return "bg-surface-soft text-ink";
  }
  if (status === "needsAuth") {
    return "bg-surface-low text-muted";
  }
  return "bg-surface-soft text-ink-muted";
}

function statusLabel(status: InventoryFilter): string {
  if (status === "needsAuth") {
    return "Needs auth";
  }
  if (status === "available") {
    return "Available";
  }
  return status === "enabled" ? "Enabled" : "Disabled";
}

function sourceLabel(source: SourceFilter): string {
  if (source === "builtIn") {
    return "Built-in";
  }
  if (source === "profile") {
    return "Profile";
  }
  if (source === "installed") {
    return "Installed";
  }
  return "Profile";
}

function matchesFilters({
  inventoryFilter,
  itemSource,
  sourceFilter,
  status,
}: {
  inventoryFilter: InventoryFilter;
  itemSource: SourceFilter;
  sourceFilter: SourceFilter;
  status: InventoryFilter;
}) {
  if (inventoryFilter !== "all" && status !== inventoryFilter) {
    return false;
  }
  if (sourceFilter !== "all" && itemSource !== sourceFilter) {
    return false;
  }
  return true;
}

export function PluginsPage({
  error,
  installPlugin,
  loading,
  onCreatePlugin,
  onCreateSkill,
  openAppInstall,
  onRefresh,
  overview,
  removeApp,
  setAppEnabled,
  setMcpServerEnabled,
  setPluginEnabled,
  setSkillEnabled,
  uninstallPlugin,
  uninstallSkill,
}: PluginsPageProps) {
  void removeApp;
  const [activeTab, setActiveTab] = useState<PluginsTabId>("plugins");
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const providerSummary = useMemo(() => overview?.provider.options ?? [], [overview?.provider.options]);
  const pluginAppsByDisplayName = useMemo(() => {
    const byDisplayName = new Map<string, DesktopAppRecord[]>();
    for (const app of overview?.apps ?? []) {
      for (const pluginDisplayName of app.pluginDisplayNames) {
        const existing = byDisplayName.get(pluginDisplayName) ?? [];
        existing.push(app);
        byDisplayName.set(pluginDisplayName, existing);
      }
    }
    return byDisplayName;
  }, [overview?.apps]);

  const filteredPlugins = useMemo(() => {
    return (overview?.plugins ?? []).filter((plugin) => {
      const relatedApps = [...new Map(
        [plugin.displayName, plugin.name, plugin.id]
          .flatMap((key) => (pluginAppsByDisplayName.get(key) ?? []).map((app) => [app.id, app] as const)),
      ).values()];
      const authApp = relatedApps.find((app) => !app.isAccessible && app.installUrl) ?? null;
      return matchesFilters({
        inventoryFilter,
        itemSource: pluginSource(plugin),
        sourceFilter,
        status: pluginStatus(plugin, authApp),
      });
    });
  }, [inventoryFilter, overview?.plugins, pluginAppsByDisplayName, sourceFilter]);

  const filteredApps = useMemo(() => {
    return (overview?.apps ?? []).filter((app) => matchesFilters({
      inventoryFilter,
      itemSource: appSource(app),
      sourceFilter,
      status: appStatus(app),
    }));
  }, [inventoryFilter, overview?.apps, sourceFilter]);

  const filteredSkills = useMemo(() => {
    return (overview?.skills ?? []).filter((skill) => matchesFilters({
      inventoryFilter,
      itemSource: skillSource(skill),
      sourceFilter,
      status: skillStatus(skill),
    }));
  }, [inventoryFilter, overview?.skills, sourceFilter]);

  async function runAction(actionKey: string, action: () => Promise<unknown>, successMessage: string | null = null) {
    setPendingActionKey(actionKey);
    setActionError(null);
    try {
      await action();
      setActionFeedback(successMessage);
    } catch (actionFailure) {
      setActionError(actionFailure instanceof Error ? actionFailure.message : "Could not complete that extension action.");
    } finally {
      setPendingActionKey(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <div className="border-b border-line/50 bg-white px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.11em] text-muted">Profile inventory</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">Plugins and integrations</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
              Manage the skills, plugins, apps, and MCP-backed tools installed for this Sense-1 profile. Enabled items are callable from any thread.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onCreatePlugin} variant="secondary">Create plugin</Button>
            <Button onClick={onCreateSkill} variant="secondary">Create skill</Button>
            <Button onClick={onRefresh} variant="default">Refresh</Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {providerSummary.map((provider) => (
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${provider.available ? "bg-surface-soft text-ink" : "bg-surface-low text-muted"}`}
              key={provider.id}
            >
              {provider.label}: {provider.available ? (provider.configured ? "configured" : "available") : "not detected"}
            </span>
          ))}
        </div>
      </div>

      <div className="border-b border-line/40 bg-white px-6 py-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = tab.id === activeTab;
            return (
              <button
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors ${active ? "bg-ink text-white" : "bg-surface-soft text-ink hover:bg-surface-strong"}`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <FilterBar active={inventoryFilter} items={INVENTORY_FILTERS} onSelect={setInventoryFilter} />
          {activeTab !== "mcps" ? <FilterBar active={sourceFilter} items={SOURCE_FILTERS} onSelect={setSourceFilter} /> : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {error ? (
          <p className="mb-4 rounded-2xl bg-surface-soft px-4 py-3 text-sm text-ink-soft">{error}</p>
        ) : null}
        {actionError ? (
          <p className="mb-4 rounded-2xl bg-surface-soft px-4 py-3 text-sm text-ink-soft">{actionError}</p>
        ) : null}
        {actionFeedback ? (
          <p className="mb-4 rounded-2xl bg-surface-soft px-4 py-3 text-sm text-ink-soft">{actionFeedback}</p>
        ) : null}
        {loading && !overview ? <EmptyState message="Loading extensions..." /> : null}

        {activeTab === "plugins" && overview ? (
          filteredPlugins.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {filteredPlugins.map((plugin) => {
                const relatedApps = [...new Map(
                  [plugin.displayName, plugin.name, plugin.id]
                    .flatMap((key) => (pluginAppsByDisplayName.get(key) ?? []).map((app) => [app.id, app] as const)),
                ).values()];
                const authApp = relatedApps.find((app) => !app.isAccessible && app.installUrl) ?? null;
                const status = pluginStatus(plugin, authApp);
                const installKey = `plugin-install:${plugin.id}`;
                const uninstallKey = `plugin-uninstall:${plugin.id}`;
                const connectKey = authApp ? `app-connect:${authApp.id}` : null;
                const enableKey = `plugin-enable:${plugin.id}`;
                const canInstall = !plugin.installed && plugin.installPolicy !== "NOT_AVAILABLE" && Boolean(plugin.marketplacePath);
                const source = pluginSource(plugin);
                const canUninstall = source === "profile";

                return (
                  <article className="rounded-3xl bg-white p-5 shadow-[0_12px_30px_rgba(10,15,20,0.05)]" key={plugin.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-ink">{plugin.displayName}</h2>
                        <p className="mt-1 text-sm text-ink-muted">{plugin.description ?? "No plugin description yet."}</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${badgeClass(status)}`}>
                          {statusLabel(status)}
                        </span>
                        <span className="rounded-full bg-surface-soft px-2.5 py-1 text-[11px] font-medium text-ink-muted">
                          {sourceLabel(source)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
                      {plugin.category ? <span>{plugin.category}</span> : null}
                      {plugin.capabilities.map((capability) => <span key={capability}>{capability}</span>)}
                    </div>
                    <div className="mt-5 flex items-center justify-between gap-3">
                      <p className="text-xs text-ink-muted">{plugin.websiteUrl ?? plugin.sourcePath ?? plugin.id}</p>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {!plugin.installed ? (
                          <Button
                            disabled={!canInstall || pendingActionKey === installKey}
                            onClick={() => {
                              const marketplacePath = plugin.marketplacePath;
                              if (!marketplacePath) {
                                return;
                              }
                              void runAction(
                                installKey,
                                async () => await installPlugin({
                                  marketplacePath,
                                  pluginId: plugin.id,
                                  pluginName: plugin.name,
                                }),
                                `Installed ${plugin.displayName} for this profile.`,
                              );
                            }}
                            variant="default"
                          >
                            Install
                          </Button>
                        ) : null}
                        {plugin.installed && authApp?.installUrl ? (
                          <Button
                            disabled={pendingActionKey === connectKey}
                            onClick={() => {
                              void runAction(
                                connectKey ?? `app-connect:${plugin.id}`,
                                async () => await openAppInstall({
                                  appId: authApp.id,
                                  installUrl: authApp.installUrl ?? "",
                                }),
                                `Opened ${authApp.name} in your browser. Finish the auth flow in your signed ChatGPT session and then refresh.`,
                              );
                            }}
                            variant="secondary"
                          >
                            Connect
                          </Button>
                        ) : null}
                        {plugin.installed ? (
                          <>
                            <Button
                              disabled={pendingActionKey === enableKey}
                              onClick={() => {
                                void runAction(
                                  enableKey,
                                  async () => await setPluginEnabled({ pluginId: plugin.id, enabled: !plugin.enabled }),
                                );
                              }}
                              variant={plugin.enabled ? "secondary" : "default"}
                            >
                              {plugin.enabled ? "Disable" : "Enable"}
                            </Button>
                            {canUninstall ? (
                              <Button
                                disabled={pendingActionKey === uninstallKey}
                                onClick={() => {
                                  void runAction(
                                    uninstallKey,
                                    async () => await uninstallPlugin({ pluginId: plugin.id }),
                                    `Removed ${plugin.displayName} from this profile.`,
                                  );
                                }}
                                variant="secondary"
                              >
                                <Trash2 className="size-4" />
                                Uninstall
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState message="No plugins match the current filters for this profile." />
          )
        ) : null}

        {activeTab === "apps" && overview ? (
          filteredApps.length > 0 ? (
            <div className="space-y-3">
              {filteredApps.map((app) => {
                const status = appStatus(app);
                return (
                  <article className="rounded-3xl bg-white p-5 shadow-[0_12px_30px_rgba(10,15,20,0.05)]" key={app.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-ink">{app.name}</h2>
                        <p className="mt-1 text-sm text-ink-muted">{app.description ?? "Connector details are managed by the upstream app configuration."}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${badgeClass(status)}`}>
                          {statusLabel(status)}
                        </span>
                        <span className="rounded-full bg-surface-soft px-2.5 py-1 text-[11px] font-medium text-ink-muted">
                          {sourceLabel(appSource(app))}
                        </span>
                        {app.isAccessible ? (
                          <Button
                            disabled={pendingActionKey === `app-enable:${app.id}`}
                            onClick={() => {
                              void runAction(
                                `app-enable:${app.id}`,
                                async () => await setAppEnabled({ appId: app.id, enabled: !app.isEnabled }),
                              );
                            }}
                            variant={app.isEnabled ? "secondary" : "default"}
                          >
                            {app.isEnabled ? "Disable" : "Enable"}
                          </Button>
                        ) : app.installUrl ? (
                          <Button
                            disabled={pendingActionKey === `app-connect:${app.id}`}
                            onClick={() => {
                              void runAction(
                                `app-connect:${app.id}`,
                                async () => await openAppInstall({ appId: app.id, installUrl: app.installUrl ?? "" }),
                                `Opened ${app.name} in your browser. Finish the auth flow in your signed ChatGPT session and then refresh.`,
                              );
                            }}
                            variant="default"
                          >
                            Connect
                          </Button>
                        ) : (
                          <Button disabled variant="secondary">
                            Unavailable
                          </Button>
                        )}
                      </div>
                    </div>
                    {app.installUrl ? <p className="mt-4 text-xs text-ink-muted">{app.installUrl}</p> : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState message="No apps match the current filters for this profile." />
          )
        ) : null}

        {activeTab === "mcps" && overview ? (
          overview.mcpServers.length > 0 ? (
            <div className="space-y-3">
              {overview.mcpServers.map((server) => (
                <article className="rounded-3xl bg-white p-5 shadow-[0_12px_30px_rgba(10,15,20,0.05)]" key={server.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-ink">{server.id}</h2>
                      <p className="mt-1 text-sm text-ink-muted">
                        {server.transport ? `${server.transport.toUpperCase()} transport` : "Configured MCP server"}
                        {server.state ? ` · ${server.state}` : ""}
                        {server.authStatus ? ` · ${server.authStatus}` : ""}
                      </p>
                    </div>
                    <Button
                      onClick={() => void setMcpServerEnabled({ serverId: server.id, enabled: !server.enabled })}
                      variant={server.enabled ? "secondary" : "default"}
                    >
                      {server.enabled ? "Disable" : "Enable"}
                    </Button>
                  </div>
                  <p className="mt-4 text-xs text-ink-muted">
                    {server.command ?? server.url ?? "No command or URL stored."} · {server.toolsCount} tools · {server.resourcesCount} resources
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState message="No MCP servers are configured for this profile yet." />
          )
        ) : null}

        {activeTab === "skills" && overview ? (
          filteredSkills.length > 0 ? (
            <div className="space-y-3">
              {filteredSkills.map((skill) => {
                const source = skillSource(skill);
                const canUninstall = source === "profile";
                const uninstallKey = `skill-uninstall:${skill.path}`;
                return (
                  <article className="rounded-3xl bg-white p-5 shadow-[0_12px_30px_rgba(10,15,20,0.05)]" key={skill.path}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-ink">{skill.name}</h2>
                        <p className="mt-1 text-sm text-ink-muted">{skill.description ?? "No skill description yet."}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${badgeClass(skillStatus(skill))}`}>
                          {statusLabel(skillStatus(skill))}
                        </span>
                        <span className="rounded-full bg-surface-soft px-2.5 py-1 text-[11px] font-medium text-ink-muted">
                          {sourceLabel(source)}
                        </span>
                        <Button
                          onClick={() => void setSkillEnabled({ path: skill.path, enabled: !skill.enabled })}
                          variant={skill.enabled ? "secondary" : "default"}
                        >
                          {skill.enabled ? "Disable" : "Enable"}
                        </Button>
                        {canUninstall ? (
                          <Button
                            disabled={pendingActionKey === uninstallKey}
                            onClick={() => {
                              void runAction(
                                uninstallKey,
                                async () => await uninstallSkill({ path: skill.path }),
                                `Removed ${skill.name} from this profile.`,
                              );
                            }}
                            variant="secondary"
                          >
                            <Trash2 className="size-4" />
                            Uninstall
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-4 text-xs text-ink-muted">{skill.scope ?? "custom"} · {skill.path}</p>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState message="No skills match the current filters for this profile." />
          )
        ) : null}
      </div>
    </div>
  );
}
