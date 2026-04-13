import test from "node:test";
import assert from "node:assert/strict";

import { resolvePromptShortcutMatches } from "../../../shared/prompt-shortcuts.ts";

function createOverview() {
  return {
    apps: [
      {
        id: "connector_gmail",
        name: "Gmail",
        description: null,
        installUrl: null,
        isAccessible: true,
        isEnabled: true,
        pluginDisplayNames: [],
      },
      {
        id: "linear",
        name: "Linear",
        description: null,
        installUrl: null,
        isAccessible: true,
        isEnabled: true,
        pluginDisplayNames: [],
      },
    ],
    plugins: [
      {
        id: "gmail",
        name: "gmail",
        displayName: "Gmail",
        description: null,
        appIds: ["connector_gmail"],
        marketplaceName: "OpenAI Curated",
        marketplacePath: "/tmp/openai-curated-marketplace.json",
        installed: true,
        enabled: true,
        installPolicy: "AVAILABLE",
        authPolicy: "ON_INSTALL",
        category: null,
        capabilities: [],
        sourcePath: null,
        websiteUrl: null,
      },
    ],
    skills: [
      {
        name: "autopilot",
        description: null,
        path: "/Users/george/.codex/skills/autopilot/SKILL.md",
        scope: "global",
        enabled: true,
        cwd: null,
      },
    ],
  };
}

test("resolved shortcut matches expose pill labels for installed plugin apps, skills, and direct apps", () => {
  const matches = resolvePromptShortcutMatches(
    "Use $gmail with $autopilot and sync $linear.",
    createOverview(),
  );

  assert.deepEqual(
    matches.map((match) => ({ kind: match.kind, label: match.label })),
    [
      { kind: "app", label: "Gmail" },
      { kind: "skill", label: "autopilot" },
      { kind: "app", label: "Linear" },
    ],
  );
});

test("resolved shortcut matches stay empty when no shortcuts resolve", () => {
  assert.deepEqual(
    resolvePromptShortcutMatches("Explain how $PATH lookup works.", {
      apps: [],
      plugins: [],
      skills: [],
    }),
    [],
  );
});

test("plugin-app shortcut pills stay hidden until the backing app is accessible", () => {
  const overview = createOverview();
  overview.apps[0] = {
    id: "connector_gmail",
    name: "Gmail",
    description: null,
    installUrl: "https://chatgpt.com/gmail/install",
    isAccessible: false,
    isEnabled: true,
    pluginDisplayNames: [],
  };

  assert.deepEqual(
    resolvePromptShortcutMatches("Use $gmail", overview),
    [],
  );
});
