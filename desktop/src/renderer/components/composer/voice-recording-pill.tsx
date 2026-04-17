import { Square } from "lucide-react";

import { cn } from "../../lib/cn";
import { Button } from "../ui/button";

export function VoiceRecordingPill({
  className,
  elapsedLabel,
  levels,
  onStop,
}: {
  className?: string;
  elapsedLabel: string;
  levels: readonly number[];
  onStop: () => void | Promise<void>;
}) {
  return (
    <div
      aria-label={`Voice recording ${elapsedLabel}`}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-line bg-surface-high px-2.5 shadow-[0_6px_16px_rgba(10,15,20,0.05)]",
        className,
      )}
      role="status"
    >
      <div aria-hidden className="flex h-4 w-[58px] items-end gap-[2px] overflow-hidden">
        {levels.map((level, index) => (
          <span
            className="w-[3px] rounded-full bg-ink transition-[height,opacity]"
            key={`${index}-${level}`}
            style={{
              height: `${Math.round(4 + (level * 11))}px`,
              opacity: 0.18 + (level * 0.82),
            }}
          />
        ))}
      </div>
      <span className="min-w-[2rem] text-[10px] font-medium tabular-nums text-ink">{elapsedLabel}</span>
      <Button
        aria-label="Stop voice input"
        className="size-6 rounded-full border-line/60 px-0"
        onClick={() => void onStop()}
        size="icon-sm"
        variant="secondary"
      >
        <Square className="size-2.5 fill-current" />
      </Button>
    </div>
  );
}
