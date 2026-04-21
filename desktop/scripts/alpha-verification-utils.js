export const AUTOMATED_ALPHA_CHECKS = Object.freeze([
  {
    id: "desktop-typecheck",
    label: "Desktop typecheck",
    command: ["pnpm", "-C", "desktop", "typecheck"],
  },
  {
    id: "desktop-build",
    label: "Desktop build",
    command: ["pnpm", "-C", "desktop", "build"],
  },
  {
    id: "desktop-auth-tests",
    label: "Auth targeted tests",
    command: ["node", "--test", "desktop/src/main/auth/desktop-auth.test.js"],
  },
  {
    id: "identity-fallback-tests",
    label: "Identity fallback targeted tests",
    command: ["node", "--test", "desktop/src/main/bootstrap/bootstrap-identity.test.js"],
  },
  {
    id: "provider-rendering-tests",
    label: "Provider rendering targeted tests",
    command: ["node", "--test", "desktop/src/main/settings/desktop-extension-service.test.js"],
  },
  {
    id: "quota-notification-tests",
    label: "Quota notification targeted tests",
    command: ["node", "--test", "desktop/src/main/session/api-key-credits-notification.test.js"],
  },
  {
    id: "diagnostics-redaction-tests",
    label: "Diagnostics redaction targeted tests",
    command: ["node", "--test", "desktop/src/main/bug-reporting/redaction.test.js"],
  },
  {
    id: "crash-suggestion-timing-tests",
    label: "Crash suggestion timing targeted tests",
    command: [
      "node",
      "--test",
      "desktop/src/main/bug-reporting/crash-class-detector.test.js",
      "desktop/src/main/bug-reporting/crash-recovery-tracker.test.js",
      "desktop/src/main/bug-reporting/crash-report-suggestion-store.test.js",
    ],
  },
  {
    id: "update-copy-tests",
    label: "Update copy targeted tests",
    command: ["node", "--test", "desktop/src/renderer/features/updates/update-presentation.test.js"],
  },
]);

export const ALPHA_MANUAL_SCENARIOS = Object.freeze([
  {
    id: "mac-chatgpt",
    platform: "macOS",
    authMode: "ChatGPT",
    artifactKey: "mac",
  },
  {
    id: "mac-api-key",
    platform: "macOS",
    authMode: "OpenAI API key",
    artifactKey: "mac",
  },
  {
    id: "windows-chatgpt",
    platform: "Windows",
    authMode: "ChatGPT",
    artifactKey: "win",
  },
  {
    id: "windows-api-key",
    platform: "Windows",
    authMode: "OpenAI API key",
    artifactKey: "win",
  },
]);

export const ALPHA_SCENARIO_SCOPE = Object.freeze([
  "Packaged install and launch",
  "Home surface",
  "Thread creation",
  "Folder binding",
  "Composer actions (send / stop / revise / queue)",
  "Model selection",
  "Plugins / MCP / apps / automations",
  "Bug reporting",
]);

export function normalizeManualStatus(value) {
  if (value == null) {
    return "pending";
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "pass" || normalized === "failed" || normalized === "blocked" || normalized === "pending") {
    return normalized;
  }
  throw new Error(`Unsupported alpha verification status: ${value}`);
}

export function parseKeyValueEntries(entries) {
  const parsed = {};
  for (const rawEntry of entries ?? []) {
    const value = String(rawEntry ?? "").trim();
    if (!value) {
      continue;
    }
    const separatorIndex = value.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(`Expected key=value entry, received: ${rawEntry}`);
    }
    const key = value.slice(0, separatorIndex).trim();
    const entryValue = value.slice(separatorIndex + 1).trim();
    if (!key) {
      throw new Error(`Expected key=value entry, received: ${rawEntry}`);
    }
    parsed[key] = entryValue;
  }
  return parsed;
}

