#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(scriptDir, "..");
const repoRoot = resolve(desktopDir, "..");
const defaultBaseUrl = "http://127.0.0.1:5174";
const defaultAppServerUrl = "ws://127.0.0.1:4513";
const args = parseArgs(process.argv.slice(2));
const desktopBuildId =
  String(args["desktop-build-id"] || process.env.SENSE1_DESKTOP_BUILD_ID || "").trim();
const desktopAppPath = args["desktop-app-path"]
  ? resolve(repoRoot, String(args["desktop-app-path"]))
  : null;
const packagedRendererStatus = parsePackagedRendererStatus(args["packaged-renderer-status"]);
const packagedRendererNote = normalizeOptionalText(args["packaged-renderer-note"]);
const packagedRendererEvidencePath = args["packaged-renderer-evidence-path"]
  ? resolve(repoRoot, String(args["packaged-renderer-evidence-path"]))
  : null;
const baseUrl = String(args["base-url"] || process.env.SENSE1_WEB_BASE_URL || defaultBaseUrl).trim();
const appServerUrl = String(
  args["app-server-url"] || process.env.SENSE_SESSION_SERVICE_URL || defaultAppServerUrl,
).trim();
const label = sanitizeSegment(args.label || "native-parity");
const sessionId = readActiveSessionId(repoRoot);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir =
  args["output-dir"] ||
  join(
    repoRoot,
    ".agent",
    "sessions",
    sessionId,
    "artifacts",
    "desktop-check",
    `${stamp}-${label}`,
  );

mkdirSync(outputDir, { recursive: true });
mkdirSync(join(outputDir, "commands"), { recursive: true });

if (!desktopBuildId) {
  writeFailureSummary(
    "Missing required --desktop-build-id.",
    [
      "Use `pnpm -C desktop check -- --desktop-build-id <build-id>`.",
      "If the branch-matched desktop alpha build is unavailable, record the ticket as blocked.",
    ],
    "blocked",
  );
  console.error("Missing required --desktop-build-id.");
  process.exit(1);
}

if (args["with-transitional-web-checks"] || args["with-shared-shell"]) {
  writeFailureSummary(
    "Desktop check no longer runs transitional shared-shell checks.",
    [
      "Use `pnpm -C desktop check -- --desktop-build-id <build-id>` for native desktop preflight.",
      "Run `pnpm -C web check` separately when validating the web/admin shared-shell path.",
    ],
  );
  console.error("Desktop check no longer supports transitional shared-shell flags.");
  process.exit(1);
}

if (desktopAppPath && !existsSync(desktopAppPath)) {
  writeFailureSummary(
    `Desktop app path does not exist: ${desktopAppPath}`,
    [
      "Point --desktop-app-path at the macOS desktop alpha build under test.",
      "If the build has not been delivered, record the ticket as blocked.",
    ],
    "blocked",
  );
  console.error(`Desktop app path does not exist: ${desktopAppPath}`);
  process.exit(1);
}

if (desktopAppPath && !packagedRendererStatus) {
  writeFailureSummary(
    "Missing required --packaged-renderer-status when --desktop-app-path is supplied.",
    [
      "Use `pnpm -C desktop check -- --desktop-build-id <build-id>` for baseline preflight before the packaged app is available.",
      "After the packaged renderer smoke, rerun this command with `--desktop-app-path /path/to/sense-1-workspace.app --packaged-renderer-status pass|failed|uncertain|blocked`.",
      "Use `--packaged-renderer-note` to record packaged-only failures with clear plain-language detail.",
    ],
  );
  console.error("Missing required --packaged-renderer-status when --desktop-app-path is supplied.");
  process.exit(1);
}

if (desktopAppPath && packagedRendererStatus !== "pass" && !packagedRendererNote) {
  writeFailureSummary(
    "Missing required --packaged-renderer-note for a non-pass packaged renderer verdict.",
    [
      "Record what the packaged renderer showed so the blocker is explicit in the bundle and Linear workpad.",
      "Example: `--packaged-renderer-note \"Packaged app launched but rendered the shared-shell fallback prompt instead of the shell.\"`",
    ],
  );
  console.error("Missing required --packaged-renderer-note for a non-pass packaged renderer verdict.");
  process.exit(1);
}

