#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const args = parseArgs(process.argv.slice(2));
const appPath = args["desktop-app-path"] ? resolve(args["desktop-app-path"]) : "";
const label = sanitizeSegment(args.label || "packaged-lifecycle");
const outputDir =
  args["output-dir"] ||
  join(
    repoRoot,
    ".agent",
    "sessions",
    "manual",
    "artifacts",
    "desktop-check",
    `packaged-${label}-${Date.now()}`,
  );
const baseUrl = args["base-url"] || "http://127.0.0.1:5174";
const appServerUrl = args["app-server-url"] || "ws://127.0.0.1:4513";
const startupTimeoutMs = Number(args["startup-timeout-ms"] || 25000);
const recoveryTimeoutMs = Number(args["recovery-timeout-ms"] || 25000);
const shutdownTimeoutMs = Number(args["shutdown-timeout-ms"] || 20000);

const result = {
  label,
  createdAt: new Date().toISOString(),
  appPath,
  baseUrl,
  appServerUrl,
  checks: [],
  pids: {},
  errors: [],
};

mkdirSync(outputDir, { recursive: true });
mkdirSync(join(outputDir, "commands"), { recursive: true });

if (!appPath) {
  writeFailure("Missing required --desktop-app-path");
  process.exit(1);
}

if (!existsSync(appPath)) {
  writeFailure(`Desktop app path does not exist: ${appPath}`);
  process.exit(1);
}

const appPattern = appMatchPatterns(appPath);
const serverPattern = "codex app-server";
const baselineAppPids = new Set(listPidsForPatterns(appPattern));
const baselineServerPids = new Set(listPidsForPatterns([serverPattern]));

result.checks.push({
  name: "launch-start",
  status: "running",
});

runAndWrite("open-app", launchCommand(appPath));

const appPid = await waitForMatch("app launch", appPattern, baselineAppPids, startupTimeoutMs);
if (!appPid) {
  result.checks[result.checks.length - 1].status = "failed";
  writeFailure("Did not detect a new app process after launch.");
  await runAndWrite("diagnostic-app-processes-after-launch", [
    "pgrep",
    "-f",
    appPath,
  ]);
  process.exit(1);
}

result.pids.appPid = appPid;
result.checks[result.checks.length - 1].status = "passed";

const startupServerPid = await waitForMatch(
  "app-server startup",
  [serverPattern],
  baselineServerPids,
  startupTimeoutMs,
);
if (!startupServerPid) {
  result.checks.push({ name: "app-server-startup", status: "failed" });
  writeFailure("App launch did not produce a new `codex app-server` process.");
  await runAndWrite("diagnostic-app-processes-after-start", ["ps", "-axo", "pid=,command="]);
  await cleanupApp([appPid]);
  process.exit(1);
}

result.pids.appServerPid = startupServerPid;
result.checks.push({ name: "app-server-startup", status: "passed" });

result.checks.push({
  name: "app-server-crash-recovery",
  status: "running",
});
runAndWrite("kill-app-server-crash", ["kill", "-9", String(startupServerPid)]);
await delay(1200);
const recoveredServerPid = await waitForMatch(
  "app-server recovery",
  [serverPattern],
  new Set([...baselineServerPids, startupServerPid]),
  recoveryTimeoutMs,
);
if (!recoveredServerPid) {
  result.checks[result.checks.length - 1].status = "failed";
  writeFailure(
    "No new `codex app-server` process appeared after forced server crash; packaged restart behavior was not observed.",
  );
  await cleanupApp([appPid]);
  process.exit(1);
}

result.pids.recoveredAppServerPid = recoveredServerPid;
result.checks[result.checks.length - 1].status = "passed";
result.checks.push({ name: "packaged-clean-shutdown", status: "running" });

