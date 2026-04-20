import type {
  DesktopBugAttachment,
  DesktopBugReportDraft,
  DesktopBugReportResult,
  DesktopBugReportingStatus,
} from "../../shared/contracts/bug-reporting.ts";
import type { DesktopBootstrap } from "../../shared/contracts/bootstrap.ts";
import type { RuntimeInfoResult } from "../../shared/contracts/runtime.ts";
import type { DesktopLogEntry } from "../logging/desktop-log-buffer.ts";
import { decideDesktopBugPromotion } from "./bug-promotion-service.ts";
import { LinearIssueAdapter } from "./linear-issue-adapter.ts";
import { redactLogEntries, redactSensitivePath, redactSensitiveText } from "./redaction.ts";

export interface DesktopBugReportingThreadContext {
  readonly id: string | null;
  readonly title: string | null;
  readonly workspaceRoot: string | null;
  readonly cwd: string | null;
}

export interface CaptureManualBugReportInput {
  readonly report: DesktopBugReportDraft;
  readonly severity: string;
  readonly context: {
    readonly runtimeInfo: RuntimeInfoResult;
    readonly thread: DesktopBugReportingThreadContext | null;
    readonly accountEmail: string | null;
    readonly tenantName: string | null;
    readonly recentLogs: DesktopLogEntry[];
  };
}

type CaptureManualBugReport = (input: CaptureManualBugReportInput) => string;

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

function normalizeAttachment(attachment: DesktopBugAttachment, homeDir: string | null): DesktopBugAttachment {
  return {
    ...attachment,
    path: redactSensitivePath(attachment.path, homeDir),
  };
}

function normalizeThreadContext(
  thread: DesktopBugReportingThreadContext | null,
  homeDir: string | null,
): DesktopBugReportingThreadContext | null {
  if (!thread) {
    return null;
  }

  return {
    ...thread,
    workspaceRoot: thread.workspaceRoot ? redactSensitivePath(thread.workspaceRoot, homeDir) : null,
    cwd: thread.cwd ? redactSensitivePath(thread.cwd, homeDir) : null,
  };
}

export class DesktopBugReportingService {
  readonly #env: NodeJS.ProcessEnv;
  readonly #runtimeInfo: RuntimeInfoResult;
  readonly #getBootstrap: () => Promise<DesktopBootstrap>;
  readonly #getVisibleThreadContext: () => DesktopBugReportingThreadContext | null;
  readonly #getRecentLogs: (limit?: number) => DesktopLogEntry[];
  readonly #captureManualBugReport: CaptureManualBugReport;
  readonly #linearIssueAdapter: LinearIssueAdapter;

