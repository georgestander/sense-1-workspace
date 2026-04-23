import { buildPlanState } from "./plan-state.ts";
import {
  maybeInteractionStateChanged,
} from "./thread-interaction-state.js";
import {
  mapItemToEntry,
  resolveCompletedEntry,
  resolveReviewSummaryText,
} from "./thread-entry-mapper.js";
import {
  reviewArtifactsFromFileChangeItem,
} from "./thread-diff-utils.js";
import {
  buildStructuredReviewSummary,
  dedupeReviewArtifacts,
} from "../review-summary.ts";

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

const APPROVAL_METHOD_KINDS = {
  "item/commandExecution/requestApproval": "command",
  "item/fileChange/requestApproval": "file",
  "item/permissions/requestApproval": "permissions",
};

export function applyEntryNotification({
  buffers,
  message,
  method,
  params,
  pendingApprovalThreadIdsByRequestId,
  resolveApprovalBuffer,
  threadId,
}) {
  if (method in APPROVAL_METHOD_KINDS) {
    if (!threadId || typeof message?.id !== "number") {
      return [];
    }

    const buffer = buffers.get(threadId);
    if (!buffer) {
      return [];
    }

    const approval = {
      id: message.id,
      kind: APPROVAL_METHOD_KINDS[method],
    };
    buffer.pendingApprovalsById.set(message.id, approval);
    pendingApprovalThreadIdsByRequestId.set(message.id, threadId);
    const interactionDelta = maybeInteractionStateChanged(buffer, threadId);

    return interactionDelta ? [interactionDelta] : [];
  }

  if (method === "serverRequest/resolved") {
    const requestId = typeof params?.requestId === "number" ? params.requestId : null;
    if (requestId === null) {
      return [];
    }

    const resolved = resolveApprovalBuffer(requestId);
    if (!resolved?.buffer) {
      return [];
    }

    resolved.buffer.pendingApprovalsById.delete(requestId);
    pendingApprovalThreadIdsByRequestId.delete(requestId);
    const interactionDelta = maybeInteractionStateChanged(resolved.buffer, resolved.threadId);
    return interactionDelta ? [interactionDelta] : [];
  }

  if (method === "item/agentMessage/delta") {
    if (!threadId) {
      return [];
    }

    const buffer = buffers.get(threadId);
    if (!buffer) {
      return [];
    }

    const itemId = firstString(params?.itemId);
    const delta = typeof params?.delta === "string" ? params.delta : null;
    if (!itemId || delta === null) {
      return [];
    }

    if (buffer.activeStreamingItemId !== itemId) {
      buffer.activeStreamingItemId = itemId;
      buffer.activeStreamingText = "";
    }

    buffer.activeStreamingText += delta;
    buffer.updatedAt = new Date().toISOString();

    const existingEntry = buffer.entriesById.get(itemId);
    const updatedEntry = {
      ...(existingEntry || { id: itemId, kind: "assistant", title: "Sense-1 activity", startedAt: buffer.updatedAt }),
      body: buffer.activeStreamingText,
      status: "streaming",
    };
    buffer.entriesById.set(itemId, updatedEntry);
    if (!buffer.entryOrder.includes(itemId)) {
      buffer.entryOrder.push(itemId);
    }

    const interactionDelta = maybeInteractionStateChanged(buffer, threadId);

    return [
      {
        kind: "entryDelta",
        threadId,
        entryId: itemId,
        field: "body",
        append: delta,
      },
      ...(interactionDelta ? [interactionDelta] : []),
    ];
  }

  if (method === "item/started") {
    if (!threadId) {
      return [];
    }

    const buffer = buffers.get(threadId);
    if (!buffer) {
      return [];
    }

    const item = asRecord(params?.item);
    if (!item) {
      return [];
    }

    const startedAt = new Date().toISOString();
    let entry = mapItemToEntry(item);
    if (!entry) {
      return [];
    }

    entry = {
      ...entry,
      startedAt,
    };

    if (item.type === "agentMessage") {
      entry = {
        ...entry,
        status: "streaming",
      };
    }

    buffer.entriesById.set(entry.id, entry);
    if (!buffer.entryOrder.includes(entry.id)) {
      buffer.entryOrder.push(entry.id);
    }
    buffer.updatedAt = new Date().toISOString();

    if (item.type === "agentMessage") {
      buffer.activeStreamingItemId = entry.id;
      buffer.activeStreamingText = entry.body || "";
    }

    if (item.type === "plan") {
      buffer.planState = buildPlanState(item, {
        workspaceRoot: firstString(buffer.workspaceRoot, buffer.cwd),
      });
      buffer.planStateVisible = hasMeaningfulPlanState(buffer.planState);
    }

    if (buffer.inputRequestState && item.type !== "userMessage") {
      buffer.inputRequestState = null;
    }

    const interactionDelta = maybeInteractionStateChanged(buffer, threadId);

    return [
      {
        kind: "entryStarted",
        threadId,
        entry,
      },
      ...(interactionDelta ? [interactionDelta] : []),
    ];
  }

  if (method === "item/completed") {
    if (!threadId) {
      return [];
    }

    const buffer = buffers.get(threadId);
    if (!buffer) {
      return [];
    }

    const item = asRecord(params?.item);
    if (!item) {
      return [];
    }

    const completedAt = new Date().toISOString();
    let entry = resolveCompletedEntry(item, buffer);
    if (!entry) {
      return [];
    }

    const existingEntry = buffer.entriesById.get(entry.id);
    entry = {
      ...entry,
      startedAt: firstString(existingEntry?.startedAt) || completedAt,
      completedAt,
    };

    buffer.entriesById.set(entry.id, entry);
    if (!buffer.entryOrder.includes(entry.id)) {
      buffer.entryOrder.push(entry.id);
    }
    buffer.updatedAt = new Date().toISOString();
    if (item.type === "fileChange") {
      buffer.reviewArtifacts = dedupeReviewArtifacts([
        ...buffer.reviewArtifacts,
        ...reviewArtifactsFromFileChangeItem(item, buffer.updatedAt),
      ]);
    }
    if (item.type === "plan") {
      buffer.planState = buildPlanState(item, {
        workspaceRoot: firstString(buffer.workspaceRoot, buffer.cwd),
      });
      buffer.planStateVisible = hasMeaningfulPlanState(buffer.planState);
    }
    if (item.type === "exitedReviewMode") {
      buffer.reviewSummary = buildStructuredReviewSummary({
        changedArtifacts: [...buffer.reviewArtifacts],
        summary: resolveReviewSummaryText(item),
        updatedAt: buffer.updatedAt,
      });
    }

    if (buffer.activeStreamingItemId === entry.id) {
      buffer.activeStreamingItemId = null;
      buffer.activeStreamingText = "";
    }

    if (buffer.inputRequestState && item.type !== "userMessage") {
      buffer.inputRequestState = null;
    }

    const interactionDelta = maybeInteractionStateChanged(buffer, threadId);

    const deltas = [
      {
        kind: "entryCompleted",
        threadId,
        entryId: entry.id,
        entry,
      },
      ...(interactionDelta ? [interactionDelta] : []),
    ];
    if (item.type === "exitedReviewMode") {
      deltas.push({
        kind: "reviewSummaryUpdated",
        threadId,
        reviewSummary: buffer.reviewSummary,
      });
    }
    return deltas;
  }

  if (method === "turn/started") {
    if (!threadId) {
      return [];
    }

    const buffer = buffers.get(threadId);
    if (!buffer) {
      return [];
    }

    buffer.state = "running";
    buffer.updatedAt = new Date().toISOString();
    buffer.inputRequestState = null;
    const turnId = firstString(params?.turn?.id, params?.turnId);
    const interactionDelta = maybeInteractionStateChanged(buffer, threadId);

    return [
      {
        kind: "threadStateChanged",
        threadId,
        state: "running",
        updatedAt: buffer.updatedAt,
        turnId,
      },
      ...(interactionDelta ? [interactionDelta] : []),
    ];
  }

  if (method === "turn/completed") {
    if (!threadId) {
      return [];
    }

    const buffer = buffers.get(threadId);
    if (!buffer) {
      return [];
    }

    buffer.state = "idle";
    buffer.activeStreamingItemId = null;
    buffer.activeStreamingText = "";
    buffer.updatedAt = new Date().toISOString();
    buffer.inputRequestState = null;
    const interactionDelta = maybeInteractionStateChanged(buffer, threadId);

    return [
      {
        kind: "threadStateChanged",
        threadId,
        state: "idle",
        updatedAt: buffer.updatedAt,
      },
      ...(interactionDelta ? [interactionDelta] : []),
    ];
  }

  return null;
}

function hasMeaningfulPlanState(planState) {
  if (!planState) {
    return false;
  }

  if (typeof planState.text === "string" && planState.text.trim()) {
    return true;
  }

  if (Array.isArray(planState.steps) && planState.steps.length > 0) {
    return true;
  }

  if (typeof planState.explanation === "string" && planState.explanation.trim()) {
    return true;
  }

  return false;
}
