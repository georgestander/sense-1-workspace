import path from "node:path";

import { buildPlanState } from "../session/plan-state.ts";

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

function stripPlanListPrefix(value) {
  const resolved = firstString(value);
  if (!resolved) {
    return null;
  }

  return resolved.replace(/^\s*[-*]\s+/, "").replace(/^\s*\d+[.)]\s+/, "").trim() || null;
}

function parsePlanSteps(planText) {
  const resolvedPlanText = firstString(planText);
  if (!resolvedPlanText) {
    return [];
  }

  return resolvedPlanText
    .split("\n")
    .map((line) => stripPlanListPrefix(line))
    .filter(Boolean);
}

function hasStructuredPlanPayload(planData) {
  const record = planData && typeof planData === "object" ? planData : null;
  if (!record) {
    return false;
  }

  if (Array.isArray(record.plan) || Array.isArray(record.planSteps) || Array.isArray(record.steps)) {
    return true;
  }

  const nestedPlan = record.plan && typeof record.plan === "object" ? record.plan : null;
  return Boolean(
    Array.isArray(nestedPlan?.plan)
      || Array.isArray(nestedPlan?.planSteps)
      || Array.isArray(nestedPlan?.steps),
  );
}

function resolvePlanDefaultLocations({ existingPlan = null, session = null } = {}) {
  const metadata = session?.metadata && typeof session.metadata === "object" ? session.metadata : {};
  const fallbackLocations = [
    firstString(metadata.workspaceRoot),
    firstString(metadata.artifactRoot),
    ...(Array.isArray(existingPlan?.affected_locations) ? existingPlan.affected_locations : []),
  ]
    .filter(Boolean)
    .map((entry) => path.resolve(entry));

  return Array.from(new Set(fallbackLocations));
}

function normalizePlanRequestSummary(value) {
  const summary = firstString(value);
  if (!summary) {
    return null;
  }

  return /[.!?]$/.test(summary) ? summary : `${summary}.`;
}

export function normalizePlanSuggestion({
  existingPlan = null,
  metadata = null,
  planData = null,
  planText = null,
  prompt = null,
  session = null,
  source = "product",
  turnId = null,
}) {
  const nativePlanState = buildPlanState(
    planData && typeof planData === "object"
      ? planData
      : firstString(planText)
        ? { text: planText }
        : null,
    {
      workspaceRoot: null,
    },
  );
  const resolvedPlanText = firstString(planText, nativePlanState.text);
  const hasNativePlanSteps = nativePlanState.planSteps.length > 0;
  const promptText = firstString(prompt, existingPlan?.request_summary, session?.summary, session?.title);
  const requestSummary = normalizePlanRequestSummary(promptText);
  const intendedActions =
    hasNativePlanSteps
      ? nativePlanState.steps
      : (() => {
          const planSteps = parsePlanSteps(resolvedPlanText);
          if (planSteps.length > 0) {
            return planSteps;
          }

          if (Array.isArray(existingPlan?.intended_actions) && existingPlan.intended_actions.length > 0) {
            return existingPlan.intended_actions;
          }

          return [];
        })();
  const assumptions =
    resolvedPlanText || hasNativePlanSteps
      ? []
      : Array.isArray(existingPlan?.assumptions)
        ? existingPlan.assumptions
        : [];
  const affectedLocations =
    (() => {
      const defaults = resolvePlanDefaultLocations({ existingPlan, session });
      return defaults.length > 0 ? defaults : [];
    })();
  const mergedMetadata =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...metadata }
      : {};
  const normalizedPlanSteps =
    Array.isArray(mergedMetadata.plan) && mergedMetadata.plan.length > 0
      ? mergedMetadata.plan
      : nativePlanState.planSteps;
  const normalizedExplanation = firstString(mergedMetadata.explanation, nativePlanState.explanation);

  return {
    affectedLocations,
    assumptions,
    intendedActions,
    metadata: {
      ...(existingPlan?.metadata ?? {}),
      ...mergedMetadata,
      ...(normalizedExplanation ? { explanation: normalizedExplanation } : {}),
      ...(normalizedPlanSteps.length > 0 ? { plan: normalizedPlanSteps } : {}),
      fallbackGenerated: !(resolvedPlanText || intendedActions.length > 0),
      normalizationVersion: 1,
      source: firstString(source) ?? "product",
      sourceTurnId: firstString(turnId),
      structuredSource: mergedMetadata.structuredSource === true || hasStructuredPlanPayload(planData),
      sourcePlanText: resolvedPlanText ?? null,
    },
    requestSummary,
    status: resolvedPlanText || intendedActions.length > 0 ? "ready_for_approval" : "generating",
  };
}