const branchResult = runAndWrite("git-branch", ["git", "branch", "--show-current"]);
const headResult = runAndWrite("git-head", ["git", "rev-parse", "HEAD"]);
runAndWrite("git-status", ["git", "status", "--short"]);

const desktopTypecheckResult = runAndWrite("desktop-typecheck", [
  "pnpm",
  "-C",
  "desktop",
  "typecheck",
]);
const desktopBuildResult = runAndWrite("desktop-build", ["pnpm", "-C", "desktop", "build"]);
const packagedLifecycleResult = desktopAppPath
  ? runAndWrite("packaged-launch-lifecycle", [
      "node",
      join("desktop", "scripts", "validate-packaged-electron-launch.mjs"),
      "--desktop-app-path",
      desktopAppPath,
      "--base-url",
      baseUrl,
      "--app-server-url",
      appServerUrl,
      "--label",
      `${label}-packaged`,
      "--output-dir",
      outputDir,
    ])
  : null;

const diagnosticsBundlePath = null;
const metadata = {
  createdAt: new Date().toISOString(),
  baseUrl,
  appServerUrl,
  branch: branchResult.stdout.trim() || null,
  desktopAppPath,
  desktopBuildId,
  desktopBuildExitCode: desktopBuildResult.exitCode,
  desktopTypecheckExitCode: desktopTypecheckResult.exitCode,
  diagnosticsBundlePath,
  gitHead: headResult.stdout.trim() || null,
  outputDir,
  packagedRendererEvidencePath,
  packagedRendererNote,
  packagedRendererStatus,
  repoRoot,
  sessionId,
};

writeJson("meta.json", metadata);

const failedCommands = [
  ["pnpm -C desktop typecheck", desktopTypecheckResult],
  ["pnpm -C desktop build", desktopBuildResult],
].concat(
  desktopAppPath
    ? [["packaged launch lifecycle check", packagedLifecycleResult || { exitCode: 1 }]]
    : [],
)
  .filter(([, result]) => result.exitCode !== 0);

if (desktopAppPath && packagedRendererStatus && packagedRendererStatus !== "pass") {
  failedCommands.push([
    `packaged renderer status (${packagedRendererStatus})`,
    { exitCode: 1 },
  ]);
}

writeFileSync(
  join(outputDir, "README.md"),
  [
    "# Desktop parity validation summary",
    "",
    "## Native target",
    "",
    `- desktop build id: \`${desktopBuildId}\``,
    desktopAppPath ? `- desktop app path: \`${desktopAppPath}\`` : "- desktop app path: not supplied",
    `- branch: \`${metadata.branch || "unknown"}\``,
    `- git head: \`${metadata.gitHead || "unknown"}\``,
    `- session id: \`${sessionId}\``,
    "",
    "## Proof boundary",
    "",
    "- `pnpm -C desktop typecheck` and `pnpm -C desktop build` are the native-first preflight for this checkout.",
    "- Desktop check no longer runs shared-shell or session-service proof steps.",
    "- Use `pnpm -C web check` separately for web/admin shared-shell validation.",
    "- `pnpm -C desktop check ...` prepares the native parity bundle for this checkout shape.",
    "- The packaged lifecycle probe is process-only proof; it does not inspect the packaged renderer UI by itself.",
    "- Native pass still requires the manual smoke in `docs/native-macos-desktop-smoke-runbook.md` against the branch-matched desktop alpha build.",
    "",
    "## Bundles",
    "",
    `- desktop check bundle: \`${outputDir}\``,
    "- diagnostics bundle: not collected by native-only desktop check",
    "",
    "## Packaged renderer proof",
    "",
    desktopAppPath
      ? `- packaged renderer status: \`${packagedRendererStatus}\``
      : "- packaged renderer status: skipped (no --desktop-app-path)",
    desktopAppPath && packagedRendererNote
      ? `- packaged renderer note: ${packagedRendererNote}`
      : desktopAppPath
        ? "- packaged renderer note: none supplied"
        : null,
    desktopAppPath && packagedRendererEvidencePath
      ? `- packaged renderer evidence: \`${packagedRendererEvidencePath}\``
      : desktopAppPath
        ? "- packaged renderer evidence: none supplied"
        : null,
    desktopAppPath && packagedRendererStatus === "pass"
      ? "- packaged renderer verdict says the bundled shell rendered without the dev-server fallback prompt."
      : desktopAppPath
        ? "- Non-pass renderer verdicts make this command fail so packaged-only blockers cannot hide behind process-only success."
        : "- Record a packaged renderer verdict when rerunning this command with --desktop-app-path.",
    "",
    "## Live preconditions",
    "",
    "- Web/session-service reachability is out of scope for native-only desktop check.",
    "",
    "## Command results",
    "",
    `- \`pnpm -C desktop typecheck\`: ${formatExit(desktopTypecheckResult.exitCode)}`,
    `- \`pnpm -C desktop build\`: ${formatExit(desktopBuildResult.exitCode)}`,
    desktopAppPath
      ? `- packaged launch lifecycle check: ${formatExit(packagedLifecycleResult?.exitCode)}`
      : "- packaged launch lifecycle check: skipped (no --desktop-app-path)",
    "",
    failedCommands.length === 0
      ? "All selected preflight commands passed. Continue with the native smoke runbook."
      : "One or more repo-local preflight commands failed. Review `commands/*.txt` before claiming native proof.",
  ]
    .filter(Boolean)
    .join("\n"),
);

