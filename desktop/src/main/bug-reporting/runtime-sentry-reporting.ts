import * as Sentry from "@sentry/electron/main";

import type { AppServerSummary } from "../runtime/app-server-process-manager.js";
import type { RuntimeInfoResult } from "../../shared/contracts/runtime.ts";
import { redactSensitivePath, redactSensitiveText, resolveRedactionHomeDir } from "./redaction.ts";

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function redactRuntimeDiagnosticText(value: string, env: NodeJS.ProcessEnv): string {
  return redactSensitivePath(redactSensitiveText(value), resolveRedactionHomeDir(env));
}

export function captureRuntimeStateFailureToSentry(options: {
  readonly kind: "crashed" | "errored";
  readonly summary: AppServerSummary;
  readonly runtimeInfo: RuntimeInfoResult;
  readonly env?: NodeJS.ProcessEnv;
}): void {
  const { kind, runtimeInfo, summary } = options;
  const env = options.env ?? process.env;
  const hasDiagnostic = Boolean(summary.lastError?.trim() || summary.recentTransportLogs.length > 0);
  if (!hasDiagnostic) {
    return;
  }

  const issueLabel = kind === "crashed" ? "crashed" : "entered errored state";
  const message = summary.lastError?.trim() || `App-server ${issueLabel}.`;
  const redactedMessage = redactRuntimeDiagnosticText(message, env);
  const error = new Error(redactedMessage);
  error.name = kind === "crashed" ? "Sense1RuntimeCrash" : "Sense1RuntimeError";
  const recentTransportLogs = summary.recentTransportLogs.map((entry) =>
    redactRuntimeDiagnosticText(entry, env),
  );

  Sentry.withScope((scope) => {
    scope.setLevel("error");
    scope.setTag("sense1.runtime.issue", kind);
    scope.setTag("sense1.runtime.state", summary.state);
    scope.setTag("sense1.runtime.restart_count", String(summary.restartCount));
    scope.setFingerprint(["sense1-runtime", kind, redactedMessage.slice(0, 120)]);
    scope.setContext("sense1Runtime", {
      state: summary.state,
      restartCount: summary.restartCount,
      lastStateAt: summary.lastStateAt,
      lastError: redactRuntimeDiagnosticText(summary.lastError ?? "", env),
      recentTransportLogs,
      runtimeInfo,
    });
    Sentry.captureException(error);
  });
}

export function captureRuntimeTransportErrorToSentry(options: {
  readonly error: unknown;
  readonly runtimeState: string;
  readonly runtimeInfo: RuntimeInfoResult;
  readonly env?: NodeJS.ProcessEnv;
}): void {
  const { runtimeInfo, runtimeState } = options;
  const env = options.env ?? process.env;
  const message = redactRuntimeDiagnosticText(formatError(options.error), env);
  let capturedError = options.error instanceof Error ? options.error : new Error(message);
  if (capturedError.message !== message) {
    const redactedError = new Error(message);
    redactedError.name = capturedError.name || "Sense1RuntimeTransportError";
    redactedError.stack = capturedError.stack;
    capturedError = redactedError;
  }

  Sentry.withScope((scope) => {
    scope.setLevel("error");
    scope.setTag("sense1.runtime.issue", "transport-error");
    scope.setTag("sense1.runtime.state", runtimeState);
    scope.setContext("sense1Runtime", {
      state: runtimeState,
      runtimeInfo,
    });
    Sentry.captureException(capturedError);
  });
}
