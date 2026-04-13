import fs from "node:fs/promises";
import path from "node:path";

import { rememberThreadWorkspaceRoot, resolveProfileSubstrateDbPath } from "../profile/profile-state.js";
import { resolveDesktopInteractionState } from "../session/interaction-state.ts";
import {
  getPendingQuestionByThreadId,
  getWorkspace,
  listRecentSessions,
  listObjectRefsBySession,
} from "../substrate/substrate-reader.js";
import { getSubstrateSessionByThreadId } from "../substrate/substrate.js";
import { asRecord, firstString } from "./bootstrap-shared.js";

const THREAD_READ_SUMMARY_PARAMS = {
  includeTurns: false,
};

function normalizeInputChoice(choice) {
  const record = asRecord(choice);
  const label = firstString(record?.label, record?.text, record?.name, record?.value);
  if (!label) {
    return null;
  }

  return {
    label,
    description: firstString(record?.description),
    value: firstString(record?.value, record?.label, record?.text, record?.name) || label,
  };
}

function normalizeInputQuestion(question) {
  const record = asRecord(question);
  const prompt = firstString(
    record?.question,
    record?.prompt,
    record?.text,
    record?.label,
    record?.header,
  );
  if (!prompt) {
    return null;
  }

  const rawChoices = Array.isArray(record?.choices)
    ? record.choices
    : Array.isArray(record?.options)
      ? record.options
      : [];

  return {
    id: firstString(record?.id),
    header: firstString(record?.header),
    question: prompt,
    isOther: record?.isOther === true,
    choices: rawChoices.map((choice) => normalizeInputChoice(choice)).filter(Boolean),
  };
}

function normalizeInputQuestions(questions) {
  if (!Array.isArray(questions)) {
    return [];
  }

  return questions.map((question) => normalizeInputQuestion(question)).filter(Boolean);
}

export async function loadThreadReviewContext(profileId, threadId, env = process.env) {
  const resolvedThreadId = firstString(threadId);
  if (!resolvedThreadId) {
    return null;
  }

  const dbPath = resolveProfileSubstrateDbPath(profileId, env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: resolvedThreadId,
    dbPath,
  });
  if (!session?.id) {
    return null;
  }

  const metadataReview =
    session.metadata?.reviewSummary && typeof session.metadata.reviewSummary === "object"
      ? session.metadata.reviewSummary
      : null;
  const refs = await listObjectRefsBySession({
    dbPath,
    limit: 250,
    sessionId: session.id,
  });
  return {
    objectRefs: refs,
    summary:
      typeof metadataReview?.summary === "string" && metadataReview.summary.trim()
        ? metadataReview.summary.trim()
        : session.summary,
    updatedAt:
      typeof metadataReview?.updatedAt === "string" && metadataReview.updatedAt.trim()
        ? metadataReview.updatedAt.trim()
        : session.ended_at,
  };
}

async function loadThreadWorkspaceRootFromSubstrate(profileId, threadId, env = process.env) {
  const resolvedThreadId = firstString(threadId);
  if (!resolvedThreadId) {
    return null;
  }

  const dbPath = resolveProfileSubstrateDbPath(profileId, env);
  const session = await getSubstrateSessionByThreadId({
    codexThreadId: resolvedThreadId,
    dbPath,
  });
  if (!session) {
    return null;
  }

  if (session.workspace_id) {
    const workspace = await getWorkspace({
      dbPath,
      workspaceId: session.workspace_id,
    });
    const workspaceRoot = firstString(workspace?.root_path);
    if (workspaceRoot) {
      return path.resolve(workspaceRoot);
    }
  }

  const metadataWorkspaceRoot = firstString(session.metadata?.workspaceRoot);
  return metadataWorkspaceRoot ? path.resolve(metadataWorkspaceRoot) : null;
}

