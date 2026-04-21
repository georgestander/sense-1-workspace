import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

const sourcePath = fileURLToPath(new URL("./report-bug-outcome.ts", import.meta.url));
const source = await fs.readFile(sourcePath, "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(
  stripTypeScriptTypes(source, { mode: "transform" }),
).toString("base64")}`;
const { resolveReportBugOutcomePresentation } = await import(moduleUrl);

function buildResult(overrides = {}) {
  return {
    sentryEventId: "evt_123",
    sentryIssueUrl: null,
    promotionDisposition: "deferred",
    promotionReason: "Sentry captured the report, but Linear ticket creation is deferred.",
    linearIssueId: null,
    linearIssueUrl: null,
    ...overrides,
  };
}

test("resolveReportBugOutcomePresentation distinguishes created ticket outcomes", () => {
  const outcome = resolveReportBugOutcomePresentation(
    buildResult({
      promotionDisposition: "create",
      promotionReason: "Report meets the actionability threshold for Linear ticket creation.",
      linearIssueId: "SEN-12",
      linearIssueUrl: "https://linear.app/sense-1/issue/SEN-12",
    }),
  );

  assert.match(outcome.title, /tracking ticket was created/i);
  assert.match(outcome.detail, /actionability threshold/i);
  assert.deepEqual(outcome.links, [
    { label: "View tracking ticket", href: "https://linear.app/sense-1/issue/SEN-12" },
  ]);
});

test("resolveReportBugOutcomePresentation preserves deferred triage messaging", () => {
  const outcome = resolveReportBugOutcomePresentation(buildResult());

  assert.match(outcome.title, /sent for triage/i);
  assert.match(outcome.detail, /deferred/i);
  assert.deepEqual(outcome.links, []);
});

test("resolveReportBugOutcomePresentation surfaces linked tickets and sentry issues when present", () => {
  const outcome = resolveReportBugOutcomePresentation(
    buildResult({
      promotionDisposition: "link",
      promotionReason: "Matched an existing tracking issue during triage.",
      linearIssueUrl: "https://linear.app/sense-1/issue/SEN-22",
      sentryIssueUrl: "https://sentry.io/issues/123",
    }),
  );

  assert.match(outcome.title, /linked to an existing tracking ticket/i);
  assert.deepEqual(outcome.links, [
    { label: "View tracking ticket", href: "https://linear.app/sense-1/issue/SEN-22" },
    { label: "View Sentry issue", href: "https://sentry.io/issues/123" },
  ]);
});

test("resolveReportBugOutcomePresentation falls back cleanly when no result exists yet", () => {
  const outcome = resolveReportBugOutcomePresentation(null);

  assert.match(outcome.title, /your report was sent/i);
  assert.equal(outcome.links.length, 0);
});
