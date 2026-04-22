import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

const sourcePath = fileURLToPath(new URL("./session-stream-live-bodies.ts", import.meta.url));
const source = await fs.readFile(sourcePath, "utf8");
const reactStubUrl = `data:text/javascript;base64,${Buffer.from("export const useSyncExternalStore = (_subscribe, getSnapshot) => getSnapshot();").toString("base64")}`;
const perfDebugStubUrl = `data:text/javascript;base64,${Buffer.from("export const perfMeasure = (_name, fn) => fn();").toString("base64")}`;
const compiledSource = stripTypeScriptTypes(source, { mode: "transform" })
  .replace(`from "react";`, `from "${reactStubUrl}";`)
  .replace(`from "../../lib/perf-debug.ts";`, `from "${perfDebugStubUrl}";`);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiledSource).toString("base64")}`;
const {
  appendStreamingEntryBody,
  clearStreamingThreadBodies,
  readStreamingEntryBody,
  subscribeStreamingEntryBody,
} = await import(moduleUrl);

async function waitForFlush() {
  await new Promise((resolve) => setTimeout(resolve, 120));
}

test("subscribeStreamingEntryBody only notifies the subscribed entry", async () => {
  const calls = [];
  const unsubscribeTarget = subscribeStreamingEntryBody("thread-1", "entry-1", () => {
    calls.push("entry-1");
  });
  const unsubscribeOther = subscribeStreamingEntryBody("thread-1", "entry-2", () => {
    calls.push("entry-2");
  });

  appendStreamingEntryBody("thread-1", "entry-1", "Hello");
  appendStreamingEntryBody("thread-1", "entry-2", "World");
  await waitForFlush();

  assert.deepEqual(calls, ["entry-1", "entry-2"]);

  unsubscribeTarget();
  unsubscribeOther();
  clearStreamingThreadBodies("thread-1");
});

test("readStreamingEntryBody exposes imperatively readable live text", async () => {
  const unsubscribe = subscribeStreamingEntryBody("thread-2", "entry-9", () => {});

  appendStreamingEntryBody("thread-2", "entry-9", "Hel");
  appendStreamingEntryBody("thread-2", "entry-9", "lo");
  await waitForFlush();

  assert.equal(readStreamingEntryBody("thread-2", "entry-9"), "Hello");

  unsubscribe();
  clearStreamingThreadBodies("thread-2");
  assert.equal(readStreamingEntryBody("thread-2", "entry-9"), null);
});

test("appendStreamingEntryBody coalesces bursty appends into a single notification", async () => {
  const calls = [];
  const unsubscribe = subscribeStreamingEntryBody("thread-3", "entry-7", () => {
    calls.push(readStreamingEntryBody("thread-3", "entry-7"));
  });

  appendStreamingEntryBody("thread-3", "entry-7", "a");
  appendStreamingEntryBody("thread-3", "entry-7", "b");
  appendStreamingEntryBody("thread-3", "entry-7", "c");
  await waitForFlush();

  assert.deepEqual(calls, ["abc"]);

  unsubscribe();
  clearStreamingThreadBodies("thread-3");
});
