import { ExternalLink, MessageSquare, Sparkles, Trash2, X } from "lucide-react";

import type { DesktopExtensionOverviewResult, DesktopManagedExtensionRecord, DesktopSkillRecord } from "../../../main/contracts";
import type { DesktopPromptShortcutSuggestion } from "../../../shared/prompt-shortcuts.ts";
import { resolveManagedExtensionPromptShortcut } from "../../../shared/prompt-shortcuts.ts";
import { Button } from "../ui/button";

type SkillDetailModalProps = {
  managedRecord: DesktopManagedExtensionRecord;
  legacySkill: DesktopSkillRecord | undefined;
  overview: Pick<DesktopExtensionOverviewResult, "apps" | "plugins" | "skills">;
  onClose: () => void;
  onToggleEnabled: (next: boolean) => void;
  onUninstall: () => void;
  onOpen: () => void;
  onTryInChat?: (shortcut: DesktopPromptShortcutSuggestion) => void;
  pendingActionKey: string | null;
  Toggle: React.ComponentType<{ checked: boolean; disabled?: boolean; onChange?: (next: boolean) => void }>;
};

export function SkillDetailModal({
  managedRecord,
  legacySkill,
  overview,
  onClose,
  onToggleEnabled,
  onUninstall,
  onOpen,
  onTryInChat,
  pendingActionKey,
  Toggle,
}: SkillDetailModalProps) {
  const isEnabled = managedRecord.enablementState === "enabled";
  const enableKey = `skill-enable:${managedRecord.id}`;
  const uninstallKey = `skill-uninstall:${managedRecord.id}`;
  const scope = legacySkill?.scope ?? (managedRecord.ownership === "plugin-owned" ? "plugin" : null);
  const tryInChatShortcut = resolveManagedExtensionPromptShortcut(managedRecord, overview);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/20"
        onClick={onClose}
        role="presentation"
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-line/40 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-line/30 px-5 py-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-strong">
            <Sparkles className="size-4 text-muted" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-ink">{managedRecord.displayName}</h3>
              <span className="shrink-0 rounded bg-surface-strong px-1.5 py-0.5 text-[10px] font-medium text-muted">
                Skill
              </span>
              {scope ? (
                <span className="shrink-0 text-[10px] text-muted">{scope}</span>
              ) : null}
            </div>
          </div>
          <button
            className="flex size-6 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="text-[12px] leading-5 text-ink">
            {managedRecord.description ?? "No description available."}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-line/30 px-5 py-3">
          <div className="flex items-center gap-3">
            {managedRecord.canDisable ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted">{isEnabled ? "Enabled" : "Disabled"}</span>
                <Toggle
                  checked={isEnabled}
                  disabled={pendingActionKey === enableKey}
                  onChange={onToggleEnabled}
                />
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
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
            {managedRecord.canOpen ? (
              <Button
                className="h-7 gap-1.5 rounded-lg px-2.5 text-[11px]"
                onClick={onOpen}
                variant="secondary"
              >
                <ExternalLink className="size-3" />
                Open
              </Button>
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
      </div>
    </div>
  );
}
