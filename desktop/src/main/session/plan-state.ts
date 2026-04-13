import type { DesktopPlanState, DesktopPlanStep, DesktopRunContext } from "../contracts";

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as LooseRecord;
}

function firstString(...values: unknown[]): string | null {
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

function sanitizePlanLine(value: unknown): string | null {
  const text = firstString(value);
  if (!text) {
    return null;
  }

  return text.replace(/^\s*[-*()[\]0-9.]+\s*/, "").trim() || null;
}

function extractTextList(value: unknown): string[] {
  if (typeof value === "string") {
    const line = sanitizePlanLine(value);
    return line ? [line] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      const line = sanitizePlanLine(entry);
      return line ? [line] : [];
    }

    const record = asRecord(entry);
    const line = sanitizePlanLine(
      firstString(
        record?.text,
        record?.title,
        record?.summary,
        record?.description,
        record?.name,
        record?.label,
      ),
    );
    return line ? [line] : [];
  });
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function joinEnglishList(items: string[]): string {
  const values = items.filter(Boolean);
  if (values.length === 0) {
    return "";
  }

  if (values.length === 1) {
    return values[0]!;
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function coerceSentence(value: unknown): string | null {
  const text = firstString(value);
  if (!text) {
    return null;
  }

  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function extractPlanRecord(source: LooseRecord | null | undefined): {
  source: LooseRecord | null;
  nestedPlan: LooseRecord | null;
} {
  const record = asRecord(source);
  return {
    source: record,
    nestedPlan: asRecord(record?.plan),
  };
}

function normalizePlanStepStatus(value: unknown): DesktopPlanStep["status"] {
  const resolved = firstString(value);
  if (resolved === "inProgress" || resolved === "in_progress") {
    return "inProgress";
  }

  if (resolved === "completed" || resolved === "complete" || resolved === "done") {
    return "completed";
  }

  return "pending";
}

function normalizeStructuredPlanStep(value: unknown): DesktopPlanStep | null {
  const record = asRecord(value);
  if (!record) {
    const text = sanitizePlanLine(value);
    return text ? { step: text, status: "pending" } : null;
  }

  const text = sanitizePlanLine(
    firstString(
      record.step,
      record.text,
      record.title,
      record.summary,
      record.description,
      record.name,
      record.label,
    ),
  );
  if (!text) {
    return null;
  }

  return {
    step: text,
    status: normalizePlanStepStatus(record.status),
  };
}

function isPlanStep(value: DesktopPlanStep | null): value is DesktopPlanStep {
  return value !== null;
}

function normalizeStructuredPlanStepList(value: unknown): DesktopPlanStep[] {
  if (typeof value === "string") {
    const line = sanitizePlanLine(value);
    return line ? [{ step: line, status: "pending" }] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => normalizeStructuredPlanStep(entry)).filter(isPlanStep);
}

function uniqueStructuredPlanSteps(values: DesktopPlanStep[]): DesktopPlanStep[] {
  const deduped = new Map<string, DesktopPlanStep>();
  for (const value of values) {
    if (!value || !firstString(value.step)) {
      continue;
    }

    deduped.set(value.step.toLowerCase(), value);
  }

  return Array.from(deduped.values());
}

function splitPlanSteps(text: unknown): DesktopPlanStep[] {
  const resolvedText = firstString(text);
  if (!resolvedText) {
    return [];
  }

  return resolvedText
    .split("\n")
    .map((line) => sanitizePlanLine(line))
    .filter((line): line is string => Boolean(line))
    .map((step) => ({ step, status: "pending" }));
}

function buildStepText(steps: string[]): string {
  return steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
}

function buildPlanText(planSteps: string[], explanation: string | null = null): string | null {
  const stepText = buildStepText(planSteps);
  const resolvedExplanation = firstString(explanation);
  if (!resolvedExplanation) {
    return stepText || null;
  }

  return stepText ? `${resolvedExplanation}\n\n${stepText}` : resolvedExplanation;
}

function extractPlanText(record: { source: LooseRecord | null; nestedPlan: LooseRecord | null }): string | null {
  return firstString(
    record.source?.text,
    record.nestedPlan?.text,
    record.nestedPlan?.summary,
    record.source?.summary,
  );
}

function extractPlanStepsFromRecord(
  record: { source: LooseRecord | null; nestedPlan: LooseRecord | null },
  explicitText: string | null = null,
): DesktopPlanStep[] {
  const structuredSteps = uniqueStructuredPlanSteps([
    ...normalizeStructuredPlanStepList(record.source?.plan),
    ...normalizeStructuredPlanStepList(record.nestedPlan?.plan),
    ...normalizeStructuredPlanStepList(record.source?.planSteps),
    ...normalizeStructuredPlanStepList(record.nestedPlan?.planSteps),
    ...normalizeStructuredPlanStepList(record.source?.steps),
    ...normalizeStructuredPlanStepList(record.nestedPlan?.steps),
    ...normalizeStructuredPlanStepList(record.source?.items),
    ...normalizeStructuredPlanStepList(record.nestedPlan?.items),
    ...normalizeStructuredPlanStepList(record.source?.actions),
    ...normalizeStructuredPlanStepList(record.nestedPlan?.actions),
    ...normalizeStructuredPlanStepList(record.source?.intendedActions),
    ...normalizeStructuredPlanStepList(record.nestedPlan?.intendedActions),
    ...normalizeStructuredPlanStepList(record.source?.intended_actions),
    ...normalizeStructuredPlanStepList(record.nestedPlan?.intended_actions),
    ...splitPlanSteps(explicitText),
  ]);

  return structuredSteps;
}

function extractExpectedOutputs(record: { source: LooseRecord | null; nestedPlan: LooseRecord | null }): string[] {
  return uniqueStrings([
    ...extractTextList(record.source?.expectedOutputs),
    ...extractTextList(record.nestedPlan?.expectedOutputs),
    ...extractTextList(record.source?.expected_outputs),
    ...extractTextList(record.nestedPlan?.expected_outputs),
    ...extractTextList(record.source?.expectedOutput),
    ...extractTextList(record.nestedPlan?.expectedOutput),
    ...extractTextList(record.source?.expected_output),
    ...extractTextList(record.nestedPlan?.expected_output),
    ...extractTextList(record.source?.outputs),
    ...extractTextList(record.nestedPlan?.outputs),
    ...extractTextList(record.source?.deliverables),
    ...extractTextList(record.nestedPlan?.deliverables),
  ]);
}

function extractScopeHint(record: { source: LooseRecord | null; nestedPlan: LooseRecord | null }): string | null {
  return firstString(
    record.source?.scopeSummary,
    record.nestedPlan?.scopeSummary,
    record.source?.scope_summary,
    record.nestedPlan?.scope_summary,
  );
}

function describePlanFocus(steps: string[], planText: string | null): string | null {
  if (steps.length > 0) {
    return coerceSentence(`Focus on ${joinEnglishList(steps.slice(0, 3))}`);
  }

  const text = firstString(planText);
  if (!text) {
    return null;
  }

  const firstSentence = text.split(/(?<=[.!?])\s+/)[0]?.trim() || text;
  return coerceSentence(`Focus on ${firstSentence.replace(/[.!?]+$/, "")}`);
}

function buildScopeSummary({
  runContext = null,
  workspaceRoot = null,
  steps = [],
  planText = null,
  scopeHint = null,
}: {
  runContext?: DesktopRunContext | null;
  workspaceRoot?: string | null;
  steps?: string[];
  planText?: string | null;
  scopeHint?: string | null;
} = {}): string {
  const scopeLabel = firstString(runContext?.scope?.displayName, runContext?.scope?.id);
  const actorLabel = firstString(runContext?.actor?.displayName, runContext?.actor?.email);
  const scopeLead = workspaceRoot
    ? `This run is scoped to work inside ${workspaceRoot}`
    : "This run is scoped to chat-only work";
  const scopeContext = scopeLabel ? `${scopeLead} in ${scopeLabel}` : scopeLead;
  const scopeOwner = actorLabel ? `${scopeContext} for ${actorLabel}.` : `${scopeContext}.`;
  const focus = coerceSentence(scopeHint) ?? describePlanFocus(steps, planText);
  return [scopeOwner, focus].filter(Boolean).join(" ");
}

function buildExpectedOutputSummary({
  workspaceRoot = null,
  expectedOutputs = [],
  steps = [],
}: {
  workspaceRoot?: string | null;
  expectedOutputs?: string[];
  steps?: string[];
} = {}): string {
  if (expectedOutputs.length > 0) {
    return coerceSentence(`Expected output: ${joinEnglishList(expectedOutputs.slice(0, 3))}`) ?? "Expected output: a clear plain-English response.";
  }

  if (steps.length > 0) {
    return workspaceRoot
      ? coerceSentence(`Expected output: completed work in ${workspaceRoot} that covers ${joinEnglishList(steps.slice(0, 3))}`) ?? "Expected output: completed work plus a plain-English summary."
      : coerceSentence(`Expected output: a clear response that covers ${joinEnglishList(steps.slice(0, 3))}`) ?? "Expected output: a clear plain-English response.";
  }

  return workspaceRoot
    ? `Expected output: completed work in ${workspaceRoot} plus a plain-English summary of what changed.`
    : "Expected output: a clear plain-English response.";
}

export function buildPlanState(
  source: LooseRecord | null | undefined,
  { runContext = null, workspaceRoot = null }: { runContext?: DesktopRunContext | null; workspaceRoot?: string | null } = {},
): DesktopPlanState {
  const record = extractPlanRecord(source);
  const text = extractPlanText(record);
  const planSteps = extractPlanStepsFromRecord(record, text);
  const steps = planSteps.map((step) => step.step);
  const explanation = firstString(
    record.source?.explanation,
    record.nestedPlan?.explanation,
    record.source?.summary,
    record.nestedPlan?.summary,
  );
  const resolvedText = text ?? buildPlanText(steps, explanation);
  const expectedOutputs = extractExpectedOutputs(record);
  const scopeHint = extractScopeHint(record);

  return {
    explanation,
    text: resolvedText,
    steps,
    planSteps,
    scopeSummary: buildScopeSummary({
      planText: resolvedText,
      runContext,
      scopeHint,
      steps,
      workspaceRoot,
    }),
    expectedOutputSummary: buildExpectedOutputSummary({
      expectedOutputs,
      steps,
      workspaceRoot,
    }),
  };
}

export function extractPlanSteps(source: LooseRecord | null | undefined): string[] {
  return buildPlanState(source).steps;
}
