import test from "node:test";
import assert from "node:assert/strict";

import {
  isSessionArtifactWorkspaceRoot,
  normalizeUserFacingWorkspaceRoot,
} from "./workspace-roots.ts";

test("isSessionArtifactWorkspaceRoot detects sense session artifact paths", () => {
  assert.equal(
    isSessionArtifactWorkspaceRoot("/Users/george/Sense-1 Workspace/sessions/sess_1234"),
    true,
  );
  assert.equal(
    isSessionArtifactWorkspaceRoot("C:\\Users\\george\\Sense-1 Workspace\\sessions\\sess_1234"),
    true,
  );
  assert.equal(
    isSessionArtifactWorkspaceRoot("/Users/george/projects/real-workspace"),
    false,
  );
});

test("normalizeUserFacingWorkspaceRoot drops session artifact roots but keeps real folders", () => {
  assert.equal(
    normalizeUserFacingWorkspaceRoot("/Users/george/Sense-1 Workspace/sessions/sess_1234"),
    null,
  );
  assert.equal(
    normalizeUserFacingWorkspaceRoot("/Users/george/projects/real-workspace/"),
    "/Users/george/projects/real-workspace",
  );
});
