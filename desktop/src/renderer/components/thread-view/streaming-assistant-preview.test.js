import test from "node:test";
import assert from "node:assert/strict";

import { buildStreamingAssistantPreview } from "./streaming-assistant-preview.ts";

test("buildStreamingAssistantPreview leaves modest streaming bodies untouched", () => {
  const preview = buildStreamingAssistantPreview("short reply");

  assert.equal(preview.truncated, false);
  assert.equal(preview.hiddenCharacterCount, 0);
  assert.equal(preview.visibleText, "short reply");
});

test("buildStreamingAssistantPreview keeps only the latest tail for very large bodies", () => {
  const source = `${"A".repeat(6_000)}${"B".repeat(8_500)}`;
  const preview = buildStreamingAssistantPreview(source);

  assert.equal(preview.truncated, true);
  assert.equal(preview.visibleText, "B".repeat(8_000));
  assert.equal(preview.hiddenCharacterCount, 6_500);
});
