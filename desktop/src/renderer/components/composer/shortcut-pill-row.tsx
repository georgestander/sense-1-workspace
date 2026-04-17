import { Blocks, PlugZap, Sparkles } from "lucide-react";

import type { DesktopExtensionOverviewResult } from "../../../main/contracts";
import { cn } from "../../lib/cn.js";
import { resolvePromptShortcutMatches } from "../../../shared/prompt-shortcuts.ts";

type ShortcutPillRowProps = {
  className?: string;
  overview: Pick<DesktopExtensionOverviewResult, "apps" | "plugins" | "skills"> | null;
  prompt: string;
};

export function ShortcutPillRow({ className, overview, prompt }: ShortcutPillRowProps) {
  const matches = overview ? resolvePromptShortcutMatches(prompt, overview) : [];
  if (matches.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {matches.map((match) => {
        const Icon = match.kind === "app" ? Blocks : match.kind === "plugin" ? PlugZap : Sparkles;
        return (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-xs font-semibold text-canvas shadow-[var(--shadow-raised)]"
            key={match.item.path}
            title={`$${match.token} -> ${match.item.name ?? match.label}`}
          >
            <Icon className="size-3.5 text-canvas/80" />
            <span className="font-bold">{match.label}</span>
          </span>
        );
      })}
    </div>
  );
}
