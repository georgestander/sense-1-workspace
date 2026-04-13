#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const forbiddenTopLevelEntries = [
  ".agent",
  ".claude",
  ".omx",
  ".playwright-cli",
  ".playwright-mcp",
  "docs",
  "output",
  "sense",
];

const failures = [];

for (const entry of forbiddenTopLevelEntries) {
  if (fs.existsSync(path.join(repoRoot, entry))) {
    failures.push(`Forbidden top-level entry present: ${entry}`);
  }
}

const desktopPackagePath = path.join(repoRoot, "desktop", "package.json");
if (!fs.existsSync(desktopPackagePath)) {
  failures.push("Missing desktop/package.json");
} else {
  const desktopPackage = JSON.parse(fs.readFileSync(desktopPackagePath, "utf8"));
  if (desktopPackage.name !== "sense-1-workspace") {
    failures.push(`desktop/package.json name must be "sense-1-workspace", found "${desktopPackage.name}"`);
  }
  if (desktopPackage.build?.publish?.[0]?.repo !== "sense-1-workspace") {
    failures.push("desktop/package.json publish repo must be \"sense-1-workspace\"");
  }
}

const expectedFiles = [
  "README.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "DESIGN.md",
  path.join("desktop", "README.md"),
  path.join("desktop", "resources", "icon-1024.png"),
];

for (const target of expectedFiles) {
  if (!fs.existsSync(path.join(repoRoot, target))) {
    failures.push(`Missing required file: ${target}`);
  }
}

if (failures.length > 0) {
  console.error("[public-boundary] failed");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("[public-boundary] ok");
