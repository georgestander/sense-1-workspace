import test from "node:test";
import assert from "node:assert/strict";

import {
  DELETE_THREAD_PROMPT,
  performThreadArchive,
  performThreadDelete,
  performThreadRename,
  performThreadRestore,
} from "./thread-shell-actions.ts";

test("performThreadRename clears rename state after a successful rename", async () => {
  let cancelled = false;

  const didRename = await performThreadRename({
    threadId: "thread-1",
    threadRenameDraft: "Renamed thread",
    renameThread: async (threadId, title) => {
      assert.equal(threadId, "thread-1");
      assert.equal(title, "Renamed thread");
      return true;
    },
    cancelThreadRename: () => {
      cancelled = true;
    },
  });

  assert.equal(didRename, true);
  assert.equal(cancelled, true);
});

test("performThreadArchive clears a matching rename draft and refreshes collections", async () => {
  const pendingValues = [];
  let cancelled = false;
  let refreshed = false;
  let closedMenus = false;

  const didArchive = await performThreadArchive({
    threadId: "thread-1",
    archiveThread: async () => true,
    setThreadArchivePendingId: (value) => {
      pendingValues.push(typeof value === "function" ? value("thread-1") : value);
    },
    threadRenameId: "thread-1",
    cancelThreadRename: () => {
      cancelled = true;
    },
    closeThreadMenus: () => {
      closedMenus = true;
    },
    refreshWorkspaceCollections: async () => {
      refreshed = true;
    },
  });

  assert.equal(didArchive, true);
  assert.deepEqual(pendingValues, ["thread-1", null]);
  assert.equal(cancelled, true);
  assert.equal(refreshed, true);
  assert.equal(closedMenus, true);
});

test("performThreadRestore refreshes workspace collections after a successful restore", async () => {
  const pendingValues = [];
  let refreshed = false;

  const didRestore = await performThreadRestore({
    threadId: "thread-2",
    restoreThread: async () => true,
    setThreadRestorePendingId: (value) => {
      pendingValues.push(typeof value === "function" ? value("thread-2") : value);
    },
    closeThreadMenus: () => {},
    refreshWorkspaceCollections: async () => {
      refreshed = true;
    },
  });

  assert.equal(didRestore, true);
  assert.deepEqual(pendingValues, ["thread-2", null]);
  assert.equal(refreshed, true);
});

test("performThreadDelete resets the start surface when deleting the selected thread", async () => {
  const pendingValues = [];
  let refreshed = false;
  let resetCalled = false;
  let confirmMessage = null;

  const didDelete = await performThreadDelete({
    threadId: "thread-3",
    selectedThreadId: "thread-3",
    deleteThread: async () => true,
    setThreadDeletePendingId: (value) => {
      pendingValues.push(typeof value === "function" ? value("thread-3") : value);
    },
    threadRenameId: null,
    cancelThreadRename: () => {},
    closeThreadMenus: () => {},
    refreshWorkspaceCollections: async () => {
      refreshed = true;
    },
    resetToStartSurface: () => {
      resetCalled = true;
    },
    confirmDeleteThread: (message) => {
      confirmMessage = message;
      return true;
    },
  });

  assert.equal(didDelete, true);
  assert.equal(confirmMessage, DELETE_THREAD_PROMPT);
  assert.deepEqual(pendingValues, ["thread-3", null]);
  assert.equal(resetCalled, true);
  assert.equal(refreshed, true);
});
