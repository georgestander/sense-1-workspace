import { resolveDesktopInteractionState } from "../session/interaction-state.ts";
import { buildPlanState } from "../session/plan-state.ts";
import {
  resolveUserMessageAttachments,
  stripAttachmentContextNote,
} from "../../shared/thread-attachments.ts";
import {
  buildStructuredReviewSummary,
  dedupeReviewArtifacts,
} from "../review-summary.ts";
import {
  deriveThreadCwd,
  deriveWorkspaceRoot,
  normalizeDesktopSummary,
  normalizeDesktopThreadSummary,
} from "./live-thread-runtime-summary.js";

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

function asRecord(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value;
}

function flattenThreadItems(thread) {
  return (Array.isArray(thread?.turns) ? thread.turns : []).flatMap((turn) =>
    Array.isArray(turn?.items) ? turn.items : [],
  );
}

function fileNameFromPath(value) {
  return value.split("/").filter(Boolean).at(-1) ?? "";
}

function mapUserMessageContent(content) {
  const attachments = resolveUserMessageAttachments(content);
  const text = (Array.isArray(content) ? content : [])
    .filter((entry) => entry?.type === "text" && typeof entry.text === "string")
    .map((entry) => entry.text)
    .join("\n")
    .trim();
  const visibleText = stripAttachmentContextNote(text);
  const attachmentCount = attachments.length;

  if (!visibleText && attachmentCount === 0) {
    return null;
  }

  return {
    attachments,
    body:
      visibleText ||
      (attachmentCount === 1
        ? "Attached 1 file."
        : `Attached ${attachmentCount} files.`),
  };
}

function mapAgentMessageItem(item) {
  const phase = firstString(item.phase);
  return {
    id: item.id,
    kind: "assistant",
    title: phase === "final_answer" ? "Sense-1" : phase === "commentary" ? "Sense-1 progress" : "Sense-1 activity",
    body: item.text || "",
    status: phase === "final_answer" || phase === "commentary" ? "complete" : "streaming",
    ...(phase ? { phase } : {}),
  };
}

function mapItemToThreadEntry(item) {
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
      ...(content.attachments.length > 0 ? { attachments: content.attachments } : {}),
    };
  }

  if (item.type === "agentMessage") {
    return mapAgentMessageItem(item);
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
      body: plan.text || "Plan updated",
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
      body: item.aggregatedOutput || "",
      command,
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
      body: [item.tool, item.query, item.path].filter(Boolean).join(" • ") || "Sense-1 used a connected tool.",
      status: item.status || "completed",
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
      body: item.review?.text || "Review finished.",
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

function buildThreadEntries(items) {
  return items
    .map((item) => mapItemToThreadEntry(item))
    .filter(Boolean);
}

function buildChangeGroups(entries) {
  return entries
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
}

function reviewArtifactsFromObjectRefs(objectRefs) {
  return dedupeReviewArtifacts(
    (Array.isArray(objectRefs) ? objectRefs : []).map((ref) => ({
      action: ref?.action,
      id: ref?.id,
      metadata: ref?.metadata,
      path: ref?.ref_path,
      recordedAt: ref?.ts,
      refId: ref?.ref_id,
      refType: ref?.ref_type,
    })),
  );
}

function reviewArtifactsFromThreadItems(items) {
  return dedupeReviewArtifacts(
    (Array.isArray(items) ? items : []).flatMap((item) => {
      if (item?.type !== "fileChange" || !Array.isArray(item.changes)) {
        return [];
      }

      return item.changes.map((change, index) => ({
        action: firstString(change?.kind) || "modified",
        id: firstString(item.id, change?.path) || `file-change-${index}`,
        metadata: {
          itemId: firstString(item.id),
          source: "thread/read",
          status: firstString(item.status),
        },
        path: firstString(change?.path),
        refId: firstString(item.id),
        refType: "file",
      }));
    }),
  );
}

function resolveReviewText(items, persistedSummary = null) {
  const persisted = firstString(persistedSummary);
  if (persisted) {
    return persisted;
  }

  for (let index = (Array.isArray(items) ? items : []).length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.type !== "exitedReviewMode") {
      continue;
    }

    const review = asRecord(item.review);
    const summary = firstString(review?.summary, review?.text, review?.body);
    if (summary) {
      return summary;
    }
  }

  return null;
}