console.log(
  [
    `Desktop parity bundle: ${outputDir}`,
    "Diagnostics bundle: not collected by native-only desktop check",
    `Desktop build id: ${desktopBuildId}`,
    desktopAppPath ? `Desktop app path: ${desktopAppPath}` : "Desktop app path: not supplied",
    desktopAppPath
      ? `Packaged renderer status: ${packagedRendererStatus}`
      : "Packaged renderer status: not recorded (rerun with --desktop-app-path after manual packaged smoke)",
    desktopAppPath && packagedRendererNote ? `Packaged renderer note: ${packagedRendererNote}` : null,
    desktopAppPath && packagedRendererEvidencePath
      ? `Packaged renderer evidence: ${packagedRendererEvidencePath}`
      : null,
  ]
    .filter(Boolean)
    .join("\n"),
);

if (failedCommands.length > 0) {
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    index += 1;
  }

  return parsed;
}

function readActiveSessionId(root) {
  const statePath = join(root, ".agent", "STATE.json");
  if (!existsSync(statePath)) {
    return "manual";
  }

  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8"));
    return parsed?.last_session?.id || "manual";
  } catch {
    return "manual";
  }
}

function sanitizeSegment(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "native-parity";
}

function parsePackagedRendererStatus(value) {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["pass", "failed", "uncertain", "blocked"].includes(normalized)) {
    return normalized;
  }

  writeFailureSummary(
    `Invalid --packaged-renderer-status value: ${value}`,
    [
      "Use one of: `pass`, `failed`, `uncertain`, `blocked`.",
      "Use `failed` for a repo-side packaged defect, such as the packaged renderer showing the dev-server fallback prompt.",
      "Use `blocked` only for external proof blockers such as a missing build or unavailable auth dependency.",
    ],
    "failed",
  );
  console.error(`Invalid --packaged-renderer-status value: ${value}`);
  process.exit(1);
}

function normalizeOptionalText(value) {
  if (value == null) {
    return "";
  }

  return String(value).trim();
}

function runAndWrite(name, command) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd: repoRoot,
    encoding: "utf8",
  });

  const payload = {
    command,
    exitCode: result.status,
    signal: result.signal,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };

  writeJson(join("commands", `${name}.json`), payload);
  writeFileSync(
    join(outputDir, "commands", `${name}.txt`),
    [
      `$ ${command.join(" ")}`,
      "",
      payload.stdout.trimEnd(),
      payload.stderr.trimEnd() ? `\n[stderr]\n${payload.stderr.trimEnd()}` : "",
      `\n[exit ${payload.exitCode ?? "null"}${payload.signal ? `, signal ${payload.signal}` : ""}]`,
    ].join("\n"),
  );

  return payload;
}

function writeJson(name, payload) {
  writeFileSync(join(outputDir, name), `${JSON.stringify(payload, null, 2)}\n`);
}

function formatExit(exitCode) {
  return exitCode === 0 ? "passed" : `failed (exit ${exitCode ?? "null"})`;
}

function writeFailureSummary(title, nextSteps, status = "failed") {
  writeFileSync(
    join(outputDir, "README.md"),
    [
      "# Desktop parity validation summary",
      "",
      `- status: ${status}`,
      `- reason: ${title}`,
      "",
      "## Next steps",
      "",
      ...nextSteps.map((step) => `- ${step}`),
    ].join("\n"),
  );
}
