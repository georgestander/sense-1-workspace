import fs from "node:fs/promises";
import path from "node:path";

import { resolveSessionArtifactRoot } from "../profile/profile-state.js";

const SESSION_RECORD_SCHEMA_VERSION = 1 as const;
const SESSION_RECORD_FILE = "session.json";
const SESSION_SUMMARY_FILE = "summary.md";

interface SessionLogCursor {
  from_ts: string | null;
  to_ts: string | null;
}

export interface SessionRecord {
  schema_version: typeof SESSION_RECORD_SCHEMA_VERSION;
  id: string | null;
  started_at: string;
  ended_at: string | null;
  intent: string | null;
  workspace_root: string | null;
  paths_read: string[];
  paths_written: string[];
  outcomes: string[];
  log_cursor: SessionLogCursor;
}

interface SessionRecordPaths {
  sessionRoot: string;
  sessionRecordPath: string;
  summaryPath: string;
}

interface SessionRecordInput {
  id?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  intent?: string | null;
  workspace_root?: string | null;
  paths_read?: unknown;
  paths_written?: unknown;
  outcomes?: unknown;
  log_cursor?: Partial<SessionLogCursor> | null;
}

interface WriteSessionRecordOptions {
  artifactRoot: string;
  endedAt?: string | null;
  intent?: string | null;
  logCursor?: Partial<SessionLogCursor> | null;
  outcomes?: string[] | null;
  pathsRead?: string[] | null;
  pathsWritten?: string[] | null;
  sessionId: string;
  startedAt?: string | null;
  workspaceRoot?: string | null;
}

interface ReadSessionRecordOptions {
  artifactRoot: string;
  sessionId: string;
}

interface ReadSessionSummaryOptions {
  artifactRoot: string;
  sessionId: string;
}

interface UpdateSessionRecordPathsWrittenOptions {
  artifactRoot: string;
  path: string;
  sessionId: string;
  ts?: string | null;
}

interface FinalizeSessionSummaryOptions {
  artifactRoot: string;
  endedAt?: string | null;
  followUps?: string[] | null;
  outcomes?: string[] | null;
  sessionId: string;
}

interface SessionRecordWriteResult extends SessionRecordPaths {
  record: SessionRecord;
}

interface SessionSummaryResult extends SessionRecordWriteResult {
  summary: string;
}

function firstString(...values: Array<unknown>): string | null {
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

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map((value) => firstString(value)).filter((value): value is string => Boolean(value)))];
}

function normalizeLogCursor(logCursor: unknown, startedAt: string): SessionLogCursor {
  const record =
    logCursor && typeof logCursor === "object"
      ? (logCursor as Partial<SessionLogCursor>)
      : null;

  return {
    from_ts: firstString(record?.from_ts, startedAt),
    to_ts: firstString(record?.to_ts),
  };
}

function buildSessionRecord(record: SessionRecordInput | null | undefined): SessionRecord {
  const startedAt = firstString(record?.started_at) || new Date().toISOString();
  return {
    schema_version: SESSION_RECORD_SCHEMA_VERSION,
    id: firstString(record?.id),
    started_at: startedAt,
    ended_at: firstString(record?.ended_at),
    intent: firstString(record?.intent),
    workspace_root: firstString(record?.workspace_root),
    paths_read: normalizeStringArray(record?.paths_read),
    paths_written: normalizeStringArray(record?.paths_written),
    outcomes: normalizeStringArray(record?.outcomes),
    log_cursor: normalizeLogCursor(record?.log_cursor, startedAt),
  };
}

function resolveSessionRecordPaths(artifactRoot: string, sessionId: string): SessionRecordPaths {
  const sessionRoot = resolveSessionArtifactRoot(artifactRoot, sessionId);
  return {
    sessionRoot,
    sessionRecordPath: path.join(sessionRoot, SESSION_RECORD_FILE),
    summaryPath: path.join(sessionRoot, SESSION_SUMMARY_FILE),
  };
}

async function ensureSessionRecordDirectory(
  artifactRoot: string,
  sessionId: string,
): Promise<SessionRecordPaths> {
  const paths = resolveSessionRecordPaths(artifactRoot, sessionId);
  await fs.mkdir(paths.sessionRoot, { recursive: true });
  return paths;
}

