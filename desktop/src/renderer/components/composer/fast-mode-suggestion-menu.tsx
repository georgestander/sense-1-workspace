import { Zap } from "lucide-react";

import type { FastModeSuggestion } from "../../features/session/fast-mode-command.js";
import { cn } from "../../lib/cn.js";

type FastModeSuggestionMenuProps = {
  activeIndex: number;
  onSelect: (suggestion: FastModeSuggestion) => void;
  suggestions: FastModeSuggestion[];
};

export function FastModeSuggestionMenu({
  activeIndex,
  onSelect,
  suggestions,
}: FastModeSuggestionMenuProps) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-line bg-surface-glass p-2 shadow-[var(--shadow-menu)] backdrop-blur-sm">
      <p className="px-2 pb-1 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-muted">
        Slash commands
      </p>
      <div className="space-y-1">
        {suggestions.map((suggestion, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              className={cn(
                "flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[0.6875rem] transition-colors",
                isActive ? "bg-ink text-canvas" : "bg-transparent text-ink hover:bg-surface-soft",
              )}
              key={suggestion.command}
              onClick={(event) => event.preventDefault()}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(suggestion);
              }}
              type="button"
            >
              <Zap className={cn("size-3.5 shrink-0", isActive ? "text-canvas" : "text-ink-muted")} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{suggestion.label}</span>
                <span className={cn("block truncate", isActive ? "text-canvas/70" : "text-ink-muted")}>
                  {suggestion.command}
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
