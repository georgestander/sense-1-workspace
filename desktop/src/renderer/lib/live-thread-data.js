import { resolveInputItemPromptShortcutMatches } from "../../shared/prompt-shortcuts.ts";

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

function coerceText(value, fallback = "") {
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

export function formatUpdatedLabel(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    return "recently";
  }

  const date = new Date(raw);
  if (Number.isNaN(date.valueOf())) {
    return raw;
  }

  const now = Date.now();
  const diffMs = now - date.valueOf();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return "just now";
  }

  if (diffMs < hour) {
    const value = Math.max(1, Math.round(diffMs / minute));
    return `${value} min ago`;
  }

  if (diffMs < day) {
    const value = Math.max(1, Math.round(diffMs / hour));
    return `${value} hr ago`;
  }

  const value = Math.max(1, Math.round(diffMs / day));
  if (value <= 7) {
    return `${value} day${value === 1 ? "" : "s"} ago`;
  }

  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  });
}

export function normalizeDesktopSummary(summary, workspaceRoot = null, cwd = null) {
  return {
    id: summary.id,
    title: summary.title,
    subtitle: summary.subtitle,
    state: summary.state,
    interactionState: firstString(summary.interactionState) ?? "conversation",
    updatedAt: summary.updatedAt,
    updatedLabel: formatUpdatedLabel(summary.updatedAt),
    workspaceRoot,
    cwd: firstString(summary?.cwd, cwd),
    threadInputState: summary?.threadInputState ?? null,
  };
}

export function normalizeLiveThread(thread, workspaceRoot = null, cwd = null) {
  const updatedAtRaw =
    typeof thread?.updatedAt === "number"
      ? thread.updatedAt
      : typeof thread?.createdAt === "number"
        ? thread.createdAt
        : Math.floor(Date.now() / 1000);

  return normalizeDesktopSummary(
    {
      id: firstString(thread?.id) ?? "",
      title: firstString(thread?.name, thread?.preview) ?? "Untitled thread",
      subtitle: firstString(thread?.preview) ?? "Sense-1 thread",
      state:
        thread?.status?.type === "active"
          ? firstString(...(Array.isArray(thread.status?.activeFlags) ? thread.status.activeFlags : [])) || "active"
          : firstString(thread?.status?.type) || "idle",
      updatedAt: new Date(updatedAtRaw * 1000).toISOString(),
      cwd: firstString(thread?.cwd, cwd),
    },
    workspaceRoot,
    firstString(thread?.cwd, cwd),
  );
}

export function flattenThreadItems(thread) {
  return (Array.isArray(thread?.turns) ? thread.turns : []).flatMap((turn) =>
    Array.isArray(turn?.items) ? turn.items : [],
  );
}

function fileNameFromPath(value) {
  return value.split("/").filter(Boolean).at(-1) ?? "";
}

function mapUserMessageContent(content) {
  const normalizedContent = Array.isArray(content) ? content : [];
  const shortcutMatches = resolveInputItemPromptShortcutMatches(normalizedContent);
  const shortcutItems = new Set(shortcutMatches.map((match) => match.item));
  const shortcuts = shortcutMatches.map((match) => ({
    kind: match.kind,
    label: match.label,
    token: match.token,
  }));
  const text = normalizedContent
    .filter((entry) => entry?.type === "text" && typeof entry.text === "string")
    .map((entry) => entry.text)
    .join("\n")
    .trim();

  const attachmentCount = normalizedContent.filter(
    (entry) => entry?.type === "localImage" || (entry?.type === "mention" && !shortcutItems.has(entry)),
  ).length;

  if (!text && attachmentCount === 0 && shortcuts.length === 0) {
    return null;
  }

  return {
    promptShortcuts: shortcuts,
    body:
      text ||
      (shortcuts.length > 0 && attachmentCount === 0
        ? shortcuts.length === 1
          ? "Used 1 shortcut."
          : `Used ${shortcuts.length} shortcuts.`
        : attachmentCount === 1
          ? "Attached 1 file."
          : `Attached ${attachmentCount} files.`),
  };
}

