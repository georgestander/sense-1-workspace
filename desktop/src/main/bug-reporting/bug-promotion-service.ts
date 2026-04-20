import type { DesktopBugPromotionDisposition, DesktopBugReportDraft, DesktopBugSeverity } from "../../shared/contracts/bug-reporting.ts";

export interface DesktopBugPromotionDecision {
  readonly disposition: DesktopBugPromotionDisposition;
  readonly reason: string;
  readonly severity: DesktopBugSeverity;
}

function normalizeWhitespace(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function resolveDesktopBugSeverity(report: DesktopBugReportDraft): DesktopBugSeverity {
  if (report.severity) {
    return report.severity;
  }

  if (report.reportType === "automatic") {
    return "high";
  }

  const description = normalizeWhitespace(report.description).toLowerCase();
  if (/\bcrash|data loss|corrupt|blocked|broken\b/.test(description)) {
    return "high";
  }

  return "medium";
}

export function decideDesktopBugPromotion(options: {
  readonly linearConfigured: boolean;
  readonly report: DesktopBugReportDraft;
}): DesktopBugPromotionDecision {
  const { linearConfigured, report } = options;
  const title = normalizeWhitespace(report.title);
  const description = normalizeWhitespace(report.description);
  const severity = resolveDesktopBugSeverity(report);

  if (!title || description.length < 10) {
    return {
      disposition: "skip",
      reason: "Report does not yet contain enough actionable detail for ticket creation.",
      severity,
    };
  }

  if (!linearConfigured) {
    return {
      disposition: "deferred",
      reason: "Linear is not configured in this environment, so promotion is deferred after Sentry ingestion.",
      severity,
    };
  }

  if (report.reportType === "automatic" && severity !== "critical" && severity !== "high") {
    return {
      disposition: "skip",
      reason: "Automatic event did not meet the severity threshold for Linear promotion.",
      severity,
    };
  }

  return {
    disposition: "create",
    reason: "Report meets the actionability threshold for Linear ticket creation.",
    severity,
  };
}
