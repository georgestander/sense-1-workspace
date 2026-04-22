export type DesktopBugReportType = "manual" | "automatic";

export type DesktopBugSeverity = "low" | "medium" | "high" | "critical";

export type DesktopBugAttachmentKind = "screenshot" | "file";

export interface DesktopBugAttachment {
  readonly kind: DesktopBugAttachmentKind;
  readonly path: string;
  readonly mimeType: string | null;
}

export interface DesktopBugReportDraft {
  readonly reportType: DesktopBugReportType;
  readonly title: string;
  readonly description: string;
  readonly expectedBehavior: string | null;
  readonly reproductionSteps: string | null;
  readonly severity?: DesktopBugSeverity | null;
  readonly attachments: DesktopBugAttachment[];
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
