#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildInstallGuide,
  buildReleaseReadme,
  collectArtifacts,
  expectedArtifactExtensions,
  normalizeTarget,
  snapshotReleaseDir,
} from "./package-alpha-utils.js";
import { formatSpawnFailure, resolveScriptCommand } from "./command-runner-utils.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(scriptDir, "..");
const releaseDir = join(desktopDir, "release");
const args = parseArgs(process.argv.slice(2));
const target = normalizeTarget(args.target);

if (!target) {
  console.error("Usage: node ./scripts/package-alpha.mjs --target mac|win");
  process.exit(1);
}

const packageJson = JSON.parse(await readFile(join(desktopDir, "package.json"), "utf8"));
const version = typeof packageJson.version === "string" ? packageJson.version : "unknown";
const beforeSnapshot = await snapshotReleaseDir(releaseDir);

run(["node", "./scripts/sentry-release.mjs", "prepare", "--runtime-target", target]);
run(target === "mac"
  ? ["pnpm", "exec", "electron-builder", "--project", ".", "--mac", "--arm64", "--publish", "never"]
  : ["pnpm", "exec", "electron-builder", "--project", ".", "--win", "--x64", "--publish", "never"]);

await mkdir(releaseDir, { recursive: true });
const artifacts = await collectArtifacts({
  releaseDir,
  target,
  snapshot: beforeSnapshot,
});

const missingExtensions = expectedArtifactExtensions(target)
  .filter((extension) => !artifacts.some((artifact) => artifact.name.toLowerCase().endsWith(extension)));

if (missingExtensions.length > 0) {
  console.error(
    `Packaging completed but did not produce the expected ${target} artifact(s): ${missingExtensions.join(", ")}`,
  );
  process.exit(1);
}

await writeFile(join(releaseDir, "INSTALL-macOS.md"), `${buildInstallGuide("mac", version)}\n`);
await writeFile(join(releaseDir, "INSTALL-Windows.md"), `${buildInstallGuide("win", version)}\n`);
await writeFile(
  join(releaseDir, "ALPHA-README.md"),
  `${buildReleaseReadme({ version, target, artifacts })}\n`,
);
await writeFile(
  join(releaseDir, "alpha-release-manifest.json"),
  `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    target,
    version,
    artifacts,
    guides: ["INSTALL-macOS.md", "INSTALL-Windows.md", "ALPHA-README.md"],
  }, null, 2)}\n`,
);

console.log(`Packaged ${target} alpha artifacts in ${releaseDir}`);
for (const artifact of artifacts) {
  console.log(`- ${artifact.name}`);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      continue;
    }
    const key = value.slice(2);
    const nextValue = argv[index + 1];
    if (!nextValue || nextValue.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = nextValue;
    index += 1;
  }
  return parsed;
}

function run(command) {
  const [commandName, ...commandArgs] = command;
  const executable = resolveScriptCommand(commandName);
  const result = spawnSync(executable, commandArgs, {
    cwd: desktopDir,
    stdio: "inherit",
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(formatSpawnFailure(commandName, commandArgs, result));
    process.exit(result.status ?? 1);
  }
}
