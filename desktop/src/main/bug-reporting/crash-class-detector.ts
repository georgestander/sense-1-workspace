export type CrashClassReason =
  | "runtime-crashed"
  | "runtime-errored"
  | "bootstrap-blocked"
  | "renderer-gone";

export interface RuntimeCrashSignal {
  readonly reason: "runtime-crashed" | "runtime-errored";
  readonly detail: string | null;
  readonly restartCount: number;
}

export interface BootstrapBlockedSignal {
  readonly reason: "bootstrap-blocked";
  readonly setupCode: string;
  readonly detail: string | null;
}

export interface RendererGoneSignal {
  readonly reason: "renderer-gone";
  readonly detail: string | null;
}

export type CrashClassSignal =
  | RuntimeCrashSignal
  | BootstrapBlockedSignal
  | RendererGoneSignal;

export interface RuntimeManagerSummaryLike {
  readonly state?: string | null;
  readonly lastError?: string | null;
  readonly restartCount?: number | null;
}

export interface BootstrapSetupLike {
  readonly blocked?: boolean | null;
  readonly code?: string | null;
  readonly detail?: string | null;
}

export interface RenderProcessGoneDetailsLike {
  readonly reason?: string | null;
  readonly exitCode?: number | null;
}

function coerceDetail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function coerceRestartCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.trunc(value);
}

export function isRuntimeStateUsable(state: string | null | undefined): boolean {
  return state === "ready" || state === "busy";
}

export function classifyRuntimeCrash(
  summary: RuntimeManagerSummaryLike | null | undefined,
): RuntimeCrashSignal | null {
  if (!summary) {
    return null;
  }
  return {
    reason: "runtime-crashed",
    detail: coerceDetail(summary.lastError),
    restartCount: coerceRestartCount(summary.restartCount),
  };
}

export function classifyRuntimeErrored(
  summary: RuntimeManagerSummaryLike | null | undefined,
): RuntimeCrashSignal | null {
  if (!summary) {
    return null;
  }
  return {
    reason: "runtime-errored",
    detail: coerceDetail(summary.lastError),
    restartCount: coerceRestartCount(summary.restartCount),
  };
}

export function classifyBootstrapSetup(
  setup: BootstrapSetupLike | null | undefined,
): BootstrapBlockedSignal | null {
  if (!setup || setup.blocked !== true) {
    return null;
  }
  const code = coerceDetail(setup.code);
  if (!code) {
    return null;
  }
  return {
    reason: "bootstrap-blocked",
    setupCode: code,
    detail: coerceDetail(setup.detail),
  };
}

export function classifyRenderProcessGone(
  details: RenderProcessGoneDetailsLike | null | undefined,
): RendererGoneSignal | null {
  if (!details) {
    return null;
  }
  const reason = coerceDetail(details.reason);
  const exitCode = typeof details.exitCode === "number" ? String(details.exitCode) : null;
  return {
    reason: "renderer-gone",
    detail: reason && exitCode ? `${reason} (exit=${exitCode})` : reason ?? exitCode,
  };
}
