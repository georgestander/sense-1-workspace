import test from "node:test";
import assert from "node:assert/strict";

import { buildPlanState } from "./plan-state.ts";

test("buildPlanState derives user-facing scope and expected output summaries from runtime context", () => {
  const planState = buildPlanState(
    {
      text: "1. Inspect the workspace\n2. Update the task flow",
    },
    {
      runContext: {
        actor: {
          displayName: "George",
          email: "george@example.com",
        },
        scope: {
          displayName: "ops-team private",
          id: "scope_ops-team_private",
        },
      },
      workspaceRoot: "/tmp/project",
    },
  );

  assert.deepEqual(planState, {
    explanation: null,
    text: "1. Inspect the workspace\n2. Update the task flow",
    steps: ["Inspect the workspace", "Update the task flow"],
    planSteps: [
      { step: "Inspect the workspace", status: "pending" },
      { step: "Update the task flow", status: "pending" },
    ],
    scopeSummary: "This run is scoped to work inside /tmp/project in ops-team private for George. Focus on Inspect the workspace and Update the task flow.",
    expectedOutputSummary: "Expected output: completed work in /tmp/project that covers Inspect the workspace and Update the task flow.",
  });
});

test("buildPlanState prefers explicit expected outputs when present", () => {
  const planState = buildPlanState({
    steps: ["Update the plan card", "Add validation"],
    expectedOutputs: ["A clear plan summary", "A clear expected output summary"],
  });

  assert.equal(
    planState.expectedOutputSummary,
    "Expected output: A clear plan summary and A clear expected output summary.",
  );
});

test("buildPlanState preserves structured plan step statuses and explanation text", () => {
  const planState = buildPlanState({
    explanation: "Validate the staging path first.",
    plan: [
      { step: "Inspect the staging config", status: "completed" },
      { step: "Confirm the deployment target", status: "inProgress" },
    ],
  });

  assert.deepEqual(planState.planSteps, [
    { step: "Inspect the staging config", status: "completed" },
    { step: "Confirm the deployment target", status: "inProgress" },
  ]);
  assert.equal(planState.explanation, "Validate the staging path first.");
  assert.equal(
    planState.text,
    "Validate the staging path first.\n\n1. Inspect the staging config\n2. Confirm the deployment target",
  );
});

test("buildPlanState normalizes structured plan status aliases", () => {
  const planState = buildPlanState({
    plan: [
      { step: "Inspect the staging config", status: "done" },
      { step: "Confirm the deployment target", status: "in_progress" },
      { step: "Queue release notes", status: "complete" },
    ],
  });

  assert.deepEqual(planState.planSteps, [
    { step: "Inspect the staging config", status: "completed" },
    { step: "Confirm the deployment target", status: "inProgress" },
    { step: "Queue release notes", status: "completed" },
  ]);
});
