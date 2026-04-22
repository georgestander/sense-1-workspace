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
    ...overrides,
  };
}

test("resolveReportBugOutcomePresentation uses neutral Sentry intake messaging", () => {
  const outcome = resolveReportBugOutcomePresentation(buildResult());

  assert.match(outcome.title, /your report was sent/i);
  assert.match(outcome.detail, /captured your report in sentry/i);
  assert.deepEqual(outcome.links, []);
});

test("resolveReportBugOutcomePresentation surfaces sentry links when present", () => {
  const outcome = resolveReportBugOutcomePresentation(
    buildResult({
      sentryIssueUrl: "https://sentry.io/issues/123",
    }),
  );

  assert.match(outcome.title, /your report was sent/i);
  assert.deepEqual(outcome.links, [
    { label: "View Sentry issue", href: "https://sentry.io/issues/123" },
  ]);
});

test("resolveReportBugOutcomePresentation falls back cleanly when no result exists yet", () => {
  const outcome = resolveReportBugOutcomePresentation(null);

  assert.match(outcome.title, /your report was sent/i);
  assert.equal(outcome.links.length, 0);
});
