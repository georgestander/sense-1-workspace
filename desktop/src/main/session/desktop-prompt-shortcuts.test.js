import test from "node:test";
import assert from "node:assert/strict";

import {
  extractPromptShortcutTokens,
  replaceActivePromptShortcut,
  resolveActivePromptShortcutQuery,
  resolveInputItemPromptShortcutMatches,
  resolveManagedExtensionPromptShortcut,
  resolvePromptShortcutInputItems,
  resolvePromptShortcutSuggestions,
} from "./desktop-prompt-shortcuts.ts";

test("extractPromptShortcutTokens preserves order and removes duplicates", () => {
  assert.deepEqual(
    extractPromptShortcutTokens("Use $autopilot with [$gmail], then $autopilot again and $linear."),
    ["autopilot", "gmail", "linear"],
  );
});

test("resolvePromptShortcutInputItems resolves skills, plugin-backed skill aliases, and apps", () => {
  const overview = {
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
        installPolicy: null,
        authPolicy: null,
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
      {
        name: "gmail:gmail",
        description: null,
        path: "/Users/george/.codex/plugins/gmail/skills/gmail/SKILL.md",
        scope: "global",
        enabled: true,
        cwd: null,
      },
      {
        name: "gmail:gmail-inbox-triage",
        description: null,
        path: "/Users/george/.codex/plugins/gmail/skills/gmail-inbox-triage/SKILL.md",
        scope: "global",
        enabled: true,
        cwd: null,
      },
    ],
  };

  assert.deepEqual(
    resolvePromptShortcutInputItems("Use $autopilot to ask $gmail for updates and sync $linear.", overview),
    [
      {
        type: "mention",
        name: "autopilot",
        path: "/Users/george/.codex/skills/autopilot/SKILL.md",
      },
      {
        type: "mention",
        name: "gmail:gmail",
        path: "/Users/george/.codex/plugins/gmail/skills/gmail/SKILL.md",
      },
      {
        type: "mention",
        name: "Linear",
        path: "app://linear",
      },
    ],
  );
});

