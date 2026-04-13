import fs from "node:fs/promises";
import path from "node:path";

import {
  ensureProfileDirectories,
  fileExists,
  resolveProfileRoot,
  sanitizeProfileId,
} from "./profile-paths.js";

const THREAD_INTERACTION_STATES_FILE = "thread-interaction-states.json";
const LAST_SELECTED_THREAD_FILE = "last-selected-thread.json";
const PENDING_APPROVALS_FILE = "pending-approvals.json";

function resolveLastSelectedThreadFile(profileId, env = process.env) {
  return path.join(resolveProfileRoot(profileId, env), LAST_SELECTED_THREAD_FILE);
}

function resolveThreadInteractionStatesFile(profileId, env = process.env) {
  return path.join(resolveProfileRoot(profileId, env), THREAD_INTERACTION_STATES_FILE);
}

function resolvePendingApprovalsFile(profileId, env = process.env) {
  return path.join(resolveProfileRoot(sanitizeProfileId(profileId), env), PENDING_APPROVALS_FILE);
}

export async function loadLastSelectedThreadId(profileId, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  await ensureProfileDirectories(profile, env);
  const targetFile = resolveLastSelectedThreadFile(profile, env);

  if (!(await fileExists(targetFile))) {
    return null;
  }

  try {
    const raw = await fs.readFile(targetFile, "utf8");
    const parsed = JSON.parse(raw);
    const threadId = typeof parsed?.thread_id === "string" ? parsed.thread_id.trim() : "";
    return threadId || null;
  } catch {
    return null;
  }
}

export async function persistLastSelectedThreadId(profileId, threadId, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  await ensureProfileDirectories(profile, env);
  const targetFile = resolveLastSelectedThreadFile(profile, env);
  const normalizedThreadId = typeof threadId === "string" ? threadId.trim() : "";

  await fs.writeFile(
    targetFile,
    JSON.stringify(
      {
        thread_id: normalizedThreadId || null,
        updated_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );

  return normalizedThreadId || null;
}

export async function clearLastSelectedThreadId(profileId, env = process.env) {
  return await persistLastSelectedThreadId(profileId, null, env);
}

export async function clearLastSelectedThreadIdIfMatches(profileId, threadId, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  const resolvedThreadId = String(threadId || "").trim();
  if (!resolvedThreadId) {
    return await loadLastSelectedThreadId(profile, env);
  }

  const existing = await loadLastSelectedThreadId(profile, env);
  if (existing !== resolvedThreadId) {
    return existing;
  }

  await persistLastSelectedThreadId(profile, null, env);
  return null;
}

function normalizeThreadInteractionStateEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const threadId = typeof entry.threadId === "string" ? entry.threadId.trim() : "";
  const interactionState =
    typeof entry.interactionState === "string" ? entry.interactionState.trim() : "";
  if (!threadId || !interactionState) {
    return null;
  }

  return {
    threadId,
    interactionState,
    updatedAt:
      typeof entry.updatedAt === "string" && entry.updatedAt.trim() ? entry.updatedAt.trim() : null,
  };
}

export async function loadThreadInteractionStates(profileId, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  await ensureProfileDirectories(profile, env);
  const targetFile = resolveThreadInteractionStatesFile(profile, env);

  if (!(await fileExists(targetFile))) {
    return [];
  }

  try {
    const raw = await fs.readFile(targetFile, "utf8");
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.states) ? parsed.states : [];
    const deduped = [];
    const seen = new Set();

    for (const item of items) {
      const normalized = normalizeThreadInteractionStateEntry(item);
      if (!normalized || seen.has(normalized.threadId)) {
        continue;
      }

      seen.add(normalized.threadId);
      deduped.push(normalized);
    }

    return deduped;
  } catch {
    return [];
  }
}

export async function rememberThreadInteractionState(
  profileId,
  threadId,
  interactionState,
  env = process.env,
) {
  const profile = sanitizeProfileId(profileId);
  const resolvedThreadId = String(threadId || "").trim();
  const resolvedInteractionState = String(interactionState || "").trim();
  if (!resolvedThreadId || !resolvedInteractionState) {
    return await loadThreadInteractionStates(profile, env);
  }

  await ensureProfileDirectories(profile, env);
  const targetFile = resolveThreadInteractionStatesFile(profile, env);
  const existing = await loadThreadInteractionStates(profile, env);
  const nextEntry = {
    threadId: resolvedThreadId,
    interactionState: resolvedInteractionState,
    updatedAt: new Date().toISOString(),
  };
  const merged = [
    nextEntry,
    ...existing.filter((entry) => entry.threadId !== resolvedThreadId),
  ];

  await fs.writeFile(
    targetFile,
    JSON.stringify(
      {
        states: merged,
        updated_at: nextEntry.updatedAt,
      },
      null,
      2,
    ),
    "utf8",
  );

  return merged;
}

export async function forgetThreadInteractionState(profileId, threadId, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  const resolvedThreadId = String(threadId || "").trim();
  if (!resolvedThreadId) {
    return await loadThreadInteractionStates(profile, env);
  }

  await ensureProfileDirectories(profile, env);
  const targetFile = resolveThreadInteractionStatesFile(profile, env);
  const existing = await loadThreadInteractionStates(profile, env);
  const nextStates = existing.filter((entry) => entry.threadId !== resolvedThreadId);

  await fs.writeFile(
    targetFile,
    JSON.stringify(
      {
        states: nextStates,
        updated_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );

  return nextStates;
}

export async function loadPendingApprovals(profileId, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  const targetFile = resolvePendingApprovalsFile(profile, env);

  if (!(await fileExists(targetFile))) {
    return [];
  }

  try {
    const raw = await fs.readFile(targetFile, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.approvals) ? parsed.approvals : [];
  } catch {
    return [];
  }
}

export async function persistPendingApprovals(profileId, approvals, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  await ensureProfileDirectories(profile, env);
  const targetFile = resolvePendingApprovalsFile(profile, env);

  await fs.writeFile(
    targetFile,
    JSON.stringify(
      {
        approvals: Array.isArray(approvals) ? approvals : [],
        updated_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

export async function forgetPendingApprovalsForThread(profileId, threadId, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  const resolvedThreadId = String(threadId || "").trim();
  if (!resolvedThreadId) {
    return await loadPendingApprovals(profile, env);
  }

  const approvals = await loadPendingApprovals(profile, env);
  const nextApprovals = approvals.filter((entry) => {
    return typeof entry?.threadId !== "string" || entry.threadId.trim() !== resolvedThreadId;
  });
  await persistPendingApprovals(profile, nextApprovals, env);
  return nextApprovals;
}
