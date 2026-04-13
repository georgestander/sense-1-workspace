import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function firstString(...values) {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

function splitPathEntries(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return [];
  }
  return rawValue
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniquePathEntries(values) {
  const seen = new Set();
  const entries = [];
  for (const value of values) {
    const normalized = path.resolve(value);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    entries.push(normalized);
  }
  return entries;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveCodexTargetTriple() {
  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "aarch64-apple-darwin" : process.arch === "x64" ? "x86_64-apple-darwin" : null;
  }

  if (process.platform === "linux") {
    return process.arch === "arm64" ? "aarch64-unknown-linux-musl" : process.arch === "x64" ? "x86_64-unknown-linux-musl" : null;
  }

  if (process.platform === "win32") {
    return process.arch === "arm64" ? "aarch64-pc-windows-msvc" : process.arch === "x64" ? "x86_64-pc-windows-msvc" : null;
  }

  return null;
}

function commandHasPath(command) {
  return command.includes("/") || command.includes("\\");
}

function candidateCommandNames(command) {
  if (process.platform !== "win32") {
    return [command];
  }

  const pathExtRaw = firstString(process.env.PATHEXT, ".EXE;.CMD;.BAT;.COM");
  const pathExt = pathExtRaw
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const hasExtension = path.extname(command).length > 0;
  if (hasExtension) {
    return [command];
  }
  return [command, ...pathExt.map((ext) => `${command}${ext.toLowerCase()}`)];
}

async function isExecutableFile(filePath) {
  const mode = process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK;
  try {
    await fs.access(filePath, mode);
    return true;
  } catch {
    return false;
  }
}

function resolveBundledRuntimeRoots() {
  const candidates = [
    typeof process.resourcesPath === "string" ? path.join(process.resourcesPath, "resources", "codex-runtime") : null,
    path.resolve(moduleDir, "..", "..", "..", "resources", "codex-runtime"),
  ].filter(Boolean);
  return uniquePathEntries(candidates);
}

async function resolveCommandFromPath(command, runtimePath) {
  const pathEntries = splitPathEntries(runtimePath);
  const names = candidateCommandNames(command);

  for (const entry of pathEntries) {
    for (const name of names) {
      const candidate = path.join(entry, name);
      if (await isExecutableFile(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

async function resolveRuntimeCommand(rawCommand, env) {
  const command = firstString(rawCommand);
  if (!command) {
    throw new Error("Sense-1 runtime command is not configured.");
  }

  if (commandHasPath(command)) {
    return command;
  }

  if (command !== "codex") {
    return command;
  }

  const resolved = await resolveCommandFromPath(command, env?.PATH || "");
  if (resolved) {
    return resolved;
  }

  const searchedEntries = splitPathEntries(env?.PATH || "")
    .slice(0, 8)
    .join(", ");
  const searchSummary = searchedEntries || "<empty PATH>";
  throw new Error(
    `Could not find "codex" runtime on PATH. Searched: ${searchSummary}. Install Codex CLI.`,
  );
}

function resolveBundledCodexScriptPath() {
  try {
    return require.resolve("@openai/codex/bin/codex.js");
  } catch {
    return null;
  }
}

async function resolveBundledCodexBinary() {
  const targetTriple = resolveCodexTargetTriple();
  if (!targetTriple) {
    return null;
  }

  const binaryName = process.platform === "win32" ? "codex.exe" : "codex";
  const runtimeRoots = resolveBundledRuntimeRoots();
  for (const runtimeRoot of runtimeRoots) {
    const binaryPath = path.join(runtimeRoot, targetTriple, "codex", binaryName);
    if (!(await isExecutableFile(binaryPath))) {
      continue;
    }

    const pathDir = path.join(runtimeRoot, targetTriple, "path");
    return {
      binaryPath,
      pathDir: (await pathExists(pathDir)) ? pathDir : null,
    };
  }

  return null;
}

function prependPathEntry(entry, existingPath) {
  if (!entry) {
    return existingPath;
  }
  const entries = uniquePathEntries([entry, ...splitPathEntries(existingPath)]);
  return entries.join(path.delimiter);
}

export async function resolveRuntimeLaunch({ command, args, env }) {
  const resolvedCommand = firstString(command);
  if (!resolvedCommand) {
    throw new Error("Sense-1 runtime command is not configured.");
  }

  if (resolvedCommand !== "codex" || commandHasPath(resolvedCommand)) {
    return {
      code: resolvedCommand,
      args,
      envPatch: {},
    };
  }

  const bundledBinary = await resolveBundledCodexBinary();
  if (bundledBinary?.binaryPath) {
    return {
      code: bundledBinary.binaryPath,
      args,
      envPatch: {
        PATH: prependPathEntry(bundledBinary.pathDir, env?.PATH || ""),
      },
    };
  }

  const bundledScript = resolveBundledCodexScriptPath();
  if (bundledScript) {
    return {
      code: process.execPath,
      args: [bundledScript, ...args],
      envPatch: {
        ELECTRON_RUN_AS_NODE: "1",
        PATH: env?.PATH || "",
      },
    };
  }

  const pathResolved = await resolveRuntimeCommand(resolvedCommand, env);
  return {
    code: pathResolved,
    args,
    envPatch: {},
  };
}
