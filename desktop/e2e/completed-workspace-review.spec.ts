import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { launchApp } from "./electron-helpers";

const FIXTURE_EMAIL = "workspace-review@example.com";

async function createSignedInRuntimeRoot(profileId: string) {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-e2e-review-"));
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
  const profileId = options.profileId ?? "e2e-workspace-review";
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

async function readBootstrap(window: Page) {
  return await window.evaluate(async () => {
    return await window.sense1Desktop.session.get();
  });
}

async function ensureSupportedModel(window: Page) {
  const modelSelect = window.locator("select").first();
  if (!(await modelSelect.count())) {
    return;
  }

  const runtimeModels = await window.evaluate(async () => {
    return await window.sense1Desktop.models.list();
  });
  const preferredModel =
    runtimeModels.models.find((entry) => entry.id.includes("mini"))?.id
    ?? runtimeModels.models.find((entry) => entry.isDefault)?.id
    ?? runtimeModels.models[0]?.id
    ?? null;
  if (preferredModel) {
    await modelSelect.selectOption(preferredModel);
  }
}

async function submitPrompt(window: Page, prompt: string) {
  const composer = window.getByPlaceholder(/How can I help you today\?|Continue this thread\.\.\./);
  await composer.fill(prompt);
  const sendButton = window.getByRole("button", { name: /Send (prompt|message)/ });
  await sendButton.click();
}

async function ensureRightRailOpen(window: Page) {
  const expandButton = window.getByRole("button", { name: "Expand right sidebar" });
  if (await expandButton.count()) {
    await expandButton.click();
  }

  await expect(window.getByRole("button", { name: /Collapse right sidebar|Expand right sidebar/ })).toBeVisible({
    timeout: 10_000,
  });
}

async function expectWorkspaceChosen(window: Page, workspaceRoot: string) {
  await expect(window.getByText(workspaceRoot).first()).toBeVisible({ timeout: 10_000 });
}

async function allowWorkspaceIfPrompted(window: Page) {
  const allowAlwaysButton = window.getByRole("button", { name: "Allow always" });
  if (await allowAlwaysButton.count()) {
    await allowAlwaysButton.click();
  }
}

test("completed workspace runs return structured review data with changed files and output artifacts", async () => {
  test.setTimeout(90_000);

  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-e2e-review-workspace-"));
  const existingFilePath = path.join(workspaceRoot, "review-existing.txt");
  const createdFileBasename = "review-created.txt";
  const modifiedFileBasename = "review-existing.txt";
  const initialExistingFileContents = "seed content\n";
  await fs.writeFile(existingFilePath, initialExistingFileContents, "utf8");

  const profileId = "e2e-workspace-review";
  const { app, runtimeRoot, window } = await launchSignedInDesktop({
    env: {
      SENSE1_E2E_PICK_FOLDER_PATH: workspaceRoot,
    },
    profileId,
  });

  try {
    await window.getByRole("button", { name: "Choose folder" }).click();
    await window.getByRole("button", { name: "Choose a different folder" }).click();
    await expectWorkspaceChosen(window, workspaceRoot);
    await ensureSupportedModel(window);

    await submitPrompt(window, "Summarize this workspace in one short sentence. Do not change files.");
    await allowWorkspaceIfPrompted(window);
    await expect(window.locator("body")).toContainText("Ready for the next prompt.", { timeout: 30_000 });

    const startedBootstrap = await readBootstrap(window);
    const threadId = startedBootstrap.selectedThread?.id;
    if (!threadId) {
      throw new Error("Expected the desktop app to select the started workspace thread.");
    }

    const createdFilePath = path.join(workspaceRoot, createdFileBasename);
    const seededSummary = "Created a review artifact and updated the existing note.";
    const seededAt = new Date().toISOString();
    await fs.writeFile(createdFilePath, "created by desktop review fixture\n", "utf8");
    await fs.writeFile(existingFilePath, "modified by desktop review fixture\n", "utf8");

    const profileRoot = path.join(runtimeRoot, "profiles", profileId);
    const dbPath = path.join(profileRoot, "sense1.db");
    const interactionStatesPath = path.join(profileRoot, "thread-interaction-states.json");
    const db = new DatabaseSync(dbPath);
    try {
      const session = db.prepare(
        "SELECT id, summary, metadata FROM sessions WHERE codex_thread_id = ?",
      ).get(threadId) as { id: string; summary: string | null; metadata: string | null } | undefined;
      if (!session?.id) {
        throw new Error("Expected a substrate session for the started workspace thread.");
      }

      let metadata: Record<string, unknown> = {};
      if (typeof session.metadata === "string" && session.metadata.trim()) {
        metadata = JSON.parse(session.metadata) as Record<string, unknown>;
      }

      metadata.reviewSummary = {
        summary: seededSummary,
        updatedAt: seededAt,
      };

      db.prepare(
        `UPDATE sessions
         SET status = 'completed',
             ended_at = ?,
             summary = ?,
             metadata = ?
         WHERE id = ?`,
      ).run(seededAt, seededSummary, JSON.stringify(metadata), session.id);

      db.prepare("DELETE FROM object_refs WHERE session_id = ?").run(session.id);
      db.prepare(
        `INSERT INTO object_refs (id, session_id, ref_type, ref_path, ref_id, action, ts, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "obj_created_review",
        session.id,
        "file",
        createdFilePath,
        "file-created-review",
        "created",
        seededAt,
        JSON.stringify({ source: "e2e-fixture" }),
      );
      db.prepare(
        `INSERT INTO object_refs (id, session_id, ref_type, ref_path, ref_id, action, ts, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "obj_modified_review",
        session.id,
        "file",
        existingFilePath,
        "file-modified-review",
        "modified",
        seededAt,
        JSON.stringify({ source: "e2e-fixture" }),
      );
    } finally {
      db.close();
    }

    await fs.writeFile(
      interactionStatesPath,
      JSON.stringify(
        {
          states: [
            {
              threadId,
              interactionState: "review",
              updatedAt: seededAt,
            },
          ],
          updated_at: seededAt,
        },
        null,
        2,
      ),
      "utf8",
    );

    await expect.poll(
      async () => {
        const bootstrap = await readBootstrap(window);
        const reviewSummary = bootstrap.selectedThread?.reviewSummary ?? null;
        return {
          interactionState: bootstrap.selectedThread?.interactionState ?? null,
          hasCreatedFile: reviewSummary?.createdFiles.some((artifact) => artifact.path?.endsWith(createdFileBasename)) ?? false,
          hasModifiedFile: reviewSummary?.modifiedFiles.some((artifact) => artifact.path?.endsWith(modifiedFileBasename)) ?? false,
          hasOutputArtifact: reviewSummary?.outputArtifacts.some((artifact) => artifact.path?.endsWith(createdFileBasename)) ?? false,
          hasChangedCreated: reviewSummary?.changedArtifacts.some((artifact) => artifact.path?.endsWith(createdFileBasename)) ?? false,
          hasChangedModified: reviewSummary?.changedArtifacts.some((artifact) => artifact.path?.endsWith(modifiedFileBasename)) ?? false,
          hasSummary: Boolean(reviewSummary?.summary?.trim()),
        };
      },
      { timeout: 20_000 },
    ).toEqual({
      interactionState: "review",
      hasCreatedFile: true,
      hasModifiedFile: true,
      hasOutputArtifact: true,
      hasChangedCreated: true,
      hasChangedModified: true,
      hasSummary: true,
    });

    const createdFileContents = await fs.readFile(path.join(workspaceRoot, createdFileBasename), "utf8");
    const modifiedFileContents = await fs.readFile(existingFilePath, "utf8");
    expect(createdFileContents.trim().length).toBeGreaterThan(0);
    expect(modifiedFileContents).not.toBe(initialExistingFileContents);
  } finally {
    await app.close();
  }
});

test("right rail hides runtime-support paths and keeps user-facing artifacts visible", async () => {
  test.setTimeout(90_000);

  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-e2e-right-rail-workspace-"));
  const visibleExistingPath = path.join(workspaceRoot, "docs", "proposal.md");
  const visibleCreatedPath = path.join(workspaceRoot, "deliverables", "budget.xlsx");
  const hiddenOutputPath = path.join(workspaceRoot, "output", "rendered", "report.md");
  const hiddenRetrievalPath = path.join(workspaceRoot, "retrieval", "cache.json");
  const hiddenObservabilityPath = path.join(workspaceRoot, "observability", "run-log.json");
  await fs.mkdir(path.dirname(visibleExistingPath), { recursive: true });
  await fs.mkdir(path.dirname(visibleCreatedPath), { recursive: true });
  await fs.mkdir(path.dirname(hiddenOutputPath), { recursive: true });
  await fs.mkdir(path.dirname(hiddenRetrievalPath), { recursive: true });
  await fs.mkdir(path.dirname(hiddenObservabilityPath), { recursive: true });
  await fs.writeFile(visibleExistingPath, "# Proposal\n", "utf8");
  await fs.writeFile(visibleCreatedPath, "budget data\n", "utf8");
  await fs.writeFile(hiddenOutputPath, "internal output\n", "utf8");
  await fs.writeFile(hiddenRetrievalPath, "{\"cached\":true}\n", "utf8");
  await fs.writeFile(hiddenObservabilityPath, "{\"trace\":true}\n", "utf8");

  const profileId = "e2e-right-rail-artifacts";
  const { app, runtimeRoot, window } = await launchSignedInDesktop({
    env: {
      SENSE1_E2E_PICK_FOLDER_PATH: workspaceRoot,
    },
    profileId,
  });

  try {
    await window.getByRole("button", { name: "Choose folder" }).click();
    await window.getByRole("button", { name: "Choose a different folder" }).click();
    await expectWorkspaceChosen(window, workspaceRoot);
    await ensureSupportedModel(window);

    await submitPrompt(window, "Summarize this workspace in one short sentence. Do not change files.");
    await allowWorkspaceIfPrompted(window);
    await expect(window.locator("body")).toContainText("Ready for the next prompt.", { timeout: 30_000 });

    const startedBootstrap = await readBootstrap(window);
    const threadId = startedBootstrap.selectedThread?.id;
    if (!threadId) {
      throw new Error("Expected the desktop app to select the started workspace thread.");
    }

    const profileRoot = path.join(runtimeRoot, "profiles", profileId);
    const dbPath = path.join(profileRoot, "sense1.db");
    const interactionStatesPath = path.join(profileRoot, "thread-interaction-states.json");
    const seededAt = new Date().toISOString();
    const db = new DatabaseSync(dbPath);

    try {
      const session = db.prepare(
        "SELECT id FROM sessions WHERE codex_thread_id = ?",
      ).get(threadId) as { id: string } | undefined;
      if (!session?.id) {
        throw new Error("Expected a substrate session for the started workspace thread.");
      }

      const workspace = db.prepare(
        "SELECT id FROM workspaces WHERE root_path = ?",
      ).get(workspaceRoot) as { id: string } | undefined;
      if (!workspace?.id) {
        throw new Error("Expected a workspace record for the selected folder.");
      }

      db.prepare(
        `INSERT INTO object_refs (id, session_id, ref_type, ref_path, ref_id, action, ts, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "obj_visible_created_budget",
        session.id,
        "file",
        visibleCreatedPath,
        "file-visible-created-budget",
        "created",
        seededAt,
        JSON.stringify({ source: "e2e-fixture" }),
      );
      db.prepare(
        `INSERT INTO object_refs (id, session_id, ref_type, ref_path, ref_id, action, ts, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "obj_hidden_output_report",
        session.id,
        "file",
        hiddenOutputPath,
        "file-hidden-output-report",
        "created",
        seededAt,
        JSON.stringify({ source: "e2e-fixture" }),
      );
      db.prepare(
        `INSERT INTO object_refs (id, session_id, ref_type, ref_path, ref_id, action, ts, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "obj_hidden_system_texutil",
        session.id,
        "file",
        "/usr/bin/texutil",
        "file-hidden-system-texutil",
        "created",
        seededAt,
        JSON.stringify({ source: "e2e-fixture" }),
      );

      db.prepare(
        `UPDATE sessions
         SET status = 'completed',
             ended_at = ?
         WHERE id = ?`,
      ).run(seededAt, session.id);

      db.prepare(
        `UPDATE workspace_projections
         SET recent_file_paths = ?
         WHERE workspace_id = ?`,
      ).run(
        JSON.stringify([
          visibleExistingPath,
          hiddenRetrievalPath,
          hiddenObservabilityPath,
        ]),
        workspace.id,
      );

      db.prepare(
        `UPDATE workspace_policies
         SET read_granted = 1,
             read_granted_at = ?,
             known_structure = ?,
             last_hydrated_at = ?
         WHERE workspace_root = ?`,
      ).run(
        seededAt,
        JSON.stringify([
          { name: "docs", type: "directory", path: path.join(workspaceRoot, "docs") },
          { name: "proposal.md", type: "file", path: visibleExistingPath },
          { name: "output", type: "directory", path: path.join(workspaceRoot, "output") },
          { name: "report.md", type: "file", path: hiddenOutputPath },
          { name: "retrieval", type: "directory", path: path.join(workspaceRoot, "retrieval") },
          { name: "cache.json", type: "file", path: hiddenRetrievalPath },
        ]),
        seededAt,
        workspaceRoot,
      );
    } finally {
      db.close();
    }

    await fs.writeFile(
      interactionStatesPath,
      JSON.stringify(
        {
          states: [
            {
              threadId,
              interactionState: "review",
              updatedAt: seededAt,
            },
          ],
          updated_at: seededAt,
        },
        null,
        2,
      ),
      "utf8",
    );

    await window.reload({ waitUntil: "domcontentloaded" });
    await ensureRightRailOpen(window);

    const rightRail = window.locator("aside").last();
    await expect(rightRail).toContainText("budget.xlsx", { timeout: 20_000 });
    await expect(rightRail).toContainText("proposal.md", { timeout: 20_000 });
    await expect(rightRail).not.toContainText("report.md");
    await expect(rightRail).not.toContainText("cache.json");
    await expect(rightRail).not.toContainText("run-log.json");
    await expect(rightRail).not.toContainText("texutil");
    await expect(rightRail).not.toContainText(/\boutput\b/);
    await expect(rightRail).not.toContainText(/\bretrieval\b/);
    await expect(rightRail).not.toContainText(/\bobservability\b/);
  } finally {
    await app.close();
  }
});
