import test from "node:test";
import assert from "node:assert/strict";

import { shouldShowHomeRightRail } from "./app-view-visibility.ts";

test("shouldShowHomeRightRail only keeps the rail visible on the home view", () => {
  assert.equal(shouldShowHomeRightRail("home", true), true);
  assert.equal(shouldShowHomeRightRail("plugins", true), false);
  assert.equal(shouldShowHomeRightRail("automations", true), false);
  assert.equal(shouldShowHomeRightRail("home", false), false);
});
