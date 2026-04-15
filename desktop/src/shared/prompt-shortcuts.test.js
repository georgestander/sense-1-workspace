import test from "node:test";
import assert from "node:assert/strict";

import { resolvePromptShortcutSuggestions, stripResolvedPromptShortcutText } from "./prompt-shortcuts.ts";

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

test("stripResolvedPromptShortcutText removes resolved tokens case-insensitively", () => {
  assert.equal(
    stripResolvedPromptShortcutText("Any important emails in $GMAIL:GMAIL ?", createOverview()),
    "Any important emails?",
  );
});

test("resolvePromptShortcutSuggestions falls back to unique app ids when human aliases collide", () => {
  const overview = {
    apps: [
      {
        id: "connector_outlook_email",
        name: "Outlook Email",
        description: "Primary mailbox",
        installUrl: null,
        isAccessible: true,
        isEnabled: true,
        pluginDisplayNames: [],
      },
      {
        id: "connector_outlook_email_v2",
        name: "Outlook Email",
        description: "Shared mailbox",
        installUrl: null,
        isAccessible: true,
        isEnabled: true,
        pluginDisplayNames: [],
      },
    ],
    plugins: [],
    skills: [],
  };

  assert.deepEqual(
    resolvePromptShortcutSuggestions("$out", overview).map((entry) => `${entry.label}:${entry.token}`),
    [
      "Outlook Email:connector_outlook_email",
      "Outlook Email:connector_outlook_email_v2",
    ],
  );
});
