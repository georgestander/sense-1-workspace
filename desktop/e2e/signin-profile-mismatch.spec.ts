import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { launchApp } from "./electron-helpers";

const FIXTURE_EMAIL = "scenario-user@example.com";
const HIDDEN_SLOT_ID = "default";

async function createRuntimeRoot(activeProfileId: string) {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-e2e-auth-"));
  const profilesDir = path.join(runtimeRoot, "profiles");

  await fs.mkdir(path.join(profilesDir, activeProfileId, "codex-home"), { recursive: true });
  await fs.writeFile(
    path.join(profilesDir, "_active.json"),
    JSON.stringify(
      {
        profile_id: activeProfileId,
        updated_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );

  return runtimeRoot;
}

async function expectSignedOutBootstrap(window: Page) {
  await expect(window.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();
  await expect(window.getByRole("button", { name: "Sign in with ChatGPT" })).toBeVisible();
  await expect(window.getByText("Existing local profiles")).toHaveCount(0);
  await expect(window.getByRole("button", { name: "Continue" })).toHaveCount(0);
}

async function signInFromBootstrap(
  window: Page,
  {
    initialProfileId,
  }: {
    initialProfileId: string;
  },
) {
  await expectSignedOutBootstrap(window);

  await window.getByRole("button", { name: "Sign in with ChatGPT" }).click();

  await expect(window.getByRole("button", { name: "New task" })).toBeVisible({ timeout: 15_000 });
  await expect(window.getByRole("heading", { name: "Sign in to continue" })).toHaveCount(0);
  await expect(window.getByText("ChatGPT account")).toBeVisible();
  await expect(window.getByText(`${initialProfileId} profile`)).toHaveCount(0);
  await expect.poll(
    async () => {
      const bootstrap = await window.evaluate(async () => await window.sense1Desktop.session.get());
      return {
        isSignedIn: bootstrap.isSignedIn,
        profileId: bootstrap.profileId,
      };
    },
    { timeout: 15_000 },
  ).toEqual({
    isSignedIn: true,
    profileId: HIDDEN_SLOT_ID,
  });
}

test.describe("SCN-001-O pinned-profile sign-in mismatch", () => {
  test("sign-in collapses legacy local profiles into the hidden desktop slot", async () => {
    const initialProfileId = "qa-pinned";
    const runtimeRoot = await createRuntimeRoot(initialProfileId);
    const { app, window } = await launchApp({
      env: {
        SENSE1_E2E_AUTH_EMAIL: FIXTURE_EMAIL,
        SENSE1_E2E_AUTH_FIXTURE: "1",
        SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
      },
      profileId: null,
    });

    try {
      await signInFromBootstrap(window, {
        initialProfileId,
      });
    } finally {
      await app.close();
    }
  });

  test("signed-out screen stays auth-first even when a legacy local profile is active", async () => {
    const initialProfileId = "qa-pinned";
    const runtimeRoot = await createRuntimeRoot(initialProfileId);
    const { app, window } = await launchApp({
      env: {
        SENSE1_E2E_AUTH_EMAIL: FIXTURE_EMAIL,
        SENSE1_E2E_AUTH_FIXTURE: "1",
        SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
      },
      profileId: null,
    });

    try {
      await expectSignedOutBootstrap(window);
    } finally {
      await app.close();
    }
  });

  test("left sidebar offers sign out instead of switch account", async () => {
    const initialProfileId = "qa-pinned";
    const runtimeRoot = await createRuntimeRoot(initialProfileId);
    const { app, window } = await launchApp({
      env: {
        SENSE1_E2E_AUTH_EMAIL: FIXTURE_EMAIL,
        SENSE1_E2E_AUTH_FIXTURE: "1",
        SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
      },
      profileId: null,
    });

    try {
      await signInFromBootstrap(window, {
        initialProfileId,
      });

      await window.getByRole("button", { name: new RegExp(FIXTURE_EMAIL, "i") }).click();
      await expect(window.getByRole("button", { name: "Sign out" })).toBeVisible();
      await expect(window.getByText("Switch account")).toHaveCount(0);

      await window.getByRole("button", { name: "Sign out" }).click();
      await expectSignedOutBootstrap(window);
      await expect.poll(
        async () => {
          const bootstrap = await window.evaluate(async () => await window.sense1Desktop.session.get());
          return bootstrap.profileId;
        },
        { timeout: 15_000 },
      ).toBe(HIDDEN_SLOT_ID);
    } finally {
      await app.close();
    }
  });
});
