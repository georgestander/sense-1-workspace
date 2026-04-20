import { folderDisplayName } from "../../state/session/session-selectors.js";

export const AUTOMATION_KIND_LABEL = "Workspace automation";
export const AUTOMATION_ALPHA_NOTE =
  "Automations run on a workspace folder on a cron schedule. Scheduling directly from a thread isn't part of this alpha.";

export type AutomationScheduleMode = "weekdays" | "weekly" | "daily" | "hourly";

export type AutomationScheduleDraft = {
  cadence: AutomationScheduleMode;
  time: string;
  days: string[];
  interval: number;
  minute: number;
};

export const WEEKDAY_OPTIONS = [
  { code: "MO", label: "Mon" },
  { code: "TU", label: "Tue" },
  { code: "WE", label: "Wed" },
  { code: "TH", label: "Thu" },
  { code: "FR", label: "Fri" },
  { code: "SA", label: "Sat" },
  { code: "SU", label: "Sun" },
] as const;

export const DEFAULT_WEEKDAY_CODES = WEEKDAY_OPTIONS.slice(0, 5).map((option) => option.code);

const DEFAULT_TIME = "09:00";
const DEFAULT_INTERVAL = 1;
const DEFAULT_MINUTE = 0;
const HOURLY_KEYS = new Set(["FREQ", "INTERVAL", "BYMINUTE"]);
const DAILY_KEYS = new Set(["FREQ", "BYHOUR", "BYMINUTE"]);
const WEEKLY_KEYS = new Set(["FREQ", "BYDAY", "BYHOUR", "BYMINUTE"]);

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.min(Math.max(Math.trunc(value), minimum), maximum);
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function parseParts(rrule: string): Record<string, string> {
  return Object.fromEntries(
    rrule
      .replace(/^RRULE:/, "")
      .split(";")
      .map((entry) => {
        const [key, rawValue = ""] = entry.split("=");
        return [key.trim().toUpperCase(), rawValue.trim().toUpperCase()];
      }),
  );
}

function parseTimeValue(value: string | null | undefined): { hour: number; minute: number } {
  if (!value || !/^\d{1,2}:\d{1,2}$/.test(value)) {
    return { hour: 9, minute: 0 };
  }

  const [hourValue, minuteValue] = value.split(":");
  const hour = clampInteger(Number.parseInt(hourValue ?? "9", 10), 0, 23);
  const minute = clampInteger(Number.parseInt(minuteValue ?? "0", 10), 0, 59);
  return { hour, minute };
}

function formatTimeValue(hour: number, minute: number): string {
  return `${pad(clampInteger(hour, 0, 23))}:${pad(clampInteger(minute, 0, 59))}`;
}

function normalizeDays(days: string[]): string[] {
  const unique = new Set(days.map((day) => day.trim().toUpperCase()).filter(Boolean));
  return WEEKDAY_OPTIONS.map((option) => option.code).filter((code) => unique.has(code));
}

function isIntegerWithin(value: string | undefined, minimum: number, maximum: number): boolean {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum;
}

function hasOnlyKeys(parts: Record<string, string>, allowedKeys: Set<string>): boolean {
  return Object.keys(parts).every((key) => allowedKeys.has(key));
}

function isWeekdaySet(days: string[]): boolean {
  return days.length === DEFAULT_WEEKDAY_CODES.length && DEFAULT_WEEKDAY_CODES.every((code, index) => days[index] === code);
}

export function createDefaultAutomationSchedule(): AutomationScheduleDraft {
  return {
    cadence: "weekdays",
    days: [...DEFAULT_WEEKDAY_CODES],
    interval: DEFAULT_INTERVAL,
    minute: DEFAULT_MINUTE,
    time: DEFAULT_TIME,
  };
}

export function formatWorkspaceOptionLabel(folderPath: string): string {
  const displayName = folderDisplayName(folderPath).trim();
  if (!displayName || displayName === "/" || displayName === ".") {
    return "Workspace";
  }
  return displayName.startsWith("/") ? displayName : `/${displayName}`;
}

export function describeAutomationWorkspace(cwds: readonly string[] | null | undefined): string {
  if (!Array.isArray(cwds)) {
    return "No workspace bound";
  }
  const firstPath = cwds.find((entry) => typeof entry === "string" && entry.trim());
  if (!firstPath) {
    return "No workspace bound";
  }
  return formatWorkspaceOptionLabel(firstPath);
}

