import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { launchApp } from "./electron-helpers";

const FIXTURE_EMAIL = "workspace-ordering@example.com";

async function createSignedInRuntimeRoot(profileId: string) {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-e2e-workspace-order-"));
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

async function launchSignedInDesktop(runtimeRoot: string, profileId: string) {
  const launched = await launchApp({
    env: {
      SENSE1_E2E_AUTH_FIXTURE: "1",
      SENSE1_RUNTIME_STATE_ROOT: runtimeRoot,
    },
    profileId,
  });

  await expect(launched.window.getByRole("button", { name: "New task" })).toBeVisible({ timeout: 20_000 });
  return launched;
}

async function readBootstrap(window: Page) {
  return await window.evaluate(async () => {
    return await window.sense1Desktop.session.get();
  });
}

async function seedWorkspaceThread(window: Page, workspaceRoot: string, prompt: string) {
  await window.evaluate(
    async ({ prompt, workspaceRoot: root }) => {
      const modelsResult = await window.sense1Desktop.models.list();
      const model = modelsResult.models[0]?.id;
      await window.sense1Desktop.turns.run({
        prompt,
        cwd: root,
        workspaceRoot: root,
        ...(model ? { model } : {}),
      });
    },
    { prompt, workspaceRoot },
  );

  await expect.poll(
    async () => {
      const bootstrap = await readBootstrap(window);
      return bootstrap.recentThreads.some((thread) => thread.workspaceRoot === workspaceRoot);
    },
    { timeout: 30_000 },
  ).toBe(true);
}

function resolveWorkspaceRootByName(workspaceRoots: string[], workspaceName: string): string | null {
  return workspaceRoots.find((workspaceRoot) => path.basename(workspaceRoot) === workspaceName) ?? null;
}

async function sidebarWorkspaceOrder(window: Page) {
  return await window.locator('button[aria-label^="Expand workspace "], button[aria-label^="Collapse workspace "]').evaluateAll(
    (elements) =>
      elements.map((element) =>
        (element.getAttribute("aria-label") || "")
          .replace(/^Expand workspace\s+/u, "")
          .replace(/^Collapse workspace\s+/u, ""),
      ),
  );
}

async function savedWorkspaceOrder(window: Page) {
  const bootstrap = await readBootstrap(window);
  return bootstrap.workspaceSidebarOrder ?? [];
}

test("workspace order persists and the active workspace floats to the top", async () => {
  const profileId = "e2e-workspace-order";
  const runtimeRoot = await createSignedInRuntimeRoot(profileId);
  const alphaRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-alpha-workspace-"));
  const betaRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-beta-workspace-"));
  const gammaRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-gamma-workspace-"));
  const workspaceRoots = [alphaRoot, betaRoot, gammaRoot];
  const prompts = workspaceRoots.map((workspaceRoot) => `Quick note for ${path.basename(workspaceRoot)}. Do not change files.`);

  let app: ElectronApplication | undefined;
  let window: Page | undefined;

  try {
    ({ app, window } = await launchSignedInDesktop(runtimeRoot, profileId));

    for (const [index, workspaceRoot] of workspaceRoots.entries()) {
      await seedWorkspaceThread(window, workspaceRoot, prompts[index]);
    }

    await app.close();
    ({ app, window } = await launchSignedInDesktop(runtimeRoot, profileId));
    await window.getByRole("button", { name: "sense-1" }).click();
    await expect.poll(async () => (await sidebarWorkspaceOrder(window)).length, { timeout: 20_000 }).toBe(3);

    const initialOrder = await sidebarWorkspaceOrder(window);
    expect(initialOrder).toHaveLength(3);
    const activeWorkspace = initialOrder[0];
    const nonActiveOrder = initialOrder.filter((workspaceName) => workspaceName !== activeWorkspace);
    expect(nonActiveOrder).toHaveLength(2);

    const workspaceToPromoteName = nonActiveOrder.at(-1);
    if (!workspaceToPromoteName) {
      throw new Error("Expected a workspace to move.");
    }
    const activeWorkspaceRoot = resolveWorkspaceRootByName(workspaceRoots, activeWorkspace);
    const workspaceToPromote = resolveWorkspaceRootByName(workspaceRoots, workspaceToPromoteName);
    if (!activeWorkspaceRoot || !workspaceToPromote) {
      throw new Error("Expected to resolve workspace roots from the visible order.");
    }

    const reorderedRoots = [
      workspaceToPromote,
      ...nonActiveOrder
        .filter((workspaceName) => workspaceName !== workspaceToPromoteName)
        .map((workspaceName) => {
          const workspaceRoot = resolveWorkspaceRootByName(workspaceRoots, workspaceName);
          if (!workspaceRoot) {
            throw new Error(`Expected to resolve ${workspaceName} to a workspace root.`);
          }
          return workspaceRoot;
        }),
      activeWorkspaceRoot,
    ];
    await window.evaluate(async (rootPaths) => {
      await window.sense1Desktop.workspace.rememberSidebarOrder({ rootPaths });
    }, reorderedRoots);
    await expect.poll(async () => (await savedWorkspaceOrder(window))[0], { timeout: 20_000 }).toBe(workspaceToPromote);

    const reorderedBeforeRestart = await savedWorkspaceOrder(window);
    expect(reorderedBeforeRestart[0]).toBe(workspaceToPromote);

    await app.close();
    ({ app, window } = await launchSignedInDesktop(runtimeRoot, profileId));

    await window.getByRole("button", { name: "sense-1" }).click();
    await expect.poll(async () => (await sidebarWorkspaceOrder(window)).length, { timeout: 20_000 }).toBe(3);

    const persistedOrder = await savedWorkspaceOrder(window);
    expect(persistedOrder[0]).toBe(workspaceToPromote);

    const workspaceToActivate = persistedOrder.find((workspaceRoot) => workspaceRoot !== workspaceToPromote);
    if (!workspaceToActivate) {
      throw new Error("Expected another workspace for the active-order check.");
    }
    const workspaceToActivateName = path.basename(workspaceToActivate);

    await window.getByRole("button", { name: `New thread in ${workspaceToActivateName}` }).click();
    await expect(window.getByPlaceholder("How can I help you today?")).toBeVisible({ timeout: 20_000 });

    const promotedOrder = await sidebarWorkspaceOrder(window);
    expect(promotedOrder[0]).toBe(workspaceToActivateName);

    await window.getByRole("button", { name: "sense-1" }).click();
    await expect(window.getByRole("heading", { name: "Let's knock something off your list" })).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await sidebarWorkspaceOrder(window))[0], { timeout: 10_000 }).toBe(path.basename(workspaceToPromote));
  } finally {
    await app?.close();
  }
});
