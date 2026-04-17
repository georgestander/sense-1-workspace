import { ArrowLeft, Blocks, Cable, ExternalLink, MessageSquare, Sparkles, Trash2 } from "lucide-react";

import type {
  DesktopAppRecord,
  DesktopExtensionOverviewResult,
  DesktopManagedExtensionRecord,
  DesktopPluginRecord,
} from "../../../main/contracts";
import type { DesktopPromptShortcutSuggestion } from "../../../shared/prompt-shortcuts.ts";
import { resolveManagedExtensionPromptShortcut } from "../../../shared/prompt-shortcuts.ts";
import { Button } from "../ui/button";

type PluginDetailViewProps = {
  managedRecord: DesktopManagedExtensionRecord;
  overview: DesktopExtensionOverviewResult;
  onBack: () => void;
  onToggleEnabled: (next: boolean) => void;
  onUninstall: () => void;
  onNavigateToEntity: (id: string, kind: "skill" | "app" | "mcp") => void;
  onOpen?: () => void;
  onTryInChat?: (shortcut: DesktopPromptShortcutSuggestion) => void;
  onToggleBundledItem?: (id: string, kind: "skill" | "app" | "mcp", enabled: boolean) => void;
  pendingActionKey: string | null;
  Toggle: React.ComponentType<{ checked: boolean; disabled?: boolean; onChange?: (next: boolean) => void }>;
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">{children}</h4>;
}

function MetadataRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-2 py-1">
      <span className="shrink-0 text-[11px] text-muted">{label}</span>
      <span className="text-[11px] text-ink">{value}</span>
    </div>
  );
}

function IncludedEntityRow({
  icon: Icon,
  label,
  onClick,
  toggle,
}: {
  icon: typeof Sparkles;
  label: string;
  onClick?: () => void;
  toggle?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <button
        className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-lg bg-surface-soft px-2.5 py-1.5 text-[11px] text-ink transition-colors hover:bg-surface-strong"
        onClick={onClick}
        type="button"
      >
        <Icon className="size-3 shrink-0 text-muted" />
        <span className="truncate">{label}</span>
      </button>
      {toggle ? (
        /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          {toggle}
        </div>
      ) : null}
    </div>
  );
}

