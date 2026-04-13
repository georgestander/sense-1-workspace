import { Clock3, ChevronDown } from "lucide-react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { cn } from "../../lib/cn";
import {
  DEFAULT_WEEKDAY_CODES,
  WEEKDAY_OPTIONS,
  type AutomationScheduleDraft,
  type AutomationScheduleMode,
  describeAutomationSchedule,
} from "./automation-form-utils.js";

type AutomationScheduleFieldProps = {
  disabled?: boolean;
  value: AutomationScheduleDraft;
  onChange: (value: AutomationScheduleDraft) => void;
};

function updateCadence(value: AutomationScheduleDraft, cadence: AutomationScheduleMode): AutomationScheduleDraft {
  if (cadence === "hourly") {
    return {
      ...value,
      cadence,
      interval: Math.max(1, value.interval || 1),
      minute: Math.min(Math.max(value.minute || 0, 0), 59),
    };
  }

  if (cadence === "daily") {
    return {
      ...value,
      cadence,
      time: value.time || "09:00",
    };
  }

  const nextDays = cadence === "weekdays"
    ? [...DEFAULT_WEEKDAY_CODES]
    : value.days.length > 0
      ? [...value.days]
      : [...DEFAULT_WEEKDAY_CODES];

  return {
    ...value,
    cadence,
    days: nextDays,
    time: value.time || "09:00",
  };
}

export function AutomationScheduleField({ disabled = false, value, onChange }: AutomationScheduleFieldProps) {
  const summary = disabled ? "Custom RRULE preserved as-is" : describeAutomationSchedule(value);
  const isHourly = value.cadence === "hourly";
  const isWeekly = value.cadence === "weekly";

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Schedule</span>
      <div className={cn("rounded-2xl border border-line/40 bg-canvas p-3", disabled && "opacity-80")}>
        <p className="text-sm font-medium text-ink">{summary}</p>
        <p className="mt-1 text-xs leading-5 text-ink-muted">Use the schedule controls below instead of editing RRULE text directly.</p>
        {disabled ? (
          <p className="mt-2 rounded-xl bg-surface-soft px-3 py-2 text-xs leading-5 text-ink-muted">
            This automation uses an RRULE the builder cannot edit yet. Saving other fields preserves the existing schedule unchanged.
          </p>
        ) : null}

        <div className="mt-3 grid gap-3">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <label className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Repeat</span>
              <div className="flex items-center gap-2 rounded-xl border border-line/40 bg-white px-3 py-2 text-sm text-ink outline-none focus-within:ring-[3px] focus-within:ring-accent/30">
                <Clock3 className="size-4 shrink-0 text-muted" />
                <select
                  disabled={disabled}
                  className="min-w-0 flex-1 bg-transparent outline-none"
                  onChange={(event) => onChange(updateCadence(value, event.target.value as AutomationScheduleMode))}
                  value={value.cadence}
                >
                  <option value="weekdays">Weekdays</option>
                  <option value="weekly">Weekly</option>
                  <option value="daily">Daily</option>
                  <option value="hourly">Hourly</option>
                </select>
                <ChevronDown className="size-4 shrink-0 text-muted" />
              </div>
            </label>

            {isHourly ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Interval</span>
                  <Input
                    disabled={disabled}
                    min={1}
                    onChange={(event) => {
                      onChange({
                        ...value,
                        interval: Number.parseInt(event.target.value, 10) || 1,
                      });
                    }}
                    type="number"
                    value={value.interval}
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Minute</span>
                  <Input
                    disabled={disabled}
                    max={59}
                    min={0}
                    onChange={(event) => {
                      onChange({
                        ...value,
                        minute: Number.parseInt(event.target.value, 10) || 0,
                      });
                    }}
                    type="number"
                    value={value.minute}
                  />
                </label>
              </div>
            ) : (
              <label className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Time</span>
                <Input
                  disabled={disabled}
                  onChange={(event) => onChange({ ...value, time: event.target.value })}
                  type="time"
                  value={value.time}
                />
              </label>
            )}
          </div>

          {isWeekly ? (
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((option) => {
                const selected = value.days.includes(option.code);
                return (
                  <Button
                    aria-pressed={selected}
                    disabled={disabled}
                    className={cn("h-8 px-3 text-xs", selected ? "bg-ink text-white hover:bg-ink-soft" : "")}
                    key={option.code}
                    onClick={() => {
                      const nextDays = selected
                        ? value.days.filter((day) => day !== option.code)
                        : [...value.days, option.code];
                      onChange({
                        ...value,
                        days: nextDays.length > 0 ? nextDays : [...DEFAULT_WEEKDAY_CODES],
                      });
                    }}
                    variant={selected ? "default" : "secondary"}
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
