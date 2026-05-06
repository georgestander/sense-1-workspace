import { Blocks, PlugZap, Sparkles } from "lucide-react";

import type { DesktopExtensionOverviewResult } from "../../../main/contracts";
import { cn } from "../../lib/cn.js";
import { resolvePromptShortcutMatches } from "../../../shared/prompt-shortcuts.ts";
import browserUseIconUrl from "../../assets/browser-use.png";

type ShortcutPillRowProps = {
  className?: string;
  hiddenTokens?: string[];
  overview: Pick<DesktopExtensionOverviewResult, "apps" | "plugins" | "skills"> | null;
  prompt: string;
};

function isBrowserUseMatch(match: ReturnType<typeof resolvePromptShortcutMatches>[number]): boolean {
  return match.token === "browser-use"
    || match.item.name === "browser-use:browser"
    || match.item.path.includes("/browser-use/");
}

export function ShortcutPillRow({ className, hiddenTokens = [], overview, prompt }: ShortcutPillRowProps) {
  const hiddenTokenSet = new Set(hiddenTokens);
  const matches = overview
    ? resolvePromptShortcutMatches(prompt, overview).filter((match) => !hiddenTokenSet.has(match.token))
    : [];
  if (matches.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {matches.map((match) => {
        const Icon = match.kind === "app" ? Blocks : match.kind === "plugin" ? PlugZap : Sparkles;
        const isBrowserUse = isBrowserUseMatch(match);
        return (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-high px-3 py-1 text-xs font-semibold text-ink shadow-[var(--shadow-raised)]"
            key={match.item.path}
            title={`${isBrowserUse ? "@" : "$"}${match.token} -> ${match.item.name ?? match.label}`}
          >
            {isBrowserUse ? (
              <img alt="" className="size-3.5 rounded-sm" src={browserUseIconUrl} />
            ) : (
              <Icon className="size-3.5 text-ink-muted" />
            )}
            <span className="font-bold">{match.label}</span>
          </span>
        );
      })}
    </div>
  );
}
