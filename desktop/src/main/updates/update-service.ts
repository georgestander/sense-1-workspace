import { EventEmitter } from "node:events";

import type { DesktopUpdateState } from "../contracts";

export interface DesktopUpdaterAdapter {
  autoDownload?: boolean;
  autoInstallOnAppQuit?: boolean;
  allowPrerelease?: boolean;
  allowDowngrade?: boolean;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: string, listener: (...args: any[]) => void): unknown;
}

export interface DesktopUpdateServiceOptions {
  currentVersion: string;
  updater: DesktopUpdaterAdapter;
  enabled?: boolean;
  installUpdateAndRestart?: (() => Promise<void> | void) | null;
  now?: () => Date;
  unsupportedMessage?: string;
}

type UpdateInfo = {
  version?: unknown;
};

type UpdateProgress = {
  percent?: unknown;
};

type DesktopUpdateStatePatch = Partial<DesktopUpdateState> & {
  busy?: boolean;
};

function isoNow(nowFactory: () => Date): string {
  return nowFactory().toISOString();
}

function clampProgress(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value as number)));
}

function createBaseState(currentVersion: string): DesktopUpdateState {
  return {
    phase: "idle",
    source: "githubReleases",
    currentVersion,
    availableVersion: null,
    downloadedVersion: null,
    progressPercent: null,
    checkedAt: null,
    readyAt: null,
    busy: false,
    message: null,
  };
}

/**
 * Main-process wrapper around Electron's updater lifecycle.
 * It keeps renderer-facing updater state small, explicit, and testable.
 */
export class DesktopUpdateService extends EventEmitter {
  currentVersion: string;
  updater: DesktopUpdaterAdapter;
  enabled: boolean;
  installUpdateAndRestart: () => Promise<void>;
  now: () => Date;
  state: DesktopUpdateState;
  started: boolean;
  installRequested: boolean;
  hasDownloadedUpdate: boolean;
  busy: boolean;
  lastAvailableVersion: string | null;

