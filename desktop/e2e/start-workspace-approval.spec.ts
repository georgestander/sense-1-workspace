import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { launchApp } from "./electron-helpers";

const FIXTURE_EMAIL = "scenario-user@example.com";

async function createSignedInRuntimeRoot(profileId: string) {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-e2e-scenarios-"));
  const profilesDir = path.join(runtimeRoot, "profiles");

  await fs.mkdir(path.join(profilesDir, profileId, "codex-home"), { recursive: true });
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
  const profileId = options.profileId ?? "e2e-scenarios";
  const runtimeRoot = await createSignedInRuntimeRoot(profileId);
  const { app, window } = await launchApp({
    env: {
      SENSE1_E2E_AUTH_FIXTURE: "1",
      SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
      ...(options.env ?? {}),
    },
    profileId,
  });

  await expect(window.getByRole("button", { name: "New task" })).toBeVisible({ timeout: 20_000 });
  await expect(window.getByRole("button", { name: "Start chatting" })).toBeVisible({ timeout: 20_000 });
  return { app, runtimeRoot, window };
}

async function submitPrompt(window: Page, prompt: string) {
  await window.getByPlaceholder("How can I help you today?").fill(prompt);
  await window.getByRole("button", { name: "Send prompt" }).click();
}

async function ensureSupportedModel(window: Page) {
  const modelSelect = window.locator("select").first();
  if (await modelSelect.count()) {
    try {
      const runtimeModels = await window.evaluate(async () => {
        return await window.sense1Desktop.models.list();
      });
      const preferredModel =
        runtimeModels.models.find((entry) => entry.isDefault)?.id
        ?? runtimeModels.models[0]?.id
        ?? null;
      if (preferredModel) {
        await modelSelect.selectOption(preferredModel);
      }
    } catch {
      // Leave the current model alone if the runtime does not expose a selectable model here.
    }
  }
}

async function expectThreadView(window: Page) {
  await expect(window.getByRole("heading", { name: "Let's knock something off your list" })).toHaveCount(0, { timeout: 20_000 });
  await expect(window.getByText("Add local files")).toBeVisible({ timeout: 20_000 });
}

async function readBootstrap(window: Page) {
  return await window.evaluate(async () => {
    return await window.sense1Desktop.session.get();
  });
}

