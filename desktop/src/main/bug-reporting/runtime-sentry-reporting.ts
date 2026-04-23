import * as Sentry from "@sentry/electron/main";

import type { AppServerSummary } from "../runtime/app-server-process-manager.js";
import type { RuntimeInfoResult } from "../../shared/contracts/runtime.ts";
import { redactRuntimeErrorForSentry, redactRuntimeTextForSentry } from "./runtime-sentry-redaction.ts";

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
  const redactedMessage = redactRuntimeTextForSentry(message, env);
  const error = new Error(redactedMessage);
  error.name = kind === "crashed" ? "Sense1RuntimeCrash" : "Sense1RuntimeError";
  const recentTransportLogs = summary.recentTransportLogs.map((entry) =>
    redactRuntimeTextForSentry(entry, env),
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
      lastError: redactRuntimeTextForSentry(summary.lastError ?? "", env),
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
  const capturedError = redactRuntimeErrorForSentry(options.error, env);

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
