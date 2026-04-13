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

const platformPackage = resolvePlatformPackageName(process.platform, process.arch);
const codexPackageRoot = path.dirname(require.resolve("@openai/codex/package.json"));

if (!platformPackage) {
  console.error(`No bundled Codex runtime package mapping for ${process.platform}/${process.arch}.`);
  process.exit(1);
}

const runtimeSource = resolveRuntimeSource(platformPackage);
await fs.rm(runtimeDestination, { recursive: true, force: true });
await fs.mkdir(runtimeDestination, { recursive: true });
await fs.cp(runtimeSource, runtimeDestination, { recursive: true });

console.log(`Prepared bundled Codex runtime from ${runtimeSource} -> ${runtimeDestination}`);

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

function resolveRuntimeSource(packageName) {
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
    console.error(`Could not resolve ${packageName}: ${detail}`);
    process.exit(1);
  }
}
