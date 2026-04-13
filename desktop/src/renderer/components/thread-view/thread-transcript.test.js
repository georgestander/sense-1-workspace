import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

const helperSourcePath = fileURLToPath(new URL("./thread-transcript-visibility.ts", import.meta.url));
const helperSource = await fs.readFile(helperSourcePath, "utf8");
const helperModuleUrl = `data:text/javascript;base64,${Buffer.from(
  stripTypeScriptTypes(helperSource, { mode: "transform" }),
).toString("base64")}`;
const { shouldShowReviewArtifacts } = await import(helperModuleUrl);

test("shouldShowReviewArtifacts stays false for active runs with only live change groups", () => {
  assert.equal(
    shouldShowReviewArtifacts({
      effectiveThreadBusy: true,
      reviewSummary: null,
      rightRailChangeGroups: [{ id: "change-1", title: "Changed Files", status: "running", files: ["notes.txt"] }],
      threadInteractionState: "conversation",
    }),
    false,
  );
});

test("shouldShowReviewArtifacts turns true for completed runs with change groups", () => {
  assert.equal(
    shouldShowReviewArtifacts({
      effectiveThreadBusy: false,
      reviewSummary: null,
      rightRailChangeGroups: [{ id: "change-1", title: "Changed Files", status: "complete", files: ["notes.txt"] }],
      threadInteractionState: "conversation",
    }),
    true,
  );
});
