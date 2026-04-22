import type {
  DesktopBugAttachment,
  DesktopBugCorrelation,
  DesktopBugCorrelationAction,
  DesktopBugCorrelationEvent,
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
    readonly recentMainSentryEvents: DesktopBugCorrelationEvent[];
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

function normalizeCorrelationAction(
  action: DesktopBugCorrelationAction,
  homeDir: string | null,
): DesktopBugCorrelationAction {
  return {
    ...action,
    name: redactSensitiveText(action.name.trim()),
    detail: action.detail
      ? redactSensitivePath(redactSensitiveText(action.detail.trim()), homeDir)
      : null,
  };
}

function normalizeCorrelationEvent(
  event: DesktopBugCorrelationEvent,
  homeDir: string | null,
): DesktopBugCorrelationEvent {
  return {
    ...event,
    title: event.title ? redactSensitivePath(redactSensitiveText(event.title.trim()), homeDir) : null,
  };
}

function normalizeCorrelation(
  correlation: DesktopBugCorrelation | null | undefined,
  homeDir: string | null,
): DesktopBugCorrelation | null {
  if (!correlation) {
    return null;
  }

  return {
    view: correlation.view
      ? {
          ...correlation.view,
          view: correlation.view.view ? redactSensitiveText(correlation.view.view.trim()) : null,
          url: correlation.view.url ? redactSensitivePath(redactSensitiveText(correlation.view.url.trim()), homeDir) : null,
          documentTitle: correlation.view.documentTitle
            ? redactSensitiveText(correlation.view.documentTitle.trim())
            : null,
          selectedThreadId: correlation.view.selectedThreadId?.trim() || null,
        }
      : null,
    recentActions: correlation.recentActions.map((action) => normalizeCorrelationAction(action, homeDir)),
    recentEvents: correlation.recentEvents.map((event) => normalizeCorrelationEvent(event, homeDir)),
  };
}

export class DesktopBugReportingService {
  readonly #env: NodeJS.ProcessEnv;
  readonly #runtimeInfo: RuntimeInfoResult;
  readonly #getBootstrap: () => Promise<DesktopBootstrap>;
  readonly #getVisibleThreadContext: () => DesktopBugReportingThreadContext | null;
  readonly #getRecentLogs: (limit?: number) => DesktopLogEntry[];
  readonly #getRecentMainSentryEvents: () => DesktopBugCorrelationEvent[];
  readonly #captureManualBugReport: CaptureManualBugReport;

  constructor(options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly runtimeInfo: RuntimeInfoResult;
    readonly getBootstrap: () => Promise<DesktopBootstrap>;
    readonly getVisibleThreadContext: () => DesktopBugReportingThreadContext | null;
    readonly getRecentLogs: (limit?: number) => DesktopLogEntry[];
    readonly getRecentMainSentryEvents?: () => DesktopBugCorrelationEvent[];
    readonly captureManualBugReport?: CaptureManualBugReport;
  }) {
    this.#env = options.env ?? process.env;
    this.#runtimeInfo = options.runtimeInfo;
    this.#getBootstrap = options.getBootstrap;
    this.#getVisibleThreadContext = options.getVisibleThreadContext;
    this.#getRecentLogs = options.getRecentLogs;
    this.#getRecentMainSentryEvents = options.getRecentMainSentryEvents ?? (() => []);
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
      correlation: normalizeCorrelation(report.correlation, homeDir),
    };
    const recentLogs = redactLogEntries(this.#getRecentLogs(25), homeDir);
    const recentMainSentryEvents = this.#getRecentMainSentryEvents().map((event) =>
      normalizeCorrelationEvent(event, homeDir),
    );

    const sentryEventId = this.#captureManualBugReport({
      report: sanitizedReport,
      severity: sanitizedReport.severity ?? "medium",
      context: {
        runtimeInfo: this.#runtimeInfo,
        thread,
        accountEmail: bootstrap.accountEmail,
        tenantName: bootstrap.tenant?.displayName ?? null,
        recentLogs,
        recentMainSentryEvents,
      },
    });

    return {
      sentryEventId,
      sentryIssueUrl: null,
    };
  }
}