  constructor(options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly runtimeInfo: RuntimeInfoResult;
    readonly getBootstrap: () => Promise<DesktopBootstrap>;
    readonly getVisibleThreadContext: () => DesktopBugReportingThreadContext | null;
    readonly getRecentLogs: (limit?: number) => DesktopLogEntry[];
    readonly captureManualBugReport?: CaptureManualBugReport;
    readonly linearIssueAdapter?: LinearIssueAdapter;
  }) {
    this.#env = options.env ?? process.env;
    this.#runtimeInfo = options.runtimeInfo;
    this.#getBootstrap = options.getBootstrap;
    this.#getVisibleThreadContext = options.getVisibleThreadContext;
    this.#getRecentLogs = options.getRecentLogs;
    this.#captureManualBugReport = options.captureManualBugReport ?? (() => {
      throw new Error("captureManualBugReport must be provided by the Electron main process.");
    });
    this.#linearIssueAdapter = options.linearIssueAdapter ?? new LinearIssueAdapter({ env: this.#env });
  }

  getStatus(): DesktopBugReportingStatus {
    return {
      sentryEnabled: true,
      linearConfigured: this.#linearIssueAdapter.isConfigured(),
      linearIntegrationMode: this.#linearIssueAdapter.isConfigured() ? "directApi" : "sentryIntegrationOnly",
    };
  }

  async submitReport(report: DesktopBugReportDraft): Promise<DesktopBugReportResult> {
    const bootstrap = await this.#getBootstrap();
    const homeDir = firstNonEmptyString(this.#env.HOME) ?? null;
    const thread = normalizeThreadContext(this.#getVisibleThreadContext(), homeDir);
    const sanitizedReport: DesktopBugReportDraft = {
      ...report,
      title: redactSensitiveText(report.title.trim()),
      description: redactSensitiveText(report.description.trim()),
      expectedBehavior: report.expectedBehavior ? redactSensitiveText(report.expectedBehavior.trim()) : null,
      reproductionSteps: report.reproductionSteps ? redactSensitiveText(report.reproductionSteps.trim()) : null,
      attachments: report.attachments.map((attachment) => normalizeAttachment(attachment, homeDir)),
    };
    const recentLogs = redactLogEntries(this.#getRecentLogs(25), homeDir);

    const promotionDecision = decideDesktopBugPromotion({
      linearConfigured: this.#linearIssueAdapter.isConfigured(),
      report: sanitizedReport,
    });

    const sentryEventId = this.#captureManualBugReport({
      report: sanitizedReport,
      severity: promotionDecision.severity,
      context: {
        runtimeInfo: this.#runtimeInfo,
        thread,
        accountEmail: bootstrap.accountEmail,
        tenantName: bootstrap.tenant?.displayName ?? null,
        recentLogs,
      },
    });

    if (promotionDecision.disposition !== "create") {
      return {
        sentryEventId,
        sentryIssueUrl: null,
        promotionDisposition: promotionDecision.disposition,
        promotionReason: promotionDecision.reason,
        linearIssueId: null,
        linearIssueUrl: null,
      };
    }

    const linearIssue = await this.#linearIssueAdapter.createIssue({
      title: sanitizedReport.title,
      severity: promotionDecision.severity,
      description: this.#buildLinearIssueDescription({
        bootstrap,
        recentLogs,
        report: sanitizedReport,
        sentryEventId,
        thread,
      }),
    });

    return {
      sentryEventId,
      sentryIssueUrl: null,
      promotionDisposition: "create",
      promotionReason: promotionDecision.reason,
      linearIssueId: linearIssue.id,
      linearIssueUrl: linearIssue.url,
    };
  }

  #buildLinearIssueDescription(options: {
    readonly bootstrap: DesktopBootstrap;
    readonly recentLogs: DesktopLogEntry[];
    readonly report: DesktopBugReportDraft;
    readonly sentryEventId: string;
    readonly thread: DesktopBugReportingThreadContext | null;
  }): string {
    const { bootstrap, recentLogs, report, sentryEventId, thread } = options;
    const details = [
      report.description,
      "",
      "### Diagnostics",
      `- Sentry event ID: \`${sentryEventId}\``,
      `- App version: \`${this.#runtimeInfo.appVersion}\``,
      `- Electron: \`${this.#runtimeInfo.electronVersion}\``,
      `- Platform: \`${this.#runtimeInfo.platform}\``,
      `- Account: ${bootstrap.accountEmail ?? "unknown"}`,
      `- Tenant: ${bootstrap.tenant?.displayName ?? "local"}`,
      `- Thread ID: ${thread?.id ?? "none"}`,
      `- Workspace root: ${thread?.workspaceRoot ?? "none"}`,
      `- CWD: ${thread?.cwd ?? "none"}`,
    ];

    if (report.expectedBehavior) {
      details.push("", "### Expected behavior", report.expectedBehavior);
    }
    if (report.reproductionSteps) {
      details.push("", "### Reproduction steps", report.reproductionSteps);
    }
    if (report.attachments.length > 0) {
      details.push("", "### Attachment metadata");
      for (const attachment of report.attachments) {
        details.push(`- ${attachment.kind}: \`${attachment.path}\``);
      }
    }
    if (recentLogs.length > 0) {
      details.push("", "### Recent redacted logs", "```text");
      for (const entry of recentLogs.slice(-10)) {
        details.push(`[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.message}`);
      }
      details.push("```");
    }

    return details.join("\n");
  }
}
