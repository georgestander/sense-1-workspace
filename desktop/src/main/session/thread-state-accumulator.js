/**
 * Thread State Accumulator
 *
 * Maintains incremental thread state in the desktop main process.
 * Consumes streaming delta events from the app-server and produces
 * renderer-ready delta IPC messages.
 *
 * Full `thread/read` is only used for cold-load (thread selection)
 * and reconnect — not as the hot path for live updates.
 */

import {
  buildInteractionState,
  maybeInteractionStateChanged,
} from "./thread-interaction-state.js";
import {
  mapItemToEntry,
} from "./thread-entry-mapper.js";
import {
  mergeDiffEntries,
  resolveDiffEntries,
} from "./thread-diff-utils.js";
import {
  buildInputPrompt,
  normalizeInputQuestions,
} from "./thread-input-request-formatting.js";
import { applyEntryNotification } from "./thread-state-entry-notifications.js";
import { applySidebarNotification } from "./thread-state-sidebar-notifications.js";
import { dedupeReviewArtifacts } from "../review-summary.ts";

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

/**
 * Per-thread state buffer.
 * Tracks entries, accumulated text for the active streaming entry,
 * and thread-level metadata.
 */
class ThreadBuffer {
  constructor(threadId) {
    this.threadId = threadId;
    /** @type {Map<string, object>} id -> entry */
    this.entriesById = new Map();
    /** @type {string[]} ordered entry ids */
    this.entryOrder = [];
    /** @type {string | null} currently streaming agent message item id */
    this.activeStreamingItemId = null;
    /** @type {string} accumulated text for the active streaming item */
    this.activeStreamingText = "";
    /** @type {string | null} */
    this.workspaceRoot = null;
    /** @type {string | null} */
    this.cwd = null;
    /** @type {string} */
    this.state = "idle";
    /** @type {string} */
    this.interactionState = "conversation";
    /** @type {string} */
    this.title = "Untitled thread";
    /** @type {string} */
    this.subtitle = "";
    /** @type {string} */
    this.updatedAt = new Date().toISOString();
    /** @type {object | null} */
    this.planState = null;
    /** @type {boolean} */
    this.planStateVisible = false;
    /** @type {object | null} */
    this.diffState = null;
    /** @type {object | null} */
    this.inputRequestState = null;
    /** @type {object | null} */
    this.threadInputState = null;
    /** @type {Map<number, object>} */
    this.pendingApprovalsById = new Map();
    /** @type {object[]} */
    this.reviewArtifacts = [];
    /** @type {object | null} */
    this.reviewSummary = null;
  }

  /**
   * Load full snapshot into the buffer (cold load).
   * Returns a full-snapshot delta for the renderer.
   */
  loadSnapshot(snapshot) {
    this.entriesById.clear();
    this.entryOrder = [];
    this.activeStreamingItemId = null;
    this.activeStreamingText = "";

    this.state = snapshot?.state || "idle";
    this.interactionState = firstString(snapshot?.interactionState) || this.interactionState;
    this.title = snapshot?.title || "Untitled thread";
    this.subtitle = snapshot?.subtitle || "";
    this.updatedAt = snapshot?.updatedAt || new Date().toISOString();
    this.workspaceRoot = snapshot?.workspaceRoot || null;
    this.cwd = snapshot?.cwd || null;
    this.reviewSummary = snapshot?.reviewSummary ?? null;
    this.reviewArtifacts = Array.isArray(snapshot?.reviewSummary?.changedArtifacts)
      ? dedupeReviewArtifacts(snapshot.reviewSummary.changedArtifacts)
      : [];
    // Preserve sidebar state across snapshot reloads unless the caller
    // provides an explicit durable state override to restore or clear it.
    if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, "planState")) {
      this.planState = snapshot.planState ?? null;
      this.planStateVisible = snapshot.planState != null;
    }
    if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, "diffState")) {
      this.diffState = snapshot.diffState ?? null;
    }
    if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, "inputRequestState")) {
      const inputRequestState = asRecord(snapshot.inputRequestState);
      this.inputRequestState = inputRequestState
        ? {
            requestId: typeof inputRequestState.requestId === "number" ? inputRequestState.requestId : null,
            prompt: buildInputPrompt(
              normalizeInputQuestions(inputRequestState.questions),
              firstString(inputRequestState.prompt),
            ),
            threadId: firstString(inputRequestState.threadId, this.threadId) || this.threadId,
            questions: normalizeInputQuestions(inputRequestState.questions),
          }
        : null;
    }
    if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, "threadInputState")) {
      const threadInputState = asRecord(snapshot.threadInputState);
      this.threadInputState = threadInputState
        ? {
            queuedMessages: Array.isArray(threadInputState.queuedMessages)
              ? threadInputState.queuedMessages.map((entry) => ({ ...entry }))
              : [],
            hasUnseenCompletion: threadInputState.hasUnseenCompletion === true,
            lastCompletionAt: firstString(threadInputState.lastCompletionAt),
            lastCompletionStatus: firstString(threadInputState.lastCompletionStatus),
          }
        : null;
    }

    if (snapshot) {
      const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
      for (const entry of entries) {
        if (entry?.id) {
          this.entriesById.set(entry.id, entry);
          this.entryOrder.push(entry.id);
        }
      }
    } else {
      this.interactionState = "conversation";
      this.planState = null;
      this.planStateVisible = false;
      this.diffState = null;
      this.inputRequestState = null;
      this.threadInputState = null;
      this.pendingApprovalsById.clear();
      this.reviewArtifacts = [];
      this.reviewSummary = null;
      this.cwd = null;
    }

    this.interactionState = buildInteractionState(this);

    return {
      kind: "snapshot",
      threadId: this.threadId,
      entries: this.getOrderedEntries(),
      state: this.state,
      interactionState: this.interactionState,
      title: this.title,
      subtitle: this.subtitle,
      updatedAt: this.updatedAt,
      workspaceRoot: this.workspaceRoot,
      cwd: this.cwd,
      reviewSummary: this.reviewSummary,
      planState: this.planState,
      diffState: this.diffState,
      inputRequestState: this.inputRequestState,
      threadInputState: this.threadInputState,
    };
  }

  getOrderedEntries() {
    return this.entryOrder
      .map((id) => this.entriesById.get(id))
      .filter(Boolean);
  }
}

