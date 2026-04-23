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

test("reuseGroupedThreadEntries reuses grouped commentary when only the streaming body changes", () => {
  const previousEntries = [
    {
      id: "user-1",
      kind: "user",
      title: "You",
      body: "please check the repo",
      status: "complete",
    },
    {
      id: "commentary-1",
      kind: "assistant",
      title: "Sense-1 progress",
      body: "I am checking",
      status: "streaming",
      phase: "commentary",
    },
  ];
  const previousGrouped = groupThreadEntries(previousEntries);
  const nextEntries = [
    previousEntries[0],
    {
      ...previousEntries[1],
      body: "I am checking the streaming path now.",
    },
  ];

  const reused = reuseGroupedThreadEntries(previousEntries, nextEntries, previousGrouped);

  assert.ok(reused);
  assert.equal(reused[0], previousGrouped[0]);
  assert.equal(reused[1].kind, "activity-group");
  assert.equal(reused[1].entries[0].body, "I am checking the streaming path now.");
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

test("groupThreadEntries groups commentary with raw activity and leaves final answers visible", () => {
  const grouped = groupThreadEntries([
    {
      id: "user-1",
      kind: "user",
      title: "You",
      body: "please test this",
    },
    {
      id: "commentary-1",
      kind: "assistant",
      title: "Sense-1 progress",
      body: "I am checking the relevant files now.",
      status: "complete",
      phase: "commentary",
      startedAt: "2026-04-23T07:00:00.000Z",
      completedAt: "2026-04-23T07:00:02.000Z",
    },
    {
      id: "cmd-1",
      kind: "command",
      title: "Command execution",
      body: "",
      command: "pnpm test",
      cwd: "/tmp/project",
      status: "completed",
      exitCode: 0,
      durationMs: 10000,
      startedAt: "2026-04-23T07:00:02.000Z",
      completedAt: "2026-04-23T07:00:12.000Z",
    },
    {
      id: "tool-1",
      kind: "tool",
      title: "Tool call",
      body: "Computer Use",
      status: "completed",
      startedAt: "2026-04-23T07:00:12.000Z",
      completedAt: "2026-04-23T07:00:15.000Z",
    },
    {
      id: "assistant-1",
      kind: "assistant",
      title: "Sense-1",
      body: "All set.",
      status: "complete",
      phase: "final_answer",
    },
  ]);

  assert.equal(grouped.length, 3);
  assert.equal(grouped[0].kind, "passthrough");
  assert.equal(grouped[1].kind, "activity-group");
  assert.deepEqual(grouped[1].entries.map((entry) => entry.id), ["commentary-1", "cmd-1", "tool-1"]);
  assert.equal(grouped[1].latestLabel, "Ran 1 command, called 1 tool");
  assert.equal(grouped[1].durationLabel, "Worked for 15s");
  assert.equal(grouped[1].isRunning, false);
  assert.equal(grouped[2].kind, "passthrough");
  assert.equal(grouped[2].entry.id, "assistant-1");
});

test("groupThreadEntries marks active work logs as running without a completed duration", () => {
  const grouped = groupThreadEntries([
    {
      id: "commentary-1",
      kind: "assistant",
      title: "Sense-1 progress",
      body: "I am running the focused check now.",
      status: "complete",
      phase: "commentary",
      startedAt: "2026-04-23T07:00:00.000Z",
      completedAt: "2026-04-23T07:00:01.000Z",
    },
    {
      id: "cmd-1",
      kind: "command",
      title: "Command execution",
      body: "",
      command: "pnpm test",
      cwd: "/tmp/project",
      status: "running",
      exitCode: null,
      durationMs: null,
      startedAt: "2026-04-23T07:00:01.000Z",
    },
  ]);

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].kind, "activity-group");
  assert.equal(grouped[0].isRunning, true);
  assert.equal(grouped[0].durationLabel, null);
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
