import fs from "node:fs/promises";
import path from "node:path";

import type { DesktopExtensionPluginMcpIssue } from "../contracts";

const PLUGIN_CLONE_ROOT_SEGMENTS = [".tmp", "plugins", "plugins"] as const;
const MANIFEST_FILENAME = ".mcp.json.quarantine-manifest.json";

export type QuarantineSummary = {
  readonly scannedFiles: number;
  readonly rewrittenFiles: number;
  readonly removedEntries: DesktopExtensionPluginMcpIssue[];
};

type ClassifyResult = { ok: true } | { ok: false; reason: string };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function classifyPluginMcpEntry(entry: unknown): ClassifyResult {
  const record = asRecord(entry);
  if (Object.keys(record).length === 0) {
    return { ok: false, reason: "Plugin MCP entry is not an object." };
  }
  if (nonEmptyString(record.command)) {
    return { ok: true };
  }
  if (nonEmptyString(record.url)) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: "Plugin MCP entry is missing both `command` (stdio) and `url` (remote); codex cannot infer a transport.",
  };
}

function pluginCloneRoot(profileCodexHome: string): string {
  return path.join(profileCodexHome, ...PLUGIN_CLONE_ROOT_SEGMENTS);
}

async function listPluginCloneMcpFiles(
  profileCodexHome: string,
  extraSourcePaths: readonly string[] = [],
): Promise<Array<{ pluginName: string; mcpJsonPath: string; sourcePath: string }>> {
  const root = pluginCloneRoot(profileCodexHome);
  const candidates: Array<{ pluginName: string; sourcePath: string }> = [];

  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      candidates.push({ pluginName: entry.name, sourcePath: path.join(root, entry.name) });
    }
  } catch {}

  for (const extra of extraSourcePaths) {
    if (!extra) {
      continue;
    }
    const resolved = path.resolve(extra);
    candidates.push({ pluginName: path.basename(resolved), sourcePath: resolved });
  }

  const seenSourcePaths = new Set<string>();
  const results: Array<{ pluginName: string; mcpJsonPath: string; sourcePath: string }> = [];
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate.sourcePath);
    if (seenSourcePaths.has(resolved)) {
      continue;
    }
    seenSourcePaths.add(resolved);

    const mcpJsonPath = path.join(resolved, ".mcp.json");
    try {
      await fs.access(mcpJsonPath);
    } catch {
      continue;
    }
    results.push({ pluginName: candidate.pluginName, mcpJsonPath, sourcePath: resolved });
  }
  return results;
}

type ManifestRecord = {
  readonly serverId: string;
  readonly reason: string;
  readonly removedAt: string;
  readonly originalValue: unknown;
};

type ManifestFile = {
  readonly entries: ManifestRecord[];
};

function sanitizeManifest(raw: unknown): ManifestFile {
  const record = asRecord(raw);
  const entries = Array.isArray(record.entries) ? record.entries : [];
  const sanitized: ManifestRecord[] = [];
  for (const item of entries) {
    const entry = asRecord(item);
    const serverId = nonEmptyString(entry.serverId);
    const reason = nonEmptyString(entry.reason);
    const removedAt = nonEmptyString(entry.removedAt);
    if (!serverId || !reason || !removedAt) {
      continue;
    }
    sanitized.push({
      serverId,
      reason,
      removedAt,
      originalValue: entry.originalValue ?? null,
    });
  }
  return { entries: sanitized };
}

async function readManifest(manifestPath: string): Promise<ManifestFile> {
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    return sanitizeManifest(JSON.parse(raw));
  } catch {
    return { entries: [] };
  }
}

function mergeManifest(existing: ManifestFile, additions: ManifestRecord[]): ManifestFile {
  const byServerId = new Map<string, ManifestRecord>();
  for (const entry of existing.entries) {
    byServerId.set(entry.serverId, entry);
  }
  for (const addition of additions) {
    byServerId.set(addition.serverId, addition);
  }
  return { entries: [...byServerId.values()] };
}

async function writeAtomic(targetPath: string, contents: string): Promise<void> {
  const tempPath = `${targetPath}.quarantine-tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, contents, "utf8");
  await fs.rename(tempPath, targetPath);
}

export async function readQuarantinedPluginMcpEntries(
  profileCodexHome: string,
  extraSourcePaths: readonly string[] = [],
): Promise<DesktopExtensionPluginMcpIssue[]> {
  const issues: DesktopExtensionPluginMcpIssue[] = [];
  const clones = await listPluginCloneMcpFiles(profileCodexHome, extraSourcePaths);
  for (const clone of clones) {
    const manifestPath = path.join(clone.sourcePath, MANIFEST_FILENAME);
    const manifest = await readManifest(manifestPath);
    for (const entry of manifest.entries) {
      issues.push({
        pluginName: clone.pluginName,
        sourcePath: clone.sourcePath,
        serverId: entry.serverId,
        reason: entry.reason,
      });
    }
  }
  return issues;
}

export async function quarantineInvalidPluginMcpEntries(
  profileCodexHome: string,
  extraSourcePaths: readonly string[] = [],
): Promise<QuarantineSummary> {
  const clones = await listPluginCloneMcpFiles(profileCodexHome, extraSourcePaths);
  const removedEntries: DesktopExtensionPluginMcpIssue[] = [];
  let scannedFiles = 0;
  let rewrittenFiles = 0;

  for (const clone of clones) {
    scannedFiles += 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(clone.mcpJsonPath, "utf8"));
    } catch {
      continue;
    }

    const root = asRecord(parsed);
    const mcpServers = asRecord(root.mcpServers);
    const serverIds = Object.keys(mcpServers);
    if (serverIds.length === 0) {
      continue;
    }

    const surviving: Record<string, unknown> = {};
    const removals: ManifestRecord[] = [];
    const nowIso = new Date().toISOString();

    for (const serverId of serverIds) {
      const value = mcpServers[serverId];
      const classification = classifyPluginMcpEntry(value);
      if (classification.ok) {
        surviving[serverId] = value;
        continue;
      }
      removals.push({
        serverId,
        reason: classification.reason,
        removedAt: nowIso,
        originalValue: value ?? null,
      });
      removedEntries.push({
        pluginName: clone.pluginName,
        sourcePath: clone.sourcePath,
        serverId,
        reason: classification.reason,
      });
    }

    if (removals.length === 0) {
      continue;
    }

    const nextFile = {
      ...root,
      mcpServers: surviving,
    };
    await writeAtomic(clone.mcpJsonPath, `${JSON.stringify(nextFile, null, 2)}\n`);

    const manifestPath = path.join(clone.sourcePath, MANIFEST_FILENAME);
    const existingManifest = await readManifest(manifestPath);
    const mergedManifest = mergeManifest(existingManifest, removals);
    await writeAtomic(manifestPath, `${JSON.stringify(mergedManifest, null, 2)}\n`);
    rewrittenFiles += 1;
  }

  return { scannedFiles, rewrittenFiles, removedEntries };
}
