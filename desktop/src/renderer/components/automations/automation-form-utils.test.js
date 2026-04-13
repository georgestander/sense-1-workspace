import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAutomationScheduleRrule,
  createDefaultAutomationSchedule,
  describeAutomationSchedule,
  formatWorkspaceOptionLabel,
  isAutomationScheduleEditable,
  normalizeWorkspaceOptions,
  parseAutomationSchedule,
  resolveAutomationSaveRrule,
} from "./automation-form-utils.ts";

test("formatWorkspaceOptionLabel strips paths to concise slash-prefixed labels", () => {
  assert.equal(formatWorkspaceOptionLabel("/Users/georgestander/dev/tools/sense-1"), "/sense-1");
  assert.equal(formatWorkspaceOptionLabel("workspace"), "/workspace");
});

test("normalizeWorkspaceOptions trims and deduplicates workspace paths", () => {
  assert.deepEqual(
    normalizeWorkspaceOptions(["  /Users/georgestander/dev/tools/sense-1  ", "/Users/georgestander/dev/tools/sense-1", "", " /tmp/demo "]),
    ["/Users/georgestander/dev/tools/sense-1", "/tmp/demo"],
  );
});

test("parseAutomationSchedule and buildAutomationScheduleRrule round-trip weekday schedules", () => {
  const parsed = parseAutomationSchedule("RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0");

  assert.deepEqual(parsed, {
    cadence: "weekdays",
    days: ["MO", "TU", "WE", "TH", "FR"],
    interval: 1,
    minute: 0,
    time: "09:00",
  });
  assert.equal(buildAutomationScheduleRrule(parsed), "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0");
  assert.equal(describeAutomationSchedule(parsed), "Every weekday at 09:00");
});

test("parseAutomationSchedule preserves hourly cadence", () => {
  const parsed = parseAutomationSchedule("RRULE:FREQ=HOURLY;INTERVAL=2;BYMINUTE=15");
  const schedule = {
    ...createDefaultAutomationSchedule(),
    ...parsed,
  };

  assert.deepEqual(schedule, {
    cadence: "hourly",
    days: ["MO", "TU", "WE", "TH", "FR"],
    interval: 2,
    minute: 15,
    time: "09:00",
  });
  assert.equal(buildAutomationScheduleRrule(schedule), "RRULE:FREQ=HOURLY;INTERVAL=2;BYMINUTE=15");
  assert.equal(describeAutomationSchedule(schedule), "Every 2 hours at minute 15");
});

test("parseAutomationSchedule accepts single-digit hour and minute values", () => {
  const parsed = parseAutomationSchedule("RRULE:FREQ=DAILY;BYHOUR=7;BYMINUTE=5");

  assert.deepEqual(parsed, {
    cadence: "daily",
    days: ["MO", "TU", "WE", "TH", "FR"],
    interval: 1,
    minute: 0,
    time: "07:05",
  });
  assert.equal(buildAutomationScheduleRrule(parsed), "RRULE:FREQ=DAILY;BYHOUR=7;BYMINUTE=5");
  assert.equal(describeAutomationSchedule(parsed), "Every day at 07:05");
});

test("unsupported RRULEs stay preserved instead of being rewritten", () => {
  const original = "RRULE:FREQ=MONTHLY;BYMONTHDAY=1";
  const parsed = parseAutomationSchedule(original);

  assert.equal(isAutomationScheduleEditable(original), false);
  assert.equal(resolveAutomationSaveRrule(original, parsed, false), original);
});
