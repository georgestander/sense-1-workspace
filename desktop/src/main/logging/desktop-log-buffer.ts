export interface DesktopLogEntry {
  readonly level: "log" | "info" | "warn" | "error";
  readonly message: string;
  readonly timestamp: string;
}

export interface DesktopLogBuffer {
  push(entry: DesktopLogEntry): void;
  list(limit?: number): DesktopLogEntry[];
}

function stringifyLogArg(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.stack ?? value.message;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatDesktopLogMessage(args: unknown[]): string {
  return args.map((value) => stringifyLogArg(value)).join(" ").trim();
}

export function createDesktopLogBuffer(limit = 200): DesktopLogBuffer {
  const entries: DesktopLogEntry[] = [];

  return {
    push(entry: DesktopLogEntry): void {
      entries.push(entry);
      if (entries.length > limit) {
        entries.splice(0, entries.length - limit);
      }
    },
    list(maxEntries = 50): DesktopLogEntry[] {
      if (maxEntries <= 0) {
        return [];
      }
      return entries.slice(-maxEntries);
    },
  };
}

export function installDesktopLogBuffer(
  buffer: DesktopLogBuffer,
  consoleLike: Console = console,
): void {
  const installKey = "__sense1LogBufferInstalled";
  const taggedConsole = consoleLike as Console & { [installKey]?: boolean };
  if (taggedConsole[installKey] === true) {
    return;
  }

  const levels = ["log", "info", "warn", "error"] as const;

  for (const level of levels) {
    const original = consoleLike[level].bind(consoleLike);
    consoleLike[level] = ((...args: unknown[]) => {
      buffer.push({
        level,
        message: formatDesktopLogMessage(args),
        timestamp: new Date().toISOString(),
      });
      original(...args);
    }) as Console[typeof level];
  }

  taggedConsole[installKey] = true;
}
