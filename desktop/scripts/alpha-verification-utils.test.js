import test from "node:test";
import assert from "node:assert/strict";

import {
  ALPHA_MANUAL_SCENARIOS,
  buildAlphaVerificationReadme,
  buildManualScenarios,
  evaluateAlphaReleaseGate,
  normalizeManualStatus,
  parseKeyValueEntries,
} from "./alpha-verification-utils.js";

test("normalizeManualStatus defaults to pending and accepts the supported statuses", () => {
  assert.equal(normalizeManualStatus(undefined), "pending");
  assert.equal(normalizeManualStatus("pass"), "pass");
  assert.equal(normalizeManualStatus("failed"), "failed");
  assert.equal(normalizeManualStatus("blocked"), "blocked");
  assert.equal(normalizeManualStatus("pending"), "pending");
  assert.throws(() => normalizeManualStatus("maybe"), /unsupported alpha verification status/i);
});

test("parseKeyValueEntries turns repeated CLI entries into a lookup map", () => {
  assert.deepEqual(
    parseKeyValueEntries(["mac-chatgpt=pass", "windows-api-key=blocked"]),
    {
      "mac-chatgpt": "pass",
      "windows-api-key": "blocked",
    },
  );
});

test("buildManualScenarios attaches artifacts, evidence, notes, and default pending status", () => {
  const scenarios = buildManualScenarios({
    statuses: { "mac-chatgpt": "pass" },
    notes: { "mac-chatgpt": "Manual smoke completed." },
    evidencePaths: { "mac-chatgpt": "/tmp/mac-chatgpt.md" },
    artifactPaths: { mac: "/tmp/Sense-1.app", win: "/tmp/Sense-1.exe" },
  });

  assert.equal(scenarios.length, ALPHA_MANUAL_SCENARIOS.length);
  assert.equal(scenarios[0].status, "pass");
  assert.equal(scenarios[0].artifactPath, "/tmp/Sense-1.app");
  assert.equal(scenarios[0].evidencePath, "/tmp/mac-chatgpt.md");
  assert.equal(scenarios[0].note, "Manual smoke completed.");
  assert.equal(scenarios.at(-1)?.status, "pending");
});

test("evaluateAlphaReleaseGate blocks invites until all manual scenarios and automated checks pass", () => {
  const blocked = evaluateAlphaReleaseGate({
    automatedChecks: [{ label: "Desktop build", status: "passed" }],
    manualScenarios: [
      { id: "mac-chatgpt", status: "pass" },
      { id: "windows-chatgpt", status: "pending" },
    ],
  });

  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.testerInvites, "blocked");
  assert.match(blocked.blockingReasons[0], /manual scenarios pending/i);

  const passed = evaluateAlphaReleaseGate({
    automatedChecks: [{ label: "Desktop build", status: "passed" }],
    manualScenarios: [
      { id: "mac-chatgpt", status: "pass" },
      { id: "windows-chatgpt", status: "pass" },
    ],
  });

  assert.equal(passed.status, "passed");
  assert.equal(passed.testerInvites, "unblocked");
  assert.deepEqual(passed.blockingReasons, []);
});

test("buildAlphaVerificationReadme reports the gate summary and scenario matrix", () => {
  const readme = buildAlphaVerificationReadme({
    desktopBuildId: "alpha-001",
    outputDir: "/tmp/alpha-gate",
    automatedChecks: [{ label: "Desktop build", status: "passed" }],
    manualScenarios: [
      {
        id: "mac-chatgpt",
        platform: "macOS",
        authMode: "ChatGPT",
        status: "blocked",
        artifactPath: "/tmp/Sense-1.app",
        evidencePath: "",
        note: "Waiting on packaged smoke.",
      },
    ],
    gate: {
      status: "blocked",
      testerInvites: "blocked",
      blockingReasons: ["Manual scenarios blocked: mac-chatgpt"],
    },
  });

  assert.match(readme, /tester invites: `blocked`/);
  assert.match(readme, /macOS \/ ChatGPT: `blocked`/);
  assert.match(readme, /Manual scenarios blocked: mac-chatgpt/);
});
