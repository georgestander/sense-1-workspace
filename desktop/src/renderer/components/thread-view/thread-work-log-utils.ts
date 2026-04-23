import type { DesktopThreadEntry } from "../../lib/live-thread-data.js";

const COMPLETED_STATUSES = new Set(["complete", "completed", "done", "success", "succeeded"]);
const TERMINAL_STATUSES = new Set([...COMPLETED_STATUSES, "blocked", "cancelled", "canceled", "error", "errored", "failed"]);

export type ThreadActivityGroup = {
  kind: "activity-group";
  entries: DesktopThreadEntry[];
  latestLabel: string;
  durationLabel: string | null;
  id: string;
  isRunning: boolean;
};

function coerceDisplayText(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value == null) {
    return fallback;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toString()} ${count === 1 ? singular : plural}`;
}

function capitalize(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function statusText(entry: DesktopThreadEntry): string | null {
  return "status" in entry ? coerceDisplayText(entry.status).trim().toLowerCase() : null;
}

export function isCompletedStatus(status: string | null | undefined): boolean {
  return COMPLETED_STATUSES.has(coerceDisplayText(status).trim().toLowerCase());
}

export function isThreadEntryRunning(entry: DesktopThreadEntry): boolean {
  const status = statusText(entry);
  return Boolean(status && !TERMINAL_STATUSES.has(status));
}

function isCommentaryEntry(entry: DesktopThreadEntry): boolean {
  return entry.kind === "assistant" && "phase" in entry && entry.phase === "commentary";
}

export function isWorkLogEntry(entry: DesktopThreadEntry): boolean {
  return (
    entry.kind === "command"
    || entry.kind === "tool"
    || entry.kind === "fileChange"
    || entry.kind === "reasoning"
    || isCommentaryEntry(entry)
  );
}

function fileChangeCounts(entries: DesktopThreadEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind !== "fileChange") {
      continue;
    }
    for (const change of entry.changes) {
      const rawKind = coerceDisplayText(change.kind, "changed").trim().toLowerCase();
      const kind = rawKind === "modified" ? "edited" : rawKind || "changed";
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
  }
  return counts;
}

export function summarizeActivityGroup(entries: DesktopThreadEntry[]): string {
  const commands = entries.filter((entry) => entry.kind === "command").length;
  const tools = entries.filter((entry) => entry.kind === "tool").length;
  const reasoning = entries.filter((entry) => entry.kind === "reasoning").length;
  const counts = fileChangeCounts(entries);
  const parts: string[] = [];

  for (const [kind, count] of counts) {
    parts.push(`${kind} ${pluralize(count, "file")}`);
  }
  if (commands > 0) {
    parts.push(`ran ${pluralize(commands, "command")}`);
  }
  if (tools > 0) {
    parts.push(`called ${pluralize(tools, "tool")}`);
  }
  if (reasoning > 0) {
    parts.push(`updated ${pluralize(reasoning, "thought")}`);
  }

  if (parts.length > 0) {
    return capitalize(parts.join(", "));
  }
  if (entries.some(isCommentaryEntry)) {
    return entries.length === 1 ? "Progress update" : "Progress updates";
  }
  return `Worked through ${pluralize(entries.length, "step")}`;
}

function parseTime(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function entryStartedAt(entry: DesktopThreadEntry): number | null {
  return parseTime("startedAt" in entry ? entry.startedAt : null);
}

function entryCompletedAt(entry: DesktopThreadEntry): number | null {
  return parseTime("completedAt" in entry ? entry.completedAt : null);
}

function commandDurationFallback(entries: DesktopThreadEntry[]): number | null {
  const total = entries.reduce((sum, entry) => {
    if (entry.kind !== "command" || !Number.isFinite(entry.durationMs) || entry.durationMs == null || entry.durationMs < 0) {
      return sum;
    }
    return sum + entry.durationMs;
  }, 0);
  return total > 0 ? total : null;
}

function formatWorkedDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return "Worked for <1s";
  }
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  if (totalSeconds < 60) {
    return `Worked for ${totalSeconds.toString()}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `Worked for ${minutes.toString()}m ${seconds.toString()}s`;
}

function summarizeActivityDuration(entries: DesktopThreadEntry[]): string | null {
  const fallback = commandDurationFallback(entries);
  const starts = entries.map(entryStartedAt).filter((value): value is number => value !== null);
  const ends = entries.map(entryCompletedAt).filter((value): value is number => value !== null);
  if (starts.length > 0 && ends.length > 0) {
    const durationMs = Math.max(...ends) - Math.min(...starts);
    if (durationMs >= 0) {
      return formatWorkedDuration(fallback != null && durationMs < 1000 ? fallback : durationMs);
    }
  }

  return fallback == null ? null : formatWorkedDuration(fallback);
}

export function buildActivityGroup(entries: DesktopThreadEntry[]): ThreadActivityGroup {
  const isRunning = entries.some(isThreadEntryRunning);
  return {
    kind: "activity-group",
    entries: [...entries],
    latestLabel: summarizeActivityGroup(entries),
    durationLabel: isRunning ? null : summarizeActivityDuration(entries),
    id: `activity-${entries[0].id}`,
    isRunning,
  };
}
