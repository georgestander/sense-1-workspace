import { Clock3, Folder } from "lucide-react";

import { cn } from "../../lib/cn";
import type { DesktopAutomationRecord } from "../../../main/contracts";
import {
  describeAutomationSchedule,
  describeAutomationWorkspace,
  isAutomationScheduleEditable,
  parseAutomationSchedule,
} from "./automation-form-utils.js";

type AutomationRowProps = {
  automation: DesktopAutomationRecord;
  onSelect: (id: string) => void;
  selected: boolean;
};

function humanCadence(record: DesktopAutomationRecord): string {
  if (!isAutomationScheduleEditable(record.rrule)) {
    return "Custom schedule";
  }
  return describeAutomationSchedule(parseAutomationSchedule(record.rrule));
}

function formatNextRun(nextRunAt: string | null): string | null {
  if (!nextRunAt) {
    return null;
  }
  const when = new Date(nextRunAt);
  if (Number.isNaN(when.getTime())) {
    return null;
  }
  return when.toLocaleString();
}

export function AutomationRow({ automation, onSelect, selected }: AutomationRowProps) {
  const workspaceLabel = describeAutomationWorkspace(automation.cwds);
  const cadence = humanCadence(automation);
  const nextRun = formatNextRun(automation.nextRunAt);
  const statusLabel = automation.status === "PAUSED" ? "Paused" : "Active";

  return (
    <button
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-left transition-colors",
        selected ? "bg-ink text-canvas" : "bg-surface-soft text-ink hover:bg-surface-strong",
      )}
      onClick={() => onSelect(automation.id)}
      type="button"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-medium">
          {automation.name || "Untitled automation"}
        </span>
        <span
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-1 text-xs",
            selected ? "text-canvas/75" : "text-ink-muted",
          )}
        >
          <span className="inline-flex items-center gap-1">
            <Folder className="size-3.5" />
            {workspaceLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-3.5" />
            {cadence}
          </span>
          <span>{statusLabel}</span>
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 text-right text-xs",
          selected ? "text-canvas/75" : "text-ink-muted",
        )}
      >
        {nextRun ? `Next ${nextRun}` : "No upcoming run"}
      </span>
    </button>
  );
}