export function buildManualScenarios({
  statuses = {},
  notes = {},
  evidencePaths = {},
  artifactPaths = {},
}) {
  return ALPHA_MANUAL_SCENARIOS.map((scenario) => ({
    ...scenario,
    status: normalizeManualStatus(statuses[scenario.id]),
    note: typeof notes[scenario.id] === "string" ? notes[scenario.id] : "",
    evidencePath: typeof evidencePaths[scenario.id] === "string" ? evidencePaths[scenario.id] : "",
    artifactPath: typeof artifactPaths[scenario.artifactKey] === "string" ? artifactPaths[scenario.artifactKey] : "",
    scope: ALPHA_SCENARIO_SCOPE,
  }));
}

export function evaluateAlphaReleaseGate({
  automatedChecks = [],
  manualScenarios = [],
}) {
  const failingAutomatedChecks = automatedChecks.filter((check) => check.status === "failed");
  const incompleteAutomatedChecks = automatedChecks.filter((check) => check.status !== "passed" && check.status !== "failed");
  const failingManualScenarios = manualScenarios.filter((scenario) => scenario.status === "failed");
  const blockedManualScenarios = manualScenarios.filter((scenario) => scenario.status === "blocked");
  const pendingManualScenarios = manualScenarios.filter((scenario) => scenario.status === "pending");

  const blockingReasons = [];
  if (failingAutomatedChecks.length > 0) {
    blockingReasons.push(
      `Automated checks failed: ${failingAutomatedChecks.map((check) => check.label).join(", ")}`,
    );
  }
  if (incompleteAutomatedChecks.length > 0) {
    blockingReasons.push(
      `Automated checks incomplete: ${incompleteAutomatedChecks.map((check) => check.label).join(", ")}`,
    );
  }
  if (failingManualScenarios.length > 0) {
    blockingReasons.push(
      `Manual scenarios failed: ${failingManualScenarios.map((scenario) => scenario.id).join(", ")}`,
    );
  }
  if (blockedManualScenarios.length > 0) {
    blockingReasons.push(
      `Manual scenarios blocked: ${blockedManualScenarios.map((scenario) => scenario.id).join(", ")}`,
    );
  }
  if (pendingManualScenarios.length > 0) {
    blockingReasons.push(
      `Manual scenarios pending: ${pendingManualScenarios.map((scenario) => scenario.id).join(", ")}`,
    );
  }

  const status = blockingReasons.length === 0
    ? "passed"
    : failingAutomatedChecks.length > 0 || failingManualScenarios.length > 0
      ? "failed"
      : "blocked";

  return {
    status,
    testerInvites: status === "passed" ? "unblocked" : "blocked",
    blockingReasons,
  };
}

export function buildAlphaVerificationReadme({
  desktopBuildId,
  outputDir,
  automatedChecks,
  manualScenarios,
  gate,
}) {
  return [
    "# Alpha Verification Matrix",
    "",
    `- desktop build id: \`${desktopBuildId}\``,
    `- output bundle: \`${outputDir}\``,
    `- gate status: \`${gate.status}\``,
    `- tester invites: \`${gate.testerInvites}\``,
    "",
    "## Automated checks",
    "",
    ...automatedChecks.map((check) => `- ${check.label}: \`${check.status}\``),
    "",
    "## Manual scenarios",
    "",
    ...manualScenarios.map((scenario) => {
      const detail = [
        `${scenario.platform} / ${scenario.authMode}: \`${scenario.status}\``,
        scenario.artifactPath ? `artifact \`${scenario.artifactPath}\`` : "artifact not recorded",
        scenario.evidencePath ? `evidence \`${scenario.evidencePath}\`` : "evidence not recorded",
        scenario.note ? `note: ${scenario.note}` : "note: none",
      ];
      return `- ${detail.join(" — ")}`;
    }),
    "",
    "## Scope required for every manual scenario",
    "",
    ...ALPHA_SCENARIO_SCOPE.map((item) => `- ${item}`),
    "",
    gate.blockingReasons.length > 0
      ? "## Blocking reasons"
      : "## Gate result",
    "",
    ...(gate.blockingReasons.length > 0
      ? gate.blockingReasons.map((reason) => `- ${reason}`)
      : ["- All required checks passed. Tester invites can proceed."]),
  ].join("\n");
}
