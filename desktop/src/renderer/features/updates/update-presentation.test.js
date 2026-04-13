import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveSettingsUpdateSummary,
  shouldShowHeaderUpdateAction,
} from "./update-presentation.js";

function buildUpdateState(overrides = {}) {
  return {
    phase: "idle",
    source: "githubReleases",
    currentVersion: "0.3.4",
    availableVersion: null,
    downloadedVersion: null,
    progressPercent: null,
    checkedAt: null,
    readyAt: null,
    busy: false,
    message: null,
    ...overrides,
  };
}

test("header update action only shows when install is ready", () => {
  assert.equal(shouldShowHeaderUpdateAction(buildUpdateState({ phase: "readyToInstall" })), true);
  assert.equal(shouldShowHeaderUpdateAction(buildUpdateState({ phase: "downloading" })), false);
  assert.equal(shouldShowHeaderUpdateAction(buildUpdateState({ phase: "downloadedWaitingForIdle" })), false);
});

test("settings summary shows download progress while updating in the background", () => {
  const summary = resolveSettingsUpdateSummary(
    buildUpdateState({
      phase: "downloading",
      availableVersion: "0.3.5",
      progressPercent: 64,
    }),
  );

  assert.equal(summary.title, "Downloading v0.3.5…");
  assert.equal(summary.detail, "64% downloaded in the background.");
  assert.equal(summary.isError, false);
});

test("settings summary explains when install is waiting for active work to finish", () => {
  const summary = resolveSettingsUpdateSummary(
    buildUpdateState({
      phase: "downloadedWaitingForIdle",
      downloadedVersion: "0.3.5",
      busy: true,
    }),
  );

  assert.equal(summary.title, "v0.3.5 is ready.");
  assert.match(summary.detail, /wait for active work to finish/i);
});

test("settings summary keeps error handling quiet but recoverable", () => {
  const summary = resolveSettingsUpdateSummary(
    buildUpdateState({
      phase: "error",
      message: "Network unavailable",
    }),
  );

  assert.equal(summary.title, "Update failed.");
  assert.match(summary.detail, /Check for updates/i);
  assert.match(summary.detail, /Download latest release/i);
  assert.equal(summary.isError, true);
});

test("unsupported builds point people to the manual download fallback", () => {
  const summary = resolveSettingsUpdateSummary(
    buildUpdateState({
      phase: "unsupported",
      message: null,
    }),
  );

  assert.equal(summary.title, "In-app updates are unavailable in this build.");
  assert.match(summary.detail, /Download latest release/i);
  assert.equal(summary.isError, false);
});
