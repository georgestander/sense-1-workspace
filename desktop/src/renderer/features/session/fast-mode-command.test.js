import test from "node:test";
import assert from "node:assert/strict";

import {
  applyFastModeSuggestion,
  parseFastModeCommand,
  resolveFastModeSuggestions,
} from "./fast-mode-command.ts";

test("parseFastModeCommand resolves fast slash commands", () => {
  assert.equal(parseFastModeCommand("/fast"), "status");
  assert.equal(parseFastModeCommand("/fast on"), "on");
  assert.equal(parseFastModeCommand("/fast off"), "off");
  assert.equal(parseFastModeCommand("/fast status"), "status");
  assert.equal(parseFastModeCommand("/fast later"), null);
});

test("resolveFastModeSuggestions offers matching slash completions", () => {
  assert.deepEqual(
    resolveFastModeSuggestions("/fa", 3).map((suggestion) => suggestion.command),
    ["/fast on", "/fast off", "/fast status"],
  );
  assert.deepEqual(
    resolveFastModeSuggestions("/fast o", 7).map((suggestion) => suggestion.command),
    ["/fast on", "/fast off"],
  );
  assert.deepEqual(resolveFastModeSuggestions("ship it", 7), []);
});

test("applyFastModeSuggestion replaces the composer prompt with the selected command", () => {
  assert.deepEqual(applyFastModeSuggestion("/fast on"), {
    cursorIndex: 8,
    prompt: "/fast on",
  });
});
