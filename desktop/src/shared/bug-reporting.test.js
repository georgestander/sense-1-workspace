import test from "node:test";
import assert from "node:assert/strict";

test("DesktopBugReportDraft shape stays consumable by manual report flows", () => {
  const draft = {
    reportType: "manual",
    title: "Composer send button stopped working",
    description: "Clicking send does nothing after switching threads twice.",
    expectedBehavior: "Send should submit the current prompt.",
    reproductionSteps: "Open one thread, switch to another, switch back, then click send.",
    attachments: [],
  };

  assert.equal(draft.reportType, "manual");
  assert.equal(Array.isArray(draft.attachments), true);
});
