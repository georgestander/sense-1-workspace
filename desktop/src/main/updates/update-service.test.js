import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { DesktopUpdateService } from "./update-service.ts";

class FakeUpdater extends EventEmitter {
  constructor() {
    super();
    this.autoDownload = false;
    this.autoInstallOnAppQuit = true;
    this.allowPrerelease = true;
    this.allowDowngrade = true;
    this.checkCount = 0;
    this.quitCalls = [];
    this.checkHandler = async () => {};
  }

  async checkForUpdates() {
    this.checkCount += 1;
    return await this.checkHandler();
  }

  quitAndInstall(isSilent = false, isForceRunAfter = true) {
    this.quitCalls.push([isSilent, isForceRunAfter]);
  }
}

function createService(options = {}) {
  const updater = options.updater ?? new FakeUpdater();
  const service = new DesktopUpdateService({
    currentVersion: "0.3.4",
    updater,
    enabled: options.enabled ?? true,
    installUpdateAndRestart: options.installUpdateAndRestart,
    unsupportedMessage: options.unsupportedMessage,
    now: options.now ?? (() => new Date("2026-04-01T10:00:00.000Z")),
  });

  return { service, updater };
}

test("disabled updater reports unsupported state on start", () => {
  const { service } = createService({
    enabled: false,
    unsupportedMessage: "Updates unavailable here.",
  });
  const states = [];
  service.on("state-changed", (state) => states.push(state));

  service.start();

  assert.equal(states.length, 1);
  assert.equal(states[0].phase, "unsupported");
  assert.equal(states[0].message, "Updates unavailable here.");
});

test("constructor configures updater for stable auto-downloads", () => {
  const { updater } = createService();

  assert.equal(updater.autoDownload, true);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowPrerelease, false);
  assert.equal(updater.allowDowngrade, false);
});

test("checkForUpdates moves from checking to readyToInstall after download", async () => {
  const { service, updater } = createService();

  updater.checkHandler = async () => {
    updater.emit("checking-for-update");
    updater.emit("update-available", { version: "0.3.5" });
    updater.emit("download-progress", { percent: 42.2 });
    updater.emit("update-downloaded", { version: "0.3.5" });
  };

  const state = await service.checkForUpdates();

  assert.equal(state.phase, "readyToInstall");
  assert.equal(state.availableVersion, "0.3.5");
  assert.equal(state.downloadedVersion, "0.3.5");
  assert.equal(state.progressPercent, 100);
  assert.equal(state.readyAt, "2026-04-01T10:00:00.000Z");
});

test("manual check reports upToDate when no stable release is available", async () => {
  const { service, updater } = createService();

  updater.checkHandler = async () => {
    updater.emit("checking-for-update");
    updater.emit("update-not-available");
  };

  const state = await service.checkForUpdates();

  assert.equal(state.phase, "upToDate");
  assert.equal(state.message, "Sense-1 Workspace is up to date.");
});

test("downloaded updates wait for idle before install if work is active", async () => {
  const installCalls = [];
  const { service, updater } = createService({
    installUpdateAndRestart: async () => {
      installCalls.push("install");
    },
  });

  service.setBusy(true);
  updater.checkHandler = async () => {
    updater.emit("checking-for-update");
    updater.emit("update-available", { version: "0.3.5" });
    updater.emit("update-downloaded", { version: "0.3.5" });
  };

  await service.checkForUpdates();
  assert.equal(service.getState().phase, "downloadedWaitingForIdle");

  await service.installUpdate();
  assert.equal(service.getState().phase, "downloadedWaitingForIdle");
  assert.deepEqual(installCalls, []);

  service.setBusy(false);
  assert.equal(service.getState().phase, "installing");
  assert.deepEqual(installCalls, ["install"]);
});

test("installUpdate uses the default updater restart path when no custom installer is provided", async () => {
  const { service, updater } = createService();

  updater.checkHandler = async () => {
    updater.emit("checking-for-update");
    updater.emit("update-available", { version: "0.3.5" });
    updater.emit("update-downloaded", { version: "0.3.5" });
  };

  await service.checkForUpdates();
  await service.installUpdate();

  assert.deepEqual(updater.quitCalls, [[false, true]]);
});

test("errors move the updater into the error state", async () => {
  const { service, updater } = createService();

  updater.checkHandler = async () => {
    updater.emit("checking-for-update");
    updater.emit("error", new Error("Network unavailable"));
  };

  const state = await service.checkForUpdates();

  assert.equal(state.phase, "error");
  assert.equal(state.message, "Network unavailable");
});
