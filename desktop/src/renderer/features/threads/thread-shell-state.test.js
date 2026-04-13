import test from "node:test";
import assert from "node:assert/strict";

import {
  applyThreadMenuStateUpdate,
  closeThreadMenuState,
  createThreadMenuState,
} from "./thread-shell-state.ts";

test("sidebar thread menu updates close the home thread menu", () => {
  const nextState = applyThreadMenuStateUpdate(
    {
      sidebarThreadMenuOpenId: null,
      homeThreadMenuOpenId: "home-thread",
    },
    "sidebar",
    "sidebar-thread",
  );

  assert.deepEqual(nextState, {
    sidebarThreadMenuOpenId: "sidebar-thread",
    homeThreadMenuOpenId: null,
  });
});

test("home thread menu updates close the sidebar thread menu", () => {
  const nextState = applyThreadMenuStateUpdate(
    {
      sidebarThreadMenuOpenId: "sidebar-thread",
      homeThreadMenuOpenId: null,
    },
    "home",
    "home-thread",
  );

  assert.deepEqual(nextState, {
    sidebarThreadMenuOpenId: null,
    homeThreadMenuOpenId: "home-thread",
  });
});

test("thread menu state updater functions receive the current open id", () => {
  const nextState = applyThreadMenuStateUpdate(
    {
      sidebarThreadMenuOpenId: "sidebar-thread",
      homeThreadMenuOpenId: null,
    },
    "sidebar",
    (current) => (current === "sidebar-thread" ? null : current),
  );

  assert.deepEqual(nextState, createThreadMenuState());
});

test("closing thread menus clears both menu anchors", () => {
  assert.deepEqual(closeThreadMenuState(), {
    sidebarThreadMenuOpenId: null,
    homeThreadMenuOpenId: null,
  });
});