test("resolvePromptShortcutInputItems leaves plugin-app shortcuts unresolved until the app is accessible", () => {
  const overview = {
    apps: [
      {
        id: "connector_gmail",
        name: "Gmail",
        description: null,
        installUrl: "https://chatgpt.com/gmail/install",
        isAccessible: false,
        isEnabled: true,
        pluginDisplayNames: [],
      },
    ],
    plugins: [
      {
        id: "gmail@openai-curated",
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
    skills: [],
  };

  assert.deepEqual(
    resolvePromptShortcutInputItems("Check $gmail", overview),
    [],
  );
});

test("resolvePromptShortcutInputItems ignores unresolved or disabled shortcuts", () => {
  const overview = {
    apps: [
      {
        id: "gmail",
        name: "Gmail",
        description: null,
        installUrl: null,
        isAccessible: false,
        isEnabled: true,
        pluginDisplayNames: [],
      },
    ],
    plugins: [],
    skills: [
      {
        name: "autopilot",
        description: null,
        path: "/Users/george/.codex/skills/autopilot/SKILL.md",
        scope: "global",
        enabled: false,
        cwd: null,
      },
    ],
  };

  assert.deepEqual(
    resolvePromptShortcutInputItems("Try $autopilot and $gmail and $missing", overview),
    [],
  );
});

test("resolveInputItemPromptShortcutMatches ignores plain file mention attachments", () => {
  assert.deepEqual(
    resolveInputItemPromptShortcutMatches([
      { type: "mention", name: "brief.md", path: "/tmp/session/brief.md" },
      { type: "mention", name: "autopilot", path: "/Users/george/.codex/skills/autopilot/SKILL.md" },
      { type: "mention", name: "Linear", path: "app://linear" },
    ]).map((match) => ({
      kind: match.kind,
      label: match.label,
      token: match.token,
      path: match.item.path,
    })),
    [
      {
        kind: "skill",
        label: "autopilot",
        token: "autopilot",
        path: "/Users/george/.codex/skills/autopilot/SKILL.md",
      },
      {
        kind: "app",
        label: "Linear",
        token: "linear",
        path: "app://linear",
      },
    ],
  );
});

test("resolvePromptShortcutSuggestions opens on bare dollar and narrows as you type", () => {
  const overview = {
    apps: [
      {
        id: "linear",
        name: "Linear",
        description: "Project tracking",
        installUrl: null,
        isAccessible: true,
        isEnabled: true,
        pluginDisplayNames: [],
      },
    ],
    plugins: [],
    skills: [
      {
        name: "excel",
        description: "Spreadsheet help",
        path: "/Users/george/.codex/skills/excel/SKILL.md",
        scope: "global",
        enabled: true,
        cwd: null,
      },
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

  assert.deepEqual(
    resolvePromptShortcutSuggestions("$", overview).map((entry) => entry.token),
    ["autopilot", "excel", "linear"],
  );
  assert.deepEqual(
    resolvePromptShortcutSuggestions("$exc", overview).map((entry) => entry.token),
    ["excel"],
  );
});

test("resolvePromptShortcutSuggestions includes secondary plugin skills without duplicating the primary plugin token", () => {
  const overview = {
    apps: [],
    plugins: [
      {
        id: "gmail",
        name: "gmail",
        displayName: "Gmail",
        description: "Gmail workflows",
        appIds: [],
        marketplaceName: "OpenAI Curated",
        marketplacePath: "/tmp/openai-curated-marketplace.json",
        installed: true,
        enabled: true,
        installPolicy: null,
        authPolicy: null,
        category: null,
        capabilities: [],
        sourcePath: null,
        websiteUrl: null,
      },
    ],
    skills: [
      {
        name: "gmail:gmail",
        description: "Primary Gmail workflow",
        path: "/Users/george/.codex/plugins/gmail/skills/gmail/SKILL.md",
        scope: "plugin",
        enabled: true,
        cwd: null,
      },
      {
        name: "gmail:gmail-inbox-triage",
        description: "Inbox triage",
        path: "/Users/george/.codex/plugins/gmail/skills/gmail-inbox-triage/SKILL.md",
        scope: "plugin",
        enabled: true,
        cwd: null,
      },
    ],
  };

  assert.deepEqual(
    resolvePromptShortcutSuggestions("$g", overview).map((entry) => `${entry.kind}:${entry.token}`),
    ["plugin:gmail", "plugin:gmail-inbox-triage"],
  );
});

test("resolvePromptShortcutSuggestions avoids app tokens that still resolve to a plugin skill", () => {
  const overview = {
    apps: [
      {
        id: "connector_gmail",
        name: "Gmail",
        description: "Mailbox access",
        installUrl: null,
        isAccessible: true,
        isEnabled: true,
        pluginDisplayNames: ["Gmail"],
      },
    ],
    plugins: [
      {
        id: "gmail",
        name: "gmail",
        displayName: "Gmail",
        description: "Gmail workflows",
        appIds: ["connector_gmail"],
        marketplaceName: "OpenAI Curated",
        marketplacePath: "/tmp/openai-curated-marketplace.json",
        installed: true,
        enabled: true,
        installPolicy: null,
        authPolicy: null,
        category: null,
        capabilities: [],
        sourcePath: null,
        websiteUrl: null,
      },
    ],
    skills: [
      {
        name: "gmail:gmail",
        description: "Primary Gmail workflow",
        path: "/Users/george/.codex/plugins/gmail/skills/gmail/SKILL.md",
        scope: "plugin",
        enabled: true,
        cwd: null,
      },
    ],
  };

  assert.deepEqual(
    resolvePromptShortcutSuggestions("$g", overview).map((entry) => `${entry.kind}:${entry.token}`),
    ["plugin:gmail", "app:connector_gmail"],
  );
});

test("resolveManagedExtensionPromptShortcut resolves bundled plugin skills and connected apps to exact mentions", () => {
  const overview = {
    apps: [
      {
        id: "linear",
        name: "Linear",
        description: "Project tracking",
        installUrl: null,
        isAccessible: true,
        isEnabled: true,
        pluginDisplayNames: [],
      },
    ],
    plugins: [
      {
        id: "sentry@openai-curated",
        name: "sentry",
        displayName: "Sentry",
        description: "Inspect recent issues and events",
        appIds: [],
        marketplaceName: "OpenAI Curated",
        marketplacePath: "/tmp/openai-curated-marketplace.json",
        installed: true,
        enabled: true,
        installPolicy: null,
        authPolicy: null,
        category: null,
        capabilities: [],
        sourcePath: "/Users/george/.codex/plugins/sentry",
        websiteUrl: null,
      },
    ],
    skills: [
      {
        name: "sentry:sentry",
        description: "Inspect recent issues and events",
        path: "/Users/george/.codex/plugins/sentry/skills/sentry/SKILL.md",
        scope: "plugin",
        enabled: true,
        cwd: null,
      },
    ],
  };

  assert.deepEqual(
    resolveManagedExtensionPromptShortcut(
      {
        id: "sentry@openai-curated",
        kind: "plugin",
        name: "sentry",
        sourcePath: "/Users/george/.codex/plugins/sentry",
      },
      overview,
    ),
    {
      item: {
        type: "mention",
        name: "sentry:sentry",
        path: "/Users/george/.codex/plugins/sentry/skills/sentry/SKILL.md",
      },
      kind: "plugin",
      label: "Sentry",
      token: "sentry",
      description: "Inspect recent issues and events",
    },
  );

  assert.deepEqual(
    resolveManagedExtensionPromptShortcut(
      {
        id: "linear",
        kind: "app",
        name: "Linear",
        sourcePath: null,
      },
      overview,
    ),
    {
      item: {
        type: "mention",
        name: "Linear",
        path: "app://linear",
      },
      kind: "app",
      label: "Linear",
      token: "linear",
      description: "Project tracking",
    },
  );
});

test("resolvePromptShortcutInputItems routes multi-skill plugin aliases to the router-style skill", () => {
  const overview = {
    apps: [],
    plugins: [
      {
        id: "life-science-research@openai-curated",
        name: "life-science-research",
        displayName: "Life Science Research",
        description: "General life sciences research workflows",
        appIds: [],
        marketplaceName: "OpenAI Curated",
        marketplacePath: "/tmp/openai-curated-marketplace.json",
        installed: true,
        enabled: true,
        installPolicy: null,
        authPolicy: null,
        category: null,
        capabilities: [],
        sourcePath: "/Users/george/.codex/plugins/life-science-research",
        websiteUrl: null,
      },
    ],
    skills: [
      {
        name: "life-science-research:alphafold-skill",
        description: "AlphaFold lookups",
        path: "/Users/george/.codex/plugins/life-science-research/skills/alphafold-skill/SKILL.md",
        scope: "plugin",
        enabled: true,
        cwd: null,
      },
      {
        name: "life-science-research:research-router-skill",
        description: "Route broad or ambiguous life-sciences research requests",
        path: "/Users/george/.codex/plugins/life-science-research/skills/research-router-skill/SKILL.md",
        scope: "plugin",
        enabled: true,
        cwd: null,
      },
    ],
  };

  assert.deepEqual(
    resolvePromptShortcutInputItems("Use $life-science-research for this", overview),
    [
      {
        type: "mention",
        name: "life-science-research:research-router-skill",
        path: "/Users/george/.codex/plugins/life-science-research/skills/research-router-skill/SKILL.md",
      },
    ],
  );
});

test("resolvePromptShortcutSuggestions prefers fully qualified names when local aliases are ambiguous", () => {
  const overview = {
    apps: [],
    plugins: [],
    skills: [
      {
        name: "foo:build",
        description: "Foo build flow",
        path: "/Users/george/.codex/skills/foo-build/SKILL.md",
        scope: "plugin",
        enabled: true,
        cwd: null,
      },
      {
        name: "bar:build",
        description: "Bar build flow",
        path: "/Users/george/.codex/skills/bar-build/SKILL.md",
        scope: "plugin",
        enabled: true,
        cwd: null,
      },
    ],
  };

  assert.deepEqual(
    resolvePromptShortcutSuggestions("$b", overview).map((entry) => entry.token),
    ["foo:build", "bar:build"],
  );
});

test("resolvePromptShortcutSuggestions prefers human app aliases over connector ids when they stay unique", () => {
  const overview = {
    apps: [
      {
        id: "connector_outlook_email",
        name: "Outlook Email",
        description: "Mailbox access",
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
    resolvePromptShortcutSuggestions("$out", overview).map((entry) => `${entry.kind}:${entry.token}`),
    ["app:outlook-email"],
  );
});

test("replaceActivePromptShortcut inserts the chosen token at the active cursor position", () => {
  assert.deepEqual(
    resolveActivePromptShortcutQuery("Use $exc for this", 8),
    {
      query: "exc",
      start: 4,
      end: 8,
    },
  );
  assert.deepEqual(
    replaceActivePromptShortcut("Use $exc for this", "excel", 8),
    {
      prompt: "Use $excel for this",
      cursorIndex: 10,
    },
  );
});
