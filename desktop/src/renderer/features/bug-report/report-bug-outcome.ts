import type { DesktopBugReportResult } from "../../../shared/contracts/bug-reporting.js";

export interface ReportBugOutcomeLink {
  readonly label: string;
  readonly href: string;
}

export interface ReportBugOutcomePresentation {
  readonly title: string;
  readonly detail: string;
  readonly links: ReportBugOutcomeLink[];
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function resolveReportBugOutcomePresentation(
  result: DesktopBugReportResult | null | undefined,
): ReportBugOutcomePresentation {
  if (!result) {
    return {
      title: "Thanks — your report was sent",
      detail: "We've received your report and attached diagnostics for team review.",
      links: [],
    };
  }

  const links: ReportBugOutcomeLink[] = [];
  if (isNonEmptyString(result.sentryIssueUrl)) {
    links.push({ label: "View Sentry issue", href: result.sentryIssueUrl });
  }

  return {
    title: "Thanks — your report was sent",
    detail: "We captured your report in Sentry with the attached diagnostics for follow-up.",
    links,
  };
}
