import { ArrowLeft, Blocks, Check, MessageSquare, Trash2 } from "lucide-react";

import type {
  DesktopAppRecord,
  DesktopExtensionOverviewResult,
  DesktopManagedExtensionRecord,
} from "../../../main/contracts";
import type { DesktopPromptShortcutSuggestion } from "../../../shared/prompt-shortcuts.ts";
import { resolveManagedExtensionPromptShortcut } from "../../../shared/prompt-shortcuts.ts";
import { Button } from "../ui/button";

type AppDetailViewProps = {
  managedRecord: DesktopManagedExtensionRecord;
  legacyApp: DesktopAppRecord | undefined;
  overview: Pick<DesktopExtensionOverviewResult, "apps" | "plugins" | "skills">;
  onBack: () => void;
  onToggleEnabled: (next: boolean) => void;
  onConnect: () => void;
  onRemove: () => void;
  onTryInChat?: (shortcut: DesktopPromptShortcutSuggestion) => void;
  pendingActionKey: string | null;
  Toggle: React.ComponentType<{ checked: boolean; disabled?: boolean; onChange?: (next: boolean) => void }>;
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">{children}</h4>;
}

export function AppDetailView({
  managedRecord,
  legacyApp,
  overview,
  onBack,
  onToggleEnabled,
  onConnect,
  onRemove,
  onTryInChat,
  pendingActionKey,
  Toggle,
}: AppDetailViewProps) {
  const isEnabled = managedRecord.enablementState === "enabled";
  const enableKey = `app-enable:${managedRecord.id}`;
  const connectKey = `app-connect:${managedRecord.id}`;
  const removeKey = `app-remove:${managedRecord.id}`;

  const authState = managedRecord.authState;
  const needsConnect = authState === "required" || authState === "failed";
  const isConnected = authState === "connected";
  const pluginNames = legacyApp?.pluginDisplayNames ?? [];
  const runtimeStateKnown = legacyApp?.runtimeStateKnown ?? true;
  const tryInChatShortcut = resolveManagedExtensionPromptShortcut(managedRecord, overview);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-line/40 px-4 py-3">
        <button
          className="flex size-7 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink"
          onClick={onBack}
          title="Back to list"
          type="button"
        >
          <ArrowLeft className="size-4" />
        </button>
        {legacyApp?.logoUrl ? (
          <img alt="" className="size-8 shrink-0 rounded-lg object-contain" src={legacyApp.logoUrl} />
        ) : (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-strong">
            <Blocks className="size-4 text-muted" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-ink">{managedRecord.displayName}</h2>
          {managedRecord.description ? (
            <p className="mt-0.5 truncate text-[11px] leading-4 text-muted">{managedRecord.description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-xl space-y-6">
          {/* Auth state */}
          <section>
            <SectionHeading>Authentication</SectionHeading>
            <div className="rounded-xl bg-surface-soft px-3 py-3">
              {!runtimeStateKnown ? (
                <p className="text-[11px] text-muted">
                  Live app auth state is unavailable right now. Sense-1 is showing the plugin-linked fallback record until the runtime recovers.
                </p>
              ) : isConnected ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 rounded-md bg-green-50 px-2 py-1 text-[11px] font-medium text-green-700">
                    <Check className="size-3" />
                    Connected
                  </span>
                </div>
              ) : needsConnect ? (
                <div className="flex items-center gap-3">
                  <span className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-600">Auth required</span>
                  <Button
                    className="h-7 rounded-lg px-3 text-[11px]"
                    disabled={pendingActionKey === connectKey}
                    onClick={onConnect}
                    variant="default"
                  >
                    Connect
                  </Button>
                </div>
              ) : (
                <p className="text-[11px] text-muted">No authentication required.</p>
              )}
            </div>
          </section>

          {/* Plugin ownership */}
          {pluginNames.length > 0 ? (
            <section>
              <SectionHeading>Used by plugins</SectionHeading>
              <div className="flex flex-wrap gap-1.5">
                {pluginNames.map((name) => (
                  <span
                    className="rounded-lg bg-surface-soft px-2.5 py-1.5 text-[11px] text-ink"
                    key={name}
                  >
                    {name}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {/* Details */}
          <section>
            <SectionHeading>Details</SectionHeading>
            <div className="rounded-xl bg-surface-soft px-3 py-2">
              <div className="flex items-baseline gap-2 py-1">
                <span className="shrink-0 text-[11px] text-muted">Ownership</span>
                <span className="text-[11px] text-ink">{managedRecord.ownership}</span>
              </div>
              {managedRecord.healthState !== "healthy" ? (
                <div className="flex items-baseline gap-2 py-1">
                  <span className="shrink-0 text-[11px] text-muted">Health</span>
                  <span className="text-[11px] text-ink">{managedRecord.healthState}</span>
                </div>
              ) : null}
              {!runtimeStateKnown ? (
                <div className="flex items-baseline gap-2 py-1">
                  <span className="shrink-0 text-[11px] text-muted">Source</span>
                  <span className="text-[11px] text-ink">local fallback</span>
                </div>
              ) : null}
            </div>
          </section>

          {/* Remove */}
          {runtimeStateKnown && (legacyApp?.isAccessible || managedRecord.enablementState === "enabled") ? (
            <section>
              <Button
                className="h-8 gap-1.5 rounded-lg px-3 text-xs"
                disabled={pendingActionKey === removeKey}
                onClick={onRemove}
                variant="destructive"
              >
                <Trash2 className="size-3.5" />
                Remove app
              </Button>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
