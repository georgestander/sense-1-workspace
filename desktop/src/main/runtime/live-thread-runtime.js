import { buildExecutionOverrides, DEFAULT_DESKTOP_MODEL, normalizeDesktopPersonality } from "./live-thread-runtime-policy.js";
import {
  buildCollaborationMode,
  buildDesktopThreadRequest,
  buildRunContext,
  buildTurnSandboxPolicy,
  normalizeRuntimeRunContext,
  resolveRuntimePath,
} from "./live-thread-runtime-request.js";
import { normalizeDesktopThreadSummary } from "./live-thread-runtime-summary.js";
import { buildDesktopThreadSnapshot } from "./live-thread-runtime-transcript.js";
import { classifyDesktopExecutionIntent } from "../settings/policy.js";
import { resolveDesktopInteractionState } from "../session/interaction-state.ts";

export {
  DEFAULT_DESKTOP_RUNTIME_INSTRUCTIONS,
  describePolicyRules,
} from "./live-thread-runtime-policy.js";
export { normalizeDesktopThreadSummary } from "./live-thread-runtime-summary.js";
export { buildDesktopThreadSnapshot } from "./live-thread-runtime-transcript.js";
export {
  buildCollaborationMode,
  buildDesktopThreadRequest,
  buildRunContext,
  buildTurnSandboxPolicy,
  normalizeRuntimeRunContext,
  resolveRuntimePath,
} from "./live-thread-runtime-request.js";

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

function fileNameFromPath(value) {
  return value.split("/").filter(Boolean).at(-1) ?? "";
}

const LOCAL_IMAGE_EXTENSIONS = new Set([
  ".apng",
  ".avif",
  ".bmp",
  ".gif",
  ".heic",
  ".heif",
  ".jpeg",
  ".jpg",
  ".png",
  ".tif",
  ".tiff",
  ".webp",
]);

function isLocalImagePath(value) {
  const fileName = fileNameFromPath(value).toLowerCase();
  const extensionIndex = fileName.lastIndexOf(".");
  if (extensionIndex < 0) {
    return false;
  }

  return LOCAL_IMAGE_EXTENSIONS.has(fileName.slice(extensionIndex));
}

function pushStructuredInputItem(input, seenPaths, item) {
  if (!item || typeof item !== "object") {
    return;
  }

  if (item.type !== "mention" && item.type !== "localImage") {
    return;
  }

  const itemPath = firstString(item.path);
  if (!itemPath) {
    return;
  }

  const itemKey = `${item.type}:${itemPath}`;
  if (seenPaths.has(itemKey)) {
    return;
  }
  seenPaths.add(itemKey);

  if (item.type === "localImage") {
    input.push({
      type: "localImage",
      path: itemPath,
    });
    return;
  }

  input.push({
    type: "mention",
    name: firstString(item.name) ?? undefined,
    path: itemPath,
  });
}

function buildTurnInput(promptText, attachments, inputItems) {
  const input = [];
  const seenPaths = new Set();

  for (const item of Array.isArray(inputItems) ? inputItems : []) {
    pushStructuredInputItem(input, seenPaths, item);
  }

  for (const attachmentPath of Array.isArray(attachments) ? attachments : []) {
    pushStructuredInputItem(
      input,
      seenPaths,
      isLocalImagePath(attachmentPath)
        ? {
            type: "localImage",
            path: attachmentPath,
          }
        : {
            type: "mention",
            name: fileNameFromPath(attachmentPath) || undefined,
            path: attachmentPath,
          },
    );
  }

  input.push({
    type: "text",
    text: promptText,
  });

  return input;
}

