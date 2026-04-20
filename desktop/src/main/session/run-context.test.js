import test from "node:test";
import assert from "node:assert/strict";

import { buildDesktopRunContext } from "./run-context.ts";

test("buildDesktopRunContext returns a local private-scope context without an email", () => {
  const runContext = buildDesktopRunContext({
    profileId: "default",
    email: null,
    workspaceRoot: null,
  });

  assert.ok(runContext);
  assert.equal(runContext?.actor.email, null);
  assert.equal(runContext?.actor.displayName, "Signed-in user");
  assert.equal(runContext?.actor.homeScopeId, "scope_default_private");
  assert.equal(runContext?.scope.kind, "private");
  assert.equal(runContext?.scope.profileId, "default");
});
