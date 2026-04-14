import test from "node:test";
import assert from "node:assert/strict";

import { stripResolvedPromptShortcutText } from "./prompt-shortcuts.ts";

function createOverview() {
  return {
    apps: [
      {
        id: "connector_outlook_email",
        name: "Outlook Email",
        description: null,
        installUrl: null,
        isAccessible: true,
        isEnabled: true,
        pluginDisplayNames: [],
      },
    ],
    plugins: [],
    skills: [
      {
        name: "gmail:gmail",
        description: null,
        path: "/Users/george/.codex/plugins/gmail/skills/gmail/SKILL.md",
        scope: "plugin",
        enabled: true,
        cwd: null,
      },
    ],
  };
}

test("stripResolvedPromptShortcutText removes resolved namespaced skill tokens from display copy", () => {
  assert.equal(
    stripResolvedPromptShortcutText("any important emails in $gmail:gmail ?", createOverview()),
    "any important emails?",
  );
});

test("stripResolvedPromptShortcutText removes resolved app tokens but leaves unresolved env-style text alone", () => {
  assert.equal(
    stripResolvedPromptShortcutText("Ask $outlook-email and explain $PATH lookup.", createOverview()),
    "Ask and explain $PATH lookup.",
  );
});
