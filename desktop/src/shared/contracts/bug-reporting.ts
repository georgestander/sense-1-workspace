export type DesktopBugReportType = "manual" | "automatic";

export type DesktopBugSeverity = "low" | "medium" | "high" | "critical";

export type DesktopBugAttachmentKind = "screenshot" | "file";
export type DesktopBugCorrelationActionKind = "click" | "view" | "action";
export type DesktopBugCorrelationActionStatus = "observed" | "started" | "succeeded" | "failed" | "no-op";
export type DesktopBugCorrelationEventSource = "renderer" | "main";

export interface DesktopBugAttachment {
  readonly kind: DesktopBugAttachmentKind;
  readonly path: string;
  readonly mimeType: string | null;
}

export interface DesktopBugCorrelationView {
  readonly view: string | null;
  readonly url: string | null;
  readonly documentTitle: string | null;
  readonly selectedThreadId: string | null;
}

export interface DesktopBugCorrelationAction {
  readonly kind: DesktopBugCorrelationActionKind;
  readonly status: DesktopBugCorrelationActionStatus;
  readonly name: string;
  readonly detail: string | null;
  readonly timestamp: string;
}

export interface DesktopBugCorrelationEvent {
  readonly eventId: string;
  readonly source: DesktopBugCorrelationEventSource;
  readonly title: string | null;
  readonly level: string | null;
  readonly timestamp: string;
}

export interface DesktopBugCorrelation {
  readonly view: DesktopBugCorrelationView | null;
  readonly recentActions: DesktopBugCorrelationAction[];
  readonly recentEvents: DesktopBugCorrelationEvent[];
}

export interface DesktopBugReportDraft {
  readonly reportType: DesktopBugReportType;
  readonly title: string;
  readonly description: string;
  readonly expectedBehavior: string | null;
  readonly reproductionSteps: string | null;
  readonly severity?: DesktopBugSeverity | null;
  readonly attachments: DesktopBugAttachment[];
  readonly correlation?: DesktopBugCorrelation | null;
}

export interface DesktopBugReportingStatus {
  readonly sentryEnabled: boolean;
}

export interface DesktopBugReportResult {
  readonly sentryEventId: string | null;
  readonly sentryIssueUrl: string | null;
}

export type DesktopCrashReportSuggestionReason =
  | "runtime-crashed"
  | "runtime-errored"
  | "bootstrap-blocked"
  | "renderer-gone";

export interface DesktopCrashReportSuggestion {
  readonly reason: DesktopCrashReportSuggestionReason;
  readonly detail: string | null;
  readonly setupCode: string | null;
  readonly restartCount: number | null;
  readonly occurredAt: string;
}

export interface DesktopCrashReportAcknowledgeRequest {
  readonly occurredAt: string;
}

export interface DesktopCrashReportAcknowledgeResult {
  readonly acknowledged: boolean;
}
