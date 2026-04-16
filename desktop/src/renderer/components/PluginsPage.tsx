import { useCallback, useMemo, useRef, useState } from "react";
import { Blocks, Cable, ChevronDown, EllipsisVertical, Filter, Plus, PlugZap, RefreshCw, Search, Sparkles, Trash2 } from "lucide-react";

import { Button } from "./ui/button";
import type { DesktopAppRecord, DesktopExtensionOverviewResult, DesktopManagedExtensionKind, DesktopPluginRecord, DesktopSkillRecord } from "../../main/contracts";
import { PluginDetailView } from "./extensions/PluginDetailView";
import { SkillDetailModal } from "./extensions/SkillDetailModal";
import { AppDetailView } from "./extensions/AppDetailView";
import { McpDetailView } from "./extensions/McpDetailView";

type ExtensionIconKind = "plugin" | "app" | "mcp" | "skill";

const FALLBACK_ICON: Record<ExtensionIconKind, typeof PlugZap> = {
  plugin: PlugZap,
  app: Blocks,
  mcp: Cable,
  skill: Sparkles,
};

function ExtensionIcon({ kind, src }: { kind: ExtensionIconKind; src?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <img alt="" className="size-7 shrink-0 rounded-md object-contain" onError={() => setFailed(true)} src={src} />;
  }
  const Icon = FALLBACK_ICON[kind];
  return (
    <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-strong">
      <Icon className="size-3.5 text-muted" />
    </div>
  );
}

type PluginsPageProps = {
  error: string | null;
  installPlugin: (request: { marketplacePath: string; pluginId: string; pluginName: string }) => Promise<unknown>;
  loading: boolean;
  onCreatePlugin: () => void;
  onCreateSkill: () => void;
  onTryInChat?: (extensionName: string) => void;
  openAppInstall: (request: { appId: string; installUrl: string }) => Promise<unknown>;
  onRefresh: () => void;
  overview: DesktopExtensionOverviewResult | null;
  removeApp: (request: { appId: string }) => Promise<unknown>;
  setAppEnabled: (request: { appId: string; enabled: boolean }) => Promise<unknown>;
  setMcpServerEnabled: (request: { serverId: string; enabled: boolean }) => Promise<unknown>;
  setPluginEnabled: (request: { pluginId: string; enabled: boolean }) => Promise<unknown>;
  setSkillEnabled: (request: { path: string; enabled: boolean }) => Promise<unknown>;
  startMcpServerAuth?: (request: { serverId: string }) => Promise<unknown>;
  uninstallPlugin: (request: { pluginId: string }) => Promise<unknown>;
  uninstallSkill: (request: { path: string }) => Promise<unknown>;
};

type PluginsTabId = "plugins" | "apps" | "mcps" | "skills";
type InventoryFilter = "all" | "enabled" | "disabled" | "available" | "needsAuth";
type SourceFilter = "all" | "profile" | "installed" | "builtIn";

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

function matchesSearch(query: string, ...fields: Array<string | null | undefined>): boolean {
  if (!query) {
    return true;
  }
  const lower = query.toLowerCase();
  return fields.some((field) => typeof field === "string" && field.toLowerCase().includes(lower));
}

