import test from "node:test";
import assert from "node:assert/strict";

import { decideDesktopBugPromotion } from "./bug-promotion-service.ts";

test("decideDesktopBugPromotion skips reports that lack enough actionable detail", () => {
  const decision = decideDesktopBugPromotion({
    linearConfigured: true,
    report: {
      reportType: "manual",
      title: "Bug",
      description: "short",
      expectedBehavior: null,
      reproductionSteps: null,
      attachments: [],
    },
  });

  assert.deepEqual(decision, {
    disposition: "skip",
    reason: "Report does not yet contain enough actionable detail for ticket creation.",
    severity: "medium",
  });
});

test("decideDesktopBugPromotion defers actionable reports when Linear is unavailable", () => {
  const decision = decideDesktopBugPromotion({
    linearConfigured: false,
    report: {
      reportType: "manual",
      title: "Composer send button stopped working",
      description: "Clicking send does nothing after switching threads twice.",
      expectedBehavior: null,
      reproductionSteps: null,
      attachments: [],
    },
  });

  assert.equal(decision.disposition, "deferred");
  assert.equal(decision.severity, "medium");
});

test("decideDesktopBugPromotion creates tickets for actionable manual reports when Linear is configured", () => {
  const decision = decideDesktopBugPromotion({
    linearConfigured: true,
    report: {
      reportType: "manual",
      title: "Desktop crashes on launch",
      description: "The app crashes immediately after sign-in and blocks all work.",
      expectedBehavior: null,
      reproductionSteps: null,
      attachments: [],
    },
  });

  assert.equal(decision.disposition, "create");
  assert.equal(decision.severity, "high");
});
