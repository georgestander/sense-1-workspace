import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, "..");
const srcRoot = path.join(desktopRoot, "src");
const strictMode = process.argv.includes("--strict");

const EXCLUDED_DIRECTORY_NAMES = new Set([
  "test-fixtures",
  "ui",
]);

const DIRECT_FILE_LIMITS = new Map([
  ["main", 30],
  ["renderer", 15],
]);

const ROOT_FILE_ALLOWLISTS = new Map([
  ["main", new Set([
    "contracts.js",
    "contracts.ts",
    "desktop-icon.ts",
    "e2e-auth-fixture.ts",
    "ipc.ts",
    "main.ts",
    "review-summary.ts",
    "session-controller.ts",
    "window.ts",
  ])],
  ["renderer", new Set([
    "App.tsx",
    "main.tsx",
    "styles.css",
    "thread-markdown.tsx",
    "use-desktop-session-state.test.js",
    "use-desktop-session-state.ts",
    "vite-env.d.ts",
  ])],
]);

const EXEMPT_LINE_COUNT_FILES = new Set([
  "main.tsx",
]);

const LEGACY_JS_TS_TWINS = new Set([
  "main/contracts",
  "renderer/features/session/use-desktop-session-actions",
  "renderer/state/session/session-selectors",
  "renderer/state/session/session-types",
  "renderer/state/threads/thread-summary-state",
  "shared/contracts/bootstrap",
  "shared/contracts/bridge",
  "shared/contracts/events",
  "shared/contracts/index",
  "shared/contracts/models",
  "shared/contracts/projections",
  "shared/contracts/run",
  "shared/contracts/runtime",
  "shared/contracts/settings",
  "shared/contracts/substrate",
  "shared/contracts/thread",
  "shared/contracts/thread-core",
  "shared/contracts/thread-delta",
  "shared/contracts/thread-input",
  "shared/contracts/workspace",
]);

const LEGACY_JS_DTS_SHIMS = new Set([
  "main/bootstrap/bootstrap-profile",
  "main/bootstrap/desktop-bootstrap",
  "main/profile/profile-state",
  "main/runtime/app-server-process-manager",
  "main/runtime/live-thread-runtime",
  "main/session/thread-state-accumulator",
  "main/settings/desktop-settings",
  "main/settings/policy",
  "main/substrate/substrate",
  "main/substrate/substrate-projections",
  "main/substrate/substrate-reader",
  "main/substrate/substrate-writer",
  "renderer/features/updates/update-presentation",
  "renderer/features/workspace/substrate-thread-enrichment",
  "renderer/features/workspace/workspace-continuity",
  "renderer/lib/live-thread-data",
  "renderer/lib/model-catalog",
  "renderer/state/threads/thread-delta-buffer",
  "shared/lifecycle",
]);

async function main() {
  const warnings = [];

  await collectDirectFileWarnings(warnings);
  await collectUnexpectedRootFiles(warnings);
  await collectSourceFileWarnings(srcRoot, warnings);

  if (warnings.length === 0) {
    console.log("[desktop:structure] OK");
    return;
  }

  console.warn(`[desktop:structure] ${warnings.length} warning(s)`);
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }

  if (strictMode) {
    process.exitCode = 1;
  }
}

async function collectDirectFileWarnings(warnings) {
  for (const [directoryName, fileLimit] of DIRECT_FILE_LIMITS) {
    const directoryPath = path.join(srcRoot, directoryName);
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    const directFiles = entries.filter((entry) => entry.isFile());
    if (directFiles.length > fileLimit) {
      warnings.push(
        `desktop/src/${directoryName} has ${directFiles.length} direct files (soft limit ${fileLimit}). ` +
        "Favor subdirectories by responsibility instead of growing the flat surface.",
      );
    }
  }
}

