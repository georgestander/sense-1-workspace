#!/usr/bin/env node

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, "..");
const runtimeDestination = path.join(desktopRoot, "resources", "codex-runtime");

const options = parseArgs(process.argv.slice(2));
const runtimeTarget = resolveRuntimeTarget(options);
const platformPackage = resolvePlatformPackageName(runtimeTarget.platform, runtimeTarget.arch);
const codexPackageRoot = path.dirname(require.resolve("@openai/codex/package.json"));

if (!platformPackage) {
  console.error(`No bundled Codex runtime package mapping for ${runtimeTarget.platform}/${runtimeTarget.arch}.`);
  process.exit(1);
}

const runtimeSource = resolveRuntimeSource(platformPackage, runtimeTarget);
await fs.rm(runtimeDestination, { recursive: true, force: true });
await fs.mkdir(runtimeDestination, { recursive: true });
await fs.cp(runtimeSource, runtimeDestination, { recursive: true });

console.log(
  `Prepared bundled Codex runtime for ${runtimeTarget.platform}/${runtimeTarget.arch} from ${runtimeSource} -> ${runtimeDestination}`,
);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = value.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      parsed[rawKey] = inlineValue;
      continue;
    }

    const nextValue = argv[index + 1];
    if (!nextValue || nextValue.startsWith("--")) {
      parsed[rawKey] = "true";
      continue;
    }

    parsed[rawKey] = nextValue;
    index += 1;
  }
  return parsed;
}

function normalizeTarget(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "mac" || normalized === "win" ? normalized : null;
}

function resolveRuntimeTarget(options) {
  const explicitPlatform = typeof options.platform === "string" && options.platform.trim()
    ? options.platform.trim()
    : null;
  const explicitArch = typeof options.arch === "string" && options.arch.trim()
    ? options.arch.trim()
    : null;

  if (explicitPlatform || explicitArch) {
    return {
      platform: explicitPlatform ?? process.platform,
      arch: explicitArch ?? process.arch,
    };
  }

  const requestedTarget = options.target ?? options["runtime-target"];
  const target = normalizeTarget(requestedTarget);
  if (requestedTarget !== undefined && !target) {
    throw new Error(`Unsupported runtime target "${requestedTarget}". Expected "mac" or "win".`);
  }
  if (target === "mac") {
    return { platform: "darwin", arch: "arm64" };
  }
  if (target === "win") {
    return { platform: "win32", arch: "x64" };
  }

  return {
    platform: process.platform,
    arch: process.arch,
  };
}

function resolvePlatformPackageName(platform, arch) {
  if (platform === "darwin" && arch === "arm64") {
    return "@openai/codex-darwin-arm64";
  }
  if (platform === "darwin" && arch === "x64") {
    return "@openai/codex-darwin-x64";
  }
  if (platform === "linux" && arch === "arm64") {
    return "@openai/codex-linux-arm64";
  }
  if (platform === "linux" && arch === "x64") {
    return "@openai/codex-linux-x64";
  }
  if (platform === "win32" && arch === "arm64") {
    return "@openai/codex-win32-arm64";
  }
  if (platform === "win32" && arch === "x64") {
    return "@openai/codex-win32-x64";
  }
  return null;
}

function resolveRuntimeSource(packageName, runtimeTarget) {
  const packageSegment = packageName.split("/").at(-1);
  const siblingOptionalPath = path.join(path.dirname(codexPackageRoot), packageSegment);
  const siblingOptionalPackageJson = path.join(siblingOptionalPath, "package.json");
  const nestedOptionalPath = path.join(codexPackageRoot, "node_modules", "@openai", packageSegment);
  const nestedOptionalPackageJson = path.join(nestedOptionalPath, "package.json");
  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`);
    const packageRoot = path.dirname(packageJsonPath);
    const vendorRoot = path.join(packageRoot, "vendor");
    return vendorRoot;
  } catch (error) {
    if (existsSync(siblingOptionalPackageJson)) {
      return path.join(siblingOptionalPath, "vendor");
    }
    if (existsSync(nestedOptionalPackageJson)) {
      return path.join(nestedOptionalPath, "vendor");
    }
    const detail = error instanceof Error ? error.message : String(error);
    console.error(
      [
        `Could not resolve ${packageName} for ${runtimeTarget.platform}/${runtimeTarget.arch}: ${detail}`,
        "Run `pnpm install` in desktop after package.json supportedArchitectures changes, then retry packaging.",
      ].join("\n"),
    );
    process.exit(1);
  }
}
