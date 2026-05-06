import test from "node:test";
import assert from "node:assert/strict";

import {
  extractPromptShortcutTokens,
  replaceActivePromptShortcut,
  resolvePromptShortcutInputItems,
  resolvePromptShortcutSuggestions,
  stripResolvedPromptShortcutText,
} from "./prompt-shortcuts.ts";

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

function createBrowserUseOverview() {
  return {
    apps: [],
    plugins: [
      {
        id: "browser-use@openai-bundled",
        name: "browser-use",
        displayName: "Browser Use",
        description: "Control the in-app browser with Codex",
        appIds: [],
        marketplaceName: "openai-bundled",
        marketplacePath: "/tmp/openai-bundled/.agents/plugins/marketplace.json",
        installed: true,
        enabled: true,
        installPolicy: "AVAILABLE",
        authPolicy: "ON_INSTALL",
        category: "Engineering",
        capabilities: ["Interactive"],
        sourcePath: "/tmp/openai-bundled/plugins/browser-use",
        websiteUrl: null,
        iconPath: "/tmp/openai-bundled/plugins/browser-use/assets/browser.png",
      },
    ],
    skills: [
      {
        name: "browser-use:browser",
        description: "Use the in-app browser",
        path: "/tmp/openai-bundled/plugins/browser-use/skills/browser/SKILL.md",
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

test("at-prefixed Browser Use shortcut resolves to a structured plugin skill mention", () => {
  const overview = createBrowserUseOverview();
  assert.deepEqual(extractPromptShortcutTokens("use @browser-use to open localhost"), ["browser-use"]);
  assert.deepEqual(resolvePromptShortcutInputItems("use @browser-use to open localhost", overview), [
    {
      type: "mention",
      name: "browser-use:browser",
      path: "/tmp/openai-bundled/plugins/browser-use/skills/browser/SKILL.md",
      token: "browser-use",
    },
  ]);
  assert.equal(
    stripResolvedPromptShortcutText("use @browser-use to open localhost", overview),
    "use to open localhost",
  );
});

test("at-prefixed shortcut suggestions preserve the at trigger when accepted", () => {
  const overview = createBrowserUseOverview();
  assert.deepEqual(
    resolvePromptShortcutSuggestions("@bro", overview).map((entry) => `${entry.trigger}${entry.label}:${entry.token}`),
    ["@Browser Use:browser-use"],
  );
  assert.deepEqual(
    replaceActivePromptShortcut("@bro", "browser-use", 4),
    {
      prompt: "@browser-use ",
      cursorIndex: 13,
    },
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