// ---------------------------------------------------------------------------
// Toggle switch (inline — no external dependency)
// ---------------------------------------------------------------------------

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange?: (next: boolean) => void }) {
  return (
    <button
      aria-checked={checked}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-40 ${checked ? "bg-accent" : "bg-ink/15"}`}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      role="switch"
      type="button"
    >
      <span className={`pointer-events-none block size-3.5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-[1.125rem]" : "translate-x-[0.1875rem]"}`} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Overflow menu (click-outside closes)
// ---------------------------------------------------------------------------

function OverflowMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function handleBlur(event: React.FocusEvent) {
    if (ref.current && !ref.current.contains(event.relatedTarget)) {
      setOpen(false);
    }
  }

  return (
    <div className="relative" onBlur={handleBlur} ref={ref}>
      <button
        className="flex size-6 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-strong hover:text-ink"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <EllipsisVertical className="size-3.5" />
      </button>
      {open ? (
        <div className="absolute right-0 top-7 z-50 min-w-[10rem] rounded-xl border border-line/40 bg-white py-1 shadow-lg">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function OverflowItem({ children, destructive, disabled, onClick }: { children: React.ReactNode; destructive?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${destructive ? "text-red-500 hover:bg-red-50" : "text-ink hover:bg-surface-soft"} disabled:pointer-events-none disabled:opacity-40`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Filter popover
// ---------------------------------------------------------------------------

function FilterPopover({
  inventoryFilter,
  setInventoryFilter,
  sourceFilter,
  setSourceFilter,
  showSourceFilter,
}: {
  inventoryFilter: InventoryFilter;
  setInventoryFilter: (v: InventoryFilter) => void;
  sourceFilter: SourceFilter;
  setSourceFilter: (v: SourceFilter) => void;
  showSourceFilter: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isFiltered = inventoryFilter !== "all" || sourceFilter !== "all";

  function handleBlur(event: React.FocusEvent) {
    if (ref.current && !ref.current.contains(event.relatedTarget)) {
      setOpen(false);
    }
  }

  return (
    <div className="relative" onBlur={handleBlur} ref={ref}>
      <button
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${isFiltered ? "bg-accent/10 text-accent" : "text-ink-muted hover:bg-surface-soft hover:text-ink"}`}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <Filter className="size-3" />
        Filter
        {isFiltered ? <span className="size-1.5 rounded-full bg-accent" /> : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-8 z-50 w-56 rounded-xl border border-line/40 bg-white p-3 shadow-lg">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">Status</p>
          <div className="flex flex-wrap gap-1">
            {INVENTORY_FILTERS.map((f) => (
              <button
                className={`rounded-md px-2 py-1 text-[11px] transition-colors ${f.id === inventoryFilter ? "bg-ink text-white" : "bg-surface-soft text-ink hover:bg-surface-strong"}`}
                key={f.id}
                onClick={() => setInventoryFilter(f.id)}
                type="button"
              >
                {f.label}
              </button>
            ))}
          </div>
          {showSourceFilter ? (
            <>
              <p className="mb-2 mt-3 text-[10px] font-semibold uppercase tracking-widest text-muted">Source</p>
              <div className="flex flex-wrap gap-1">
                {SOURCE_FILTERS.map((f) => (
                  <button
                    className={`rounded-md px-2 py-1 text-[11px] transition-colors ${f.id === sourceFilter ? "bg-ink text-white" : "bg-surface-soft text-ink hover:bg-surface-strong"}`}
                    key={f.id}
                    onClick={() => setSourceFilter(f.id)}
                    type="button"
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {isFiltered ? (
            <button
              className="mt-3 w-full rounded-md px-2 py-1 text-[11px] text-muted transition-colors hover:bg-surface-soft hover:text-ink"
              onClick={() => {
                setInventoryFilter("all");
                setSourceFilter("all");
              }}
              type="button"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create menu
// ---------------------------------------------------------------------------

function CreateMenu({ onCreatePlugin, onCreateSkill }: { onCreatePlugin: () => void; onCreateSkill: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function handleBlur(event: React.FocusEvent) {
    if (ref.current && !ref.current.contains(event.relatedTarget)) {
      setOpen(false);
    }
  }

  return (
    <div className="relative" onBlur={handleBlur} ref={ref}>
      <button
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <Plus className="size-3" />
        Create
        <ChevronDown className="size-3" />
      </button>
      {open ? (
        <div className="absolute right-0 top-8 z-50 min-w-[9rem] rounded-xl border border-line/40 bg-white py-1 shadow-lg">
          <button className="flex w-full items-center px-3 py-1.5 text-left text-xs text-ink transition-colors hover:bg-surface-soft" onClick={() => { onCreatePlugin(); setOpen(false); }} type="button">Plugin</button>
          <button className="flex w-full items-center px-3 py-1.5 text-left text-xs text-ink transition-colors hover:bg-surface-soft" onClick={() => { onCreateSkill(); setOpen(false); }} type="button">Skill</button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ message }: { message: string }) {
  return <p className="py-8 text-center text-sm text-muted">{message}</p>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PluginsPage({
  error,
  installPlugin,
  loading,
  onCreatePlugin,
  onCreateSkill,
  onTryInChat,
  openAppInstall,
  onRefresh,
  overview,
  removeApp,
  setAppEnabled,
  setMcpServerEnabled,
  setPluginEnabled,
  setSkillEnabled,
  startMcpServerAuth,
  uninstallPlugin,
  uninstallSkill,
}: PluginsPageProps) {
  const [activeTab, setActiveTab] = useState<PluginsTabId>("plugins");
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);

  // Entity detail navigation state
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedEntityKind, setSelectedEntityKind] = useState<DesktopManagedExtensionKind | null>(null);

  const selectEntity = useCallback((id: string, kind: DesktopManagedExtensionKind) => {
    setSelectedEntityId(id);
    setSelectedEntityKind(kind);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedEntityId(null);
    setSelectedEntityKind(null);
  }, []);

  // Look up the managed record for the selected entity
  const selectedManagedRecord = useMemo(() => {
    if (!selectedEntityId || !selectedEntityKind || !overview) return null;
    return overview.managedExtensions.find(
      (e) => e.id === selectedEntityId && e.kind === selectedEntityKind,
    ) ?? null;
  }, [overview, selectedEntityId, selectedEntityKind]);

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
      if (!matchesSearch(searchQuery, plugin.displayName, plugin.name, plugin.description, plugin.category)) {
        return false;
      }
      const relatedApps = [...new Map(
        [plugin.displayName, plugin.name, plugin.id]
          .flatMap((key) => (pluginAppsByDisplayName.get(key) ?? []).map((app) => [app.id, app] as const)),
      ).values()];
      const authApp = relatedApps.find((app) => !app.isAccessible && app.installUrl) ?? null;
      return matchesFilters({ inventoryFilter, itemSource: pluginSource(plugin), sourceFilter, status: pluginStatus(plugin, authApp) });
    });
  }, [inventoryFilter, overview?.plugins, pluginAppsByDisplayName, searchQuery, sourceFilter]);

  const filteredApps = useMemo(() => {
    return (overview?.apps ?? []).filter((app) => {
      if (!matchesSearch(searchQuery, app.name, app.description)) {
        return false;
      }
      return matchesFilters({ inventoryFilter, itemSource: appSource(app), sourceFilter, status: appStatus(app) });
    });
  }, [inventoryFilter, overview?.apps, searchQuery, sourceFilter]);

  const filteredMcps = useMemo(() => {
    return (overview?.mcpServers ?? []).filter((server) => matchesSearch(searchQuery, server.id, server.command, server.url));
  }, [overview?.mcpServers, searchQuery]);

  const filteredSkills = useMemo(() => {
    return (overview?.skills ?? []).filter((skill) => {
      if (!matchesSearch(searchQuery, skill.name, skill.description, skill.scope)) {
        return false;
      }
      return matchesFilters({ inventoryFilter, itemSource: skillSource(skill), sourceFilter, status: skillStatus(skill) });
    });
  }, [inventoryFilter, overview?.skills, searchQuery, sourceFilter]);

  const tabCounts = useMemo(() => ({
    plugins: overview?.plugins?.length ?? 0,
    apps: overview?.apps?.length ?? 0,
    mcps: overview?.mcpServers?.length ?? 0,
    skills: overview?.skills?.length ?? 0,
  }), [overview?.plugins?.length, overview?.apps?.length, overview?.mcpServers?.length, overview?.skills?.length]);

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

  function resolvePluginAuth(plugin: DesktopPluginRecord): DesktopAppRecord | null {
    const relatedApps = [...new Map(
      [plugin.displayName, plugin.name, plugin.id]
        .flatMap((key) => (pluginAppsByDisplayName.get(key) ?? []).map((app) => [app.id, app] as const)),
    ).values()];
    return relatedApps.find((app) => !app.isAccessible && app.installUrl) ?? null;
  }

  const TABS: Array<{ id: PluginsTabId; label: string; count: number }> = [
    { id: "plugins", label: "Plugins", count: tabCounts.plugins },
    { id: "apps", label: "Apps", count: tabCounts.apps },
    { id: "mcps", label: "MCPs", count: tabCounts.mcps },
    { id: "skills", label: "Skills", count: tabCounts.skills },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      {/* ---- Toolbar ---- */}
      <div className="flex items-center gap-1 border-b border-line/40 px-4 py-2">
        {/* Tabs with counts */}
        <nav className="flex items-center gap-0.5">
          {TABS.map((tab) => (
            <button
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${tab.id === activeTab ? "bg-ink text-white" : "text-ink-muted hover:bg-surface-soft hover:text-ink"}`}
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); clearSelection(); }}
              type="button"
            >
              {tab.label}
              <span className={`ml-1 ${tab.id === activeTab ? "text-white/60" : "text-ink-muted/60"}`}>{tab.count}</span>
            </button>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Filter */}
        <FilterPopover
          inventoryFilter={inventoryFilter}
          setInventoryFilter={setInventoryFilter}
          setSourceFilter={setSourceFilter}
          showSourceFilter={activeTab !== "mcps"}
          sourceFilter={sourceFilter}
        />

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted" />
          <input
            className="h-7 w-44 rounded-lg border border-line/40 bg-white pl-7 pr-2 text-xs text-ink outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/30"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${activeTab}...`}
            type="text"
            value={searchQuery}
          />
        </div>

        {/* Create + Refresh */}
        <CreateMenu onCreatePlugin={onCreatePlugin} onCreateSkill={onCreateSkill} />
        <button
          className="flex size-7 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink"
          onClick={onRefresh}
          title="Refresh"
          type="button"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>

      {/* ---- Error / feedback banners ---- */}
      {error || actionError || actionFeedback ? (
        <div className="border-b border-line/30 px-4 py-2">
          {[error, actionError, actionFeedback].filter(Boolean).map((msg, i) => (
            <p className="text-xs text-ink-muted" key={i}>{msg}</p>
          ))}
        </div>
      ) : null}

      {/* ---- Content ---- */}
      {/* Show detail view for plugin/app/mcp (replaces card grid) */}
      {selectedManagedRecord && selectedEntityKind === "plugin" && overview ? (
        <PluginDetailView
          managedRecord={selectedManagedRecord}
          overview={overview}
          onBack={clearSelection}
          onToggleEnabled={(next) => void runAction(`plugin-enable:${selectedManagedRecord.id}`, async () => await setPluginEnabled({ pluginId: selectedManagedRecord.id, enabled: next }))}
          onUninstall={() => void runAction(`plugin-uninstall:${selectedManagedRecord.id}`, async () => { await uninstallPlugin({ pluginId: selectedManagedRecord.id }); clearSelection(); }, `Removed ${selectedManagedRecord.displayName}.`)}
          onNavigateToEntity={(id, kind) => {
            const tabMap = { skill: "skills", app: "apps", mcp: "mcps" } as const;
            setActiveTab(tabMap[kind]);
            selectEntity(id, kind);
          }}
          onOpen={selectedManagedRecord.canOpen && selectedManagedRecord.sourcePath ? () => {
            void window.sense1Desktop.workspace.openFilePath(selectedManagedRecord.sourcePath!);
          } : undefined}
          onTryInChat={onTryInChat}
          onToggleBundledItem={(id, kind, enabled) => {
            if (kind === "skill") {
              void runAction(`skill-enable:${id}`, async () => await setSkillEnabled({ path: id, enabled }));
            } else if (kind === "app") {
              void runAction(`app-enable:${id}`, async () => await setAppEnabled({ appId: id, enabled }));
            } else if (kind === "mcp") {
              void runAction(`mcp-enable:${id}`, async () => await setMcpServerEnabled({ serverId: id, enabled }));
            }
          }}
          pendingActionKey={pendingActionKey}
          Toggle={Toggle}
        />
      ) : selectedManagedRecord && selectedEntityKind === "app" && overview ? (
        <AppDetailView
          managedRecord={selectedManagedRecord}
          legacyApp={overview.apps.find((a) => a.id === selectedManagedRecord.id)}
          onBack={clearSelection}
          onToggleEnabled={(next) => void runAction(`app-enable:${selectedManagedRecord.id}`, async () => await setAppEnabled({ appId: selectedManagedRecord.id, enabled: next }))}
          onConnect={() => {
            const legacyApp = overview.apps.find((a) => a.id === selectedManagedRecord.id);
            if (legacyApp?.installUrl) {
              void runAction(`app-connect:${selectedManagedRecord.id}`, async () => await openAppInstall({ appId: selectedManagedRecord.id, installUrl: legacyApp.installUrl ?? "" }), `Opened auth flow for ${selectedManagedRecord.displayName}.`);
            }
          }}
          onRemove={() => void runAction(`app-remove:${selectedManagedRecord.id}`, async () => { await removeApp({ appId: selectedManagedRecord.id }); clearSelection(); }, `Removed ${selectedManagedRecord.displayName}.`)}
          pendingActionKey={pendingActionKey}
          Toggle={Toggle}
        />
      ) : selectedManagedRecord && selectedEntityKind === "mcp" && overview ? (
        <McpDetailView
          managedRecord={selectedManagedRecord}
          legacyMcp={overview.mcpServers.find((m) => m.id === selectedManagedRecord.id)}
          onBack={clearSelection}
          onToggleEnabled={(next) => void runAction(`mcp-enable:${selectedManagedRecord.id}`, async () => await setMcpServerEnabled({ serverId: selectedManagedRecord.id, enabled: next }))}
          onStartAuth={selectedManagedRecord.canConnect && startMcpServerAuth ? () => {
            void runAction(`mcp-auth:${selectedManagedRecord.id}`, async () => await startMcpServerAuth({ serverId: selectedManagedRecord.id }), `Started auth flow for ${selectedManagedRecord.displayName}.`);
          } : undefined}
          onReload={selectedManagedRecord.canReload ? () => {
            void runAction(`mcp-reload:${selectedManagedRecord.id}`, async () => {
              await setMcpServerEnabled({ serverId: selectedManagedRecord.id, enabled: false });
              await setMcpServerEnabled({ serverId: selectedManagedRecord.id, enabled: true });
            }, `Reloaded ${selectedManagedRecord.displayName}.`);
          } : undefined}
          pendingActionKey={pendingActionKey}
          Toggle={Toggle}
        />
      ) : (
        /* Default: show card grids */
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading && !overview ? <EmptyState message="Loading..." /> : null}

          {/* ---------- Plugins ---------- */}
          {activeTab === "plugins" && overview ? (
            filteredPlugins.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {filteredPlugins.map((plugin) => {
                  const authApp = resolvePluginAuth(plugin);
                  const canInstall = !plugin.installed && plugin.installPolicy !== "NOT_AVAILABLE" && Boolean(plugin.marketplacePath);
                  const canUninstall = pluginSource(plugin) === "profile";
                  const installKey = `plugin-install:${plugin.id}`;
                  const enableKey = `plugin-enable:${plugin.id}`;
                  const uninstallKey = `plugin-uninstall:${plugin.id}`;
                  const connectKey = authApp ? `app-connect:${authApp.id}` : null;
                  const needsConnect = plugin.installed && Boolean(authApp?.installUrl);

                  return (
                    <article
                      className={`group flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:ring-1 hover:ring-accent/30 ${plugin.enabled ? "bg-surface-soft" : "bg-surface-soft/50"}`}
                      key={plugin.id}
                      onClick={() => selectEntity(plugin.id, "plugin")}
                    >
                      <ExtensionIcon kind="plugin" src={plugin.iconPath} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-[13px] font-medium text-ink">{plugin.displayName}</h3>
                          {!plugin.installed ? <span className="shrink-0 rounded bg-surface-strong px-1.5 py-0.5 text-[10px] text-muted">Available</span> : null}
                          {needsConnect ? <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">Auth</span> : null}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] leading-4 text-muted">{plugin.description ?? "No description"}</p>
                      </div>
                      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                      <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {!plugin.installed && canInstall ? (
                          <Button
                            className="h-6 rounded-md px-2 text-[11px]"
                            disabled={pendingActionKey === installKey}
                            onClick={() => {
                              const marketplacePath = plugin.marketplacePath;
                              if (!marketplacePath) return;
                              void runAction(installKey, async () => await installPlugin({ marketplacePath, pluginId: plugin.id, pluginName: plugin.name }), `Installed ${plugin.displayName}.`);
                            }}
                            variant="default"
                          >
                            Install
                          </Button>
                        ) : null}
                        {needsConnect ? (
                          <Button
                            className="h-6 rounded-md px-2 text-[11px]"
                            disabled={pendingActionKey === connectKey}
                            onClick={() => {
                              if (!authApp) return;
                              void runAction(connectKey ?? `app-connect:${plugin.id}`, async () => await openAppInstall({ appId: authApp.id, installUrl: authApp.installUrl ?? "" }), `Opened auth flow for ${authApp.name}.`);
                            }}
                            variant="secondary"
                          >
                            Connect
                          </Button>
                        ) : null}
                        {plugin.installed ? (
                          <Toggle checked={plugin.enabled} disabled={pendingActionKey === enableKey} onChange={(next) => void runAction(enableKey, async () => await setPluginEnabled({ pluginId: plugin.id, enabled: next }))} />
                        ) : null}
                        {(canUninstall || plugin.category) ? (
                          <OverflowMenu>
                            {plugin.category ? <OverflowItem onClick={() => {}}>{plugin.category}</OverflowItem> : null}
                            {canUninstall ? <OverflowItem destructive disabled={pendingActionKey === uninstallKey} onClick={() => void runAction(uninstallKey, async () => await uninstallPlugin({ pluginId: plugin.id }), `Removed ${plugin.displayName}.`)}><Trash2 className="size-3" /> Uninstall</OverflowItem> : null}
                          </OverflowMenu>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <EmptyState message="No plugins match the current filters." />
          ) : null}

          {/* ---------- Apps ---------- */}
          {activeTab === "apps" && overview ? (
            filteredApps.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {filteredApps.map((app) => {
                  const enableKey = `app-enable:${app.id}`;
                  const connectKey = `app-connect:${app.id}`;
                  const needsConnect = !app.isAccessible && Boolean(app.installUrl);

                  return (
                    <article
                      className={`group flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:ring-1 hover:ring-accent/30 ${app.isEnabled ? "bg-surface-soft" : "bg-surface-soft/50"}`}
                      key={app.id}
                      onClick={() => selectEntity(app.id, "app")}
                    >
                      <ExtensionIcon kind="app" src={app.logoUrl} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-[13px] font-medium text-ink">{app.name}</h3>
                          {needsConnect ? <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">Auth</span> : null}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] leading-4 text-muted">{app.description ?? "App connector"}</p>
                      </div>
                      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                      <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {needsConnect ? (
                          <Button
                            className="h-6 rounded-md px-2 text-[11px]"
                            disabled={pendingActionKey === connectKey}
                            onClick={() => void runAction(connectKey, async () => await openAppInstall({ appId: app.id, installUrl: app.installUrl ?? "" }), `Opened auth flow for ${app.name}.`)}
                            variant="secondary"
                          >
                            Connect
                          </Button>
                        ) : null}
                        {app.isAccessible ? (
                          <Toggle checked={app.isEnabled} disabled={pendingActionKey === enableKey} onChange={(next) => void runAction(enableKey, async () => await setAppEnabled({ appId: app.id, enabled: next }))} />
                        ) : !needsConnect ? (
                          <Toggle checked={false} disabled />
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <EmptyState message="No apps match the current filters." />
          ) : null}

          {/* ---------- MCPs ---------- */}
          {activeTab === "mcps" && overview ? (
            filteredMcps.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {filteredMcps.map((server) => (
                  <article
                    className={`group flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:ring-1 hover:ring-accent/30 ${server.enabled ? "bg-surface-soft" : "bg-surface-soft/50"}`}
                    key={server.id}
                    onClick={() => selectEntity(server.id, "mcp")}
                  >
                    <ExtensionIcon kind="mcp" />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[13px] font-medium text-ink">{server.id}</h3>
                      <p className="mt-0.5 truncate text-[11px] leading-4 text-muted">
                        {server.transport?.toUpperCase() ?? "MCP"}
                        {server.state ? ` · ${server.state}` : ""}
                        {` · ${server.toolsCount} tools`}
                        {server.resourcesCount > 0 ? ` · ${server.resourcesCount} res.` : ""}
                      </p>
                    </div>
                    {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                    <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {server.authStatus ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">{server.authStatus}</span> : null}
                      <Toggle checked={server.enabled} onChange={(next) => void setMcpServerEnabled({ serverId: server.id, enabled: next })} />
                    </div>
                  </article>
                ))}
              </div>
            ) : <EmptyState message="No MCP servers configured." />
          ) : null}

          {/* ---------- Skills ---------- */}
          {activeTab === "skills" && overview ? (
            filteredSkills.length > 0 ? (
              <div className="grid gap-px sm:grid-cols-2 xl:grid-cols-3">
                {filteredSkills.map((skill) => {
                  const canUninstall = skillSource(skill) === "profile";
                  const uninstallKey = `skill-uninstall:${skill.path}`;

                  return (
                    <article
                      className={`group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:ring-1 hover:ring-accent/30 ${skill.enabled ? "bg-surface-soft" : "bg-surface-soft/30 opacity-70"}`}
                      key={skill.path}
                      onClick={() => selectEntity(skill.path, "skill")}
                    >
                      <ExtensionIcon kind="skill" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-[13px] font-medium text-ink">{skill.name}</h3>
                          {skill.scope ? <span className="shrink-0 text-[10px] text-muted">{skill.scope}</span> : null}
                        </div>
                        <p className="truncate text-[11px] leading-4 text-muted">{skill.description ?? "No description"}</p>
                      </div>
                      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                      <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <Toggle checked={skill.enabled} onChange={(next) => void setSkillEnabled({ path: skill.path, enabled: next })} />
                        {canUninstall ? (
                          <OverflowMenu>
                            <OverflowItem destructive disabled={pendingActionKey === uninstallKey} onClick={() => void runAction(uninstallKey, async () => await uninstallSkill({ path: skill.path }), `Removed ${skill.name}.`)}><Trash2 className="size-3" /> Uninstall</OverflowItem>
                          </OverflowMenu>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <EmptyState message="No skills match the current filters." />
          ) : null}
        </div>
      )}

      {/* ---- Skill detail modal (overlay) ---- */}
      {selectedManagedRecord && selectedEntityKind === "skill" ? (
        <SkillDetailModal
          managedRecord={selectedManagedRecord}
          legacySkill={overview?.skills.find((s) => s.path === selectedManagedRecord.id)}
          onClose={clearSelection}
          onToggleEnabled={(next) => {
            const legacySkill = overview?.skills.find((s) => s.path === selectedManagedRecord.id);
            if (legacySkill) {
              void runAction(`skill-enable:${selectedManagedRecord.id}`, async () => await setSkillEnabled({ path: legacySkill.path, enabled: next }));
            }
          }}
          onUninstall={() => {
            const legacySkill = overview?.skills.find((s) => s.path === selectedManagedRecord.id);
            if (legacySkill) {
              void runAction(`skill-uninstall:${selectedManagedRecord.id}`, async () => { await uninstallSkill({ path: legacySkill.path }); clearSelection(); }, `Removed ${selectedManagedRecord.displayName}.`);
            }
          }}
          onOpen={() => {
            if (selectedManagedRecord.sourcePath) {
              void window.sense1Desktop.workspace.openFilePath(selectedManagedRecord.sourcePath);
            }
          }}
          onTryInChat={onTryInChat}
          pendingActionKey={pendingActionKey}
          Toggle={Toggle}
        />
      ) : null}
    </div>
  );
}