/**
 * The accumulator manages per-thread buffers and translates raw
 * app-server notifications into renderer-ready delta events.
 */
export class ThreadStateAccumulator {
  constructor() {
    /** @type {Map<string, ThreadBuffer>} */
    this.buffers = new Map();
    /** @type {string | null} */
    this.activeThreadId = null;
    /** @type {Map<number, string>} */
    this.pendingApprovalThreadIdsByRequestId = new Map();
  }

  /**
   * Get or create a buffer for a thread.
   */
  getBuffer(threadId) {
    let buffer = this.buffers.get(threadId);
    if (!buffer) {
      buffer = new ThreadBuffer(threadId);
      this.buffers.set(threadId, buffer);
    }
    return buffer;
  }

  /**
   * Load a full snapshot into a thread buffer. Used for cold load
   * (thread selection) and reconnect.
   * Returns a full-snapshot delta message for the renderer.
   */
  loadSnapshot(threadId, snapshot) {
    const buffer = this.getBuffer(threadId);
    return buffer.loadSnapshot(snapshot);
  }

  /**
   * Set the actively selected thread.
   */
  setActiveThread(threadId) {
    this.activeThreadId = threadId;
  }

  /**
   * Drop a thread buffer when it's no longer needed.
   */
  dropBuffer(threadId) {
    for (const [requestId, approvalThreadId] of this.pendingApprovalThreadIdsByRequestId.entries()) {
      if (approvalThreadId === threadId) {
        this.pendingApprovalThreadIdsByRequestId.delete(requestId);
      }
    }
    this.buffers.delete(threadId);
    if (this.activeThreadId === threadId) {
      this.activeThreadId = null;
    }
  }

  /**
   * Process a raw app-server notification message and return
   * zero or more delta events for the renderer.
   *
   * Returns an array of delta objects, each with a `kind` field.
   * Returns empty array if the message is irrelevant or for
   * a thread that isn't buffered.
   */
  applyNotification(message) {
    const method = firstString(message?.method);
    if (!method) {
      return [];
    }

    const params = asRecord(message?.params);
    const threadId = firstString(params?.threadId);

    const entryDeltas = applyEntryNotification({
      buffers: this.buffers,
      message,
      method,
      params,
      pendingApprovalThreadIdsByRequestId: this.pendingApprovalThreadIdsByRequestId,
      resolveApprovalBuffer: (requestId) => this.#resolveApprovalBuffer(requestId),
      threadId,
    });
    if (entryDeltas) {
      return entryDeltas;
    }

    if (
      method === "turn/plan/updated"
      || method === "turn/diff/updated"
      || method === "tool/requestUserInput"
      || method === "item/tool/requestUserInput"
      || method === "thread/name/updated"
    ) {
      if (!threadId) {
        return [];
      }

      const buffer = this.buffers.get(threadId);
      if (!buffer) {
        return [];
      }

      const sidebarDeltas = applySidebarNotification({
        buffer,
        message,
        method,
        params,
        threadId,
      });
      if (sidebarDeltas) {
        return sidebarDeltas;
      }
    }

    return [];
  }

