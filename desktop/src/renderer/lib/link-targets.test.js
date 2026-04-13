import test from "node:test";
import assert from "node:assert/strict";

import { isExternalUrl, isFilePath } from "./link-targets.ts";

test("isExternalUrl recognizes http and https links", () => {
  assert.equal(isExternalUrl("https://www.cdc.gov/adhd/treatment/index.html"), true);
  assert.equal(isExternalUrl("http://localhost:3000/path"), true);
});

test("isFilePath rejects web urls that end in file-like extensions", () => {
  assert.equal(isFilePath("https://www.cdc.gov/adhd/treatment/index.html"), false);
  assert.equal(isFilePath("https://example.com/report.pdf"), false);
});

test("isFilePath still recognizes local file references", () => {
  assert.equal(isFilePath("./notes.md"), true);
  assert.equal(isFilePath("/tmp/report.pdf"), true);
  assert.equal(isFilePath("C:\\temp\\report.pdf"), true);
});
