import path from "node:path";

import { listRecentSessions } from "../substrate/substrate-reader.js";
import { readSessionRecord, readSessionSummary } from "./session-record.ts";

type ContinuitySession = {
  id: string;
  codex_thread_id: string | null;
  title: string | null;
  summary: string | null;
  started_at: string;
  metadata: Record<string, unknown>;
};

interface BuildRuntimeContinuityInstructionOptions {
  artifactRoot: string;
  currentSessionId?: string | null;
  dbPath: string;
  profileId: string;
  workspaceRoot?: string | null;
}

interface SessionContinuityDetails {
  displayTitle: string | null;
  summary: string | null;
  timestamp: string | null;
  writtenPaths: string[];
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

function normalizeWorkspaceRoot(rootPath: string | null | undefined): string | null {
  const resolvedRootPath = firstString(rootPath);
  if (!resolvedRootPath) {
    return null;
  }

  return path.resolve(resolvedRootPath);
}

function formatTimestamp(value: string | null): string | null {
  const resolvedValue = firstString(value);
  if (!resolvedValue) {
    return null;
  }

  const parsed = Date.parse(resolvedValue);
  if (Number.isNaN(parsed)) {
    return resolvedValue;
  }

  return new Date(parsed).toISOString().slice(0, 10);
}

function collapseWhitespace(value: string | null | undefined): string | null {
  const resolvedValue = firstString(value);
  if (!resolvedValue) {
    return null;
  }

  return resolvedValue.replace(/\s+/g, " ").trim() || null;
}

function truncateText(value: string | null, maxLength = 180): string | null {
  const resolvedValue = collapseWhitespace(value);
  if (!resolvedValue) {
    return null;
  }

  if (resolvedValue.length <= maxLength) {
    return resolvedValue;
  }

  return `${resolvedValue.slice(0, maxLength - 1).trimEnd()}…`;
}

function extractMarkdownOutcomes(summary: string | null): string[] {
  const resolvedSummary = firstString(summary);
  if (!resolvedSummary) {
    return [];
  }

  const match = resolvedSummary.match(/## Outcomes\s+([\s\S]*?)(?:\n## |\s*$)/i);
  if (!match?.[1]) {
    return [];
  }

  return match[1]
    .split("\n")
    .map((line) => line.replace(/^\s*-\s*/, "").trim())
    .filter(Boolean);
}

function summarizeWrittenPaths(paths: string[], workspaceRoot: string | null): string[] {
  const resolvedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
  return paths
    .slice(0, 3)
    .map((entry) => {
      const resolvedEntry = firstString(entry);
      if (!resolvedEntry) {
        return null;
      }
      if (!resolvedWorkspaceRoot) {
        return path.basename(resolvedEntry);
      }

      const relativePath = path.relative(resolvedWorkspaceRoot, path.resolve(resolvedEntry)).replace(/\\/g, "/");
      if (!relativePath || relativePath.startsWith("..")) {
        return path.basename(resolvedEntry);
      }

      return relativePath;
    })
    .filter((entry): entry is string => Boolean(entry));
}

function sessionMatchesWorkspace(session: ContinuitySession, workspaceRoot: string | null): boolean {
  const resolvedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
  if (!resolvedWorkspaceRoot) {
    return false;
  }

  const metadataWorkspaceRoot = normalizeWorkspaceRoot(firstString(session.metadata?.workspaceRoot));
  return metadataWorkspaceRoot === resolvedWorkspaceRoot;
}

async function buildSessionContinuityDetails({
  artifactRoot,
  session,
  workspaceRoot = null,
}: {
  artifactRoot: string;
  session: ContinuitySession;
  workspaceRoot?: string | null;
}): Promise<SessionContinuityDetails> {
  const sessionRecord = await readSessionRecord({
    artifactRoot,
    sessionId: session.id,
  });
  const summaryMarkdown = await readSessionSummary({
    artifactRoot,
    sessionId: session.id,
  });
  const outcomesFromRecord = Array.isArray(sessionRecord?.outcomes)
    ? sessionRecord.outcomes.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const outcomesFromSummary = extractMarkdownOutcomes(summaryMarkdown);
  const summary = truncateText(
    outcomesFromRecord.slice(0, 2).join("; ")
    || outcomesFromSummary.slice(0, 2).join("; ")
    || firstString(session.summary, summaryMarkdown, sessionRecord?.intent),
  );

  return {
    displayTitle: truncateText(firstString(session.title, sessionRecord?.intent), 80),
    summary,
    timestamp: formatTimestamp(firstString(session.started_at, sessionRecord?.started_at)),
    writtenPaths: summarizeWrittenPaths(sessionRecord?.paths_written ?? [], workspaceRoot),
  };
}

function formatContinuityLine(details: SessionContinuityDetails): string | null {
  const parts = [
    firstString(details.timestamp),
    firstString(details.displayTitle),
    firstString(details.summary),
    details.writtenPaths.length > 0 ? `Files: ${details.writtenPaths.join(", ")}` : null,
  ].filter((value): value is string => Boolean(value));

  if (parts.length === 0) {
    return null;
  }

  return `- ${parts.join(" · ")}`;
}

async function buildThreadContinuitySection({
  artifactRoot,
  sessionId,
}: {
  artifactRoot: string;
  sessionId: string | null | undefined;
}): Promise<string | null> {
  const resolvedSessionId = firstString(sessionId);
  if (!resolvedSessionId) {
    return null;
  }

  const details = await buildSessionContinuityDetails({
    artifactRoot,
    session: {
      id: resolvedSessionId,
      codex_thread_id: null,
      title: null,
      summary: null,
      started_at: "",
      metadata: {},
    },
  });
  const line = formatContinuityLine(details);
  if (!line) {
    return null;
  }

  return [
    "Thread continuity is available from the durable session record for this thread.",
    line,
  ].join("\n");
}

async function buildWorkspaceContinuitySection({
  artifactRoot,
  dbPath,
  profileId,
  workspaceRoot,
  currentSessionId = null,
}: {
  artifactRoot: string;
  currentSessionId?: string | null;
  dbPath: string;
  profileId: string;
  workspaceRoot: string | null | undefined;
}): Promise<string | null> {
  const resolvedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
  if (!resolvedWorkspaceRoot) {
    return null;
  }

  const recentSessions = await listRecentSessions({
    dbPath,
    profileId,
    limit: 50,
  });
  const matchingSessions = recentSessions
    .filter((session) => Boolean(session?.id))
    .filter((session) => session.id !== firstString(currentSessionId))
    .filter((session) => sessionMatchesWorkspace(session, resolvedWorkspaceRoot))
    .slice(0, 3);

  if (matchingSessions.length === 0) {
    return null;
  }

  const lines = await Promise.all(
    matchingSessions.map(async (session) => formatContinuityLine(
      await buildSessionContinuityDetails({
        artifactRoot,
        session,
        workspaceRoot: resolvedWorkspaceRoot,
      }),
    )),
  );
  const visibleLines = lines.filter((line): line is string => Boolean(line));
  if (visibleLines.length === 0) {
    return null;
  }

  return [
    `Workspace continuity is available from ${matchingSessions.length} recent durable session record${matchingSessions.length === 1 ? "" : "s"} for this folder. Use this history when the user asks what has been happening here or starts a new thread in the workspace.`,
    ...visibleLines,
  ].join("\n");
}

export async function buildRuntimeContinuityInstruction({
  artifactRoot,
  currentSessionId = null,
  dbPath,
  profileId,
  workspaceRoot = null,
}: BuildRuntimeContinuityInstructionOptions): Promise<string | null> {
  const sections = (
    await Promise.all([
      buildThreadContinuitySection({
        artifactRoot,
        sessionId: currentSessionId,
      }),
      buildWorkspaceContinuitySection({
        artifactRoot,
        currentSessionId,
        dbPath,
        profileId,
        workspaceRoot,
      }),
    ])
  ).filter((section): section is string => Boolean(section));

  if (sections.length === 0) {
    return null;
  }

  return sections.join("\n\n");
}
