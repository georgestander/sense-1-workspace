import test from "node:test";
import assert from "node:assert/strict";

import { shouldReloadManagementOverviewForRuntimeEvent } from "./management-runtime-events.ts";

test("shouldReloadManagementOverviewForRuntimeEvent only reloads for inventory changes", () => {
  assert.equal(shouldReloadManagementOverviewForRuntimeEvent({ kind: "managementInventoryChanged" }), true);
  assert.equal(shouldReloadManagementOverviewForRuntimeEvent({ kind: "accountChanged" }), false);
  assert.equal(shouldReloadManagementOverviewForRuntimeEvent(null), false);
});
