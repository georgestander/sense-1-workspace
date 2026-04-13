import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  finalizeSessionSummary,
  readSessionRecord,
  updateSessionRecordPathsWritten,
  writeSessionRecord,
} from "./session-record.ts";

async function makeArtifactRoot() {
  return await fs.mkdtemp(path.join(os.tmpdir(), "sense1-session-record-test-"));
}

test("writeSessionRecord creates session.json in the Sense-1 session folder", async () => {
  const artifactRoot = await makeArtifactRoot();

  const result = await writeSessionRecord({
    artifactRoot,
    intent: "Fix the desktop shell",
    logCursor: {
      from_ts: "2026-03-31T10:00:00.000Z",
    },
    sessionId: "sess_unit3",
    startedAt: "2026-03-31T10:00:00.000Z",
    workspaceRoot: "/tmp/workspace",
  });

  assert.equal(result.sessionRoot, path.join(artifactRoot, "sessions", "sess_unit3"));
  await assert.doesNotReject(fs.access(result.sessionRecordPath));

  const record = await readSessionRecord({
    artifactRoot,
    sessionId: "sess_unit3",
  });
  assert.deepEqual(record, {
    schema_version: 1,
    id: "sess_unit3",
    started_at: "2026-03-31T10:00:00.000Z",
    ended_at: null,
    intent: "Fix the desktop shell",
    workspace_root: "/tmp/workspace",
    paths_read: [],
    paths_written: [],
    outcomes: [],
    log_cursor: {
      from_ts: "2026-03-31T10:00:00.000Z",
      to_ts: null,
    },
  });
});

test("updateSessionRecordPathsWritten deduplicates writes and advances log cursor", async () => {
  const artifactRoot = await makeArtifactRoot();
  await writeSessionRecord({
    artifactRoot,
    intent: "Keep a session log",
    logCursor: {
      from_ts: "2026-03-31T11:00:00.000Z",
    },
    sessionId: "sess_unit6",
    startedAt: "2026-03-31T11:00:00.000Z",
  });

  await updateSessionRecordPathsWritten({
    artifactRoot,
    path: "/tmp/workspace/src/index.ts",
    sessionId: "sess_unit6",
    ts: "2026-03-31T11:05:00.000Z",
  });
  await updateSessionRecordPathsWritten({
    artifactRoot,
    path: "/tmp/workspace/src/index.ts",
    sessionId: "sess_unit6",
    ts: "2026-03-31T11:06:00.000Z",
  });
  await updateSessionRecordPathsWritten({
    artifactRoot,
    path: "/tmp/workspace/README.md",
    sessionId: "sess_unit6",
    ts: "2026-03-31T11:07:00.000Z",
  });

  const record = await readSessionRecord({
    artifactRoot,
    sessionId: "sess_unit6",
  });
  assert.deepEqual(record?.paths_written, [
    "/tmp/workspace/src/index.ts",
    "/tmp/workspace/README.md",
  ]);
  assert.deepEqual(record?.log_cursor, {
    from_ts: "2026-03-31T11:00:00.000Z",
    to_ts: "2026-03-31T11:07:00.000Z",
  });
});

test("finalizeSessionSummary writes summary.md and marks the session ended", async () => {
  const artifactRoot = await makeArtifactRoot();
  await writeSessionRecord({
    artifactRoot,
    intent: "Ship the summary",
    pathsWritten: ["/tmp/workspace/src/index.ts"],
    sessionId: "sess_unit4",
    startedAt: "2026-03-31T12:00:00.000Z",
  });

  const result = await finalizeSessionSummary({
    artifactRoot,
    endedAt: "2026-03-31T12:30:00.000Z",
    sessionId: "sess_unit4",
  });

  assert.ok(result);
  await assert.doesNotReject(fs.access(result.summaryPath));
  assert.match(result.summary, /## Intent/);
  assert.match(result.summary, /Ship the summary/);
  assert.match(result.summary, /\/tmp\/workspace\/src\/index\.ts/);

  const record = await readSessionRecord({
    artifactRoot,
    sessionId: "sess_unit4",
  });
  assert.equal(record?.ended_at, "2026-03-31T12:30:00.000Z");
  assert.deepEqual(record?.outcomes, ["/tmp/workspace/src/index.ts"]);
});
