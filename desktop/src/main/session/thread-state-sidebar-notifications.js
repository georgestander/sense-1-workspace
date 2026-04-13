import { buildPlanState } from "./plan-state.ts";
import {
  maybeInteractionStateChanged,
  shouldSurfaceTurnPlanUpdate,
} from "./thread-interaction-state.js";
import {
  buildInputPrompt,
  normalizeInputQuestions,
} from "./thread-input-request-formatting.js";
import {
  mergeDiffEntries,
  resolveDiffEntries,
  reviewArtifactsFromDiffs,
} from "./thread-diff-utils.js";
import {
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

function normalizePlanStateSignature(planState) {
  if (!planState) {
    return "null";
  }

  return JSON.stringify({
    explanation: planState.explanation ?? null,
    planSteps: Array.isArray(planState.planSteps)
      ? planState.planSteps.map((step) => ({
          step: firstString(step?.step),
          status: firstString(step?.status),
        }))
      : [],
    text: planState.text ?? null,
  });
}

export function applySidebarNotification({
  buffer,
  message,
  method,
  params,
  threadId,
}) {
  if (method === "turn/plan/updated") {
    const previousPlanSignature = normalizePlanStateSignature(buffer.planState);
    const planState = buildPlanState(params, {
      runContext: asRecord(params?.runContext),
      workspaceRoot: firstString(params?.workspaceRoot, buffer.workspaceRoot),
    });
    const shouldSurface = shouldSurfaceTurnPlanUpdate(buffer, planState);
    if (!shouldSurface) {
      return [];
    }

    const nextPlanSignature = normalizePlanStateSignature(planState);
    const planText = planState.text;
    const planSteps = planState.steps;

    buffer.planState = planState;
    buffer.planStateVisible = true;
    buffer.updatedAt = new Date().toISOString();
    buffer.inputRequestState = null;
    const interactionDelta = maybeInteractionStateChanged(buffer, threadId);

    return [
      ...(previousPlanSignature !== nextPlanSignature
        ? [{
            kind: "planUpdated",
            threadId,
            planText,
            planSteps,
            planScopeSummary: planState.scopeSummary,
            planExpectedOutputSummary: planState.expectedOutputSummary,
            planState,
          }]
        : []),
      ...(interactionDelta ? [interactionDelta] : []),
    ];
  }

  if (method === "turn/diff/updated") {
    const diffs = mergeDiffEntries(
      buffer.diffState?.diffs,
      resolveDiffEntries(params?.diff ?? params?.diffs),
    );
    if (diffs.length === 0) {
      return [];
    }

    buffer.diffState = { diffs };
    buffer.updatedAt = new Date().toISOString();
    buffer.reviewArtifacts = dedupeReviewArtifacts([
      ...buffer.reviewArtifacts,
      ...reviewArtifactsFromDiffs(diffs, buffer.updatedAt),
    ]);
    const interactionDelta = maybeInteractionStateChanged(buffer, threadId);

    return [
      {
        kind: "diffUpdated",
        threadId,
        diffs,
      },
      ...(interactionDelta ? [interactionDelta] : []),
    ];
  }

  if (method === "tool/requestUserInput" || method === "item/tool/requestUserInput") {
    const requestId = typeof message?.id === "number" ? message.id : null;
    const questions = normalizeInputQuestions(params?.questions);
    const prompt = buildInputPrompt(
      questions,
      firstString(params?.prompt, params?.question, params?.text),
    );
    buffer.inputRequestState = {
      requestId,
      prompt,
      threadId,
      questions,
    };
    const interactionDelta = maybeInteractionStateChanged(buffer, threadId);

    return [
      {
        kind: "inputRequested",
        threadId,
        requestId,
        prompt: buffer.inputRequestState.prompt,
        questions: buffer.inputRequestState.questions,
      },
      ...(interactionDelta ? [interactionDelta] : []),
    ];
  }

  if (method === "thread/name/updated") {
    const name = firstString(params?.name);
    if (name) {
      buffer.title = name;
      buffer.updatedAt = new Date().toISOString();
    }

    return [
      {
        kind: "threadMetadataChanged",
        threadId,
        title: buffer.title,
        updatedAt: buffer.updatedAt,
      },
    ];
  }

  return null;
}
