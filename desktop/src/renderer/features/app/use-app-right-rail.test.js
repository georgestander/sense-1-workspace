import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

const helperSourcePath = fileURLToPath(new URL("./transcript-scroll.ts", import.meta.url));
const helperSource = await fs.readFile(helperSourcePath, "utf8");
const helperModuleUrl = `data:text/javascript;base64,${Buffer.from(
  stripTypeScriptTypes(helperSource, { mode: "transform" }),
).toString("base64")}`;
const {
  buildTranscriptScrollAnchor,
  shouldAutoFollowTranscript,
} = await import(helperModuleUrl);

test("shouldAutoFollowTranscript only stays pinned when the viewport is very close to the bottom", () => {
  assert.equal(shouldAutoFollowTranscript(0), true);
  assert.equal(shouldAutoFollowTranscript(8), true);
  assert.equal(shouldAutoFollowTranscript(9), false);
});

test("buildTranscriptScrollAnchor coalesces streaming body growth into larger buckets", () => {
  assert.equal(
    buildTranscriptScrollAnchor({
      id: "entry-1",
      kind: "assistant",
      title: "Sense-1 activity",
      body: "x".repeat(1023),
      status: "streaming",
    }),
    "entry-1:streaming:0",
  );
  assert.equal(
    buildTranscriptScrollAnchor({
      id: "entry-1",
      kind: "assistant",
      title: "Sense-1 activity",
      body: "x".repeat(1024),
      status: "streaming",
    }),
    "entry-1:streaming:1",
  );
  assert.equal(
    buildTranscriptScrollAnchor({
      id: "entry-1",
      kind: "assistant",
      title: "Sense-1 activity",
      body: "done",
      status: "completed",
    }),
    "entry-1:completed:0",
  );
});

test("buildTranscriptScrollAnchor can follow live streaming body overlays", () => {
  assert.equal(
    buildTranscriptScrollAnchor(
      {
        id: "entry-1",
        kind: "assistant",
        title: "Sense-1 activity",
        body: "stale",
        status: "streaming",
      },
      "x".repeat(2048),
    ),
    "entry-1:streaming:2",
  );
  assert.equal(
    buildTranscriptScrollAnchor(
      {
        id: "entry-1",
        kind: "assistant",
        title: "Sense-1 activity",
        body: "done",
        status: "completed",
      },
      "x".repeat(2048),
    ),
    "entry-1:completed:0",
  );
});