async function collectUnexpectedRootFiles(warnings) {
  for (const [directoryName, allowlist] of ROOT_FILE_ALLOWLISTS) {
    const directoryPath = path.join(srcRoot, directoryName);
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || allowlist.has(entry.name)) {
        continue;
      }

      const relativePath = `desktop/src/${directoryName}/${entry.name}`;
      const destinationHint = directoryName === "main"
        ? "Move responsibility-specific code into a named main-process subdirectory."
        : "Move feature code into renderer/features, renderer/components, renderer/state, or renderer/lib.";
      warnings.push(`${relativePath} is an unexpected ${directoryName}-root file. ${destinationHint}`);
    }
  }
}

async function collectSourceFileWarnings(directoryPath, warnings) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const siblingExtensions = new Map();

  for (const entry of entries) {
    if (EXCLUDED_DIRECTORY_NAMES.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      await collectSourceFileWarnings(entryPath, warnings);
      continue;
    }

    const relativePath = path.relative(desktopRoot, entryPath).replace(/\\/g, "/");
    if (!isTrackedSourceFile(relativePath)) {
      continue;
    }

    const { extension, baseName } = splitTrackedExtension(entry.name);
    const siblings = siblingExtensions.get(baseName) ?? new Set();
    siblings.add(extension);
    siblingExtensions.set(baseName, siblings);

    const threshold = lineCountThreshold(relativePath);
    if (threshold === null) {
      continue;
    }

    const lineCount = await countLines(entryPath);
    if (lineCount > threshold) {
      warnings.push(
        `${relativePath} is ${lineCount} lines (soft limit ${threshold}). ` +
        "Split responsibilities before adding more behavior here.",
      );
    }
  }

  for (const [baseName, extensions] of siblingExtensions) {
    const relativeDir = path.relative(srcRoot, directoryPath).replace(/\\/g, "/");
    const relativeStem = `${relativeDir}/${baseName}`;

    if (extensions.has(".js") && extensions.has(".ts") && !LEGACY_JS_TS_TWINS.has(relativeStem)) {
      warnings.push(
        `desktop/src/${relativeStem} mixes side-by-side .js and .ts sources. ` +
        "Keep one authored source of truth for the module.",
      );
    }

    if (extensions.has(".js") && extensions.has(".d.ts") && !LEGACY_JS_DTS_SHIMS.has(relativeStem)) {
      warnings.push(
        `desktop/src/${relativeStem} mixes a .js module with a side-by-side .d.ts file. ` +
        "Prefer authored TypeScript or move ambient typing into an explicit type-only location.",
      );
    }
  }
}

function isTrackedSourceFile(relativePath) {
  if (!relativePath.startsWith("src/")) {
    return false;
  }

  if (relativePath.endsWith(".test.js") || relativePath.endsWith(".test.ts") || relativePath.endsWith(".test.tsx")) {
    return false;
  }

  return (
    relativePath.endsWith(".js")
    || relativePath.endsWith(".ts")
    || relativePath.endsWith(".tsx")
    || relativePath.endsWith(".d.ts")
  );
}

function splitTrackedExtension(fileName) {
  if (fileName.endsWith(".d.ts")) {
    return {
      extension: ".d.ts",
      baseName: fileName.slice(0, -".d.ts".length),
    };
  }

  const extension = path.extname(fileName);
  return {
    extension,
    baseName: fileName.slice(0, -extension.length),
  };
}

function lineCountThreshold(relativePath) {
  const normalized = relativePath.replace(/^src\//, "");
  const fileName = path.basename(normalized);

  if (EXEMPT_LINE_COUNT_FILES.has(fileName)) {
    return null;
  }

  if (normalized.startsWith("preload/")) {
    return 200;
  }

  if (normalized.startsWith("shared/")) {
    return normalized.includes("contracts/") ? 300 : 350;
  }

  if (normalized.startsWith("renderer/")) {
    return fileName.endsWith(".tsx") || normalized.includes("/hooks/") || normalized.includes("/state/")
      ? 350
      : 400;
  }

  if (normalized.startsWith("main/")) {
    return 500;
  }

  return 400;
}

async function countLines(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  if (!content) {
    return 0;
  }

  return content.split("\n").length;
}

await main();
