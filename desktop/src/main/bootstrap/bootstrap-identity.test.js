import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildDesktopIdentityState,
  inferDisplayNameFromAuth,
} from "./bootstrap-identity.js";
import { canonicalizeDesktopProfile } from "./bootstrap-profile.js";
import {
  DEFAULT_PROFILE_ID,
  ensureProfileDirectories,
  loadProfileIdentity,
  persistProfileIdentity,
  resolveProfileCodexHome,
  resolveProfileRoot,
} from "../profile/profile-state.js";

function createTestEnv(runtimeRoot) {
  return {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
  };
}

async function makeTempRuntimeRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "sense1-identity-test-"));
}

test("inferDisplayNameFromAuth prefers an explicit auth.name", () => {
  assert.equal(
    inferDisplayNameFromAuth({ name: "Alex Morgan", email: "alex@example.com" }),
    "Alex Morgan",
  );
});

test("inferDisplayNameFromAuth humanizes an email local-part when no name is present", () => {
  assert.equal(
    inferDisplayNameFromAuth({ name: null, email: "alex.morgan@example.com" }),
    "Alex Morgan",
  );
  assert.equal(
    inferDisplayNameFromAuth({ email: "alex_m@example.com" }),
    "Alex M",
  );
  assert.equal(
    inferDisplayNameFromAuth({ email: "alex-morgan@example.com" }),
    "Alex Morgan",
  );
  assert.equal(
    inferDisplayNameFromAuth({ email: "ALEX.MORGAN@EXAMPLE.COM" }),
    "Alex Morgan",
  );
});

test("inferDisplayNameFromAuth strips plus-tags before deriving", () => {
  assert.equal(
    inferDisplayNameFromAuth({ email: "alex+alpha@example.com" }),
    "Alex",
  );
});

test("inferDisplayNameFromAuth rejects email local-parts without letters", () => {
  assert.equal(inferDisplayNameFromAuth({ email: "12345@example.com" }), null);
  assert.equal(inferDisplayNameFromAuth({ email: "___@example.com" }), null);
});

test("inferDisplayNameFromAuth returns null when there is nothing to go on", () => {
  assert.equal(inferDisplayNameFromAuth(null), null);
  assert.equal(inferDisplayNameFromAuth(undefined), null);
  assert.equal(inferDisplayNameFromAuth({ name: null, email: null }), null);
  assert.equal(inferDisplayNameFromAuth({ name: "   ", email: "" }), null);
});

test("buildDesktopIdentityState surfaces a persisted display name as-is", async () => {
  const runtimeRoot = await makeTempRuntimeRoot();
  const env = createTestEnv(runtimeRoot);
  await ensureProfileDirectories(DEFAULT_PROFILE_ID, env);
  await persistProfileIdentity(
    DEFAULT_PROFILE_ID,
    { displayName: "Al", email: "alex.morgan@example.com" },
    env,
  );

  const state = await buildDesktopIdentityState(
    { id: DEFAULT_PROFILE_ID },
    { isSignedIn: true, email: "alex.morgan@example.com" },
    env,
  );

  assert.deepEqual(state, {
    displayName: "Al",
    inferredDisplayName: "Al",
    needsDisplayName: false,
  });
});

test("buildDesktopIdentityState falls back to an email-derived name when nothing is persisted", async () => {
  const runtimeRoot = await makeTempRuntimeRoot();
  const env = createTestEnv(runtimeRoot);
  await ensureProfileDirectories(DEFAULT_PROFILE_ID, env);

  const state = await buildDesktopIdentityState(
    { id: DEFAULT_PROFILE_ID },
    { isSignedIn: true, email: "alex.morgan@example.com" },
    env,
  );

  assert.deepEqual(state, {
    displayName: null,
    inferredDisplayName: "Alex Morgan",
    needsDisplayName: false,
  });
});

test("buildDesktopIdentityState flags needsDisplayName only when inference truly fails", async () => {
  const runtimeRoot = await makeTempRuntimeRoot();
  const env = createTestEnv(runtimeRoot);
  await ensureProfileDirectories(DEFAULT_PROFILE_ID, env);

  const noSignals = await buildDesktopIdentityState(
    { id: DEFAULT_PROFILE_ID },
    { isSignedIn: true },
    env,
  );
  assert.deepEqual(noSignals, {
    displayName: null,
    inferredDisplayName: null,
    needsDisplayName: true,
  });

  const allDigits = await buildDesktopIdentityState(
    { id: DEFAULT_PROFILE_ID },
    { isSignedIn: true, email: "12345@example.com" },
    env,
  );
  assert.deepEqual(allDigits, {
    displayName: null,
    inferredDisplayName: null,
    needsDisplayName: true,
  });

  const signedOut = await buildDesktopIdentityState(
    { id: DEFAULT_PROFILE_ID },
    { isSignedIn: false, email: "alex@example.com" },
    env,
  );
  assert.equal(signedOut.needsDisplayName, false);
  assert.equal(signedOut.inferredDisplayName, "Alex");
});

test("canonicalizeDesktopProfile persists the email-derived name on first sign-in", async () => {
  const runtimeRoot = await makeTempRuntimeRoot();
  const env = createTestEnv(runtimeRoot);
  await ensureProfileDirectories(DEFAULT_PROFILE_ID, env);

  const profile = {
    id: DEFAULT_PROFILE_ID,
    source: "default",
    rootPath: resolveProfileRoot(DEFAULT_PROFILE_ID, env),
    codexHome: resolveProfileCodexHome(DEFAULT_PROFILE_ID, env),
  };

  await canonicalizeDesktopProfile(
    profile,
    { isSignedIn: true, name: null, email: "alex.morgan@example.com" },
    env,
  );

  const persisted = await loadProfileIdentity(DEFAULT_PROFILE_ID, env);
  assert.equal(persisted?.displayName, "Alex Morgan");
});

test("canonicalizeDesktopProfile preserves a manually-edited display name across later sign-ins", async () => {
  const runtimeRoot = await makeTempRuntimeRoot();
  const env = createTestEnv(runtimeRoot);
  await ensureProfileDirectories(DEFAULT_PROFILE_ID, env);
  await persistProfileIdentity(
    DEFAULT_PROFILE_ID,
    { displayName: "Al", email: "alex.morgan@example.com" },
    env,
  );

  const profile = {
    id: DEFAULT_PROFILE_ID,
    source: "default",
    rootPath: resolveProfileRoot(DEFAULT_PROFILE_ID, env),
    codexHome: resolveProfileCodexHome(DEFAULT_PROFILE_ID, env),
  };

  await canonicalizeDesktopProfile(
    profile,
    { isSignedIn: true, name: null, email: "alex.morgan@example.com" },
    env,
  );

  const persisted = await loadProfileIdentity(DEFAULT_PROFILE_ID, env);
  assert.equal(persisted?.displayName, "Al");
});
