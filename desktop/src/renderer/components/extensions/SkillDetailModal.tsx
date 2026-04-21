import { useEffect, useRef, useState } from "react";
import { Maximize2, MessageSquare, Minimize2, MoreHorizontal, Pencil, Sparkles, Trash2, X } from "lucide-react";

import type { DesktopExtensionOverviewResult, DesktopManagedExtensionRecord, DesktopSkillRecord } from "../../../main/contracts";
import type { DesktopPromptShortcutSuggestion } from "../../../shared/prompt-shortcuts.ts";
import { resolveManagedExtensionPromptShortcut } from "../../../shared/prompt-shortcuts.ts";
import { ThreadMarkdown } from "../../thread-markdown";
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

function stripFrontmatter(md: string): string {
  return md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+/, "");
}

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
  const skillPath = legacySkill?.path ?? null;

  const [content, setContent] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState<boolean>(Boolean(skillPath));
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!skillPath) {
      setContent(null);
      setContentLoading(false);
      return;
    }
    let cancelled = false;
    setContentLoading(true);
    setContentError(null);
    window.sense1Desktop.management
      .readSkillDetail({ path: skillPath })
      .then((result) => {
        if (cancelled) return;
        setContent(result.content ?? "");
        setContentLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setContentError(err instanceof Error ? err.message : "Could not read SKILL.md.");
        setContentLoading(false);
      });
    return () => { cancelled = true; };
  }, [skillPath]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const body = stripFrontmatter(content ?? "").trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/20"
        onClick={onClose}
        role="presentation"
      />

      {/* Modal */}
      <div
        className={`relative z-10 flex w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface-high shadow-xl transition-all ${
          expanded ? "max-h-[95vh] max-w-6xl" : "max-h-[85vh] max-w-3xl"
        }`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
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
          {managedRecord.canDisable ? (
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[11px] text-muted">{isEnabled ? "Enabled" : "Disabled"}</span>
              <Toggle
                checked={isEnabled}
                disabled={pendingActionKey === enableKey}
                onChange={onToggleEnabled}
              />
            </div>
          ) : null}
          <div className="relative" ref={menuRef}>
            <button
              className="flex size-6 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink"
              onClick={() => setMenuOpen((open) => !open)}
              type="button"
            >
              <MoreHorizontal className="size-4" />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-7 z-20 min-w-[180px] overflow-hidden rounded-lg border border-line bg-surface-high shadow-lg">
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-ink transition-colors hover:bg-surface-soft"
                  onClick={() => {
                    setExpanded((prev) => !prev);
                    setMenuOpen(false);
                  }}
                  type="button"
                >
                  {expanded ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
                  {expanded ? "Exit large view" : "Open in large view"}
                </button>
              </div>
            ) : null}
          </div>
          <button
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Description block */}
        {managedRecord.description ? (
          <div className="shrink-0 border-b border-line px-5 py-3">
            <p className="text-[12px] leading-5 text-ink">{managedRecord.description}</p>
          </div>
        ) : null}

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {contentLoading ? (
            <div className="space-y-2">
              <div className="h-3 w-3/4 animate-pulse rounded bg-surface-soft" />
              <div className="h-3 w-full animate-pulse rounded bg-surface-soft" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-surface-soft" />
            </div>
          ) : contentError ? (
            <p className="text-[11px] text-muted">{contentError}</p>
          ) : body ? (
            <ThreadMarkdown>{body}</ThreadMarkdown>
          ) : (
            <p className="text-[11px] text-muted">This skill has no additional content.</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-5 py-3">
          <div className="flex items-center gap-2">
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
          <div className="flex items-center gap-2">
            {managedRecord.canOpen ? (
              <button
                className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink"
                onClick={onOpen}
                type="button"
              >
                <Pencil className="size-3" />
                Edit source
              </button>
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
          </div>
        </div>
      </div>
    </div>
  );
}
