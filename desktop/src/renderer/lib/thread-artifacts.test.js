import test from "node:test";
import assert from "node:assert/strict";

import {
  extractArtifactPathsFromText,
  extractStandaloneArtifactTarget,
  resolveArtifactPath,
} from "./thread-artifacts.ts";

test("resolveArtifactPath anchors relative file names to the workspace root", () => {
  assert.equal(resolveArtifactPath("bo.txt", "/tmp/project"), "/tmp/project/bo.txt");
  assert.equal(resolveArtifactPath("./notes/today.md", "/tmp/project"), "/tmp/project/notes/today.md");
  assert.equal(resolveArtifactPath("/tmp/project/bo.txt", "/tmp/project"), "/tmp/project/bo.txt");
});

test("resolveArtifactPath suppresses relative targets when no workspace root is available", () => {
  assert.equal(resolveArtifactPath("bo.txt", null), null);
  assert.equal(resolveArtifactPath("./notes/today.md", undefined), null);
  assert.equal(resolveArtifactPath("/tmp/project/bo.txt", null), "/tmp/project/bo.txt");
});

test("resolveArtifactPath ignores external URLs and trims trailing punctuation", () => {
  assert.equal(resolveArtifactPath("https://example.com/report.pdf", "/tmp/project"), null);
  assert.equal(resolveArtifactPath("notes/today.md)", "/tmp/project"), "/tmp/project/notes/today.md");
});

test("extractStandaloneArtifactTarget recognizes absolute, relative, and backticked file references", () => {
  assert.equal(
    extractStandaloneArtifactTarget("`/tmp/project/report.pdf`"),
    "/tmp/project/report.pdf",
  );
  assert.equal(
    extractStandaloneArtifactTarget("./artifacts/today.md"),
    "./artifacts/today.md",
  );
  assert.equal(
    extractStandaloneArtifactTarget("report.pdf"),
    "report.pdf",
  );
  assert.equal(extractStandaloneArtifactTarget("not a file path"), null);
});

test("extractArtifactPathsFromText finds standalone artifact lines and markdown file links", () => {
  const text = [
    "Done — I created the PDF report here:",
    "",
    "`/tmp/project/report.pdf`",
    "",
    "You can also open [notes](./artifacts/notes.md).",
  ].join("\n");

  assert.deepEqual(extractArtifactPathsFromText(text, "/tmp/project"), [
    "/tmp/project/artifacts/notes.md",
    "/tmp/project/report.pdf",
  ]);
});