export async function resolveThreadWorkspaceRoot(
  profileId,
  threadId,
  workspaceRootByThreadId = {},
  env = process.env,
) {
  const resolvedThreadId = firstString(threadId);
  if (!resolvedThreadId) {
    return null;
  }

  const rememberedWorkspaceRoot = firstString(workspaceRootByThreadId?.[resolvedThreadId]);
  if (rememberedWorkspaceRoot) {
    try {
      await fs.access(rememberedWorkspaceRoot);
      return path.resolve(rememberedWorkspaceRoot);
    } catch {
      // Fall through to substrate-backed recovery when the remembered mount path has gone stale.
    }
  }

  const substrateWorkspaceRoot = await loadThreadWorkspaceRootFromSubstrate(profileId, resolvedThreadId, env);
  if (!substrateWorkspaceRoot) {
    return null;
  }

  try {
    await rememberThreadWorkspaceRoot(profileId, resolvedThreadId, substrateWorkspaceRoot, env);
  } catch {
    // Keep bootstrap recovery working even if the self-heal write fails.
  }

  if (workspaceRootByThreadId && typeof workspaceRootByThreadId === "object") {
    workspaceRootByThreadId[resolvedThreadId] = substrateWorkspaceRoot;
  }

  return substrateWorkspaceRoot;
}

async function hydrateWorkspaceRoots(profileId, threadIds, workspaceRootByThreadId = {}, env = process.env) {
  const resolvedThreadIds = [...new Set(
    (Array.isArray(threadIds) ? threadIds : [])
      .map((threadId) => firstString(threadId))
      .filter(Boolean),
  )];

  await Promise.all(
    resolvedThreadIds.map(async (threadId) => {
      const workspaceRoot = await resolveThreadWorkspaceRoot(profileId, threadId, workspaceRootByThreadId, env);
      if (workspaceRoot) {
        workspaceRootByThreadId[threadId] = workspaceRoot;
      }
    }),
  );

  return workspaceRootByThreadId;
}

const PLACEHOLDER_THREAD_TITLES = new Set([
  "untitled thread",
  "new thread",
  "new task",
  "current thread",
]);

function isPlaceholderThreadTitle(title) {
  const resolvedTitle = firstString(title);
  if (!resolvedTitle) {
    return true;
  }

  return PLACEHOLDER_THREAD_TITLES.has(resolvedTitle.toLowerCase());
}

