import * as Sentry from "@sentry/electron/main";

import type { DesktopBugReportDraft } from "../../shared/contracts/bug-reporting.ts";
import type { RuntimeInfoResult } from "../../shared/contracts/runtime.ts";

export interface DesktopCapturedBugContext {
  readonly runtimeInfo: RuntimeInfoResult;
  readonly thread: {
    readonly id: string | null;
    readonly title: string | null;
    readonly workspaceRoot: string | null;
    readonly cwd: string | null;
  } | null;
  readonly accountEmail: string | null;
  readonly tenantName: string | null;
  readonly recentLogs: Array<{ readonly level: string; readonly message: string; readonly timestamp: string }>;
}

function normalizeFingerprintValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "report";
}

export function captureDesktopManualBugReport(options: {
  readonly report: DesktopBugReportDraft;
  readonly severity: string;
  readonly context: DesktopCapturedBugContext;
}): string {
  const { context, report, severity } = options;
  let eventId = "";

  Sentry.withScope((scope) => {
    scope.setLevel(severity === "critical" || severity === "high" ? "error" : "warning");
    scope.setTag("sense1.report.type", report.reportType);
    scope.setTag("sense1.report.severity", severity);
    scope.setTag("sense1.report.source", "desktop-manual-report");
    if (context.thread?.id) {
      scope.setTag("sense1.thread.id", context.thread.id);
    }
    if (context.thread?.workspaceRoot) {
      scope.setTag("sense1.workspace.root", context.thread.workspaceRoot);
    }
    scope.setFingerprint([
      "sense1-manual-bug-report",
      normalizeFingerprintValue(report.title || report.description),
    ]);
    scope.setContext("sense1BugReport", {
      expectedBehavior: report.expectedBehavior,
      reproductionSteps: report.reproductionSteps,
      attachmentPaths: report.attachments.map((entry) => entry.path),
    });
    scope.setContext("sense1Diagnostics", {
      appVersion: context.runtimeInfo.appVersion,
      electronVersion: context.runtimeInfo.electronVersion,
      platform: context.runtimeInfo.platform,
      startedAt: context.runtimeInfo.startedAt,
      thread: context.thread,
      tenantName: context.tenantName,
      recentLogs: context.recentLogs,
    });
    if (context.accountEmail) {
      scope.setUser({ email: context.accountEmail });
    }
    scope.setExtra("description", report.description);
    if (report.expectedBehavior) {
      scope.setExtra("expectedBehavior", report.expectedBehavior);
    }
    if (report.reproductionSteps) {
      scope.setExtra("reproductionSteps", report.reproductionSteps);
    }
    if (report.attachments.length > 0) {
      scope.setExtra("attachmentMetadata", report.attachments);
    }
    eventId = Sentry.captureMessage(report.title || "Desktop bug report");
  });

  return eventId;
}
