import test from "node:test";
import assert from "node:assert/strict";

import { LinearIssueAdapter } from "./linear-issue-adapter.ts";

test("LinearIssueAdapter reports configuration state from env", () => {
  const adapter = new LinearIssueAdapter({
    env: {
      SENSE1_LINEAR_API_KEY: "linear-key",
      SENSE1_LINEAR_TEAM_ID: "team-123",
    },
    fetchImpl: fetch,
  });

  assert.equal(adapter.isConfigured(), true);
});

test("LinearIssueAdapter creates issues through Linear GraphQL", async () => {
  const calls = [];
  const adapter = new LinearIssueAdapter({
    env: {
      SENSE1_LINEAR_API_KEY: "linear-key",
      SENSE1_LINEAR_TEAM_ID: "team-123",
      SENSE1_LINEAR_WORKSPACE_URL: "sense-1",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        data: {
          issueCreate: {
            success: true,
            issue: {
              id: "issue_123",
              identifier: "SEN-42",
            },
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });

  const result = await adapter.createIssue({
    title: "Composer send button stopped working",
    description: "Detailed markdown body",
    severity: "high",
  });

  assert.equal(calls.length, 1);
  assert.equal(result.id, "issue_123");
  assert.equal(result.url, "https://linear.app/sense-1/issue/SEN-42");
});
