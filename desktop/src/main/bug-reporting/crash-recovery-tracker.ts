import type { CrashClassSignal } from "./crash-class-detector.ts";

export type CrashRecoveryEmit = (signal: CrashClassSignal) => void;

export class CrashRecoveryTracker {
  #pending: CrashClassSignal | null = null;
  #runtimeUsable = false;
  #bootstrapUsable = true;
  #windowOpen = false;
  readonly #emit: CrashRecoveryEmit;

  constructor(emit: CrashRecoveryEmit) {
    this.#emit = emit;
  }

  recordSignal(signal: CrashClassSignal): void {
    this.#pending = signal;
    this.#tryEmit();
  }

  setRuntimeUsable(value: boolean): void {
    this.#runtimeUsable = value;
    this.#tryEmit();
  }

  setBootstrapUsable(value: boolean): void {
    this.#bootstrapUsable = value;
    this.#tryEmit();
  }

  setWindowOpen(value: boolean): void {
    this.#windowOpen = value;
    this.#tryEmit();
  }

  hasPendingSignal(): boolean {
    return this.#pending !== null;
  }

  #tryEmit(): void {
    if (!this.#pending) {
      return;
    }
    if (!this.#runtimeUsable || !this.#bootstrapUsable || !this.#windowOpen) {
      return;
    }
    const signal = this.#pending;
    this.#pending = null;
    this.#emit(signal);
  }
}