export function normalizeWorkspaceOptions(options: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const option of options) {
    const trimmed = option.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

export function isAutomationScheduleEditable(rrule: string): boolean {
  const parts = parseParts(rrule);

  if (parts.FREQ === "HOURLY") {
    return hasOnlyKeys(parts, HOURLY_KEYS) && isIntegerWithin(parts.INTERVAL, 1, 24) && isIntegerWithin(parts.BYMINUTE, 0, 59);
  }

  if (parts.FREQ === "DAILY") {
    return hasOnlyKeys(parts, DAILY_KEYS) && isIntegerWithin(parts.BYHOUR, 0, 23) && isIntegerWithin(parts.BYMINUTE, 0, 59);
  }

  if (parts.FREQ === "WEEKLY") {
    const byDay = parts.BYDAY?.split(",").map((day) => day.trim().toUpperCase()).filter(Boolean) ?? [];
    const validDays = byDay.length > 0 && byDay.every((day) => WEEKDAY_OPTIONS.some((option) => option.code === day));
    return hasOnlyKeys(parts, WEEKLY_KEYS) && validDays && isIntegerWithin(parts.BYHOUR, 0, 23) && isIntegerWithin(parts.BYMINUTE, 0, 59);
  }

  return false;
}

export function parseAutomationSchedule(rrule: string): AutomationScheduleDraft {
  const parts = parseParts(rrule);
  const base = createDefaultAutomationSchedule();

  if (parts.FREQ === "HOURLY") {
    return {
      ...base,
      cadence: "hourly",
      interval: clampInteger(Number.parseInt(parts.INTERVAL ?? "1", 10), 1, 24),
      minute: clampInteger(Number.parseInt(parts.BYMINUTE ?? "0", 10), 0, 59),
    };
  }

  if (parts.FREQ === "DAILY") {
    const { hour, minute } = parseTimeValue(`${parts.BYHOUR ?? "9"}:${parts.BYMINUTE ?? "0"}`);
    return {
      ...base,
      cadence: "daily",
      time: formatTimeValue(hour, minute),
    };
  }

  if (parts.FREQ === "WEEKLY") {
    const parsedDays = normalizeDays((parts.BYDAY ?? "").split(",").filter(Boolean));
    const { hour, minute } = parseTimeValue(`${parts.BYHOUR ?? "9"}:${parts.BYMINUTE ?? "0"}`);
    const days = parsedDays.length > 0 ? parsedDays : [...DEFAULT_WEEKDAY_CODES];
    return {
      ...base,
      cadence: isWeekdaySet(days) ? "weekdays" : "weekly",
      days,
      time: formatTimeValue(hour, minute),
    };
  }

  return base;
}

export function buildAutomationScheduleRrule(schedule: AutomationScheduleDraft): string {
  if (schedule.cadence === "hourly") {
    const interval = clampInteger(schedule.interval, 1, 24);
    const minute = clampInteger(schedule.minute, 0, 59);
    return `RRULE:FREQ=HOURLY;INTERVAL=${interval};BYMINUTE=${minute}`;
  }

  const { hour, minute } = parseTimeValue(schedule.time);

  if (schedule.cadence === "daily") {
    return `RRULE:FREQ=DAILY;BYHOUR=${hour};BYMINUTE=${minute}`;
  }

  const days = schedule.cadence === "weekdays"
    ? [...DEFAULT_WEEKDAY_CODES]
    : normalizeDays(schedule.days).slice(0, 7);

  return `RRULE:FREQ=WEEKLY;BYDAY=${(days.length > 0 ? days : DEFAULT_WEEKDAY_CODES).join(",")};BYHOUR=${hour};BYMINUTE=${minute}`;
}

export function resolveAutomationSaveRrule(rrule: string, schedule: AutomationScheduleDraft, editable: boolean): string {
  return editable ? buildAutomationScheduleRrule(schedule) : rrule;
}

export function describeAutomationSchedule(schedule: AutomationScheduleDraft): string {
  if (schedule.cadence === "hourly") {
    const interval = clampInteger(schedule.interval, 1, 24);
    const minute = pad(clampInteger(schedule.minute, 0, 59));
    return `Every ${interval} hour${interval === 1 ? "" : "s"} at minute ${minute}`;
  }

  if (schedule.cadence === "daily") {
    return `Every day at ${schedule.time}`;
  }

  if (schedule.cadence === "weekdays") {
    return `Every weekday at ${schedule.time}`;
  }

  const labels = normalizeDays(schedule.days)
    .map((code) => WEEKDAY_OPTIONS.find((option) => option.code === code)?.label ?? code);

  return `Every ${labels.join(", ")} at ${schedule.time}`;
}
