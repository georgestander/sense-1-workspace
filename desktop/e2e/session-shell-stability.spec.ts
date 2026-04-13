import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { launchApp } from "./electron-helpers";

const FIXTURE_EMAIL = "shell-stability@example.com";

async function createSignedInRuntimeRoot(profileId: string) {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-e2e-shell-"));
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
} = {}): Promise<{ app: ElectronApplication; window: Page }> {
  const profileId = options.profileId ?? "e2e-shell-stability";
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
  return { app, window };
}

async function allowWorkspaceAccessIfPrompted(window: Page) {
  const allowThisTimeButton = window.getByRole("button", { name: "Allow this time" });
  if (await allowThisTimeButton.isVisible().catch(() => false)) {
    await allowThisTimeButton.click();
  }
}

test("live thread keeps one prompt bubble and stays signed in during a run", async () => {
  const workspaceRoot = path.resolve(import.meta.dirname, "..", "..");
  const prompt = "stable-shell-9173: give me a one-line summary of this folder";
  const { app, window } = await launchSignedInDesktop({
    env: {
      SENSE1_E2E_PICK_FOLDER_PATH: workspaceRoot,
    },
    profileId: "e2e-shell-stability",
  });

  try {
    await window.getByRole("button", { name: "Choose folder" }).click();
    await window.getByRole("button", { name: "Choose a different folder" }).click();
    await expect(window.getByText(workspaceRoot).first()).toBeVisible({ timeout: 10_000 });

    await window.getByPlaceholder("How can I help you today?").fill(prompt);
    await window.getByRole("button", { name: "Send prompt" }).click();
    await allowWorkspaceAccessIfPrompted(window);

    await expect(window.getByPlaceholder("Continue this thread...")).toBeVisible({ timeout: 20_000 });
    await expect.poll(
      async () => {
        return await window.evaluate(async (submittedPrompt) => {
          const bootstrap = await window.sense1Desktop.session.get();
          return (
            bootstrap.selectedThread?.entries.filter(
              (entry) => entry.kind === "user" && "body" in entry && entry.body === submittedPrompt,
            ).length ?? 0
          );
        }, prompt);
      },
      { timeout: 20_000 },
    ).toBe(1);

    await expect(window.getByRole("heading", { name: "Sign in to continue" })).toHaveCount(0);
    await expect(window.getByRole("button", { exact: true, name: "sense-1" })).toBeVisible({ timeout: 20_000 });

    await expect.poll(
      async () => {
        return await window.evaluate(async () => {
          const bootstrap = await window.sense1Desktop.session.get();
          return bootstrap.isSignedIn;
        });
      },
      { timeout: 20_000 },
    ).toBe(true);
  } finally {
    await app.close();
  }
});
