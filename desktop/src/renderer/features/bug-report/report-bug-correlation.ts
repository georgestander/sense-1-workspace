import type {
  DesktopBugCorrelation,
  DesktopBugCorrelationAction,
  DesktopBugCorrelationActionKind,
  DesktopBugCorrelationActionStatus,
  DesktopBugCorrelationEvent,
  DesktopBugCorrelationView,
} from "../../../shared/contracts/bug-reporting.js";
import { RecentSentryEventBuffer } from "../../../shared/bug-report-correlation.js";

const ACTION_LIMIT = 24;
const eventBuffer = new RecentSentryEventBuffer("renderer");

let installed = false;
let currentView: DesktopBugCorrelationView = {
  view: null,
  url: null,
  documentTitle: null,
  selectedThreadId: null,
};
let recentActions: DesktopBugCorrelationAction[] = [];

function normalizeWhitespace(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.replace(/\s+/gu, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function truncate(value: string | null, maxLength: number): string | null {
  if (!value) {
    return null;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function pushAction(entry: DesktopBugCorrelationAction): void {
  recentActions = [entry, ...recentActions].slice(0, ACTION_LIMIT);
}

function describeInteractiveTarget(target: Element): { name: string; detail: string | null } | null {
  const interactive = target.closest("button, a, [role='button'], input[type='button'], input[type='submit'], summary");
  if (!interactive) {
    return null;
  }

  const rawName = normalizeWhitespace(
    interactive.getAttribute("data-bug-action")
      ?? interactive.getAttribute("aria-label")
      ?? interactive.getAttribute("title")
      ?? ("value" in interactive ? String((interactive as HTMLInputElement).value ?? "") : null)
      ?? interactive.textContent
      ?? interactive.id
      ?? interactive.tagName.toLowerCase(),
  );
  const detail = normalizeWhitespace(
    interactive.getAttribute("href")
      ?? interactive.getAttribute("data-testid")
      ?? interactive.getAttribute("name")
      ?? interactive.id
      ?? null,
  );

  return {
    name: truncate(rawName ?? interactive.tagName.toLowerCase(), 120) ?? interactive.tagName.toLowerCase(),
    detail: truncate(detail, 120),
  };
}

function refreshWindowContext(): void {
  if (typeof window === "undefined") {
    return;
  }

  currentView = {
    ...currentView,
    url: truncate(normalizeWhitespace(window.location?.href ?? null), 240),
    documentTitle: truncate(normalizeWhitespace(document.title), 160),
  };
}

export function installReportBugCorrelationCapture(): void {
  if (installed || typeof document === "undefined") {
    return;
  }

  installed = true;
  refreshWindowContext();
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const described = describeInteractiveTarget(target);
      if (!described) {
        return;
      }

      recordReportBugAction("click", "observed", described.name, described.detail);
    },
    true,
  );
}

export function updateReportBugViewContext(next: {
  readonly view: string | null;
  readonly selectedThreadId?: string | null;
}): void {
  refreshWindowContext();
  const previousView = currentView.view;
  const previousThreadId = currentView.selectedThreadId;
  currentView = {
    ...currentView,
    view: normalizeWhitespace(next.view),
    selectedThreadId: normalizeWhitespace(next.selectedThreadId ?? null),
  };

  if (currentView.view !== previousView || currentView.selectedThreadId !== previousThreadId) {
    recordReportBugAction(
      "view",
      "succeeded",
      currentView.view ?? "unknown",
      currentView.selectedThreadId ? `thread:${currentView.selectedThreadId}` : null,
    );
  }
}

export function recordReportBugAction(
  kind: DesktopBugCorrelationActionKind,
  status: DesktopBugCorrelationActionStatus,
  name: string,
  detail: string | null = null,
): void {
  pushAction({
    kind,
    status,
    name: truncate(normalizeWhitespace(name) ?? "action", 120) ?? "action",
    detail: truncate(normalizeWhitespace(detail), 160),
    timestamp: new Date().toISOString(),
  });
}

export function recordReportBugRendererEvent(event: {
  event_id?: unknown;
  level?: unknown;
  message?: unknown;
  timestamp?: unknown;
  exception?: { values?: Array<{ type?: unknown; value?: unknown }> } | null;
}): void {
  eventBuffer.record(event);
}

export function getReportBugCorrelationSnapshot(): DesktopBugCorrelation {
  refreshWindowContext();
  return {
    view: { ...currentView },
    recentActions: recentActions.map((entry) => ({ ...entry })),
    recentEvents: eventBuffer.snapshot().map((entry: DesktopBugCorrelationEvent) => ({ ...entry })),
  };
}