  constructor({
    currentVersion,
    updater,
    enabled = true,
    installUpdateAndRestart = null,
    now = () => new Date(),
    unsupportedMessage = "Updates are only available in packaged Sense-1 Workspace builds.",
  }: DesktopUpdateServiceOptions) {
    super();
    this.currentVersion = currentVersion;
    this.updater = updater;
    this.enabled = enabled;
    this.installUpdateAndRestart =
      typeof installUpdateAndRestart === "function"
        ? async () => {
            await installUpdateAndRestart();
          }
        : async () => {
            this.updater.quitAndInstall(false, true);
          };
    this.now = now;
    this.state = enabled
      ? createBaseState(currentVersion)
      : {
          ...createBaseState(currentVersion),
          phase: "unsupported",
          message: unsupportedMessage,
        };
    this.started = false;
    this.installRequested = false;
    this.hasDownloadedUpdate = false;
    this.busy = false;
    this.lastAvailableVersion = null;

    if (!enabled) {
      return;
    }

    this.updater.autoDownload = true;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.allowPrerelease = false;
    this.updater.allowDowngrade = false;

    this.updater.on("checking-for-update", () => {
      this.#setState({
        phase: "checking",
        checkedAt: isoNow(this.now),
        progressPercent: null,
        message: "Checking for updates…",
      });
    });

    this.updater.on("update-available", (info: UpdateInfo = {}) => {
      const nextVersion = typeof info?.version === "string" && info.version.trim() ? info.version.trim() : null;
      this.lastAvailableVersion = nextVersion;
      this.hasDownloadedUpdate = false;
      this.installRequested = false;
      this.#setState({
        phase: "downloading",
        availableVersion: nextVersion,
        downloadedVersion: null,
        progressPercent: 0,
        readyAt: null,
        message: nextVersion ? `Downloading v${nextVersion}…` : "Downloading update…",
      });
    });

    this.updater.on("download-progress", (progress: UpdateProgress = {}) => {
      const progressPercent = clampProgress(progress?.percent);
      this.#setState({
        phase: "downloading",
        progressPercent,
        message:
          this.lastAvailableVersion
            ? `Downloading v${this.lastAvailableVersion}…`
            : "Downloading update…",
      });
    });

    this.updater.on("update-not-available", () => {
      this.lastAvailableVersion = null;
      this.hasDownloadedUpdate = false;
      this.installRequested = false;
      this.#setState({
        phase: "upToDate",
        availableVersion: null,
        downloadedVersion: null,
        progressPercent: null,
        readyAt: null,
        checkedAt: isoNow(this.now),
        message: "Sense-1 Workspace is up to date.",
      });
    });

    this.updater.on("update-downloaded", (info: UpdateInfo = {}) => {
      const nextVersion = typeof info?.version === "string" && info.version.trim() ? info.version.trim() : this.lastAvailableVersion;
      this.lastAvailableVersion = nextVersion;
      this.hasDownloadedUpdate = true;
      const waitingForIdle = this.busy || this.installRequested;
      this.#setState({
        phase: waitingForIdle ? "downloadedWaitingForIdle" : "readyToInstall",
        availableVersion: nextVersion,
        downloadedVersion: nextVersion,
        progressPercent: 100,
        readyAt: isoNow(this.now),
        message: waitingForIdle
          ? "Update downloaded. Sense-1 Workspace will wait until work is idle before installing."
          : "Update ready to install.",
      });

      if (this.installRequested && !this.busy) {
        void this.#installNow();
      }
    });

    this.updater.on("error", (error: unknown) => {
      this.hasDownloadedUpdate = false;
      this.installRequested = false;
      this.#setState({
        phase: "error",
        progressPercent: null,
        readyAt: null,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    if (!this.enabled) {
      this.emit("state-changed", this.getState());
      return;
    }

    void this.checkForUpdates().catch(() => {});
  }

  getState(): DesktopUpdateState {
    return { ...this.state };
  }

  async checkForUpdates(): Promise<DesktopUpdateState> {
    if (!this.enabled) {
      return this.getState();
    }

    if (this.state.phase === "checking" || this.state.phase === "downloading") {
      return this.getState();
    }

    this.#setState({
      phase: "checking",
      checkedAt: isoNow(this.now),
      progressPercent: null,
      message: "Checking for updates…",
    });

    try {
      await this.updater.checkForUpdates();
    } catch (error) {
      this.hasDownloadedUpdate = false;
      this.installRequested = false;
      this.#setState({
        phase: "error",
        progressPercent: null,
        readyAt: null,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return this.getState();
  }

  setBusy(value: boolean): void {
    const nextBusy = Boolean(value);
    if (this.busy === nextBusy) {
      return;
    }

    this.busy = nextBusy;
    if (!this.enabled) {
      this.#setState({ busy: nextBusy });
      return;
    }

    if (nextBusy && this.hasDownloadedUpdate && this.state.phase === "readyToInstall") {
      this.#setState({
        phase: "downloadedWaitingForIdle",
        busy: true,
        message: "Update downloaded. Sense-1 Workspace will wait until work is idle before installing.",
      });
      return;
    }

    if (!nextBusy && this.installRequested && this.hasDownloadedUpdate) {
      void this.#installNow();
      return;
    }

    if (!nextBusy && this.hasDownloadedUpdate && this.state.phase === "downloadedWaitingForIdle") {
      this.#setState({
        phase: "readyToInstall",
        busy: false,
        message: "Update ready to install.",
      });
      return;
    }

    this.#setState({ busy: nextBusy });
  }

  async installUpdate(): Promise<void> {
    if (!this.enabled) {
      throw new Error("Updates are only available in packaged Sense-1 Workspace builds.");
    }

    if (!this.hasDownloadedUpdate) {
      throw new Error("No downloaded update is ready to install.");
    }

    this.installRequested = true;
    if (this.busy) {
      this.#setState({
        phase: "downloadedWaitingForIdle",
        message: "Update downloaded. Sense-1 Workspace will wait until work is idle before installing.",
      });
      return;
    }

    await this.#installNow();
  }

  async #installNow(): Promise<void> {
    this.#setState({
      phase: "installing",
      message: this.state.downloadedVersion
        ? `Installing v${this.state.downloadedVersion}…`
        : "Installing update…",
    });
    try {
      await this.installUpdateAndRestart();
    } catch (error) {
      this.installRequested = false;
      this.#setState({
        phase: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  #setState(patch: DesktopUpdateStatePatch): void {
    this.state = {
      ...this.state,
      ...patch,
      busy: Object.prototype.hasOwnProperty.call(patch, "busy") ? Boolean(patch.busy) : this.busy,
    };
    this.emit("state-changed", this.getState());
  }
}