test.describe("desktop scenario coverage", () => {
  test("start surface model picker mirrors the runtime model list", async () => {
    const { app, window } = await launchSignedInDesktop({ profileId: "e2e-model-list" });

    try {
      const runtimeModels = await window.evaluate(async () => {
        return await window.sense1Desktop.models.list();
      });
      expect(runtimeModels.models.length).toBeGreaterThan(0);

      const modelOptions = await window.locator("select").first().locator("option").evaluateAll((options) =>
        options.map((option) => ({
          label: option.textContent?.trim() ?? "",
          value: option.getAttribute("value") ?? "",
        })),
      );

      expect(modelOptions.map((option) => option.value)).toEqual(runtimeModels.models.map((model) => model.id));
    } finally {
      await app.close();
    }
  });

  test("thread composer reasoning picker falls back to documented GPT-5 efforts when the runtime omits them", async () => {
    const { app, window } = await launchSignedInDesktop({ profileId: "e2e-reasoning-list" });

    try {
      await submitPrompt(window, "Start a quick QA note about desktop continuity.");
      await expectThreadView(window);

      const composerSelects = window.locator("select");
      const selectCount = await composerSelects.count();
      expect(selectCount).toBeGreaterThan(1);

      const selectedModel = await composerSelects.first().inputValue();
      const reasoningOptions = await composerSelects.nth(1).locator("option").evaluateAll((options) =>
        options.map((option) => option.getAttribute("value") ?? ""),
      );

      expect(reasoningOptions.length).toBeGreaterThan(0);

      if (selectedModel.includes("pro")) {
        expect(reasoningOptions).toEqual(["high"]);
      } else if (selectedModel.startsWith("gpt-5.1")) {
        expect(reasoningOptions).toEqual(["none", "low", "medium", "high"]);
      } else {
        expect(reasoningOptions).toEqual(["low", "medium", "high", "xhigh"]);
      }
    } finally {
      await app.close();
    }
  });

  test("plain chat starts a live thread and can reopen from recents", async () => {
    const { app, window } = await launchSignedInDesktop();

    try {
      await submitPrompt(window, "Start a quick QA note about desktop continuity.");
      await expectThreadView(window);

      const startedBootstrap = await readBootstrap(window);
      expect(startedBootstrap.selectedThread?.id).toBeTruthy();
      expect(startedBootstrap.selectedThread?.workspaceRoot ?? null).toBeNull();

      await window.getByRole("button", { name: "sense-1" }).click();
      await expect(window.getByRole("heading", { name: "Let's knock something off your list" })).toBeVisible();

      const recentBootstrap = await readBootstrap(window);
      const recentThread = recentBootstrap.recentThreads[0];
      expect(recentThread?.id).toBeTruthy();
      expect(recentThread?.title).toBeTruthy();

      await window.locator("aside").first().getByText(recentThread.title, { exact: true }).first().click();
      await expectThreadView(window);

      const reopenedBootstrap = await readBootstrap(window);
      const reopenedSelectedThreadId = reopenedBootstrap.selectedThread?.id ?? recentThread.id;
      expect(reopenedSelectedThreadId).toBe(recentThread.id);
    } finally {
      await app.close();
    }
  });

  test("native folder picker fixture chooses a folder and surfaces workspace recents", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-e2e-workspace-"));
    const { app, window } = await launchSignedInDesktop({
      env: {
        SENSE1_E2E_PICK_FOLDER_PATH: workspaceRoot,
      },
      profileId: "e2e-workspace",
    });

    try {
      await window.getByRole("button", { name: "Choose folder" }).click();
      await window.getByRole("button", { name: "Choose a different folder" }).click();
      await expect(window.getByText(workspaceRoot)).toBeVisible({ timeout: 10_000 });

      await submitPrompt(window, "Write a quick workspace status note.");
      await expectThreadView(window);

      const threadBootstrap = await readBootstrap(window);
      expect(threadBootstrap.selectedThread?.workspaceRoot).toBe(workspaceRoot);

      await window.getByRole("button", { name: "sense-1" }).click();
      await expect(window.getByRole("button", { name: new RegExp(path.basename(workspaceRoot), "i") }).first()).toBeVisible();
      await expect(window.getByText("Recent threads")).toBeVisible();

      const recentBootstrap = await readBootstrap(window);
      expect(recentBootstrap.recentThreads.some((thread) => thread.workspaceRoot === workspaceRoot)).toBe(true);

      await window.getByRole("button", { name: new RegExp(path.basename(workspaceRoot), "i") }).first().click();
      await expect(window.locator("body")).toContainText(path.basename(workspaceRoot));
    } finally {
      await app.close();
    }
  });

  test("out-of-folder request raises a pending approval instead of running immediately", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-e2e-approval-"));
    const { app, window } = await launchSignedInDesktop({
      env: {
        SENSE1_E2E_PICK_FOLDER_PATH: workspaceRoot,
      },
      profileId: "e2e-approval",
    });

    try {
      await window.getByRole("button", { name: "Choose folder" }).click();
      await window.getByRole("button", { name: "Choose a different folder" }).click();
      await expect(window.getByText(workspaceRoot)).toBeVisible({ timeout: 10_000 });

      await submitPrompt(window, "Write a file to /tmp/sense1-approval-check.txt");

      await expect(window.locator("body")).toContainText("Workspace access for /tmp", { timeout: 10_000 });
      await expect(window.locator("body")).toContainText("Waiting for your approval before continuing.", { timeout: 10_000 });

      const pendingBootstrap = await readBootstrap(window);
      expect(pendingBootstrap.pendingApprovals).toHaveLength(1);

      await window.evaluate(async () => {
        const bootstrap = await window.sense1Desktop.session.get();
        const approval = bootstrap.pendingApprovals[0];
        if (!approval) {
          throw new Error("Expected a pending approval before declining it.");
        }
        await window.sense1Desktop.approvals.respond({
          requestId: approval.id,
          decision: "decline",
        });
      });
      await expect.poll(async () => {
        const resolvedBootstrap = await readBootstrap(window);
        return resolvedBootstrap.pendingApprovals.length;
      }, { timeout: 10_000 }).toBe(0);
    } finally {
      await app.close();
    }
  });

  test("vague build-style workspace requests stay in clarification until the missing details are supplied", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-e2e-plan-gate-"));
    const { app, window } = await launchSignedInDesktop({
      env: {
        SENSE1_E2E_PICK_FOLDER_PATH: workspaceRoot,
      },
      profileId: "e2e-plan-gate",
    });

    try {
      await window.getByRole("button", { name: "Choose folder" }).click();
      await window.getByRole("button", { name: "Choose a different folder" }).click();
      await expect(window.getByText(workspaceRoot)).toBeVisible({ timeout: 10_000 });
      await ensureSupportedModel(window);

      await submitPrompt(window, "Build a landing page for a robotics startup in this workspace.");

      await expect(window.locator("body")).toContainText("Clarifying", { timeout: 10_000 });
      await expect(window.locator("body")).toContainText("still too vague for a useful plan", { timeout: 10_000 });
      await expect(window.locator("body")).toContainText("What specifically should Sense-1 change, where should it work, and what outcome matters most?", { timeout: 10_000 });
      await expect(window.getByPlaceholder("Type your answer...")).toBeVisible({ timeout: 10_000 });
      await expect(window.getByText("Proposed plan", { exact: true })).toHaveCount(0);
      await expect(window.getByRole("button", { name: "Approve plan" })).toHaveCount(0);
      await expect(window.getByRole("button", { name: "Revise plan" })).toHaveCount(0);
      await expect(window.getByRole("button", { name: "Add details" })).toHaveCount(0);
      await expect(window.locator("body")).not.toContainText("Command execution");

      const clarificationBootstrap = await readBootstrap(window);
      expect(clarificationBootstrap.pendingApprovals).toHaveLength(0);
      expect(clarificationBootstrap.selectedThread?.inputRequestState?.prompt ?? "").toContain("still too vague for a useful plan");

      await window.reload({ waitUntil: "domcontentloaded" });
      await expect(window.locator("body")).toContainText("Clarifying", { timeout: 10_000 });
      await expect(window.locator("body")).toContainText("still too vague for a useful plan", { timeout: 10_000 });
      await expect(window.getByText("Proposed plan", { exact: true })).toHaveCount(0);

      const refreshedBootstrap = await readBootstrap(window);
      expect(refreshedBootstrap.selectedThread?.inputRequestState?.prompt ?? "").toContain("still too vague for a useful plan");
    } finally {
      await app.close();
    }
  });

  test("read-only workspace prompts stay conversational and do not show a plan card", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-e2e-readonly-"));
    const { app, window } = await launchSignedInDesktop({
      env: {
        SENSE1_E2E_PICK_FOLDER_PATH: workspaceRoot,
      },
      profileId: "e2e-readonly",
    });

    try {
      await window.getByRole("button", { name: "Choose folder" }).click();
      await window.getByRole("button", { name: "Choose a different folder" }).click();
      await expect(window.getByText(workspaceRoot)).toBeVisible({ timeout: 10_000 });
      await ensureSupportedModel(window);

      await submitPrompt(
        window,
        "Can you talk through what a good landing page should include for a robotics startup? Do not change any files.",
      );

      await expect(window.locator("body")).toContainText(
        "Can you talk through what a good landing page should include for a robotics startup? Do not change any files.",
        { timeout: 20_000 },
      );
      await expect.poll(
        async () => {
          const bootstrap = await readBootstrap(window);
          return bootstrap.selectedThread?.interactionState ?? null;
        },
        { timeout: 20_000 },
      ).toBe("conversation");
      await expect(window.getByText("Proposed plan")).toHaveCount(0);
      await expect(window.getByText("Generating plan")).toHaveCount(0);
      await expect(window.getByRole("button", { name: "Approve plan" })).toHaveCount(0);
      await expect(window.locator("body")).not.toContainText("Command execution");
    } finally {
      await app.close();
    }
  });

  test("approved plan state survives a refresh and stays visible", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-e2e-approved-plan-"));
    const { app, window } = await launchSignedInDesktop({
      env: {
        SENSE1_E2E_PICK_FOLDER_PATH: workspaceRoot,
      },
      profileId: "e2e-approved-plan",
    });

    try {
      await window.getByRole("button", { name: "Choose folder" }).click();
      await window.getByRole("button", { name: "Choose a different folder" }).click();
      await expect(window.getByText(workspaceRoot)).toBeVisible({ timeout: 10_000 });
      await ensureSupportedModel(window);

      await submitPrompt(
        window,
        "Create a single static landing page in this empty workspace for a robotics startup. Use plain HTML and CSS. One page only.",
      );
      await expect(window.getByRole("button", { name: "Approve plan" })).toBeVisible({ timeout: 10_000 });

      await window.getByRole("button", { name: "Approve plan" }).click();
      await expect(window.locator("body")).toContainText("Plan approved", { timeout: 10_000 });
      await expect(window.locator("body")).toContainText("This plan is approved and ready to run.", { timeout: 10_000 });

      await window.reload({ waitUntil: "domcontentloaded" });
      await expect(window.locator("body")).toContainText("Plan approved", { timeout: 10_000 });
      await expect(window.locator("body")).toContainText("Continue when you're ready.", { timeout: 10_000 });

      const bootstrap = await readBootstrap(window);
      expect(bootstrap.lastSelectedThreadId).toBeTruthy();
      const plansResult = await window.evaluate(async () => {
        const bootstrap = await window.sense1Desktop.session.get();
        return await window.sense1Desktop.plans.listBySession({
          threadId: bootstrap.lastSelectedThreadId ?? undefined,
        });
      });
      expect(plansResult.plans.some((plan: { approval_status?: string }) => plan.approval_status === "approved")).toBe(true);
    } finally {
      await app.close();
    }
  });

  test("settings reject a weaker approval posture and show the reason", async () => {
      const { app, window } = await launchSignedInDesktop({
      profileId: "e2e-settings",
    });

    try {
      await window.getByRole("button", { name: new RegExp(FIXTURE_EMAIL, "i") }).click();
      await window.getByRole("button", { name: "Settings", exact: true }).click();
      await expect(window.getByRole("heading", { name: "Settings" })).toBeVisible();

      const approvalSelect = window.getByLabel("Approval posture");
      await approvalSelect.selectOption("never");

      await expect(window.getByRole("alert")).toContainText(/cannot weaken approval posture/i);
      await expect(approvalSelect).toHaveValue("onRequest");
    } finally {
      await app.close();
    }
  });
});
