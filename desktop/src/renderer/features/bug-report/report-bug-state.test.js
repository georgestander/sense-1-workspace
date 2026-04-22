import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

const sourcePath = fileURLToPath(new URL("./report-bug-state.ts", import.meta.url));
const source = await fs.readFile(sourcePath, "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(
  stripTypeScriptTypes(source, { mode: "transform" }),
).toString("base64")}`;
const {
  EMPTY_DRAFT,
  appendAttachments,
  buildDraftPayload,
  canSubmit,
  inferAttachmentFromPath,
  removeAttachment,
  sanitizeReportErrorMessage,
} = await import(moduleUrl);

test("canSubmit requires title and description", () => {
  assert.equal(canSubmit(EMPTY_DRAFT), false);
  assert.equal(canSubmit({ ...EMPTY_DRAFT, title: "Bug" }), false);
  assert.equal(canSubmit({ ...EMPTY_DRAFT, title: "Bug", description: "Something" }), true);
  assert.equal(canSubmit({ ...EMPTY_DRAFT, title: "   ", description: "   " }), false);
});

test("buildDraftPayload trims text fields and converts empty optionals to null", () => {
  const payload = buildDraftPayload({
    title: "  Crash on launch  ",
    description: "The app crashes\n",
    expectedBehavior: "   ",
    reproductionSteps: "1. open app\n2. see crash",
    severity: "",
    attachments: [],
  });
  assert.equal(payload.reportType, "manual");
  assert.equal(payload.title, "Crash on launch");
  assert.equal(payload.description, "The app crashes");
  assert.equal(payload.expectedBehavior, null);
  assert.equal(payload.reproductionSteps, "1. open app\n2. see crash");
  assert.equal(payload.severity, null);
  assert.deepEqual(payload.attachments, []);
  assert.equal(payload.correlation, null);
});

test("buildDraftPayload preserves severity when chosen", () => {
  const payload = buildDraftPayload({
    ...EMPTY_DRAFT,
    title: "t",
    description: "d",
    severity: "high",
  });
  assert.equal(payload.severity, "high");
});

test("buildDraftPayload includes a correlation snapshot when provided", () => {
  const correlation = {
    view: {
      view: "thread",
      url: "http://localhost:5173/",
      documentTitle: "Sense-1 Workspace",
      selectedThreadId: "thread-1",
    },
    recentActions: [{
      kind: "click",
      status: "observed",
      name: "Send prompt",
      detail: null,
      timestamp: "2026-04-20T07:10:00.000Z",
    }],
    recentEvents: [{
      eventId: "evt_1",
      source: "renderer",
      title: "Error: composer crashed",
      level: "error",
      timestamp: "2026-04-20T07:09:59.000Z",
    }],
  };
  const payload = buildDraftPayload(
    {
      ...EMPTY_DRAFT,
      title: "t",
      description: "d",
    },
    correlation,
  );

  assert.deepEqual(payload.correlation, correlation);
});

test("inferAttachmentFromPath marks image files as screenshots with a mimeType", () => {
  const png = inferAttachmentFromPath("/tmp/screenshots/crash.PNG");
  assert.equal(png.kind, "screenshot");
  assert.equal(png.mimeType, "image/png");

  const jpg = inferAttachmentFromPath("C:\\Users\\me\\Pictures\\bug.jpg");
  assert.equal(jpg.kind, "screenshot");
  assert.equal(jpg.mimeType, "image/jpeg");
});

test("inferAttachmentFromPath leaves non-image files as generic file attachments", () => {
  const txt = inferAttachmentFromPath("/tmp/logs/session.log");
  assert.equal(txt.kind, "file");
  assert.equal(txt.mimeType, null);

  const noExt = inferAttachmentFromPath("/tmp/README");
  assert.equal(noExt.kind, "file");
  assert.equal(noExt.mimeType, null);
});

test("appendAttachments deduplicates by path and preserves insertion order", () => {
  const first = { kind: "file", path: "/a.log", mimeType: null };
  const second = { kind: "screenshot", path: "/b.png", mimeType: "image/png" };
  const dupe = { kind: "file", path: "/a.log", mimeType: null };
  const merged = appendAttachments([first], [second, dupe]);
  assert.deepEqual(merged, [first, second]);
});

test("removeAttachment drops entries by path", () => {
  const first = { kind: "file", path: "/a.log", mimeType: null };
  const second = { kind: "screenshot", path: "/b.png", mimeType: "image/png" };
  assert.deepEqual(removeAttachment([first, second], "/a.log"), [second]);
  assert.deepEqual(removeAttachment([first, second], "/missing"), [first, second]);
});

test("sanitizeReportErrorMessage strips electron and error prefixes", () => {
  assert.equal(
    sanitizeReportErrorMessage("Error invoking remote method 'submit-desktop-bug-report': Sentry intake failed"),
    "Sentry intake failed",
  );
  assert.equal(sanitizeReportErrorMessage("Error: boom"), "boom");
  assert.equal(sanitizeReportErrorMessage("  ready  "), "ready");
});
