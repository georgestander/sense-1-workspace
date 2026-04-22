import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

const helperSourcePath = fileURLToPath(new URL("./thread-markdown-performance.ts", import.meta.url));
const helperSource = await fs.readFile(helperSourcePath, "utf8");
const helperModuleUrl = `data:text/javascript;base64,${Buffer.from(
  stripTypeScriptTypes(helperSource, { mode: "transform" }),
).toString("base64")}`;
const {
  hasFencedCodeBlocks,
  shouldDeferRichMarkdown,
  shouldUseVirtualizedMarkdown,
} = await import(helperModuleUrl);

test("hasFencedCodeBlocks only enables highlighting for fenced code blocks", () => {
  assert.equal(hasFencedCodeBlocks("Plain text only"), false);
  assert.equal(hasFencedCodeBlocks("```ts\nconst answer = 42;\n```"), true);
  assert.equal(hasFencedCodeBlocks("~~~js\nconsole.log('hi')\n~~~"), true);
});

test("shouldUseVirtualizedMarkdown stays off for short answers", () => {
  assert.equal(shouldUseVirtualizedMarkdown("1. Small item\n2. Another one"), false);
});

test("shouldUseVirtualizedMarkdown turns on for very long numbered lists", () => {
  const longList = Array.from({ length: 90 }, (_, index) => `${index + 1}. Item ${index + 1}`).join("\n");
  assert.equal(shouldUseVirtualizedMarkdown(longList), true);
});

test("shouldUseVirtualizedMarkdown turns on for very large markdown bodies", () => {
  assert.equal(shouldUseVirtualizedMarkdown("Paragraph\n".repeat(700)), true);
});

test("shouldDeferRichMarkdown stays off for normal answers", () => {
  assert.equal(shouldDeferRichMarkdown("Paragraph\n".repeat(12)), false);
});

test("shouldDeferRichMarkdown turns on for huge numbered lists", () => {
  const hugeList = Array.from({ length: 180 }, (_, index) => `${index + 1}. Item ${index + 1}`).join("\n");
  assert.equal(shouldDeferRichMarkdown(hugeList), true);
});
