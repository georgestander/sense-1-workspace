#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  AUTOMATED_ALPHA_CHECKS,
  buildAlphaVerificationReadme,
  buildManualScenarios,
  evaluateAlphaReleaseGate,
  parseKeyValueEntries,
} from "./alpha-verification-utils.js";
import { resolveScriptCommand, resolveScriptSpawnOptions } from "./command-runner-utils.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(scriptDir, "..");
const repoRoot = resolve(desktopDir, "..");
const args = parseArgs(process.argv.slice(2));
const desktopBuildId = String(args["desktop-build-id"] || process.env.SENSE1_DESKTOP_BUILD_ID || "").trim();
const outputDir = resolve(
  repoRoot,
  String(args["output-dir"] || join("desktop", "release", "alpha-verification")),
);
const skipAutomated = Boolean(args["skip-automated"]);
const macAppPath = args["mac-app-path"] ? resolve(repoRoot, String(args["mac-app-path"])) : "";
const winInstallerPath = args["win-installer-path"] ? resolve(repoRoot, String(args["win-installer-path"])) : "";

mkdirSync(outputDir, { recursive: true });
mkdirSync(join(outputDir, "commands"), { recursive: true });

if (!desktopBuildId) {
  console.error("Missing required --desktop-build-id");
  process.exit(1);
}

const automatedChecks = skipAutomated
  ? AUTOMATED_ALPHA_CHECKS.map((check) => ({
      ...check,
      status: "pending",
      exitCode: null,
    }))
  : AUTOMATED_ALPHA_CHECKS.map(runAutomatedCheck);

if (macAppPath) {
  automatedChecks.push(runAutomatedCheck({
    id: "mac-packaged-lifecycle",
    label: "Packaged macOS lifecycle probe",
    command: [
      "node",
      "desktop/scripts/validate-packaged-electron-launch.mjs",
      "--desktop-app-path",
      macAppPath,
      "--label",
      "alpha-verification-mac",
      "--output-dir",
      outputDir,
    ],
  }));
}

const scenarioStatuses = parseKeyValueEntries(toArray(args.scenario));
const scenarioNotes = parseKeyValueEntries(toArray(args["scenario-note"]));
const scenarioEvidence = parseKeyValueEntries(toArray(args["scenario-evidence"]));
const manualScenarios = buildManualScenarios({
  statuses: scenarioStatuses,
  notes: scenarioNotes,
  evidencePaths: scenarioEvidence,
  artifactPaths: {
    mac: macAppPath,
    win: winInstallerPath,
  },
});

const gate = evaluateAlphaReleaseGate({
  automatedChecks,
  manualScenarios,
});

writeJson("alpha-verification-matrix.json", {
  generatedAt: new Date().toISOString(),
  desktopBuildId,
  automatedChecks,
  manualScenarios,
  gate,
});
writeFileSync(
  join(outputDir, "README.md"),
  `${buildAlphaVerificationReadme({
    desktopBuildId,
    outputDir,
    automatedChecks,
    manualScenarios,
    gate,
  })}\n`,
);

console.log(
  [
    `Alpha verification bundle: ${outputDir}`,
    `Gate status: ${gate.status}`,
    `Tester invites: ${gate.testerInvites}`,
  ].join("\n"),
);

if (gate.status !== "passed") {
  process.exit(1);
}

function runAutomatedCheck(check) {
  const [commandName, ...commandArgs] = check.command;
  const result = spawnSync(resolveScriptCommand(commandName), commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    ...resolveScriptSpawnOptions(commandName),
  });

  const payload = {
    ...check,
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status,
  };

  writeJson(join("commands", `${check.id}.json`), {
    command: check.command,
    exitCode: result.status,
    signal: result.signal,
    error: result.error?.message || "",
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  });
  writeFileSync(
    join(outputDir, "commands", `${check.id}.txt`),
    [
      `$ ${check.command.join(" ")}`,
      "",
      (result.stdout || "").trimEnd(),
      (result.stderr || "").trimEnd() ? `\n[stderr]\n${(result.stderr || "").trimEnd()}` : "",
      result.error ? `\n[error]\n${result.error.message}` : "",
      `\n[exit ${result.status ?? "null"}${result.signal ? `, signal ${result.signal}` : ""}]`,
    ].join("\n"),
  );

  return payload;
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
    const value = !next || next.startsWith("--") ? true : next;
    if (value !== true) {
      index += 1;
    }

    if (Object.prototype.hasOwnProperty.call(parsed, key)) {
      parsed[key] = [...toArray(parsed[key]), value];
    } else {
      parsed[key] = value;
    }
  }

  return parsed;
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value == null || value === true) {
    return [];
  }
  return [value];
}

function writeJson(name, payload) {
  writeFileSync(join(outputDir, name), `${JSON.stringify(payload, null, 2)}\n`);
}
