import type { DesktopThreadEntry } from "../../lib/live-thread-data.js";
import { perfMeasure } from "../../lib/perf-debug.ts";
import { resolveArtifactPath } from "../../lib/thread-artifacts.ts";
import {
  buildActivityGroup,
  isWorkLogEntry,
  summarizeActivityGroup,
  type ThreadActivityGroup,
} from "./thread-work-log-utils.ts";
export { isCompletedStatus, isThreadEntryRunning, summarizeActivityGroup } from "./thread-work-log-utils.ts";
export { summarizeWorkLogEntry } from "./thread-work-log-utils.ts";

export type ThreadGroupedEntry =
  | ThreadActivityGroup
  | {
      kind: "passthrough";
      entry: DesktopThreadEntry;
    };

export function coerceDisplayText(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value == null) {
    return fallback;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

export function firstLinePreview(value: unknown, fallback: string): string {
  const text = coerceDisplayText(value, fallback).trim();
  if (!text) {
    return fallback;
  }
  const [firstLine] = text.split(/\r?\n/, 1);
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
}

export function resolveWorkspaceFilePath(filePath: string, workspaceRoot: string | null | undefined): string {
  if (!filePath || filePath.startsWith("/") || /^[a-zA-Z]:\\/.test(filePath) || !workspaceRoot?.trim()) {
    return filePath;
  }

  const normalizedRoot = workspaceRoot.replace(/[\\/]+$/, "");
  const normalizedPath = filePath.replace(/^[.][\\/]/, "").replace(/^[\\/]+/, "");
  return `${normalizedRoot}/${normalizedPath}`;
}

export function fileBasename(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
}

export function fileRelativePath(filePath: string, workspaceRoot: string | null): string {
  if (workspaceRoot && filePath.startsWith(workspaceRoot)) {
    const relativePath = filePath.slice(workspaceRoot.length).replace(/^[\\/]/, "");
    return relativePath || filePath;
  }

  return filePath;
}

export function resolveFileChangeTarget(filePath: string, workspaceRoot: string | null): {
  name: string;
  relativePath: string;
  openPath: string | null;
} {
  return {
    name: fileBasename(filePath),
    relativePath: fileRelativePath(filePath, workspaceRoot),
    openPath: resolveArtifactPath(filePath, workspaceRoot),
  };
}

function unwrapShellCommand(command: string): string {
  return command
    .replace(/^\/bin\/(?:bash|sh|zsh)\s+-[a-z]+\s+/, "")
    .replace(/^"(.*)"$/s, "$1")
    .replace(/^'(.*)'$/s, "$1")
    .trim();
}

function detectCommandFileHint(command: string): string | null {
  const normalized = command.toLowerCase();
  if (normalized.includes("skill.md")) {
    return "SKILL.md";
  }
  if (normalized.includes("openai.yaml")) {
    return "openai.yaml";
  }
  if (normalized.includes("plugin.json")) {
    return "plugin.json";
  }
  if (normalized.includes("marketplace.json")) {
    return "marketplace.json";
  }
  return null;
}

export function summarizeCommand(command: string | undefined): string {
  if (!command) {
    return "Running command";
  }

  const clean = unwrapShellCommand(command);
  const lowerClean = clean.toLowerCase();
  const hintedFile = detectCommandFileHint(clean);

  if (lowerClean.includes("init_skill.py")) {
    return "Scaffolding skill files";
  }
  if (lowerClean.includes("quick_validate.py")) {
    return "Validating the skill";
  }
  if (lowerClean.includes("generate_openai_yaml.py")) {
    return "Generating skill metadata";
  }
  if (lowerClean.includes("create_basic_plugin.py")) {
    return "Scaffolding plugin files";
  }
  if (lowerClean.includes("install-skill-from-github.py")) {
    return "Installing a skill";
  }
  if (lowerClean.includes("list-skills.py")) {
    return "Listing installable skills";
  }
  if (lowerClean.includes("python3 - <<'py'") || lowerClean.includes("python3 - <<\"py\"")) {
    return hintedFile ? `Running inline Python for ${hintedFile}` : "Running inline Python helper";
  }

  const parts = clean.split(/\s+/);
  const tool = parts[0] ?? "command";
  if (tool === "rg" || tool === "grep") {
    return hintedFile ? `Searching ${hintedFile}` : "Searching files";
  }
  if (tool === "sed" || tool === "cat" || tool === "head") {
    const filePart = parts.find((part) => part.includes("/") || part.includes("."));
    return filePart ? `Reading ${filePart.split("/").pop()}` : "Reading files";
  }
  if (tool === "printf" || tool === "echo") {
    if (hintedFile) {
      return `Preparing ${hintedFile}`;
    }
    return "Preparing output";
  }
  if (tool === "ls" || tool === "find") return "Listing files";
  if (tool === "mkdir") return "Creating directory";
  if (tool === "rm") return "Removing files";
  if (tool === "git") return `git ${parts[1] ?? ""}`.trim();
  if (tool === "python3" || tool === "python") {
    const scriptPart = parts.find((part) => part.endsWith(".py"));
    if (scriptPart) {
      return `Running ${scriptPart.split("/").pop()}`;
    }
    return "Running Python";
  }
  if (tool === "node" || tool === "npm" || tool === "pnpm") return `Running ${tool} ${parts[1] ?? ""}`.trim();
  return `Running ${tool}`;
}

function formatDuration(durationMs: number | null | undefined): string | null {
  if (!Number.isFinite(durationMs) || durationMs == null || durationMs < 0) {
    return null;
  }
  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }
  if (durationMs < 60_000) {
    return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
  }
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function describeCommandExecution(entry: {
  status?: string | null;
  exitCode?: number | null;
  durationMs?: number | null;
  cwd?: string | null;
  body?: string | null;
}): {
  detail: string;
  emptyOutputHint: string;
} {
  const status = coerceDisplayText(entry.status, "running").toLowerCase();
  const parts: string[] = [];

  if (status === "completed") {
    if (entry.exitCode === 0 || entry.exitCode == null) {
      parts.push("Completed successfully");
    } else {
      parts.push(`Failed with exit code ${entry.exitCode}`);
    }
  } else {
    parts.push("Still running");
  }

  const durationLabel = formatDuration(entry.durationMs);
  if (durationLabel) {
    parts.push(durationLabel);
  }

  if (entry.cwd) {
    parts.push(entry.cwd);
  }

  const emptyOutputHint =
    status === "completed"
      ? entry.exitCode === 0 || entry.exitCode == null
        ? "No stdout/stderr was captured, but the command completed successfully."
        : "No stdout/stderr was captured before the command failed."
      : "No stdout/stderr captured yet.";

  return {
    detail: parts.join(" • "),
    emptyOutputHint,
  };
}

export function groupThreadEntries(entries: DesktopThreadEntry[]): ThreadGroupedEntry[] {
  return perfMeasure("transcript.group-thread-entries", () => {
    const result: ThreadGroupedEntry[] = [];
    let currentGroup: DesktopThreadEntry[] = [];

    function flushGroup() {
      if (currentGroup.length === 0) {
        return;
      }
      result.push(buildActivityGroup(currentGroup));
      currentGroup = [];
    }

    for (const entry of entries) {
      if (isWorkLogEntry(entry)) {
        currentGroup.push(entry);
      } else {
        flushGroup();
        result.push({ kind: "passthrough", entry });
      }
    }
    flushGroup();
    return result;
  });
}

export function reuseGroupedThreadEntries(
  previousEntries: DesktopThreadEntry[] | null,
  nextEntries: DesktopThreadEntry[],
  previousGroupedEntries: ThreadGroupedEntry[] | null,
): ThreadGroupedEntry[] | null {
  if (!previousEntries || !previousGroupedEntries || previousEntries.length === 0 || previousEntries.length !== nextEntries.length) {
    return null;
  }

  const lastEntryIndex = nextEntries.length - 1;
  for (let index = 0; index < lastEntryIndex; index += 1) {
    if (previousEntries[index] !== nextEntries[index]) {
      return null;
    }
  }

  const previousLastEntry = previousEntries[lastEntryIndex];
  const nextLastEntry = nextEntries[lastEntryIndex];
  if (
    previousLastEntry.id !== nextLastEntry.id
    || previousLastEntry.kind !== "assistant"
    || nextLastEntry.kind !== "assistant"
    || !("body" in previousLastEntry)
    || !("body" in nextLastEntry)
    || previousLastEntry === nextLastEntry
  ) {
    return null;
  }

  const lastGroupedEntry = previousGroupedEntries.at(-1);
  if (!lastGroupedEntry) {
    return null;
  }

  if (lastGroupedEntry.kind === "passthrough" && lastGroupedEntry.entry.id === nextLastEntry.id) {
    return [
      ...previousGroupedEntries.slice(0, -1),
      {
        kind: "passthrough",
        entry: nextLastEntry,
      },
    ];
  }

  if (lastGroupedEntry.kind === "activity-group" && lastGroupedEntry.entries.at(-1)?.id === nextLastEntry.id) {
    return [
      ...previousGroupedEntries.slice(0, -1),
      buildActivityGroup([
        ...lastGroupedEntry.entries.slice(0, -1),
        nextLastEntry,
      ]),
    ];
  }

  return null;
}