function formatUpdatedLabel(raw) {
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

export function normalizeRecentThreads(
  result,
  workspaceRootByThreadId = {},
  interactionStateByThreadId = {},
) {
  const entries = Array.isArray(result?.data) ? result.data : [];

  return entries.map((entry, index) => {
    const id = firstString(entry?.id) ?? `thread-${index + 1}`;
    const title = firstString(entry?.title) ?? "Untitled thread";
    const subtitle = firstString(
      entry?.subtitle,
      entry?.workspaceRootName,
      entry?.workspace_root_name,
      entry?.workspace?.name,
      entry?.model,
    ) || "Sense-1 thread";
    const state = firstString(entry?.state, entry?.status) || "idle";
    const updatedAt = firstString(
      entry?.updated_at,
      entry?.updatedAt,
      entry?.last_updated_at,
      entry?.lastUpdatedAt,
    ) || new Date().toISOString();
    const workspaceRoot = firstString(workspaceRootByThreadId[id]);

    return {
      id,
      title,
      subtitle,
      state,
      interactionState: resolveDesktopInteractionState({
        previousInteractionState: interactionStateByThreadId[id] ?? null,
        threadState: state,
        workspaceRoot,
      }),
      updatedAt,
      workspaceRoot,
    };
  });
}

function sortRecentThreads(threads, lastSelectedThreadId = null) {
  return [...threads].sort((left, right) => {
    const updatedDelta = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    if (!Number.isNaN(updatedDelta) && updatedDelta !== 0) {
      return updatedDelta;
    }

    if (lastSelectedThreadId) {
      if (left.id === lastSelectedThreadId && right.id !== lastSelectedThreadId) {
        return -1;
      }
      if (right.id === lastSelectedThreadId && left.id !== lastSelectedThreadId) {
        return 1;
      }
    }

    return left.title.localeCompare(right.title);
  });
}

export function mergeRecentThreadMetadata(
  threads,
  {
    lastSelectedThreadId = null,
    selectedThread = null,
    sessionTitleByThreadId = {},
  } = {},
) {
  const resolvedSelectedThreadId = firstString(selectedThread?.id);
  const mergedThreads = [];
  let selectedThreadSeen = false;

  for (const thread of Array.isArray(threads) ? threads : []) {
    let nextThread = thread;
    const persistedTitle = firstString(sessionTitleByThreadId[thread.id]);
    if (persistedTitle && isPlaceholderThreadTitle(nextThread.title)) {
      nextThread = {
        ...nextThread,
        title: persistedTitle,
      };
    }

    if (resolvedSelectedThreadId && thread.id === resolvedSelectedThreadId) {
      selectedThreadSeen = true;
      const selectedTitle = firstString(selectedThread?.title);
      nextThread = {
        ...nextThread,
        title:
          selectedTitle && !isPlaceholderThreadTitle(selectedTitle)
            ? selectedTitle
            : nextThread.title,
        subtitle: firstString(selectedThread?.subtitle, nextThread.subtitle) || "Sense-1 thread",
        state: firstString(selectedThread?.state, nextThread.state) || "idle",
        interactionState:
          firstString(selectedThread?.interactionState, nextThread.interactionState) || "conversation",
        updatedAt: firstString(selectedThread?.updatedAt, nextThread.updatedAt) || nextThread.updatedAt,
        workspaceRoot: firstString(selectedThread?.workspaceRoot, nextThread.workspaceRoot),
      };
    }

    mergedThreads.push(nextThread);
  }

  if (selectedThread && resolvedSelectedThreadId && !selectedThreadSeen) {
    mergedThreads.push({
      id: resolvedSelectedThreadId,
      title:
        firstString(selectedThread.title) && !isPlaceholderThreadTitle(selectedThread.title)
          ? selectedThread.title
          : firstString(sessionTitleByThreadId[resolvedSelectedThreadId], selectedThread.title) || "Untitled thread",
      subtitle: firstString(selectedThread.subtitle) || "Sense-1 thread",
      state: firstString(selectedThread.state) || "idle",
      interactionState: firstString(selectedThread.interactionState) || "conversation",
      updatedAt: firstString(selectedThread.updatedAt) || new Date().toISOString(),
      workspaceRoot: firstString(selectedThread.workspaceRoot),
    });
  }

  return sortRecentThreads(mergedThreads, lastSelectedThreadId);
}

export function mergeSubstrateSessionsIntoRecentThreads(
  threads,
  {
    sessions = [],
    workspaces = [],
    interactionStateByThreadId = {},
    lastSelectedThreadId = null,
  } = {},
) {
  const mergedThreads = Array.isArray(threads) ? [...threads] : [];
  const seenThreadIds = new Set(mergedThreads.map((thread) => thread.id));
  const workspaceRootById = new Map(
    (Array.isArray(workspaces) ? workspaces : [])
      .map((workspace) => [firstString(workspace?.id), firstString(workspace?.root_path)])
      .filter(([workspaceId, workspaceRoot]) => Boolean(workspaceId && workspaceRoot)),
  );

  for (const session of Array.isArray(sessions) ? sessions : []) {
    const threadId = firstString(session?.codex_thread_id);
    if (!threadId || seenThreadIds.has(threadId)) {
      continue;
    }

    if (firstString(session?.status)?.toLowerCase() === "archived") {
      continue;
    }

    const workspaceRoot = firstString(
      session?.workspace_id ? workspaceRootById.get(session.workspace_id) : null,
    );
    const state = firstString(session?.status) === "active" ? "active" : "idle";
    mergedThreads.push({
      id: threadId,
      title: firstString(session?.title) || "Untitled session",
      subtitle: workspaceRoot ? path.basename(workspaceRoot) || "Workspace thread" : "Sense-1 thread",
      state,
      interactionState: resolveDesktopInteractionState({
        previousInteractionState: interactionStateByThreadId[threadId] ?? null,
        threadState: state,
        workspaceRoot,
      }),
      updatedAt: firstString(session?.ended_at, session?.started_at) || new Date().toISOString(),
      workspaceRoot,
    });
    seenThreadIds.add(threadId);
  }

  return sortRecentThreads(mergedThreads, lastSelectedThreadId);
}

export async function loadRecentThreads(
  manager,
  profileId,
  workspaceRootByThreadId = {},
  lastSelectedThreadId = null,
  interactionStateByThreadId = {},
  env = process.env,
  threadListParams,
) {
  const substrateDbPath = resolveProfileSubstrateDbPath(profileId, env);
  const listedResult = await manager.request("thread/list", threadListParams);
  const listedThreadIds = (Array.isArray(listedResult?.data) ? listedResult.data : [])
    .map((entry) => firstString(entry?.id))
    .filter(Boolean);
  await hydrateWorkspaceRoots(profileId, listedThreadIds, workspaceRootByThreadId, env);
  const listedThreads = normalizeRecentThreads(
    listedResult,
    workspaceRootByThreadId,
    interactionStateByThreadId,
  );
  const listedIds = new Set(listedThreads.map((thread) => thread.id));

  let candidateIds = [];
  try {
    const loadedResult = await manager.request("thread/loaded/list");
    candidateIds = Array.isArray(loadedResult?.data)
      ? loadedResult.data.filter((threadId) => typeof threadId === "string" && threadId.trim() && !listedIds.has(threadId.trim()))
      : [];
  } catch {
    candidateIds = [];
  }

  const rememberedThreadId = firstString(lastSelectedThreadId);
  if (rememberedThreadId && !listedIds.has(rememberedThreadId) && !candidateIds.includes(rememberedThreadId)) {
    candidateIds.push(rememberedThreadId);
  }
  await hydrateWorkspaceRoots(profileId, candidateIds, workspaceRootByThreadId, env);

  const loadedThreads = [];
  for (const threadId of candidateIds) {
    try {
      const readResult = await manager.request("thread/read", {
        threadId,
        ...THREAD_READ_SUMMARY_PARAMS,
      });
      if (readResult?.thread) {
        loadedThreads.push(
          ...normalizeRecentThreads(
            { data: [readResult.thread] },
            workspaceRootByThreadId,
            interactionStateByThreadId,
          ),
        );
      }
    } catch {
      // Skip threads that are not readable yet.
    }
  }

  let substrateThreads = [];
  try {
    const recentSessions = await listRecentSessions({
      dbPath: substrateDbPath,
      profileId,
      limit: 200,
    });
    const substrateThreadIds = recentSessions
      .map((session) => firstString(session.codex_thread_id))
      .filter(Boolean);
    await hydrateWorkspaceRoots(profileId, substrateThreadIds, workspaceRootByThreadId, env);
    substrateThreads = recentSessions
      .map((session) => {
        const threadId = firstString(session.codex_thread_id);
        if (!threadId || session.status === "archived") {
          return null;
        }
        const workspaceRoot = firstString(workspaceRootByThreadId[threadId]);
        return {
          id: threadId,
          title: firstString(session.title) || "Untitled thread",
          subtitle: firstString(session.model) || "Sense-1 thread",
          state: firstString(session.status) || "idle",
          interactionState: resolveDesktopInteractionState({
            previousInteractionState: interactionStateByThreadId[threadId] ?? null,
            threadState: firstString(session.status) || "idle",
            workspaceRoot,
          }),
          updatedAt: firstString(session.ended_at, session.started_at) || new Date().toISOString(),
          workspaceRoot,
        };
      })
      .filter(Boolean);
  } catch {
    substrateThreads = [];
  }

  const seen = new Set();
  return sortRecentThreads([...listedThreads, ...loadedThreads, ...substrateThreads].filter((thread) => {
    if (seen.has(thread.id)) {
      return false;
    }
    seen.add(thread.id);
    return true;
  }), rememberedThreadId);
}

export function buildSelectedThreadFallback(summary) {
  if (!summary?.id) {
    return null;
  }

  return {
    ...summary,
    updatedLabel: formatUpdatedLabel(summary.updatedAt),
    workspaceRoot: firstString(summary.workspaceRoot),
    entries: [],
    changeGroups: [],
    progressSummary: [],
    reviewSummary: null,
    hasLoadedDetails: false,
    inputRequestState: null,
  };
}

export async function hydrateThreadInputRequestState(thread, dbPath) {
  if (!thread?.id) {
    return thread;
  }

  const pendingQuestion = await getPendingQuestionByThreadId({
    codexThreadId: thread.id,
    dbPath,
  });
  if (!pendingQuestion) {
    return thread;
  }

  return {
    ...thread,
    inputRequestState: {
      requestId: pendingQuestion.request_id,
      prompt: pendingQuestion.prompt,
      threadId: thread.id,
      questions: normalizeInputQuestions(pendingQuestion.metadata?.questions),
    },
  };
}
