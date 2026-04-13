import test from "node:test";
import assert from "node:assert/strict";

import { groupThreadEntries, reuseGroupedThreadEntries } from "./thread-view-utils.ts";

test("reuseGroupedThreadEntries reuses grouped structure when only the last assistant body changes", () => {
  const previousEntries = [
    {
      id: "user-1",
      kind: "user",
      title: "You",
      body: "hello",
      status: "complete",
    },
    {
      id: "assistant-1",
      kind: "assistant",
      title: "Sense-1 activity",
      body: "partial",
      status: "streaming",
    },
  ];
  const previousGrouped = groupThreadEntries(previousEntries);
  const nextEntries = [
    previousEntries[0],
    {
      ...previousEntries[1],
      body: "partial answer",
    },
  ];

  const reused = reuseGroupedThreadEntries(previousEntries, nextEntries, previousGrouped);

  assert.ok(reused);
  assert.equal(reused.length, previousGrouped.length);
  assert.equal(reused[0], previousGrouped[0]);
  assert.equal(reused[1].kind, "passthrough");
  assert.equal(reused[1].entry.body, "partial answer");
});

test("reuseGroupedThreadEntries returns null when a non-terminal entry changes", () => {
  const previousEntries = [
    {
      id: "assistant-1",
      kind: "assistant",
      title: "Sense-1 activity",
      body: "first",
      status: "complete",
    },
    {
      id: "assistant-2",
      kind: "assistant",
      title: "Sense-1 activity",
      body: "second",
      status: "streaming",
    },
  ];
  const previousGrouped = groupThreadEntries(previousEntries);
  const nextEntries = [
    {
      ...previousEntries[0],
      body: "changed",
    },
    previousEntries[1],
  ];

  assert.equal(reuseGroupedThreadEntries(previousEntries, nextEntries, previousGrouped), null);
});
