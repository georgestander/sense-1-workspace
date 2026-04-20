import type { DesktopCrashReportSuggestion } from "../../shared/contracts/bug-reporting.ts";
import type { CrashClassSignal } from "./crash-class-detector.ts";

export type CrashReportSuggestionClock = () => string;

function toSuggestion(signal: CrashClassSignal, occurredAt: string): DesktopCrashReportSuggestion {
  const setupCode = signal.reason === "bootstrap-blocked" ? signal.setupCode : null;
  const restartCount =
    signal.reason === "runtime-crashed" || signal.reason === "runtime-errored"
      ? signal.restartCount
      : null;
  return {
    reason: signal.reason,
    detail: signal.detail,
    setupCode,
    restartCount,
    occurredAt,
  };
}

export class CrashReportSuggestionStore {
  #current: DesktopCrashReportSuggestion | null = null;
  readonly #clock: CrashReportSuggestionClock;

  constructor(clock: CrashReportSuggestionClock = () => new Date().toISOString()) {
    this.#clock = clock;
  }

  record(signal: CrashClassSignal): DesktopCrashReportSuggestion {
    const suggestion = toSuggestion(signal, this.#clock());
    this.#current = suggestion;
    return suggestion;
  }

  get(): DesktopCrashReportSuggestion | null {
    return this.#current;
  }

  acknowledge(occurredAt: string): boolean {
    if (this.#current && this.#current.occurredAt === occurredAt) {
      this.#current = null;
      return true;
    }
    return false;
  }
}
