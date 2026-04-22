import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTranscriptScrollAnchor,
  resolveTranscriptScrollBucketChars,
} from "./transcript-scroll.ts";

test("resolveTranscriptScrollBucketChars grows for large streaming bodies", () => {
  assert.equal(resolveTranscriptScrollBucketChars(4_000), 1024);
  assert.equal(resolveTranscriptScrollBucketChars(20_000), 4096);
  assert.equal(resolveTranscriptScrollBucketChars(80_000), 8192);
});

test("buildTranscriptScrollAnchor buckets very large streams more coarsely", () => {
  const entry = {
    id: "entry-1",
    status: "streaming",
  };

  assert.equal(
    buildTranscriptScrollAnchor(entry, "x".repeat(20_000)),
    buildTranscriptScrollAnchor(entry, "x".repeat(20_400)),
  );
  assert.notEqual(
    buildTranscriptScrollAnchor(entry, "x".repeat(20_000)),
    buildTranscriptScrollAnchor(entry, "x".repeat(21_000)),
  );
});
