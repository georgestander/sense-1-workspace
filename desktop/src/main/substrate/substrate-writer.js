import {
  upsertSubstrateQuestion,
  appendSubstrateEvent,
  appendSubstrateObjectRef,
  ingestSubstratePlanSuggestion,
  updateSubstrateSessionThreadTitle,
  updateSubstrateSessionReviewSummary,
} from "./substrate.js";
import {
  asRecord,
  buildCommandActivity,
  buildFileReadActivities,
  buildFileWriteActivities,
  buildInputPrompt,
  collectItemText,
  firstString,
  normalizeCommand,
  normalizeInputQuestions,
  resolveDiffPaths,
  resolveFileChangePaths,
  resolveReviewSummary,
  TOOL_ITEM_TYPES,
  TRACKED_RUNTIME_METHODS,
} from "./substrate-writer-runtime-items.js";
import { buildPlanState } from "../session/plan-state.ts";

async function notifyHook(handler, payload) {
  if (typeof handler !== "function") {
    return;
  }

  try {
    await handler(payload);
  } catch {
    // Hooks are best-effort. The substrate write should keep going.
  }
}

export async function writeRuntimeMessageToSubstrate({
  dbPath,
  onRuntimeActivity = null,
  onSessionRecordUpdate = null,
  message,
  receivedAt = null,
  resolveSessionContextByThreadId,
}) {
  const method = firstString(message?.method);
  if (!method) {
    return { status: "ignored", threadId: null };
  }

  const params = asRecord(message?.params);
  const threadId = firstString(params?.threadId);
  if (!TRACKED_RUNTIME_METHODS.has(method)) {
    return { status: "ignored", threadId };
  }

  if (!threadId || typeof resolveSessionContextByThreadId !== "function") {
    return { status: "ignored", threadId };
  }

  const session = await resolveSessionContextByThreadId(threadId);
  if (!session) {
    return { status: "deferred", threadId };
  }

  const engineTurnId = firstString(params?.turnId);
  const ts = firstString(receivedAt) || new Date().toISOString();

  if (method === "thread/name/updated") {
    const updatedSession = await updateSubstrateSessionThreadTitle({
      codexThreadId: threadId,
      dbPath,
      title: firstString(params?.name),
    });
    return {
      status: updatedSession ? "written" : "ignored",
      threadId,
    };
  }

  if (method === "turn/started") {
    await appendSubstrateEvent({
      actorId: session.actor_id,
      afterState: {
        status: "running",
      },
      correlationId: threadId,
      dbPath,
      detail: {
        threadId,
      },
      engineTurnId,
      profileId: session.profile_id,
      scopeId: session.scope_id,
      sessionId: session.id,
      subjectId: session.id,
      subjectType: "session",
      ts,
      verb: "turn.started",
    });
    return { status: "written", threadId };
  }

  if (method === "turn/completed") {
    await appendSubstrateEvent({
      actorId: session.actor_id,
      afterState: {
        status: firstString(params?.status) || "completed",
      },
      correlationId: threadId,
      dbPath,
      detail: {
        threadId,
      },
      engineTurnId,
      profileId: session.profile_id,
      scopeId: session.scope_id,
      sessionId: session.id,
      subjectId: session.id,
      subjectType: "session",
      ts,
      verb: "turn.completed",
    });
    return { status: "written", threadId };
  }

  if (method === "turn/plan/updated") {
    const planState = buildPlanState(params);
    if (!planState.text && planState.planSteps.length === 0) {
      return { status: "ignored", threadId };
    }
    const persistedPlanText = firstString(params?.text)
      ?? (
        planState.steps.length > 0
          ? planState.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")
          : planState.text
      );

    await ingestSubstratePlanSuggestion({
      actorId: session.actor_id,
      dbPath,
      metadata: {
        sourceEvent: "turn/plan/updated",
      },
      planData: params,
      planText: persistedPlanText,
      prompt: firstString(session.summary, session.title),
      sessionId: session.id,
      source: "engine",
      turnId: engineTurnId,
      now: ts,
    });
    return { status: "written", threadId };
  }

  if (method === "tool/requestUserInput") {
    const requestId = Number.isInteger(message?.id) ? message.id : null;
    const questions = normalizeInputQuestions(params?.questions);
    const prompt = buildInputPrompt(questions, firstString(params?.prompt, params?.question, params?.text));
    const targetId = engineTurnId || session.id;
    const question = await upsertSubstrateQuestion({
      actorId: session.actor_id,
      codexThreadId: threadId,
      dbPath,
      engineTurnId,
      metadata: {
        questions,
        source: "tool/requestUserInput",
        threadId,
      },
      profileId: session.profile_id,
      prompt,
      requestId,
      scopeId: session.scope_id,
      sessionId: session.id,
      status: "pending",
      targetId,
      targetKind: "pending_run",
      targetSnapshot: {
        sessionId: session.id,
        threadId,
        turnId: engineTurnId,
      },
      ts,
    });
    await appendSubstrateEvent({
      actorId: session.actor_id,
      afterState: {
        status: "pending",
      },
      correlationId: threadId,
      dbPath,
      detail: {
        prompt,
        questions,
        requestId,
        targetId,
        targetKind: "pending_run",
        threadId,
      },
      engineTurnId,
      profileId: session.profile_id,
      scopeId: session.scope_id,
      sessionId: session.id,
      subjectId: question.id,
      subjectType: "question",
      ts,
      verb: "question.asked",
    });
    await appendSubstrateObjectRef({
      action: "requested",
      dbPath,
      metadata: {
        prompt,
        questions,
        requestId,
        status: "pending",
        targetId,
        targetKind: "pending_run",
      },
      refId: question.id,
      refType: "question",
      sessionId: session.id,
      ts,
    });
    return { status: "written", threadId };
  }

  if (method === "turn/diff/updated") {
    const diffs = resolveDiffPaths(params);
    if (diffs.length > 0) {
      await notifyHook(onSessionRecordUpdate, {
        logCursor: {
          toTs: ts,
        },
        pathsWritten: diffs.map((diff) => diff.path),
        sessionId: session.id,
        threadId,
      });
    }
    for (const diff of diffs) {
      await appendSubstrateObjectRef({
        action: "modified",
        dbPath,
        metadata: {
          hunkCount: diff.hunkCount,
          source: "turn/diff/updated",
        },
        refPath: diff.path,
        refType: "file",
        sessionId: session.id,
        ts,
      });
      await appendSubstrateEvent({
        actorId: session.actor_id,
        correlationId: threadId,
        dbPath,
        detail: {
          action: "modified",
          hunkCount: diff.hunkCount,
          path: diff.path,
          source: "turn/diff/updated",
        },
        engineTurnId,
        profileId: session.profile_id,
        scopeId: session.scope_id,
        sessionId: session.id,
        subjectId: diff.path,
        subjectType: "file",
        ts,
        verb: "file.write",
      });
      await appendSubstrateEvent({
        actorId: session.actor_id,
        afterState: {
          change_kind: "modified",
        },
        correlationId: threadId,
        dbPath,
        detail: {
          hunkCount: diff.hunkCount,
          source: "turn/diff/updated",
        },
        engineTurnId,
        profileId: session.profile_id,
        scopeId: session.scope_id,
        sessionId: session.id,
        subjectId: diff.path,
        subjectType: "file",
        ts,
        verb: "file.changed",
      });
    }
    return {
      status: diffs.length > 0 ? "written" : "ignored",
      threadId,
    };
  }

  const item = asRecord(params?.item);
  if (!item) {
    return { status: "ignored", threadId };
  }

  const itemId = firstString(item.id);
  const itemType = firstString(item.type);
  if (!itemId || !itemType) {
    return { status: "ignored", threadId };
  }

  if (itemType === "commandExecution") {
    const activity = buildCommandActivity({
      command: normalizeCommand(item.command),
      cwd: firstString(item.cwd),
      durationMs: Number.isFinite(item.durationMs) ? item.durationMs : null,
      exitCode: Number.isFinite(item.exitCode) ? item.exitCode : null,
      itemId,
      itemStatus: firstString(item.status),
      sessionId: session.id,
      threadId,
      ts,
    });
    await notifyHook(onRuntimeActivity, activity);
    await appendSubstrateEvent({
      actorId: session.actor_id,
      correlationId: threadId,
      dbPath,
      detail: activity.detail,
      engineItemId: itemId,
      engineTurnId,
      profileId: session.profile_id,
      scopeId: session.scope_id,
      sessionId: session.id,
      subjectId: activity.subjectId,
      subjectType: activity.subjectType,
      ts,
      verb: activity.kind,
    });
    return { status: "written", threadId };
  }

  if (itemType === "fileChange") {
    const changes = resolveFileChangePaths(item);
    const activities = buildFileWriteActivities({
      changes,
      itemId,
      itemStatus: firstString(item.status),
      sessionId: session.id,
      threadId,
      ts,
    });
    for (const activity of activities) {
      await notifyHook(onRuntimeActivity, activity);
    }
    if (activities.length > 0) {
      await notifyHook(onSessionRecordUpdate, {
        logCursor: {
          toTs: ts,
        },
        pathsWritten: activities.map((activity) => activity.subjectId),
        sessionId: session.id,
        threadId,
      });
    }
    for (const change of changes) {
      const activity = activities.find((entry) => entry.subjectId === change.path);
      await appendSubstrateObjectRef({
        action: change.kind,
        dbPath,
        metadata: {
          itemId,
          source: "item/completed",
          status: firstString(item.status),
        },
        refId: itemId,
        refPath: change.path,
        refType: "file",
        sessionId: session.id,
        ts,
      });
      if (activity) {
        await appendSubstrateEvent({
          actorId: session.actor_id,
          correlationId: threadId,
          dbPath,
          detail: activity.detail,
          engineItemId: itemId,
          engineTurnId,
          profileId: session.profile_id,
          scopeId: session.scope_id,
          sessionId: session.id,
          subjectId: activity.subjectId,
          subjectType: activity.subjectType,
          ts,
          verb: activity.kind,
        });
      }
    }
    return {
      status: changes.length > 0 ? "written" : "ignored",
      threadId,
    };
  }

  if (itemType === "agentMessage") {
    const fileReadActivities = buildFileReadActivities({
      text: collectItemText(item),
      itemId,
      sessionId: session.id,
      threadId,
      ts,
    });
    for (const activity of fileReadActivities) {
      await notifyHook(onRuntimeActivity, activity);
      await appendSubstrateEvent({
        actorId: session.actor_id,
        correlationId: threadId,
        dbPath,
        detail: activity.detail,
        engineItemId: itemId,
        engineTurnId,
        profileId: session.profile_id,
        scopeId: session.scope_id,
        sessionId: session.id,
        subjectId: activity.subjectId,
        subjectType: activity.subjectType,
        ts,
        verb: activity.kind,
      });
    }
    if (fileReadActivities.length > 0) {
      return { status: "written", threadId };
    }
  }

  if (TOOL_ITEM_TYPES.has(itemType)) {
    await appendSubstrateEvent({
      actorId: session.actor_id,
      correlationId: threadId,
      dbPath,
      detail: {
        itemType,
        path: firstString(item.path),
        query: firstString(item.query),
        status: firstString(item.status),
        tool: firstString(item.tool),
      },
      engineItemId: itemId,
      engineTurnId,
      profileId: session.profile_id,
      scopeId: session.scope_id,
      sessionId: session.id,
      subjectId: itemId,
      subjectType: "tool",
      ts,
      verb: "tool.completed",
    });
    return { status: "written", threadId };
  }

  if (itemType === "exitedReviewMode") {
    const summary = resolveReviewSummary(item);
    await updateSubstrateSessionReviewSummary({
      dbPath,
      sessionId: session.id,
      summary,
      updatedAt: ts,
    });
    await appendSubstrateEvent({
      actorId: session.actor_id,
      correlationId: threadId,
      dbPath,
      detail: {
        summary,
      },
      engineItemId: itemId,
      engineTurnId,
      profileId: session.profile_id,
      scopeId: session.scope_id,
      sessionId: session.id,
      subjectId: session.id,
      subjectType: "session",
      ts,
      verb: "review.completed",
    });
    return { status: "written", threadId };
  }

  return { status: "ignored", threadId };
}
