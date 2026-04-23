#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatSpawnFailure,
  resolveScriptCommand,
  resolveScriptSpawnOptions,
} from "./command-runner-utils.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(scriptDir, "..");
const distDir = resolve(desktopDir, "dist");
const packageJson = JSON.parse(readFileSync(resolve(desktopDir, "package.json"), "utf8"));
const desktopVersion =
  typeof packageJson.version === "string" && packageJson.version.trim()
    ? packageJson.version.trim()
    : "unknown";
const sentryRelease = `sense-1-workspace@${desktopVersion}`;
const sentryDist = normalizeOptionalString(process.env.SENSE1_DESKTOP_BUILD_ID);
const args = process.argv.slice(2);
const command = args[0] ?? "help";
const flags = new Set(args.slice(1));
const runtimeTarget = readOptionValue(args.slice(1), "--runtime-target") ?? readOptionValue(args.slice(1), "--target");

const mainProbe = {
  surface: "main",
  bundlePath: resolve(distDir, "main", "main.js"),
  sourcePath: "src/main/main.ts",
  marker: "https://github.com/georgestander/sense-1-workspace/releases/latest",
};

const preloadProbe = {
  surface: "preload",
  bundlePath: resolve(distDir, "preload", "index.mjs"),
  sourcePath: "src/preload/index.ts",
  marker: "sense1Desktop",
};

main();

