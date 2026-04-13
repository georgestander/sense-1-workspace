import type { DesktopThreadEntry } from "../../lib/live-thread-data.js";
import { resolveArtifactPath } from "../../lib/thread-artifacts.ts";

const COLLAPSIBLE_KINDS = new Set<string>(["command", "tool", "reasoning"]);

export type ThreadGroupedEntry =
  | {
      kind: "activity-group";
      entries: DesktopThreadEntry[];
      latestLabel: string;
      id: string;
    }
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

export function summarizeCommand(command: string | undefined): string {
  if (!command) {
    return "Running command";
  }

  const clean = command.replace(/^\/bin\/[a-z]+ -[a-z]+ ["']?/, "").replace(/["']$/, "");
  const parts = clean.split(/\s+/);
  const tool = parts[0] ?? "command";
  if (tool === "rg" || tool === "grep") return "Searching files";
  if (tool === "sed" || tool === "cat" || tool === "head") {
    const filePart = parts.find((part) => part.includes("/") || part.includes("."));
    return filePart ? `Reading ${filePart.split("/").pop()}` : "Reading files";
  }
  if (tool === "ls" || tool === "find") return "Listing files";
  if (tool === "mkdir") return "Creating directory";
  if (tool === "rm") return "Removing files";
  if (tool === "git") return `git ${parts[1] ?? ""}`.trim();
  if (tool === "node" || tool === "npm" || tool === "pnpm") return `Running ${tool} ${parts[1] ?? ""}`.trim();
  return `Running ${tool}`;
}

export function summarizeActivityGroup(entries: DesktopThreadEntry[]): string {
  const commands = entries.filter((entry) => entry.kind === "command");
  const tools = entries.filter((entry) => entry.kind === "tool");
  const reasoning = entries.filter((entry) => entry.kind === "reasoning");

  if (commands.length > 0) {
    const latest = commands[commands.length - 1];
    const label = summarizeCommand("command" in latest ? (latest.command as string) : undefined);
    return commands.length === 1 ? label : `${label} (${commands.length} operations)`;
  }
  if (tools.length > 0) {
    return tools.length === 1 ? "Using a tool" : `Using tools (${tools.length} calls)`;
  }
  if (reasoning.length > 0) {
    return "Thinking";
  }
  return `Working (${entries.length} steps)`;
}

export function groupThreadEntries(entries: DesktopThreadEntry[]): ThreadGroupedEntry[] {
  const result: ThreadGroupedEntry[] = [];
  let currentGroup: DesktopThreadEntry[] = [];

  function flushGroup() {
    if (currentGroup.length === 0) {
      return;
    }
    if (currentGroup.length === 1 && currentGroup[0].kind === "reasoning") {
      result.push({ kind: "passthrough", entry: currentGroup[0] });
    } else {
      result.push({
        kind: "activity-group",
        entries: [...currentGroup],
        latestLabel: summarizeActivityGroup(currentGroup),
        id: `activity-${currentGroup[0].id}`,
      });
    }
    currentGroup = [];
  }

  for (const entry of entries) {
    if (COLLAPSIBLE_KINDS.has(entry.kind)) {
      currentGroup.push(entry);
    } else {
      flushGroup();
      result.push({ kind: "passthrough", entry });
    }
  }
  flushGroup();
  return result;
}
