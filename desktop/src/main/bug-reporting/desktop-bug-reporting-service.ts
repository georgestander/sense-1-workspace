import type {
  DesktopBugAttachment,
  DesktopBugReportDraft,
  DesktopBugReportResult,
  DesktopBugReportingStatus,
} from "../../shared/contracts/bug-reporting.ts";
import type { DesktopBootstrap } from "../../shared/contracts/bootstrap.ts";
import type { RuntimeInfoResult } from "../../shared/contracts/runtime.ts";
import type { DesktopLogEntry } from "../logging/desktop-log-buffer.ts";
import { redactLogEntries, redactSensitivePath, redactSensitiveText, resolveRedactionHomeDir } from "./redaction.ts";

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

  constructor(options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly runtimeInfo: RuntimeInfoResult;
    readonly getBootstrap: () => Promise<DesktopBootstrap>;
    readonly getVisibleThreadContext: () => DesktopBugReportingThreadContext | null;
    readonly getRecentLogs: (limit?: number) => DesktopLogEntry[];
    readonly captureManualBugReport?: CaptureManualBugReport;
  }) {
    this.#env = options.env ?? process.env;
    this.#runtimeInfo = options.runtimeInfo;
    this.#getBootstrap = options.getBootstrap;
    this.#getVisibleThreadContext = options.getVisibleThreadContext;
    this.#getRecentLogs = options.getRecentLogs;
    this.#captureManualBugReport = options.captureManualBugReport ?? (() => {
      throw new Error("captureManualBugReport must be provided by the Electron main process.");
    });
  }

  getStatus(): DesktopBugReportingStatus {
    return {
      sentryEnabled: true,
    };
  }

  async submitReport(report: DesktopBugReportDraft): Promise<DesktopBugReportResult> {
    const bootstrap = await this.#getBootstrap();
    const homeDir = resolveRedactionHomeDir(this.#env);
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

    const sentryEventId = this.#captureManualBugReport({
      report: sanitizedReport,
      severity: sanitizedReport.severity ?? "medium",
      context: {
        runtimeInfo: this.#runtimeInfo,
        thread,
        accountEmail: bootstrap.accountEmail,
        tenantName: bootstrap.tenant?.displayName ?? null,
        recentLogs,
      },
    });

    return {
      sentryEventId,
      sentryIssueUrl: null,
    };
  }
}
