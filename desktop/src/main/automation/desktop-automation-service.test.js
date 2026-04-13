import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { computeNextRunAt, DesktopAutomationService } from "./desktop-automation-service.ts";

function createTestEnv(runtimeRoot) {
  return {
    ...process.env,
    SENSE1_ARTIFACT_ROOT: path.join(runtimeRoot, "visible-artifacts"),
    SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
  };
}

async function makeTempRoot() {
  const root = path.join(os.tmpdir(), `automation-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await fs.mkdir(root, { recursive: true });
  return root;
}

function createService(env) {
  return new DesktopAutomationService({
    env,
    resolveProfile: async () => ({ id: "default" }),
  });
}

test("saveAutomation avoids slug collisions when creating automations with the same name", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const service = createService(env);

  const first = await service.saveAutomation({
    name: "Daily Brief",
    prompt: "Prepare a daily brief",
    status: "ACTIVE",
    rrule: "RRULE:FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0",
    model: "gpt-5.4-mini",
    reasoningEffort: "medium",
    executionEnvironment: "worktree",
    cwds: ["/tmp/project-a"],
  });
  const second = await service.saveAutomation({
    name: "Daily Brief",
    prompt: "Prepare another daily brief",
    status: "ACTIVE",
    rrule: "RRULE:FREQ=WEEKLY;BYDAY=TU;BYHOUR=9;BYMINUTE=0",
    model: "gpt-5.4-mini",
    reasoningEffort: "medium",
    executionEnvironment: "worktree",
    cwds: ["/tmp/project-b"],
  });

  assert.equal(first.automation.id, "daily-brief");
  assert.equal(second.automation.id, "daily-brief-2");

  const listed = await service.listAutomations();
  assert.deepEqual(
    listed.automations.map((automation) => automation.id).sort(),
    ["daily-brief", "daily-brief-2"],
  );
});

test("recordAutomationRun preserves started runs without forcing a terminal state", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const service = createService(env);

  const detail = await service.saveAutomation({
    name: "Weekly Sync",
    prompt: "Open the weekly sync thread",
    status: "ACTIVE",
    rrule: "RRULE:FREQ=WEEKLY;BYDAY=FR;BYHOUR=16;BYMINUTE=0",
    model: "gpt-5.4-mini",
    reasoningEffort: "medium",
    executionEnvironment: "local",
    cwds: ["/tmp/project"],
  });

  const updated = await service.recordAutomationRun(detail.automation.id, {
    startedAt: "2026-04-09T10:00:00.000Z",
    finishedAt: null,
    status: "started",
    threadId: "thread-automation-1",
    note: "Started from the Automations page.",
  });

  assert.equal(updated.automation.lastRunStatus, "started");
  assert.equal(updated.automation.lastRunAt, "2026-04-09T10:00:00.000Z");
  assert.equal(updated.runs[0]?.finishedAt, null);
  assert.equal(updated.runs[0]?.threadId, "thread-automation-1");
});

test("saveAutomation computes a next run for daily schedules", async () => {
  const root = await makeTempRoot();
  const env = createTestEnv(root);
  const service = createService(env);
  const now = new Date();
  const target = new Date(now);
  target.setHours(target.getHours() + 2);
  const hour = target.getHours().toString().padStart(2, "0");
  const minute = target.getMinutes().toString().padStart(2, "0");

  const detail = await service.saveAutomation({
    name: "Daily Check",
    prompt: "Prepare the daily check",
    status: "ACTIVE",
    rrule: `RRULE:FREQ=DAILY;BYHOUR=${Number.parseInt(hour, 10)};BYMINUTE=${Number.parseInt(minute, 10)}`,
    model: "gpt-5.4-mini",
    reasoningEffort: "medium",
    executionEnvironment: "local",
    cwds: ["/tmp/project"],
  });

  assert.notEqual(detail.automation.nextRunAt, null);
  assert.ok(new Date(detail.automation.nextRunAt ?? "").getTime() > now.getTime());
});

test("computeNextRunAt preserves midnight daily schedules", () => {
  const now = new Date(2026, 3, 9, 12, 0, 0, 0);
  const nextRunAt = computeNextRunAt("RRULE:FREQ=DAILY;BYHOUR=0;BYMINUTE=15", "ACTIVE", now);

  assert.notEqual(nextRunAt, null);
  const next = new Date(nextRunAt ?? "");
  assert.equal(next.getHours(), 0);
  assert.equal(next.getMinutes(), 15);
  assert.ok(next.getTime() > now.getTime());
});
