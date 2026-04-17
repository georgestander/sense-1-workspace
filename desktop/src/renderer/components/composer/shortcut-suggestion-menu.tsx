import { Blocks, PlugZap, Sparkles } from "lucide-react";

import type { DesktopPromptShortcutSuggestion } from "../../../shared/prompt-shortcuts.ts";
import { cn } from "../../lib/cn.js";

type ShortcutSuggestionMenuProps = {
  activeIndex: number;
  onSelect: (suggestion: DesktopPromptShortcutSuggestion) => void;
  suggestions: DesktopPromptShortcutSuggestion[];
};

export function ShortcutSuggestionMenu({
  activeIndex,
  onSelect,
  suggestions,
}: ShortcutSuggestionMenuProps) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-line bg-surface-glass p-2 shadow-[0_16px_36px_rgba(10,15,20,0.08)] backdrop-blur-sm">
      <p className="px-2 pb-1 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-muted">
        Profile shortcuts
      </p>
      <div className="space-y-1">
        {suggestions.slice(0, 8).map((suggestion, index) => {
          const Icon = suggestion.kind === "app" ? Blocks : suggestion.kind === "plugin" ? PlugZap : Sparkles;
          const isActive = index === activeIndex;
          return (
            <button
              className={cn(
                "flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[0.6875rem] transition-colors",
                isActive ? "bg-ink text-white" : "bg-transparent text-ink hover:bg-surface-soft",
              )}
              key={`${suggestion.token}:${suggestion.item.path}`}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(suggestion);
              }}
              onClick={(event) => event.preventDefault()}
              type="button"
            >
              <Icon className={cn("size-3.5 shrink-0", isActive ? "text-white" : "text-ink-muted")} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{suggestion.label}</span>
                <span className={cn("block truncate", isActive ? "text-white/70" : "text-ink-muted")}>
                  ${suggestion.token}
                  {suggestion.description ? ` · ${suggestion.description}` : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