export function mapItemToThreadEntry(item) {
  if (item.type === "userMessage") {
    const content = mapUserMessageContent(item.content);
    if (!content) {
      return null;
    }

    return {
      id: item.id,
      kind: "user",
      title: "You",
      body: content.body,
      ...(content.promptShortcuts.length > 0 ? { promptShortcuts: content.promptShortcuts } : {}),
    };
  }

  if (item.type === "agentMessage") {
    return {
      id: item.id,
      kind: "assistant",
      title: item.phase === "final_answer" ? "Sense-1" : "Sense-1 activity",
      body: coerceText(item.text, ""),
      status: item.phase === "final_answer" ? "complete" : "streaming",
    };
  }

  if (item.type === "reasoning") {
    const summary =
      (Array.isArray(item.summary) ? item.summary : [])
        .map((entry) => entry?.text)
        .filter(Boolean)
        .join(" ") || "Reasoning updated";
    const detail =
      (Array.isArray(item.content) ? item.content : [])
        .map((entry) => entry?.text)
        .filter(Boolean)
        .join("\n") || summary;

    return {
      id: item.id,
      kind: "reasoning",
      title: "Thinking",
      summary,
      body: detail,
    };
  }

  if (item.type === "plan") {
    return {
      id: item.id,
      kind: "plan",
      title: "Plan",
      body: coerceText(item.text, "Plan updated"),
      steps: coerceText(item.text, "")
        .split("\n")
        .map((line) => line.replace(/^\s*[-*\d.]+\s*/, "").trim())
        .filter(Boolean),
    };
  }

  if (item.type === "commandExecution") {
    const command =
      Array.isArray(item.command) ? item.command.join(" ") : item.command || "Command pending";

    return {
      id: item.id,
      kind: "command",
      title: "Command execution",
      body: coerceText(item.aggregatedOutput, ""),
      command: coerceText(command, "Command pending"),
      cwd: item.cwd || null,
      status: item.status || "running",
      exitCode: Number.isFinite(item.exitCode) ? item.exitCode : null,
      durationMs: Number.isFinite(item.durationMs) ? item.durationMs : null,
    };
  }

  if (item.type === "fileChange") {
    return {
      id: item.id,
      kind: "fileChange",
      title: "File changes",
      status: item.status || "complete",
      changes: Array.isArray(item.changes) ? item.changes : [],
    };
  }

  if (
    item.type === "mcpToolCall" ||
    item.type === "dynamicToolCall" ||
    item.type === "collabToolCall" ||
    item.type === "webSearch" ||
    item.type === "imageView"
  ) {
    return {
      id: item.id,
      kind: "tool",
      title: "Tool call",
      body: [coerceText(item.tool), coerceText(item.query), coerceText(item.path)].filter(Boolean).join(" • ") || "Sense-1 used a connected tool.",
      status: item.status || "running",
    };
  }

  if (item.type === "enteredReviewMode") {
    return {
      id: item.id,
      kind: "review",
      title: "Review started",
      body: "Sense-1 entered review mode for this thread.",
    };
  }

  if (item.type === "exitedReviewMode") {
    return {
      id: item.id,
      kind: "review",
      title: "Review completed",
      body: coerceText(item.review?.text, "Review finished."),
    };
  }

  if (item.type === "contextCompaction") {
    return {
      id: item.id,
      kind: "activity",
      title: "Context refreshed",
      body: "The thread context was compacted to keep the run focused.",
    };
  }

  return null;
}

export function buildThreadEntries(items) {
  return items
    .map((item) => mapItemToThreadEntry(item))
    .filter(Boolean);
}

export function buildChangeGroups(entries, diffs = []) {
  const entryGroups = entries
    .filter((entry) => entry.kind === "fileChange")
    .map((entry) => {
      const files = (Array.isArray(entry.changes) ? entry.changes : [])
        .map((change) => firstString(change.path))
        .filter(Boolean);
      const leadFile = files[0];
      const title =
        leadFile && files.length === 1
          ? fileNameFromPath(leadFile)
          : leadFile
            ? `${fileNameFromPath(leadFile)} and ${files.length - 1} more`
            : "File changes";

      return {
        id: entry.id,
        title,
        status: entry.status || "complete",
        files,
      };
    });

  // Include file changes from turn/diff/updated that aren't already in entries
  const entryFileSet = new Set(entryGroups.flatMap((g) => g.files));
  const diffFiles = (Array.isArray(diffs) ? diffs : [])
    .map((diff) => {
      const record = diff && typeof diff === "object" ? diff : null;
      return typeof record?.path === "string" ? record.path : null;
    })
    .filter(Boolean)
    .filter((path) => !entryFileSet.has(path));

  if (diffFiles.length > 0) {
    const leadFile = diffFiles[0];
    const title =
      leadFile && diffFiles.length === 1
        ? fileNameFromPath(leadFile)
        : leadFile
          ? `${fileNameFromPath(leadFile)} and ${diffFiles.length - 1} more`
          : "File changes";
    entryGroups.push({
      id: `diff-group-${Date.now()}`,
      title,
      status: "complete",
      files: diffFiles,
    });
  }

  return entryGroups;
}

export function buildProgressSummary(entries, threadState, diffs = []) {
  const commandCount = entries.filter((entry) => entry.kind === "command").length;
  const entryFileChangeCount = entries.filter((entry) => entry.kind === "fileChange").length;
  const diffFileCount = (Array.isArray(diffs) ? diffs : []).length;
  const toolCount = entries.filter((entry) => entry.kind === "tool").length;
  const assistantTurnCount = entries.filter((entry) => entry.kind === "assistant").length;

  const summary = [
    threadState === "active" || threadState === "running"
      ? "Sense-1 is actively working in this thread."
      : "Thread is idle and ready for the next step.",
  ];

  if (commandCount > 0) {
    summary.push(`${commandCount} command${commandCount === 1 ? "" : "s"} captured.`);
  }

  if (diffFileCount > 0) {
    summary.push(`${diffFileCount} file${diffFileCount === 1 ? "" : "s"} changed.`);
  } else if (entryFileChangeCount > 0) {
    summary.push(`${entryFileChangeCount} file change${entryFileChangeCount === 1 ? "" : "s"} recorded.`);
  }

  if (toolCount > 0) {
    summary.push(`${toolCount} tool call${toolCount === 1 ? "" : "s"} captured.`);
  }

  if (assistantTurnCount > 0) {
    summary.push(`${assistantTurnCount} assistant response${assistantTurnCount === 1 ? "" : "s"} in this thread.`);
  }

  return summary;
}
