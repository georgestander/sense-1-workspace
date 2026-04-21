import test from "node:test";
import assert from "node:assert/strict";

import {
  describeCommandExecution,
  groupThreadEntries,
  reuseGroupedThreadEntries,
  summarizeCommand,
} from "./thread-view-utils.ts";

test("reuseGroupedThreadEntries reuses grouped structure when only the last assistant body changes", () => {
  const previousEntries = [
    {
      id: "user-1",
      kind: "user",
      title: "You",
      body: "hello",
      status: "complete",
    },
    {
      id: "assistant-1",
      kind: "assistant",
      title: "Sense-1 activity",
      body: "partial",
      status: "streaming",
    },
  ];
  const previousGrouped = groupThreadEntries(previousEntries);
  const nextEntries = [
    previousEntries[0],
    {
      ...previousEntries[1],
      body: "partial answer",
    },
  ];

  const reused = reuseGroupedThreadEntries(previousEntries, nextEntries, previousGrouped);

  assert.ok(reused);
  assert.equal(reused.length, previousGrouped.length);
  assert.equal(reused[0], previousGrouped[0]);
  assert.equal(reused[1].kind, "passthrough");
  assert.equal(reused[1].entry.body, "partial answer");
});

test("reuseGroupedThreadEntries returns null when a non-terminal entry changes", () => {
  const previousEntries = [
    {
      id: "assistant-1",
      kind: "assistant",
      title: "Sense-1 activity",
      body: "first",
      status: "complete",
    },
    {
      id: "assistant-2",
      kind: "assistant",
      title: "Sense-1 activity",
      body: "second",
      status: "streaming",
    },
  ];
  const previousGrouped = groupThreadEntries(previousEntries);
  const nextEntries = [
    {
      ...previousEntries[0],
      body: "changed",
    },
    previousEntries[1],
  ];

  assert.equal(reuseGroupedThreadEntries(previousEntries, nextEntries, previousGrouped), null);
});

test("summarizeCommand humanizes shell-wrapped skill scaffold commands", () => {
  assert.equal(
    summarizeCommand("/bin/zsh -lc \"python3 /Users/george/.codex/skills/.system/skill-creator/scripts/init_skill.py finance-word\""),
    "Scaffolding skill files",
  );
  assert.equal(
    summarizeCommand("/bin/zsh -lc \"python3 /Users/george/.codex/skills/.system/plugin-creator/scripts/create_basic_plugin.py finance-plugin\""),
    "Scaffolding plugin files",
  );
  assert.equal(
    summarizeCommand("/bin/zsh -lc \"python3 - <<'PY'\\nprint('hello')\\nPY\""),
    "Running inline Python helper",
  );
});

test("summarizeCommand adds file-aware hints for simple shell helpers", () => {
  assert.equal(
    summarizeCommand("/bin/zsh -lc \"printf '%s\\n' '--- SKILL.md ---'\""),
    "Preparing SKILL.md",
  );
  assert.equal(
    summarizeCommand("/bin/zsh -lc \"rg -n 'display_name' SKILL.md\""),
    "Searching SKILL.md",
  );
});

test("describeCommandExecution explains silent successful commands", () => {
  assert.deepEqual(
    describeCommandExecution({
      status: "completed",
      exitCode: 0,
      durationMs: 1842,
      cwd: "/tmp/skill",
      body: "",
    }),
    {
      detail: "Completed successfully • 1.8 s • /tmp/skill",
      emptyOutputHint: "No stdout/stderr was captured, but the command completed successfully.",
    },
  );
});

test("describeCommandExecution explains silent failed commands", () => {
  assert.deepEqual(
    describeCommandExecution({
      status: "completed",
      exitCode: 2,
      durationMs: 75,
      cwd: null,
      body: "",
    }),
    {
      detail: "Failed with exit code 2 • 75 ms",
      emptyOutputHint: "No stdout/stderr was captured before the command failed.",
    },
  );
});
