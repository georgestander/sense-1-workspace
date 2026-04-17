import { ArrowLeft, Cable, Check, RefreshCw } from "lucide-react";

import type {
  DesktopManagedExtensionRecord,
  DesktopMcpServerRecord,
} from "../../../main/contracts";
import { Button } from "../ui/button";

type McpDetailViewProps = {
  managedRecord: DesktopManagedExtensionRecord;
  legacyMcp: DesktopMcpServerRecord | undefined;
  onBack: () => void;
  onToggleEnabled: (next: boolean) => void;
  onStartAuth?: () => void;
  onReload?: () => void;
  pendingActionKey: string | null;
  Toggle: React.ComponentType<{ checked: boolean; disabled?: boolean; onChange?: (next: boolean) => void }>;
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">{children}</h4>;
}

function MetadataRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null) return null;
  return (
    <div className="flex items-baseline gap-2 py-1">
      <span className="shrink-0 text-[11px] text-muted">{label}</span>
      <span className="text-[11px] text-ink">{String(value)}</span>
    </div>
  );
}

function HealthBadge({ state }: { state: string }) {
  const color =
    state === "healthy"
      ? "bg-success-faint text-success"
      : state === "warning"
        ? "bg-warning-faint text-warning"
        : "bg-danger-faint text-danger";
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${color}`}>{state}</span>;
}

export function McpDetailView({
  managedRecord,
  legacyMcp,
  onBack,
  onToggleEnabled,
  onStartAuth,
  onReload,
  pendingActionKey,
  Toggle,
}: McpDetailViewProps) {
  const isEnabled = managedRecord.enablementState === "enabled";
  const enableKey = `mcp-enable:${managedRecord.id}`;
  const authKey = `mcp-auth:${managedRecord.id}`;
  const reloadKey = `mcp-reload:${managedRecord.id}`;

  const authState = managedRecord.authState;
  const needsConnect = authState === "required" || authState === "failed";
  const isConnected = authState === "connected";

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
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-strong">
          <Cable className="size-4 text-muted" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-ink">{managedRecord.displayName}</h2>
          {legacyMcp?.transport ? (
            <p className="mt-0.5 text-[11px] text-muted">{legacyMcp.transport.toUpperCase()}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {managedRecord.canReload && onReload ? (
            <Button
              className="h-7 gap-1.5 rounded-lg px-2.5 text-[11px]"
              disabled={pendingActionKey === reloadKey}
              onClick={onReload}
              variant="secondary"
            >
              <RefreshCw className="size-3" />
              Reload
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
          {/* Status */}
          <section>
            <SectionHeading>Status</SectionHeading>
            <div className="flex items-center gap-3 rounded-xl bg-surface-soft px-3 py-3">
              <HealthBadge state={managedRecord.healthState} />
              {isConnected ? (
                <span className="flex items-center gap-1 rounded-md bg-success-faint px-2 py-1 text-[11px] font-medium text-success">
                  <Check className="size-3" />
                  Connected
                </span>
              ) : needsConnect ? (
                <span className="rounded bg-warning-faint px-2 py-0.5 text-[11px] text-warning">
                  Auth required
                </span>
              ) : authState !== "not-required" ? (
                <span className="rounded bg-warning-faint px-2 py-0.5 text-[11px] text-warning">
                  Auth: {authState}
                </span>
              ) : null}
            </div>
          </section>

          {/* Auth action */}
          {managedRecord.canConnect && needsConnect && onStartAuth ? (
            <section>
              <SectionHeading>Authentication</SectionHeading>
              <div className="flex items-center gap-3 rounded-xl bg-surface-soft px-3 py-3">
                <span className="rounded bg-warning-faint px-2 py-1 text-[11px] text-warning">Auth required</span>
                <Button
                  className="h-7 rounded-lg px-3 text-[11px]"
                  disabled={pendingActionKey === authKey}
                  onClick={onStartAuth}
                  variant="default"
                >
                  Connect
                </Button>
              </div>
            </section>
          ) : null}

          {/* Capabilities */}
          {legacyMcp ? (
            <section>
              <SectionHeading>Capabilities</SectionHeading>
              <div className="rounded-xl bg-surface-soft px-3 py-2">
                <MetadataRow label="Tools" value={legacyMcp.toolsCount} />
                <MetadataRow label="Resources" value={legacyMcp.resourcesCount > 0 ? legacyMcp.resourcesCount : null} />
                <MetadataRow label="Transport" value={legacyMcp.transport} />
                <MetadataRow label="State" value={legacyMcp.state} />
                <MetadataRow label="Command" value={legacyMcp.command} />
                <MetadataRow label="URL" value={legacyMcp.url} />
              </div>
            </section>
          ) : null}

          {/* Details */}
          <section>
            <SectionHeading>Details</SectionHeading>
            <div className="rounded-xl bg-surface-soft px-3 py-2">
              <MetadataRow label="Server ID" value={managedRecord.id} />
              <MetadataRow label="Ownership" value={managedRecord.ownership} />
              <MetadataRow label="Install state" value={managedRecord.installState} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