  /**
   * Get the current full thread state for a buffered thread.
   * Used for sidebar state and diagnostics, not for hot-path rendering.
   */
  getThreadState(threadId) {
    const buffer = this.buffers.get(threadId);
    if (!buffer) {
      return null;
    }

    return {
      threadId: buffer.threadId,
      state: buffer.state,
      interactionState: buffer.interactionState,
      title: buffer.title,
      subtitle: buffer.subtitle,
      updatedAt: buffer.updatedAt,
      workspaceRoot: buffer.workspaceRoot,
      cwd: buffer.cwd,
      entries: buffer.getOrderedEntries(),
      reviewSummary: buffer.reviewSummary,
      planState: buffer.planState,
      diffState: buffer.diffState,
      inputRequestState: buffer.inputRequestState,
      threadInputState: buffer.threadInputState,
    };
  }

  setDiffState(threadId, diffs) {
    const buffer = this.getBuffer(threadId);
    const resolvedDiffs = mergeDiffEntries(buffer.diffState?.diffs, resolveDiffEntries(diffs));
    buffer.diffState = { diffs: resolvedDiffs };
    buffer.updatedAt = new Date().toISOString();
    const interactionDelta = maybeInteractionStateChanged(buffer, threadId);

    return interactionDelta
      ? [
          {
            kind: "diffUpdated",
            threadId,
            diffs: resolvedDiffs,
          },
          interactionDelta,
        ]
      : [
          {
            kind: "diffUpdated",
            threadId,
            diffs: resolvedDiffs,
          },
        ];
  }

  setInputRequestState(threadId, requestId, prompt, questions = []) {
    const buffer = this.getBuffer(threadId);
    const normalizedQuestions = normalizeInputQuestions(questions);
    buffer.inputRequestState = {
      requestId: typeof requestId === "number" ? requestId : null,
      prompt: buildInputPrompt(normalizedQuestions, prompt),
      threadId,
      questions: normalizedQuestions,
    };
    buffer.updatedAt = new Date().toISOString();

    return {
      kind: "inputRequested",
      threadId,
      requestId: buffer.inputRequestState.requestId,
      prompt: buffer.inputRequestState.prompt,
      questions: buffer.inputRequestState.questions,
    };
  }

  setThreadInputState(threadId, threadInputState) {
    const buffer = this.getBuffer(threadId);
    buffer.threadInputState = threadInputState
      ? {
          queuedMessages: Array.isArray(threadInputState.queuedMessages)
            ? threadInputState.queuedMessages.map((entry) => ({ ...entry }))
            : [],
          hasUnseenCompletion: threadInputState.hasUnseenCompletion === true,
          lastCompletionAt: firstString(threadInputState.lastCompletionAt),
          lastCompletionStatus: firstString(threadInputState.lastCompletionStatus),
        }
      : null;
    buffer.updatedAt = new Date().toISOString();
    return {
      kind: "threadInputStateChanged",
      threadId,
      updatedAt: buffer.updatedAt,
      threadInputState: buffer.threadInputState,
    };
  }

  appendSyntheticEntry(threadId, entry) {
    const buffer = this.getBuffer(threadId);
    const sourceEntry = asRecord(entry) ?? {};
    const nextEntry = {
      ...sourceEntry,
      id: firstString(sourceEntry.id) || `synthetic-${Date.now()}`,
      kind: firstString(sourceEntry.kind) || "activity",
      title: firstString(sourceEntry.title) || "Sense-1 activity",
      body: typeof sourceEntry.body === "string" ? sourceEntry.body : "",
      status: firstString(sourceEntry.status) || undefined,
    };

    buffer.entriesById.set(nextEntry.id, nextEntry);
    if (!buffer.entryOrder.includes(nextEntry.id)) {
      buffer.entryOrder.push(nextEntry.id);
    }
    buffer.updatedAt = new Date().toISOString();
    const interactionDelta = maybeInteractionStateChanged(buffer, threadId);

    return interactionDelta
      ? [
          {
            kind: "entryCompleted",
            threadId,
            entryId: nextEntry.id,
            entry: nextEntry,
          },
          interactionDelta,
        ]
      : [
          {
            kind: "entryCompleted",
            threadId,
            entryId: nextEntry.id,
            entry: nextEntry,
          },
        ];
  }

  hasBlockingWork() {
    for (const buffer of this.buffers.values()) {
      if (buffer.state === "running") {
        return true;
      }

      if (buffer.inputRequestState) {
        return true;
      }

      if (buffer.pendingApprovalsById.size > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Clear all buffers (e.g. on profile change).
   */
  clear() {
    this.buffers.clear();
    this.activeThreadId = null;
    this.pendingApprovalThreadIdsByRequestId.clear();
  }

  #resolveApprovalBuffer(requestId) {
    const threadId = this.pendingApprovalThreadIdsByRequestId.get(requestId);
    if (!threadId) {
      return null;
    }

    return {
      buffer: this.buffers.get(threadId) ?? null,
      threadId,
    };
  }
}

export { mapItemToEntry };