export async function readDesktopThread(
  manager,
  threadId,
  workspaceRoot = null,
  interactionState = null,
  reviewContext = null,
) {
  const resolvedThreadId = firstString(threadId);
  if (!resolvedThreadId) {
    throw new Error("Choose a thread before loading its details.");
  }

  let result;
  try {
    result = await manager.request("thread/read", {
      threadId: resolvedThreadId,
      includeTurns: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/rollout .* is empty/i.test(message)) {
      return {
        thread: null,
      };
    }

    throw error;
  }
  if (!result?.thread) {
    return {
      thread: null,
    };
  }

  const normalizedThread = {
    ...result.thread,
    turns: Array.isArray(result.thread.turns) ? result.thread.turns : [],
  };

  return {
    thread: buildDesktopThreadSnapshot(normalizedThread, workspaceRoot, interactionState, reviewContext),
  };
}

export async function runDesktopTask(
  manager,
  {
    attachments,
    contextPaths = [],
    cwd,
    inputItems,
    model,
    onThreadReady = null,
    personality,
    prompt,
    reasoningEffort,
    serviceTier,
    runContext,
    runtimeInstructions = null,
    settings = null,
    threadId,
    workspaceRoot,
  },
) {
  const promptText = firstString(prompt);
  if (!promptText) {
    throw new Error("Add a prompt before starting the task.");
  }

  let resolvedThreadId = firstString(threadId);
  const requestedExistingThreadId = resolvedThreadId;
  const resolvedWorkspaceRoot = firstString(workspaceRoot);
  const resolvedCwd = firstString(cwd, resolvedWorkspaceRoot);
  const executionIntent = classifyDesktopExecutionIntent({
    prompt: promptText,
    workspaceRoot: resolvedWorkspaceRoot,
  });
  const productRunContext = normalizeRuntimeRunContext(runContext, {
    cwd: resolvedCwd,
    workspaceRoot: resolvedWorkspaceRoot,
  });
  if (!productRunContext?.actor || !productRunContext?.scope) {
    throw new Error("Add actor and scope metadata before starting the task.");
  }
  const executionContext = buildRunContext(
    {
      cwd: resolvedCwd,
      runContext: productRunContext,
      workspaceRoot: resolvedWorkspaceRoot,
    },
    resolvedWorkspaceRoot,
  );
  if (!executionContext) {
    throw new Error("Add actor and scope metadata before starting the task.");
  }
  let thread = null;
  const executionOverrides = buildExecutionOverrides(executionContext);
  const turnSandboxPolicy = buildTurnSandboxPolicy(
    executionOverrides.sandboxPolicy,
    resolvedWorkspaceRoot,
    resolvedCwd,
  );
  const runtimeCwd = resolveRuntimePath(resolvedCwd);
  const ensuredThread = await ensureDesktopThread(manager, {
    contextPaths,
    cwd: resolvedCwd,
    executionIntent,
    model,
    personality,
    runContext: productRunContext,
    runtimeInstructions,
    settings,
    threadId: resolvedThreadId,
    workspaceRoot: resolvedWorkspaceRoot,
  });
  thread = ensuredThread.thread;
  resolvedThreadId = ensuredThread.threadId;
  if (typeof onThreadReady === "function") {
    await onThreadReady(resolvedThreadId);
  }
  const turnAttachments = (Array.isArray(attachments) ? attachments : [])
    .map((path) => firstString(path))
    .filter(Boolean);

  if (turnAttachments.length > 0) {
    console.log("[desktop:attachments] Adding selected files to turn/start input.", {
      attachments: turnAttachments,
      threadId: resolvedThreadId,
    });
  }

  const turnInput = buildTurnInput(promptText, turnAttachments, inputItems);
  const collaborationMode = buildCollaborationMode({
    mode: "default",
    model,
    reasoningEffort,
    serviceTier,
  });

  let turnResult;
  try {
    turnResult = await manager.request("turn/start", {
      approvalPolicy: executionOverrides.approvalPolicy,
      threadId: resolvedThreadId,
      cwd: runtimeCwd ?? null,
      collaborationMode,
      model: firstString(model) ?? DEFAULT_DESKTOP_MODEL,
      personality: normalizeDesktopPersonality(personality),
      reasoningEffort: firstString(reasoningEffort) ?? undefined,
      sandboxPolicy: turnSandboxPolicy,
      input: turnInput,
      settings: {
        sense1: {
          executionIntent,
          runContext: productRunContext,
          serviceTier: firstString(serviceTier) ?? "flex",
        },
      },
    });
  } catch (turnError) {
    const message = turnError instanceof Error ? turnError.message : String(turnError);
    if (/thread.*(not found|does not exist|unknown)/i.test(message)) {
      if (requestedExistingThreadId) {
        throw new Error("This thread is no longer available. Choose another thread or start a new task.");
      }
      const restartedThread = await ensureDesktopThread(manager, {
        contextPaths,
        cwd: resolvedCwd,
        executionIntent,
        model,
        personality,
        runContext: productRunContext,
        runtimeInstructions,
        settings,
        workspaceRoot: resolvedWorkspaceRoot,
      });
      thread = restartedThread.thread;
      resolvedThreadId = restartedThread.threadId;
      turnResult = await manager.request("turn/start", {
        approvalPolicy: executionOverrides.approvalPolicy,
        threadId: resolvedThreadId,
        cwd: runtimeCwd ?? null,
        collaborationMode,
        model: firstString(model) ?? DEFAULT_DESKTOP_MODEL,
        personality: normalizeDesktopPersonality(personality),
        reasoningEffort: firstString(reasoningEffort) ?? undefined,
        sandboxPolicy: turnSandboxPolicy,
        input: turnInput,
        settings: {
          sense1: {
            executionIntent,
            runContext: productRunContext,
            serviceTier: firstString(serviceTier) ?? "flex",
          },
        },
      });
    } else {
      throw turnError;
    }
  }

  const currentThread =
    thread ?? {
      id: resolvedThreadId,
      name: promptText,
      preview: promptText,
      updatedAt: Math.floor(Date.now() / 1000),
      status: {
        type: "active",
        activeFlags: ["running"],
      },
      cwd: resolvedCwd ?? undefined,
    };
  if (!currentThread) {
    throw new Error("Sense-1 could not describe the thread after starting the turn.");
  }

  const nextThread = {
    ...currentThread,
    preview: firstString(currentThread.preview, promptText) ?? currentThread.preview,
    updatedAt: Math.floor(Date.now() / 1000),
    status: {
      type: "active",
      activeFlags: ["running"],
    },
  };

  return {
    status: "started",
    cwd: resolvedCwd ?? null,
    workspaceRoot: resolvedWorkspaceRoot ?? null,
    runContext: productRunContext,
    permissionRequest: null,
    thread: normalizeDesktopThreadSummary(
      nextThread,
      resolvedWorkspaceRoot,
      resolveDesktopInteractionState({
        threadState: "running",
        workspaceRoot: resolvedWorkspaceRoot,
      }),
    ),
    threadId: resolvedThreadId,
    turnId: firstString(turnResult?.turn?.id),
  };
}

export async function ensureDesktopThread(
  manager,
  {
    cwd = null,
    contextPaths = [],
    executionIntent = null,
    model = null,
    personality = null,
    runContext = null,
    runtimeInstructions = null,
    settings = null,
    threadId = null,
    workspaceRoot = null,
  },
) {
  const resolvedThreadId = firstString(threadId);
  const resolvedWorkspaceRoot = firstString(workspaceRoot);
  const resolvedCwd = firstString(cwd, resolvedWorkspaceRoot);
  const productRunContext = normalizeRuntimeRunContext(runContext, {
    cwd: resolvedCwd,
    workspaceRoot: resolvedWorkspaceRoot,
  });
  if (!productRunContext?.actor || !productRunContext?.scope) {
    throw new Error("Add actor and scope metadata before starting the task.");
  }
  const executionContext = buildRunContext(
    {
      cwd: resolvedCwd,
      runContext: productRunContext,
      workspaceRoot: resolvedWorkspaceRoot,
    },
    resolvedWorkspaceRoot,
  );
  if (!executionContext) {
    throw new Error("Add actor and scope metadata before starting the task.");
  }

  let thread = null;
  let nextThreadId = resolvedThreadId;
  if (nextThreadId) {
    try {
      const resumeResult = await manager.request("thread/resume", {
        ...buildDesktopThreadRequest({
          cwd: resolvedCwd,
          contextPaths,
          executionContext,
          model,
          personality,
          runContext: productRunContext,
          runtimeInstructions,
          settings,
          workspaceRoot: resolvedWorkspaceRoot,
        }),
        threadId: nextThreadId,
      });
      thread = resumeResult?.thread ?? thread;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/\bno rollout found for thread id\b/i.test(message)) {
        throw error;
      }
    }
  } else {
    const startResult = await manager.request("thread/start", {
      ...buildDesktopThreadRequest({
        cwd: resolvedCwd,
        contextPaths,
        executionContext,
        model,
        personality,
        runContext: productRunContext,
        runtimeInstructions,
        settings,
        workspaceRoot: resolvedWorkspaceRoot,
      }),
      settings: {
        sense1: {
          runContext: productRunContext,
        },
      },
    });
    thread = startResult?.thread ?? null;
    nextThreadId = firstString(thread?.id);
  }

  if (!nextThreadId) {
    throw new Error("Sense-1 could not start a new thread.");
  }

  const currentThread =
    thread ?? {
      id: nextThreadId,
      name: resolvedThreadId ? "Current thread" : "New task",
      preview: resolvedThreadId ? "Current thread" : "New task",
      updatedAt: Math.floor(Date.now() / 1000),
      status: {
        type: "active",
        activeFlags: [],
      },
      cwd: resolvedCwd ?? undefined,
    };

  return {
    thread: currentThread,
    threadId: nextThreadId,
    threadSummary: normalizeDesktopThreadSummary(currentThread, resolvedWorkspaceRoot),
  };
}
