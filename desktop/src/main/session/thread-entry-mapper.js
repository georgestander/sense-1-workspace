import { buildPlanState } from "./plan-state.ts";
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

function asRecord(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value;
}

export function resolveReviewSummaryText(item) {
  const review = asRecord(item?.review);
  return firstString(review?.summary, review?.text, review?.body);
}

export function mapItemToEntry(item) {
  if (!item || typeof item !== "object" || !item.id) {
    return null;
  }

  if (item.type === "userMessage") {
    const content = Array.isArray(item.content) ? item.content : [];
    const promptShortcuts = resolveInputItemPromptShortcutMatches(content).map((match) => ({
      kind: match.kind,
      label: match.label,
      token: match.token,
    }));
    const text = content
      .filter((entry) => entry?.type === "text" && typeof entry.text === "string")
      .map((entry) => entry.text)
      .join("\n")
      .trim();
    const attachmentCount = content.filter(
      (entry) => entry?.type === "localImage",
    ).length;

    if (!text && attachmentCount === 0 && promptShortcuts.length === 0) {
      return null;
    }

    return {
      id: item.id,
      kind: "user",
      title: "You",
      body:
        text ||
        (promptShortcuts.length > 0 && attachmentCount === 0
          ? promptShortcuts.length === 1
            ? "Used 1 shortcut."
            : `Used ${promptShortcuts.length} shortcuts.`
          : attachmentCount === 1
            ? "Attached 1 file."
            : `Attached ${attachmentCount} files.`),
      ...(promptShortcuts.length > 0 ? { promptShortcuts } : {}),
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
    const plan = buildPlanState(item, {
      workspaceRoot: null,
    });
    return {
      id: item.id,
      kind: "plan",
      title: "Plan",
      body: plan.text ?? "Plan updated",
      steps: plan.steps,
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
      body: [coerceText(item.tool), coerceText(item.query), coerceText(item.path)].filter(Boolean).join(" \u2022 ") || "Sense-1 used a connected tool.",
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

export function resolveCompletedEntry(item, buffer) {
  const entry = mapItemToEntry(item);
  if (!entry) {
    return null;
  }

  if (
    item?.type === "agentMessage" &&
    buffer?.activeStreamingItemId === entry.id &&
    (!entry.body || !entry.body.trim()) &&
    typeof buffer.activeStreamingText === "string" &&
    buffer.activeStreamingText.trim()
  ) {
    return {
      ...entry,
      body: buffer.activeStreamingText,
    };
  }

  return entry;
}
