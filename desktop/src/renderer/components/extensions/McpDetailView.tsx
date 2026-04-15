import { ArrowLeft, Cable } from "lucide-react";

import type {
  DesktopManagedExtensionRecord,
  DesktopMcpServerRecord,
} from "../../../main/contracts";

type McpDetailViewProps = {
  managedRecord: DesktopManagedExtensionRecord;
  legacyMcp: DesktopMcpServerRecord | undefined;
  onBack: () => void;
  onToggleEnabled: (next: boolean) => void;
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
      ? "bg-green-50 text-green-700"
      : state === "warning"
        ? "bg-amber-50 text-amber-600"
        : "bg-red-50 text-red-600";
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${color}`}>{state}</span>;
}

export function McpDetailView({
  managedRecord,
  legacyMcp,
  onBack,
  onToggleEnabled,
  pendingActionKey,
  Toggle,
}: McpDetailViewProps) {
  const isEnabled = managedRecord.enablementState === "enabled";
  const enableKey = `mcp-enable:${managedRecord.id}`;

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
              {managedRecord.authState !== "not-required" ? (
                <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] text-amber-600">
                  Auth: {managedRecord.authState}
                </span>
              ) : null}
            </div>
          </section>

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
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
