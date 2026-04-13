import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { launchApp } from "./electron-helpers";

const FIXTURE_EMAIL = "stability-user@example.com";

async function createSignedInRuntimeRoot(profileId: string) {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-e2e-stability-"));
  await fs.mkdir(path.join(runtimeRoot, "profiles", profileId, "codex-home"), { recursive: true });
  await fs.writeFile(
    path.join(runtimeRoot, "_e2e-auth-fixture.json"),
    JSON.stringify(
      {
        profiles: {
          [profileId]: {
            email: FIXTURE_EMAIL,
            accountType: "chatgpt",
            updatedAt: new Date().toISOString(),
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  return runtimeRoot;
}

async function launchSignedInDesktop(options: {
  env?: NodeJS.ProcessEnv;
  profileId?: string;
} = {}): Promise<{ app: ElectronApplication; runtimeRoot: string; window: Page }> {
  const profileId = options.profileId ?? "e2e-stability";
  const runtimeRoot = await createSignedInRuntimeRoot(profileId);
  const { app, window } = await launchApp({
    env: {
      SENSE1_E2E_AUTH_FIXTURE: "1",
      SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
      ...(options.env ?? {}),
    },
    profileId,
  });

  await expect(window.getByRole("button", { name: "Choose folder" })).toBeVisible({ timeout: 20_000 });
  return { app, runtimeRoot, window };
}

test("active run stays visible and stop works without a renderer crash", async () => {
  const workspaceRoot = path.resolve(import.meta.dirname, "..", "..");
  const { app, window } = await launchSignedInDesktop({
    env: {
      SENSE1_E2E_PICK_FOLDER_PATH: workspaceRoot,
    },
    profileId: "e2e-stop-stability",
  });
  const pageErrors: string[] = [];

  try {
    window.on("pageerror", (error) => {
      pageErrors.push(error.stack || error.message);
    });

    await window.getByRole("button", { name: "Choose folder" }).click();
    await window.getByRole("button", { name: "Choose a different folder" }).click();
    await expect(window.getByText(workspaceRoot)).toBeVisible({ timeout: 10_000 });

    await window.getByPlaceholder("How can I help you today?").fill("Search this repository for every use of thread and summarize what you find.");
    await window.getByRole("button", { name: "Send prompt" }).click();

    await expect(window.getByRole("button", { name: "Stop run" })).toBeVisible({ timeout: 20_000 });
    await window.getByRole("button", { name: "Stop run" }).click();

    await expect.poll(async () => await window.getByRole("button", { name: "Stop run" }).count(), { timeout: 10_000 }).toBe(0);
    await expect(window.locator("body")).not.toContainText(/missing field 'turnId'|Could not stop the active run|could not find the active run/i);
    await expect(window.locator("body")).toContainText("Ready for the next prompt.", { timeout: 10_000 });
    expect(pageErrors).toEqual([]);
  } finally {
    await app.close();
  }
});
