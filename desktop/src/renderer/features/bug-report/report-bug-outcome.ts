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
      detail: "We've received your report and the team can review it during triage.",
      links: [],
    };
  }

  const links: ReportBugOutcomeLink[] = [];
  if (isNonEmptyString(result.linearIssueUrl)) {
    links.push({ label: "View tracking ticket", href: result.linearIssueUrl });
  }
  if (isNonEmptyString(result.sentryIssueUrl)) {
    links.push({ label: "View Sentry issue", href: result.sentryIssueUrl });
  }

  switch (result.promotionDisposition) {
    case "create":
      return {
        title: "Thanks — your report was sent and a tracking ticket was created",
        detail: result.promotionReason || "The team can pick up the linked ticket directly from triage.",
        links,
      };
    case "link":
      return {
        title: "Thanks — your report was linked to an existing tracking ticket",
        detail: result.promotionReason || "The team can review the linked ticket and attached diagnostics during triage.",
        links,
      };
    case "deferred":
      return {
        title: "Thanks — your report was sent for triage",
        detail: result.promotionReason || "We captured the report, but ticket creation is deferred for now.",
        links,
      };
    case "skip":
    default:
      return {
        title: "Thanks — your report was sent for review",
        detail: result.promotionReason || "We captured the report for the team even though no tracking ticket was created automatically.",
        links,
      };
  }
}