export async function readSessionRecord({
  artifactRoot,
  sessionId,
}: ReadSessionRecordOptions): Promise<SessionRecord | null> {
  const { sessionRecordPath } = resolveSessionRecordPaths(artifactRoot, sessionId);

  try {
    const raw = await fs.readFile(sessionRecordPath, "utf8");
    const parsed = JSON.parse(raw) as SessionRecordInput;
    return buildSessionRecord(parsed);
  } catch {
    return null;
  }
}

export async function readSessionSummary({
  artifactRoot,
  sessionId,
}: ReadSessionSummaryOptions): Promise<string | null> {
  const { summaryPath } = resolveSessionRecordPaths(artifactRoot, sessionId);

  try {
    const raw = await fs.readFile(summaryPath, "utf8");
    const trimmed = raw.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

export async function writeSessionRecord({
  artifactRoot,
  endedAt = null,
  intent = null,
  logCursor = null,
  outcomes = null,
  pathsRead = null,
  pathsWritten = null,
  sessionId,
  startedAt = null,
  workspaceRoot = null,
}: WriteSessionRecordOptions): Promise<SessionRecordWriteResult> {
  const paths = await ensureSessionRecordDirectory(artifactRoot, sessionId);
  const existing = await readSessionRecord({ artifactRoot, sessionId });
  const nextRecord = buildSessionRecord({
    ...existing,
    ended_at: firstString(endedAt, existing?.ended_at),
    id: firstString(sessionId, existing?.id),
    intent: firstString(intent, existing?.intent),
    log_cursor: {
      ...existing?.log_cursor,
      ...(logCursor ?? {}),
    },
    outcomes: outcomes ?? existing?.outcomes ?? [],
    paths_read: pathsRead ?? existing?.paths_read ?? [],
    paths_written: pathsWritten ?? existing?.paths_written ?? [],
    started_at: firstString(startedAt, existing?.started_at),
    workspace_root: firstString(workspaceRoot, existing?.workspace_root),
  });

  await fs.writeFile(paths.sessionRecordPath, `${JSON.stringify(nextRecord, null, 2)}\n`, "utf8");
  return {
    ...paths,
    record: nextRecord,
  };
}

export async function updateSessionRecordPathsWritten({
  artifactRoot,
  path: writtenPath,
  sessionId,
  ts = null,
}: UpdateSessionRecordPathsWrittenOptions): Promise<SessionRecordWriteResult | null> {
  const existing = await readSessionRecord({ artifactRoot, sessionId });
  if (!existing) {
    return null;
  }

  const nextPathsWritten = normalizeStringArray([
    ...existing.paths_written,
    writtenPath,
  ]);

  return await writeSessionRecord({
    artifactRoot,
    logCursor: {
      from_ts: existing.log_cursor?.from_ts ?? existing.started_at,
      to_ts: firstString(ts, existing.log_cursor?.to_ts),
    },
    pathsWritten: nextPathsWritten,
    sessionId,
  });
}

export async function finalizeSessionSummary({
  artifactRoot,
  endedAt = null,
  followUps = [],
  outcomes = null,
  sessionId,
}: FinalizeSessionSummaryOptions): Promise<SessionSummaryResult | null> {
  const existing = await readSessionRecord({ artifactRoot, sessionId });
  if (!existing) {
    return null;
  }

  const resolvedOutcomes = normalizeStringArray(
    outcomes ?? (existing.outcomes.length > 0 ? existing.outcomes : existing.paths_written),
  );
  const nextRecordResult = await writeSessionRecord({
    artifactRoot,
    endedAt: firstString(endedAt) || new Date().toISOString(),
    outcomes: resolvedOutcomes,
    sessionId,
  });
  const resolvedRecord = nextRecordResult.record;
  const outcomeLines = resolvedOutcomes.length > 0
    ? resolvedOutcomes.map((outcome) => `- ${outcome}`)
    : ["No files modified"];
  const followUpLines = normalizeStringArray(followUps).map((item) => `- ${item}`);
  const summary = [
    "## Intent",
    resolvedRecord.intent ?? "No intent recorded",
    "",
    "## Outcomes",
    ...outcomeLines,
    "",
    "## Follow-ups",
    ...(followUpLines.length > 0 ? followUpLines : ["None"]),
    "",
  ].join("\n");

  await fs.writeFile(nextRecordResult.summaryPath, summary, "utf8");
  return {
    ...nextRecordResult,
    summary: summary.trimEnd(),
  };
}