export function PluginDetailView({
  managedRecord,
  overview,
  onBack,
  onToggleEnabled,
  onUninstall,
  onNavigateToEntity,
  onOpen,
  onTryInChat,
  onToggleBundledItem,
  pendingActionKey,
  Toggle,
}: PluginDetailViewProps) {
  const legacyPlugin: DesktopPluginRecord | undefined = overview.plugins.find((p) => p.id === managedRecord.id);
  const enableKey = `plugin-enable:${managedRecord.id}`;
  const uninstallKey = `plugin-uninstall:${managedRecord.id}`;

  // Resolve included entities from managed extensions
  const includedSkills = overview.managedExtensions.filter(
    (e) => e.kind === "skill" && managedRecord.includedSkillIds.includes(e.id),
  );
  const includedApps = overview.managedExtensions.filter(
    (e) => e.kind === "app" && managedRecord.includedAppIds.includes(e.id),
  );
  const includedMcps = overview.managedExtensions.filter(
    (e) => e.kind === "mcp" && managedRecord.includedMcpServerIds.includes(e.id),
  );

  // Fallback: also look up apps from legacy records
  const legacyAppRecords: DesktopAppRecord[] = managedRecord.includedAppIds
    .map((appId) => overview.apps.find((a) => a.id === appId))
    .filter((a): a is DesktopAppRecord => a != null);

  const hasIncludes = includedSkills.length > 0 || includedApps.length > 0 || includedMcps.length > 0 || legacyAppRecords.length > 0;
  const isEnabled = managedRecord.enablementState === "enabled";
  const websiteUrl = legacyPlugin?.websiteUrl ?? null;
  const tryInChatShortcut = resolveManagedExtensionPromptShortcut(managedRecord, overview);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button
          className="flex size-7 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink"
          onClick={onBack}
          title="Back to list"
          type="button"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-ink">{managedRecord.displayName}</h2>
          {managedRecord.description ? (
            <p className="mt-0.5 truncate text-[11px] leading-4 text-muted">{managedRecord.description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {managedRecord.canOpen && onOpen ? (
            <Button
              className="h-7 gap-1.5 rounded-lg px-2.5 text-[11px]"
              onClick={onOpen}
              variant="secondary"
            >
              <ExternalLink className="size-3" />
              Open
            </Button>
          ) : null}
          {onTryInChat && tryInChatShortcut ? (
            <Button
              className="h-7 gap-1.5 rounded-lg px-2.5 text-[11px]"
              onClick={() => onTryInChat(tryInChatShortcut)}
              variant="secondary"
            >
              <MessageSquare className="size-3" />
              Try in chat
            </Button>
          ) : null}
          {managedRecord.canDisable ? (
            <Toggle
              checked={isEnabled}
              disabled={pendingActionKey === enableKey}
              onChange={onToggleEnabled}
            />
          ) : null}
          {managedRecord.canUninstall ? (
            <Button
              className="h-7 gap-1.5 rounded-lg px-2.5 text-[11px]"
              disabled={pendingActionKey === uninstallKey}
              onClick={onUninstall}
              variant="destructive"
            >
              <Trash2 className="size-3" />
              Uninstall
            </Button>
          ) : null}
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-xl space-y-6">
          {/* Metadata */}
          <section>
            <SectionHeading>Details</SectionHeading>
            <div className="rounded-xl bg-surface-soft px-3 py-2">
              <MetadataRow label="Category" value={managedRecord.capabilities.length > 0 ? managedRecord.capabilities.join(", ") : legacyPlugin?.category} />
              <MetadataRow label="Marketplace" value={managedRecord.marketplaceName} />
              <MetadataRow label="Ownership" value={managedRecord.ownership} />
              <MetadataRow label="Install state" value={managedRecord.installState} />
              <MetadataRow label="Health" value={managedRecord.healthState !== "healthy" ? managedRecord.healthState : null} />
              <MetadataRow label="Auth" value={managedRecord.authState !== "not-required" ? managedRecord.authState : null} />
              {websiteUrl ? (
                <div className="flex items-center gap-2 py-1">
                  <span className="shrink-0 text-[11px] text-muted">Website</span>
                  <a
                    className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                    href={websiteUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {websiteUrl}
                    <ExternalLink className="size-2.5" />
                  </a>
                </div>
              ) : null}
            </div>
          </section>

          {/* Includes */}
          {hasIncludes ? (
            <section>
              <SectionHeading>Includes</SectionHeading>
              <div className="space-y-0.5">
                {includedSkills.map((skill) => (
                  <IncludedEntityRow
                    icon={Sparkles}
                    key={skill.id}
                    label={skill.displayName}
                    onClick={() => onNavigateToEntity(skill.id, "skill")}
                    toggle={
                      skill.canDisable && onToggleBundledItem ? (
                        <Toggle
                          checked={skill.enablementState === "enabled"}
                          disabled={pendingActionKey === `skill-enable:${skill.id}`}
                          onChange={(next) => onToggleBundledItem(skill.id, "skill", next)}
                        />
                      ) : null
                    }
                  />
                ))}
                {includedApps.length > 0
                  ? includedApps.map((app) => (
                      <IncludedEntityRow
                        icon={Blocks}
                        key={app.id}
                        label={app.displayName}
                        onClick={() => onNavigateToEntity(app.id, "app")}
                        toggle={
                          app.canDisable && onToggleBundledItem ? (
                            <Toggle
                              checked={app.enablementState === "enabled"}
                              disabled={pendingActionKey === `app-enable:${app.id}`}
                              onChange={(next) => onToggleBundledItem(app.id, "app", next)}
                            />
                          ) : null
                        }
                      />
                    ))
                  : legacyAppRecords.map((app) => (
                      <IncludedEntityRow
                        icon={Blocks}
                        key={app.id}
                        label={app.name}
                        onClick={() => onNavigateToEntity(app.id, "app")}
                      />
                    ))}
                {includedMcps.map((mcp) => (
                  <IncludedEntityRow
                    icon={Cable}
                    key={mcp.id}
                    label={mcp.displayName}
                    onClick={() => onNavigateToEntity(mcp.id, "mcp")}
                    toggle={
                      mcp.canDisable && onToggleBundledItem ? (
                        <Toggle
                          checked={mcp.enablementState === "enabled"}
                          disabled={pendingActionKey === `mcp-enable:${mcp.id}`}
                          onChange={(next) => onToggleBundledItem(mcp.id, "mcp", next)}
                        />
                      ) : null
                    }
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