function buildDesktopThreadReviewSummary({
  objectRefs = [],
  persistedSummary = null,
  persistedUpdatedAt = null,
  thread = null,
} = {}) {
  const items = flattenThreadItems(thread);
  const summary = resolveReviewText(items, persistedSummary);
  const changedArtifacts = reviewArtifactsFromObjectRefs(objectRefs);
  const fallbackArtifacts =
    changedArtifacts.length > 0
      ? changedArtifacts
      : summary
        ? reviewArtifactsFromThreadItems(items)
        : [];
  const updatedAt =
    firstString(persistedUpdatedAt) ||
    fallbackArtifacts.find((artifact) => firstString(artifact.recordedAt))?.recordedAt ||
    null;
  return buildStructuredReviewSummary({
    changedArtifacts: fallbackArtifacts,
    summary,
    updatedAt,
  });
}

function buildProgressSummary(entries, threadState) {
  const commandCount = entries.filter((entry) => entry.kind === "command").length;
  const fileChangeCount = entries.filter((entry) => entry.kind === "fileChange").length;
  const toolCount = entries.filter((entry) => entry.kind === "tool").length;

  return [
    threadState === "active" || threadState === "running"
      ? "Sense-1 is actively working in this thread."
      : "Thread is idle and ready for the next step.",
    commandCount > 0
      ? `${commandCount} command${commandCount === 1 ? "" : "s"} captured in the transcript.`
      : "No commands captured yet.",
    fileChangeCount > 0
      ? `${fileChangeCount} file change group${fileChangeCount === 1 ? "" : "s"} recorded.`
      : "No file changes recorded yet.",
    toolCount > 0
      ? `${toolCount} tool call${toolCount === 1 ? "" : "s"} recorded.`
      : "No tool calls recorded yet.",
  ];
}

export function buildDesktopThreadSnapshot(
  thread,
  workspaceRoot = null,
  interactionState = null,
  reviewContext = null,
) {
  let resolvedInteractionState = interactionState;
  let resolvedReviewContext = reviewContext;
  if (
    !reviewContext &&
    interactionState &&
    typeof interactionState === "object" &&
    !Array.isArray(interactionState)
  ) {
    const maybeReviewContext = interactionState;
    if (
      Object.prototype.hasOwnProperty.call(maybeReviewContext, "summary") ||
      Object.prototype.hasOwnProperty.call(maybeReviewContext, "objectRefs") ||
      Object.prototype.hasOwnProperty.call(maybeReviewContext, "updatedAt")
    ) {
      resolvedInteractionState = null;
      resolvedReviewContext = maybeReviewContext;
    }
  }
  const entries = buildThreadEntries(flattenThreadItems(thread));
  const resolvedWorkspaceRoot = deriveWorkspaceRoot(thread, workspaceRoot);
  const resolvedCwd = deriveThreadCwd(thread, resolvedWorkspaceRoot);
  const threadSummary = normalizeDesktopThreadSummary(thread, resolvedWorkspaceRoot, resolvedInteractionState);
  resolvedInteractionState = resolveDesktopInteractionState({
    entries,
    previousInteractionState: resolvedInteractionState,
    threadState: threadSummary.state,
    workspaceRoot: resolvedWorkspaceRoot,
  });
  const summary = normalizeDesktopSummary(
    {
      ...threadSummary,
      interactionState: resolvedInteractionState,
    },
    resolvedWorkspaceRoot,
    resolvedCwd,
    resolvedInteractionState,
  );
  const reviewSummary = buildDesktopThreadReviewSummary({
    objectRefs: Array.isArray(resolvedReviewContext?.objectRefs) ? resolvedReviewContext.objectRefs : [],
    persistedSummary: firstString(resolvedReviewContext?.summary),
    persistedUpdatedAt: firstString(resolvedReviewContext?.updatedAt),
    thread,
  });

  return {
    ...summary,
    entries,
    changeGroups: buildChangeGroups(entries),
    progressSummary: buildProgressSummary(entries, summary.state),
    reviewSummary,
    hasLoadedDetails: true,
  };
}
