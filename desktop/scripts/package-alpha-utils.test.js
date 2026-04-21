import test from "node:test";
import assert from "node:assert/strict";

import {
  buildInstallGuide,
  buildReleaseReadme,
  expectedArtifactExtensions,
  isTargetArtifact,
  normalizeTarget,
} from "./package-alpha-utils.js";

test("normalizeTarget accepts supported alpha packaging targets", () => {
  assert.equal(normalizeTarget("mac"), "mac");
  assert.equal(normalizeTarget(" win "), "win");
  assert.equal(normalizeTarget("linux"), null);
});

test("expectedArtifactExtensions matches alpha packaging expectations", () => {
  assert.deepEqual(expectedArtifactExtensions("mac"), [".dmg", ".zip"]);
  assert.deepEqual(expectedArtifactExtensions("win"), [".exe"]);
});

test("isTargetArtifact identifies target-specific release files", () => {
  assert.equal(isTargetArtifact("mac", "Sense-1 Workspace-0.11.1-arm64.dmg"), true);
  assert.equal(isTargetArtifact("mac", "Sense-1 Workspace-0.11.1-arm64.zip"), true);
  assert.equal(isTargetArtifact("win", "Sense-1 Workspace-0.11.1-x64.exe"), true);
  assert.equal(isTargetArtifact("win", "latest.yml"), false);
});

test("buildInstallGuide keeps manual alpha friction explicit", () => {
  const macGuide = buildInstallGuide("mac", "0.11.1");
  const winGuide = buildInstallGuide("win", "0.11.1");

  assert.match(macGuide, /drag `Sense-1 Workspace\.app` into `Applications`/i);
  assert.match(macGuide, /gatekeeper/i);
  assert.match(macGuide, /does not deliver in-app auto-updates/i);

  assert.match(winGuide, /nsis installer/i);
  assert.match(winGuide, /smartscreen/i);
  assert.match(winGuide, /does not deliver in-app auto-updates/i);
});

test("buildReleaseReadme lists artifacts and generated guides", () => {
  const readme = buildReleaseReadme({
    version: "0.11.1",
    target: "mac",
    artifacts: [
      {
        name: "Sense-1 Workspace-0.11.1-arm64.dmg",
        sizeBytes: 123,
        sha256: "abc123",
      },
    ],
  });

  assert.match(readme, /Packaged target: macOS/);
  assert.match(readme, /INSTALL-macOS\.md/);
  assert.match(readme, /abc123/);
});
