import test from "node:test";
import assert from "node:assert/strict";

import { summarizeEarlyConversationThreadTitle } from "./thread-title-summarizer.js";

test("summarizeEarlyConversationThreadTitle strips namespaced skill tokens from prompt-derived titles", () => {
  assert.equal(
    summarizeEarlyConversationThreadTitle({
      userText: "any important emails in $gmail:gmail ?",
    }),
    "Any important emails",
  );
});