function main() {
  switch (command) {
    case "prepare":
      prepareReleaseArtifacts();
      return;
    case "smoke":
      if (!flags.has("--no-build")) {
        prepareReleaseArtifacts();
      }
      runSmokeValidation();
      return;
    case "upload":
      if (!flags.has("--no-build")) {
        prepareReleaseArtifacts();
      }
      runSmokeValidation();
      uploadArtifacts();
      return;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  console.log(
    [
      "Usage: node ./scripts/sentry-release.mjs <prepare|smoke|upload> [--no-build] [--runtime-target mac|win]",
      "",
      "prepare  Build desktop release artifacts and inject Sentry Debug IDs.",
      "smoke    Prepare artifacts (unless --no-build) and verify local source-map resolution.",
      "upload   Prepare artifacts (unless --no-build), verify them, then upload to Sentry.",
      "",
      "Environment:",
      "- SENSE1_DESKTOP_BUILD_ID: optional build id mapped to Sentry dist",
      "- SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT: required for upload",
      "",
      "Options:",
      "- --runtime-target mac|win: prepare the bundled Codex runtime for a package target",
    ].join("\n"),
  );
}

function prepareReleaseArtifacts() {
  console.log(`Preparing desktop release artifacts for ${formatReleaseLabel()}`);
  const prepareRuntimeArgs = ["./scripts/prepare-codex-runtime.mjs"];
  if (runtimeTarget) {
    prepareRuntimeArgs.push("--target", runtimeTarget);
  }
  run("node", prepareRuntimeArgs);
  run("pnpm", ["exec", "electron-vite", "build"]);
  runSentryCli([
    "sourcemaps",
    "inject",
    distDir,
    "--release",
    sentryRelease,
  ]);
}

function uploadArtifacts() {
  assertEnv("SENTRY_AUTH_TOKEN");
  assertEnv("SENTRY_ORG");
  assertEnv("SENTRY_PROJECT");

  console.log(`Uploading desktop source maps for ${formatReleaseLabel()}`);
  const args = [
    "sourcemaps",
    "upload",
    distDir,
    "--release",
    sentryRelease,
    "--validate",
    "--wait",
  ];
  if (sentryDist) {
    args.push("--dist", sentryDist);
  }
  runSentryCli(args);
}

function runSmokeValidation() {
  console.log(`Running Sentry smoke validation for ${formatReleaseLabel()}`);
  const probes = [mainProbe, preloadProbe, resolveRendererProbe()];

  for (const probe of probes) {
    assertExists(probe.bundlePath, `${probe.surface} bundle`);
    assertExists(`${probe.bundlePath}.map`, `${probe.surface} sourcemap`);
    assertDebugIdInjected(probe);
    assertSourcemapResolves(probe);
  }

  console.log("Sentry smoke validation passed for main, preload, and renderer bundles.");
}

function resolveRendererProbe() {
  const rendererAssetsDir = resolve(distDir, "renderer", "assets");
  assertExists(rendererAssetsDir, "renderer assets directory");

  const rendererBundleName = readdirSync(rendererAssetsDir)
    .filter((entry) => entry.startsWith("index-") && entry.endsWith(".js"))
    .sort()[0];

  if (!rendererBundleName) {
    throw new Error("Unable to find the renderer JavaScript bundle under dist/renderer/assets.");
  }

  return {
    surface: "renderer",
    bundlePath: resolve(rendererAssetsDir, rendererBundleName),
    sourcePath: "src/renderer/main.tsx",
    marker: "Desktop renderer root element was not found.",
  };
}

function assertDebugIdInjected(probe) {
  const bundleContent = readFileSync(probe.bundlePath, "utf8");
  const sourcemapContent = readFileSync(`${probe.bundlePath}.map`, "utf8");

  if (!/debugId=/.test(bundleContent)) {
    throw new Error(`Missing injected Debug ID marker in ${probe.surface} bundle: ${probe.bundlePath}`);
  }
  if (!/"debug(?:_|)id"\s*:\s*"/i.test(sourcemapContent)) {
    throw new Error(`Missing injected debug_id in ${probe.surface} sourcemap: ${probe.bundlePath}.map`);
  }
}

function assertSourcemapResolves(probe) {
  const bundleContent = readFileSync(probe.bundlePath, "utf8");
  const location = findMarkerLocation(bundleContent, probe.marker);
  const result = runSentryCli(
    [
      "sourcemaps",
      "resolve",
      `${probe.bundlePath}.map`,
      "--line",
      String(location.line),
      "--column",
      String(location.column),
    ],
    { capture: true },
  );

  const resolvedOutput = `${result.stdout}\n${result.stderr}`;
  if (!resolvedOutput.includes(probe.sourcePath)) {
    throw new Error(
      [
        `Sentry CLI did not resolve the ${probe.surface} bundle back to ${probe.sourcePath}.`,
        `Marker: ${probe.marker}`,
        `Line: ${location.line}, column: ${location.column}`,
        resolvedOutput.trim(),
      ].join("\n"),
    );
  }
}

function findMarkerLocation(content, marker) {
  const index = content.indexOf(marker);
  if (index < 0) {
    throw new Error(`Could not find smoke marker "${marker}" in built bundle.`);
  }

  const prefix = content.slice(0, index);
  const line = prefix.split("\n").length;
  const lastNewlineIndex = prefix.lastIndexOf("\n");
  const column = index - lastNewlineIndex;
  return { line, column };
}

function runSentryCli(args, options = {}) {
  return run("pnpm", ["dlx", "@sentry/cli@3.4.0", ...args], options);
}

function run(commandName, commandArgs, options = {}) {
  const executable = resolveScriptCommand(commandName);
  const result = spawnSync(executable, commandArgs, {
    cwd: desktopDir,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    ...resolveScriptSpawnOptions(commandName),
  });

  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stderr ?? "");
      process.stdout.write(result.stdout ?? "");
    }
    throw new Error(formatSpawnFailure(commandName, commandArgs, result));
  }

  return result;
}

function assertExists(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

function assertEnv(name) {
  if (!normalizeOptionalString(process.env[name])) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOptionValue(values, name) {
  const inlinePrefix = `${name}=`;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === name) {
      const nextValue = values[index + 1];
      return nextValue && !nextValue.startsWith("--") ? nextValue : null;
    }
    if (value.startsWith(inlinePrefix)) {
      return normalizeOptionalString(value.slice(inlinePrefix.length));
    }
  }
  return null;
}

function formatReleaseLabel() {
  return sentryDist ? `${sentryRelease} (dist ${sentryDist})` : sentryRelease;
}
