import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";

export function normalizeTarget(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "mac" || normalized === "win" ? normalized : null;
}

export function expectedArtifactExtensions(target) {
  if (target === "mac") {
    return [".dmg", ".zip"];
  }
  if (target === "win") {
    return [".exe"];
  }
  return [];
}

export function isTargetArtifact(target, fileName) {
  const lowerName = fileName.toLowerCase();
  return expectedArtifactExtensions(target).some((extension) => lowerName.endsWith(extension));
}

export function buildInstallGuide(target, version) {
  if (target === "mac") {
    return [
      "# Sense-1 Workspace Alpha Install Guide (macOS)",
      "",
      `Version: ${version}`,
      "",
      "## Install",
      "",
      "1. Open the packaged DMG from this release folder.",
      "2. Drag `Sense-1 Workspace.app` into `Applications`.",
      "3. Launch it from `Applications`.",
      "4. When you receive a newer alpha, replace the existing app in `Applications` with the newer one.",
      "",
      "## Unsigned app friction",
      "",
      "If Gatekeeper blocks the alpha because it is unsigned:",
      "",
      "- In Finder, `Control`-click the app and choose `Open`, or",
      "- Use `System Settings` -> `Privacy & Security` -> `Open Anyway` after the first blocked launch attempt.",
      "",
      "## Updates",
      "",
      "Sense-1 does not deliver in-app auto-updates during this alpha. Install updates manually by replacing the app with the newer packaged build.",
      "",
    ].join("\n");
  }

  return [
    "# Sense-1 Workspace Alpha Install Guide (Windows)",
    "",
    `Version: ${version}`,
    "",
    "## Install",
    "",
    "1. Run the packaged NSIS installer `.exe` from this release folder.",
    "2. Complete the installer flow.",
    "3. When you receive a newer alpha, run the newer installer again to update the app.",
    "",
    "## SmartScreen friction",
    "",
    "If Windows SmartScreen warns that the installer is from an unrecognized app:",
    "",
    "- Choose `More info` -> `Run anyway` only for trusted internal alpha builds.",
    "",
    "## Updates",
    "",
    "Sense-1 does not deliver in-app auto-updates during this alpha. Install updates manually by running the newer installer.",
    "",
  ].join("\n");
}

export function buildReleaseReadme({ version, target, artifacts }) {
  const targetLabel = target === "mac" ? "macOS" : "Windows";
  const artifactLines = artifacts.map((artifact) => `- ${artifact.name} (${artifact.sizeBytes} bytes, sha256 ${artifact.sha256})`);
  return [
    "# Sense-1 Workspace Alpha Release Bundle",
    "",
    `Version: ${version}`,
    `Packaged target: ${targetLabel}`,
    "",
    "## Included artifacts",
    "",
    ...(artifactLines.length > 0 ? artifactLines : ["- No artifacts were detected."]),
    "",
    "## Install guides",
    "",
    "- `INSTALL-macOS.md`",
    "- `INSTALL-Windows.md`",
    "",
    "Sense-1 alpha builds install manually. The app does not provide in-app auto-updates for this alpha.",
    "",
  ].join("\n");
}

export async function snapshotReleaseDir(releaseDir) {
  const snapshot = new Map();
  for (const entry of await safeReadDir(releaseDir)) {
    if (!entry.isFile()) {
      continue;
    }
    const entryPath = join(releaseDir, entry.name);
    const entryStat = await stat(entryPath);
    snapshot.set(entry.name, entryStat.mtimeMs);
  }
  return snapshot;
}

export async function collectArtifacts({ releaseDir, target, snapshot }) {
  const artifacts = [];
  for (const entry of await safeReadDir(releaseDir)) {
    if (!entry.isFile() || !isTargetArtifact(target, entry.name)) {
      continue;
    }

    const entryPath = join(releaseDir, entry.name);
    const entryStat = await stat(entryPath);
    const previousMtimeMs = snapshot.get(entry.name);
    if (previousMtimeMs != null && previousMtimeMs === entryStat.mtimeMs) {
      continue;
    }

    const contents = await readFile(entryPath);
    artifacts.push({
      name: basename(entryPath),
      path: entryPath,
      sizeBytes: contents.byteLength,
      sha256: createHash("sha256").update(contents).digest("hex"),
    });
  }

  return artifacts.sort((left, right) => left.name.localeCompare(right.name));
}

async function safeReadDir(targetPath) {
  try {
    return await readdir(targetPath, { withFileTypes: true });
  } catch {
    return [];
  }
}
