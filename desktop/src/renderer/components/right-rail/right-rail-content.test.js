import test from "node:test";
import assert from "node:assert/strict";

import { buildRightRailChangedFiles } from "./right-rail-content.ts";

function isVisibleRightRailArtifactPath(filePath, artifactRoots) {
  const roots = Array.isArray(artifactRoots) ? artifactRoots : [artifactRoots];
  return roots.some((root) => typeof root === "string" && filePath.startsWith(root));
}

function extractArtifactPathsFromText(text, workspaceRoot) {
  if (!workspaceRoot || !text.includes("notes.md")) {
    return [];
  }

  return [`${workspaceRoot}/artifacts/notes.md`];
}

function createThread(overrides = {}) {
  return {
    id: "thread-1",
    title: "Thread",
    subtitle: "Chat",
    state: "idle",
    interactionState: "conversation",
    updatedAt: "2026-04-13T12:00:00.000Z",
    updatedLabel: "just now",
    workspaceRoot: "/tmp/project",
    cwd: "/tmp/project",
    entries: [],
    changeGroups: [],
    progressSummary: [],
    reviewSummary: null,
    hasLoadedDetails: true,
    ...overrides,
  };
}

test("buildRightRailChangedFiles skips transcript rescans while the thread is live", () => {
  const selectedThread = createThread({
    state: "running",
    entries: [
      {
        id: "entry-1",
        kind: "assistant",
        title: "Assistant",
        body: "Created `/tmp/project/from-transcript.md`.",
        status: "streaming",
      },
    ],
  });

  const changedFiles = buildRightRailChangedFiles({
    artifactRoots: ["/tmp/project"],
    extractArtifactPathsFromText,
    isVisibleRightRailArtifactPath,
    persistedSessionWrittenPaths: ["/tmp/project/from-persisted.md"],
    rightRailChangeGroups: [
      {
        id: "group-1",
        title: "Changes",
        status: "completed",
        files: ["/tmp/project/from-change-group.md"],
      },
    ],
    rightRailThread: createThread({
      reviewSummary: {
        summary: "Done",
        outputArtifacts: [],
        createdFiles: [],
        modifiedFiles: [],
        changedArtifacts: [
          {
            id: "artifact-1",
            refType: "file",
            path: "/tmp/project/from-review.md",
            refId: null,
            action: "modified",
            recordedAt: null,
            metadata: {},
          },
        ],
        updatedAt: null,
      },
    }),
    selectedThread,
  });

  assert.deepEqual(
    changedFiles.map(([filePath]) => filePath),
    [
      "/tmp/project/from-persisted.md",
      "/tmp/project/from-change-group.md",
      "/tmp/project/from-review.md",
    ],
  );
});

test("buildRightRailChangedFiles falls back to transcript artifacts after the run is finished", () => {
  const changedFiles = buildRightRailChangedFiles({
    artifactRoots: ["/tmp/project"],
    extractArtifactPathsFromText,
    isVisibleRightRailArtifactPath,
    persistedSessionWrittenPaths: [],
    rightRailChangeGroups: [],
    rightRailThread: null,
    selectedThread: createThread({
      entries: [
        {
          id: "entry-1",
          kind: "assistant",
          title: "Assistant",
          body: "You can open [notes](./artifacts/notes.md).",
          status: "completed",
        },
      ],
    }),
  });

  assert.deepEqual(changedFiles, [
    ["/tmp/project/artifacts/notes.md", "created"],
  ]);
});
