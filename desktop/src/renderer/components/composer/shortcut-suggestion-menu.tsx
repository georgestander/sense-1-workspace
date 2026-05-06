import { Blocks, PlugZap, Sparkles } from "lucide-react";

import type { DesktopPromptShortcutSuggestion } from "../../../shared/prompt-shortcuts.ts";
import { cn } from "../../lib/cn.js";
import browserUseIconUrl from "../../assets/browser-use.png";

type ShortcutSuggestionMenuProps = {
  activeIndex: number;
  onSelect: (suggestion: DesktopPromptShortcutSuggestion) => void;
  suggestions: DesktopPromptShortcutSuggestion[];
};

function isBrowserUseSuggestion(suggestion: DesktopPromptShortcutSuggestion): boolean {
  return suggestion.token === "browser-use"
    || suggestion.item.name === "browser-use:browser"
    || suggestion.item.path.includes("/browser-use/");
}

export function ShortcutSuggestionMenu({
  activeIndex,
  onSelect,
  suggestions,
}: ShortcutSuggestionMenuProps) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-line bg-surface-glass p-2 shadow-[var(--shadow-menu)] backdrop-blur-sm">
      <p className="px-2 pb-1 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-muted">
        Profile shortcuts
      </p>
      <div className="space-y-1">
        {suggestions.slice(0, 8).map((suggestion, index) => {
          const Icon = suggestion.kind === "app" ? Blocks : suggestion.kind === "plugin" ? PlugZap : Sparkles;
          const isActive = index === activeIndex;
          const isBrowserUse = isBrowserUseSuggestion(suggestion);
          const trigger = suggestion.trigger ?? "$";
          return (
            <button
              className={cn(
                "flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[0.6875rem] transition-colors",
                isActive ? "bg-ink text-canvas" : "bg-transparent text-ink hover:bg-surface-soft",
              )}
              key={`${suggestion.token}:${suggestion.item.path}`}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(suggestion);
              }}
              onClick={(event) => event.preventDefault()}
              type="button"
            >
              {isBrowserUse ? (
                <img alt="" className="size-3.5 shrink-0 rounded-sm" src={browserUseIconUrl} />
              ) : (
                <Icon className={cn("size-3.5 shrink-0", isActive ? "text-canvas" : "text-ink-muted")} />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{suggestion.label}</span>
                <span className={cn("block truncate", isActive ? "text-canvas/70" : "text-ink-muted")}>
                  {trigger}{suggestion.token}
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