await cleanupApp([appPid], shutdownTimeoutMs);
if (isAnyProcessAlive(appPid) || isAnyProcessAlive(recoveredServerPid)) {
  const lingering = [
    isAnyProcessAlive(appPid) ? `app pid ${appPid}` : null,
    isAnyProcessAlive(recoveredServerPid) ? `app-server pid ${recoveredServerPid}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  writeAndLog(`failed clean shutdown; lingering process(es): ${lingering}`);
  result.checks[result.checks.length - 1].status = "failed";
  writeFailure(
    "Packaged clean shutdown did not terminate both the app process and its managed `codex app-server` process.",
  );
  process.exit(1);
}

result.checks[result.checks.length - 1].status = "passed";

result.checks.push({ name: "packaged-restart", status: "running" });
runAndWrite("relaunch-app", launchCommand(appPath));
await delay(1200);
const relaunchPid = await waitForMatch(
  "app restart",
  appPattern,
  baselineAppPids,
  startupTimeoutMs,
);
if (!relaunchPid) {
  result.checks[result.checks.length - 1].status = "failed";
  await cleanupKnownProcesses(appPattern, baselineAppPids);
  writeFailure("Could not relaunch packaged app for restart check.");
  process.exit(1);
}

const relaunchServerPid = await waitForMatch(
  "app-server restart",
  [serverPattern],
  new Set([...baselineServerPids, startupServerPid, recoveredServerPid]),
  startupTimeoutMs,
);
if (!relaunchServerPid) {
  result.checks[result.checks.length - 1].status = "failed";
  await cleanupApp([relaunchPid]);
  writeFailure("Re-launched app did not recover app-server automatically.");
  process.exit(1);
}

result.checks[result.checks.length - 1].status = "passed";
result.pids.relaunchAppPid = relaunchPid;
result.pids.relaunchAppServerPid = relaunchServerPid;
result.checks.push({ name: "packaged-restart-clean-shutdown", status: "running" });
await cleanupApp([relaunchPid], shutdownTimeoutMs);
if (isAnyProcessAlive(relaunchPid) || isAnyProcessAlive(relaunchServerPid)) {
  const lingering = [
    isAnyProcessAlive(relaunchPid) ? `app pid ${relaunchPid}` : null,
    isAnyProcessAlive(relaunchServerPid) ? `app-server pid ${relaunchServerPid}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  result.checks[result.checks.length - 1].status = "failed";
  writeFailure(
    `Packaged restart cleanup did not terminate both relaunch processes. Lingering process(es): ${lingering}`,
  );
  process.exit(1);
}
result.checks[result.checks.length - 1].status = "passed";

result.checks.push({ name: "endpoint-probe", status: "running" });
await runAndWrite("app-server-web-probe", ["curl", "-I", "-sS", baseUrl]);
await runAndWrite("studio-config-probe", ["curl", "-sS", `${baseUrl}/api/studio/config`]);
await runAndWrite("objects-probe", ["curl", "-sS", `${baseUrl}/api/objects?limit=20`]);
result.checks[result.checks.length - 1].status = "passed";

result.status = "passed";
writeJson("packaged-launch-summary.json", result);
writeReadme();
console.log(join(outputDir, "packaged-launch-summary.json"));
process.exit(0);

async function cleanupApp(pids = [], timeoutMs = 5000) {
  if (pids.length === 0) {
    return;
  }

  runAndWrite("stop-app-terminate", ["kill", "-15", ...pids.map(String)]);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pids.every((pid) => !isAnyProcessAlive(pid))) {
      return;
    }
    await delay(300);
  }

  runAndWrite("stop-app-force", ["kill", "-9", ...pids.map(String)]);
}

