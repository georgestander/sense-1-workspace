import test from "node:test";
import assert from "node:assert/strict";

import {
  filterVisibleRightRailArtifactPaths,
  isVisibleRightRailArtifactPath,
} from "./right-rail-artifacts.ts";

test("shows workspace files and folders that look like user-facing artifacts", () => {
  const workspaceRoot = "/tmp/project";

  assert.equal(
    isVisibleRightRailArtifactPath("/tmp/project/budget.xlsx", workspaceRoot),
    true,
  );
  assert.equal(
    isVisibleRightRailArtifactPath("/tmp/project/docs/proposal.docx", workspaceRoot),
    true,
  );
  assert.equal(
    isVisibleRightRailArtifactPath("docs/proposal.docx", workspaceRoot),
    true,
  );
});

test("hides runtime-support paths and files outside the workspace", () => {
  const workspaceRoot = "/tmp/project";

  assert.equal(
    isVisibleRightRailArtifactPath("/tmp/project/output/rendered/report.md", workspaceRoot),
    false,
  );
  assert.equal(
    isVisibleRightRailArtifactPath("/tmp/project/retrieval/cache.json", workspaceRoot),
    false,
  );
  assert.equal(
    isVisibleRightRailArtifactPath("/tmp/project/observability/run-log.json", workspaceRoot),
    false,
  );
  assert.equal(
    isVisibleRightRailArtifactPath("/tmp/project/search/retrieval", workspaceRoot),
    false,
  );
  assert.equal(
    isVisibleRightRailArtifactPath("/tmp/project/eval/observability", workspaceRoot),
    false,
  );
  assert.equal(
    isVisibleRightRailArtifactPath("/tmp/project/output/spreadsheet/sense1_runway_budget.xlsx", workspaceRoot),
    true,
  );
  assert.equal(
    isVisibleRightRailArtifactPath("/tmp/project/output/sense1_elevator_pitch.docx", workspaceRoot),
    true,
  );
  assert.equal(
    isVisibleRightRailArtifactPath("/usr/bin/texutil", workspaceRoot),
    false,
  );
  assert.equal(
    isVisibleRightRailArtifactPath("/opt/homebrew/bin/uv", workspaceRoot),
    false,
  );
});

test("filters noisy metadata files from the right rail", () => {
  const workspaceRoot = "/tmp/project";

  assert.equal(
    isVisibleRightRailArtifactPath("/tmp/project/session.json", workspaceRoot),
    false,
  );
  assert.equal(
    isVisibleRightRailArtifactPath("/tmp/project/summary.md", workspaceRoot),
    false,
  );
  assert.equal(
    isVisibleRightRailArtifactPath("/tmp/project/.DS_Store", workspaceRoot),
    false,
  );
});

test("keeps only visible right-rail artifact paths when filtering a list", () => {
  const workspaceRoot = "/tmp/project";

  assert.deepEqual(
    filterVisibleRightRailArtifactPaths(
      [
        "/tmp/project/budget.xlsx",
        "/tmp/project/output/rendered/report.md",
        "/tmp/project/output/spreadsheet/sense1_runway_budget.xlsx",
        "/tmp/project/search/retrieval",
        "/tmp/project/eval/observability",
        "/usr/bin/texutil",
        "/tmp/project/docs/proposal.docx",
      ],
      workspaceRoot,
    ),
    [
      "/tmp/project/budget.xlsx",
      "/tmp/project/output/spreadsheet/sense1_runway_budget.xlsx",
      "/tmp/project/docs/proposal.docx",
    ],
  );
});

test("accepts canonical artifact paths when the selected workspace root is a symlink", () => {
  assert.equal(
    isVisibleRightRailArtifactPath(
      "/private/tmp/project/output/spreadsheet/sense1_runway_budget.xlsx",
      ["/tmp/project-link", "/private/tmp/project"],
    ),
    true,
  );
  assert.equal(
    isVisibleRightRailArtifactPath(
      "/private/tmp/project/retrieval/cache.json",
      ["/tmp/project-link", "/private/tmp/project"],
    ),
    false,
  );
});

test("preserves artifacts when the workspace root is the filesystem root", () => {
  assert.equal(
    isVisibleRightRailArtifactPath("/budget.xlsx", "/"),
    true,
  );
  assert.equal(
    isVisibleRightRailArtifactPath("/retrieval/cache.json", "/"),
    false,
  );
});
