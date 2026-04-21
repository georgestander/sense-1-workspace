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

test("header update action stays hidden for the manual alpha flow", () => {
  assert.equal(shouldShowHeaderUpdateAction(buildUpdateState({ phase: "readyToInstall" })), false);
  assert.equal(shouldShowHeaderUpdateAction(buildUpdateState({ phase: "downloading" })), false);
  assert.equal(shouldShowHeaderUpdateAction(buildUpdateState({ phase: "downloadedWaitingForIdle" })), false);
});

test("settings summary keeps stale download phases on the manual alpha path", () => {
  const summary = resolveSettingsUpdateSummary(
    buildUpdateState({
      phase: "downloading",
      availableVersion: "0.3.5",
      progressPercent: 64,
    }),
  );

  assert.equal(summary.title, "Install alpha builds manually.");
  assert.match(summary.detail, /will not download or restart into updates/i);
  assert.equal(summary.isError, false);
});

test("settings summary does not advertise a ready-to-install restart flow", () => {
  const summary = resolveSettingsUpdateSummary(
    buildUpdateState({
      phase: "downloadedWaitingForIdle",
      downloadedVersion: "0.3.5",
      busy: true,
    }),
  );

  assert.equal(summary.title, "Install alpha builds manually.");
  assert.match(summary.detail, /replace your current app/i);
});

test("settings summary keeps error handling quiet but recoverable", () => {
  const summary = resolveSettingsUpdateSummary(
    buildUpdateState({
      phase: "error",
      message: "Network unavailable",
    }),
  );

  assert.equal(summary.title, "Couldn't refresh alpha release status.");
  assert.match(summary.detail, /Open alpha downloads/i);
  assert.match(summary.detail, /manually/i);
  assert.equal(summary.isError, true);
});

test("unsupported builds point people to the manual alpha download fallback", () => {
  const summary = resolveSettingsUpdateSummary(
    buildUpdateState({
      phase: "unsupported",
      message: null,
    }),
  );

  assert.equal(summary.title, "Manual alpha installs only.");
  assert.match(summary.detail, /Open the alpha downloads/i);
  assert.equal(summary.isError, false);
});