function isAnyProcessAlive(pid) {
  const pidText = String(pid);
  const result = spawnSync("ps", ["-p", pidText, "-o", "pid=", "-o", "command="], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim().length > 0;
}

function appMatchPatterns(appPathValue) {
  const name = basename(appPathValue, ".app");
  const patterns = [appPathValue, basename(appPathValue), name].filter(Boolean);
  return [...new Set(patterns)];
}

function runAndWrite(name, command) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd: repoRoot,
    encoding: "utf8",
  });

  writeJson(join("commands", `${name}.json`), {
    command,
    exitCode: result.status,
    signal: result.signal,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  });
  writeFileSync(
    join(outputDir, "commands", `${name}.txt`),
    [
      `$ ${command.join(" ")}`,
      "",
      (result.stdout || "").trimEnd(),
      (result.stderr || "").trimEnd() ? `\n[stderr]\n${(result.stderr || "").trimEnd()}` : "",
      `\n[exit ${result.status ?? "null"}${result.signal ? `, signal ${result.signal}` : ""}]`,
    ].join("\n"),
  );

  return result;
}

function listPidsForPatterns(patterns) {
  const candidates = runAndWrite("find-processes", ["ps", "-axo", "pid=,command="]).stdout || "";
  const matching = new Set();

  for (const line of candidates.split("\n")) {
    if (!line) {
      continue;
    }
    const match = line.match(/^\s*(\d+)\s+(.*)$/);
    if (!match) {
      continue;
    }
    const pid = match[1];
    const command = match[2] || "";
    if (patterns.some((pattern) => command.includes(pattern))) {
      matching.add(Number(pid));
    }
  }

  return [...matching];
}

async function waitForMatch(name, patterns, excludeSet, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pids = listPidsForPatterns(patterns).filter((pid) => !excludeSet.has(pid));
    if (pids.length > 0) {
      return pids[0];
    }
    await delay(250);
  }
  writeAndLog(`Timed out waiting for ${name}`);
  return null;
}

async function cleanupKnownProcesses(patterns, excludeSet = new Set()) {
  const pids = listPidsForPatterns(patterns).filter((pid) => !excludeSet.has(pid));
  if (pids.length > 0) {
    await cleanupApp(pids, 8000);
  }
}

function launchCommand(appPathValue) {
  if (appPathValue.endsWith(".app") && process.platform === "darwin") {
    return ["open", "-a", appPathValue];
  }

  return [appPathValue];
}

function writeFailure(message) {
  result.errors.push(message);
  result.status = "failed";
  writeJson("packaged-launch-summary.json", result);
  writeReadme(message);
}

function writeReadme(message) {
  const failed = result.status === "failed";
  const lines = [
    "# Packaged Electron launch lifecycle validation",
    "",
    `- label: \`${label}\``,
    `- status: ${failed ? "failed" : "passed"}`,
    `- app path: \`${appPath}\``,
    `- app marker patterns: \`${appMatchPatterns(appPath).join(" | ")}\``,
    `- app launch pid: \`${result.pids.appPid || "unknown"}\``,
    `- app-server startup pid: \`${result.pids.appServerPid || "unknown"}\``,
    `- relaunch app pid: \`${result.pids.relaunchAppPid || "not-run"}\``,
    `- relaunch app-server pid: \`${result.pids.relaunchAppServerPid || "not-run"}\``,
    "",
    "## Proof boundary",
    "- This bundle proves packaged process lifecycle only.",
    "- Record the packaged renderer verdict separately through `pnpm -C desktop check -- --packaged-renderer-status ...`.",
    "",
    "## Checks",
    ...result.checks.map((check) => `- ${check.name}: ${check.status}`),
    "",
    ...(failed || result.errors.length > 0 ? ["## Errors", ...result.errors.map((line) => `- ${line}`)] : []),
    "",
    "## Recommended artifacts",
    "- packaged-launch-summary.json",
    "- commands/open-app.txt",
    "- commands/relaunch-app.txt",
    "- commands/diagnostic-*.txt",
  ];
  if (message) {
    lines.push("", `Failure: ${message}`);
  }
  writeFileSync(join(outputDir, "README.md"), lines.join("\n"));
}

function writeJson(name, payload) {
  writeFileSync(join(outputDir, name), `${JSON.stringify(payload, null, 2)}\n`);
}

function sanitizeSegment(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "packaged-lifecycle";
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeAndLog(message) {
  result.errors.push(message);
}
