import type { DesktopBugCorrelationEvent, DesktopBugCorrelationEventSource } from "./contracts/bug-reporting.js";

const DEFAULT_EVENT_LIMIT = 8;

function firstNonEmptyString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function trimToLength(value: string | null, maxLength: number): string | null {
  if (!value) {
    return null;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function resolveEventTitle(event: {
  message?: unknown;
  exception?: { values?: Array<{ type?: unknown; value?: unknown }> } | null;
}): string | null {
  const exception = Array.isArray(event.exception?.values) ? event.exception.values[0] : null;
  const exceptionType = firstNonEmptyString(exception?.type);
  const exceptionValue = firstNonEmptyString(exception?.value);
  const exceptionTitle = firstNonEmptyString(
    exceptionType && exceptionValue ? `${exceptionType}: ${exceptionValue}` : null,
    exceptionValue,
    exceptionType,
  );
  return trimToLength(firstNonEmptyString(event.message, exceptionTitle), 160);
}

export function summarizeSentryEvent(
  source: DesktopBugCorrelationEventSource,
  event: {
    event_id?: unknown;
    level?: unknown;
    message?: unknown;
    timestamp?: unknown;
    exception?: { values?: Array<{ type?: unknown; value?: unknown }> } | null;
  },
): DesktopBugCorrelationEvent | null {
  const eventId = firstNonEmptyString(event.event_id);
  if (!eventId) {
    return null;
  }

  return {
    eventId,
    source,
    title: resolveEventTitle(event),
    level: firstNonEmptyString(event.level),
    timestamp: firstNonEmptyString(event.timestamp, new Date().toISOString()) ?? new Date().toISOString(),
  };
}

export class RecentSentryEventBuffer {
  readonly #source: DesktopBugCorrelationEventSource;
  readonly #limit: number;
  #events: DesktopBugCorrelationEvent[] = [];

  constructor(source: DesktopBugCorrelationEventSource, limit = DEFAULT_EVENT_LIMIT) {
    this.#source = source;
    this.#limit = Math.max(1, limit);
  }

  record(event: {
    event_id?: unknown;
    level?: unknown;
    message?: unknown;
    timestamp?: unknown;
    exception?: { values?: Array<{ type?: unknown; value?: unknown }> } | null;
  }): void {
    const summary = summarizeSentryEvent(this.#source, event);
    if (!summary) {
      return;
    }

    this.#events = [
      summary,
      ...this.#events.filter((entry) => entry.eventId !== summary.eventId),
    ].slice(0, this.#limit);
  }

  snapshot(): DesktopBugCorrelationEvent[] {
    return this.#events.map((entry) => ({ ...entry }));
  }
}
