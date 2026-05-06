import assert from "node:assert/strict";
import test from "node:test";

import {
  handleDynamicToolCallRequest,
  isDynamicToolCallRequest,
} from "./dynamic-tool-call-service.ts";

function createManager(result) {
  const calls = [];
  const responses = [];
  return {
    calls,
    responses,
    async request(method, params, timeoutMs) {
      calls.push({ method, params, timeoutMs });
      if (result instanceof Error) {
        throw result;
      }
      return result;
    },
    respond(requestId, payload) {
      responses.push({ requestId, payload });
    },
  };
}

test("isDynamicToolCallRequest detects app-server dynamic tool requests", () => {
  assert.equal(isDynamicToolCallRequest({
    id: 7,
    method: "item/tool/call",
    params: {},
  }), true);
  assert.equal(isDynamicToolCallRequest({
    method: "item/tool/call",
    params: {},
  }), false);
});

test("handleDynamicToolCallRequest forwards namespaced MCP tools through app-server MCP call", async () => {
  const manager = createManager({
    content: [{ type: "text", text: "ok" }],
    isError: false,
  });

  await handleDynamicToolCallRequest({
    manager,
    message: {
      id: 42,
      method: "item/tool/call",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        namespace: "mcp__node_repl__",
        tool: "js",
        arguments: {
          code: "console.log('ok')",
          timeout_ms: 30_000,
        },
      },
    },
  });

  assert.deepEqual(manager.calls, [{
    method: "mcpServer/tool/call",
    timeoutMs: 90_000,
    params: {
      threadId: "thread-1",
      server: "node_repl",
      tool: "js",
      arguments: {
        code: "console.log('ok')",
        timeout_ms: 30_000,
      },
      _meta: {
        "x-codex-turn-metadata": {
          session_id: "thread-1",
          turn_id: "turn-1",
        },
      },
    },
  }]);
  assert.deepEqual(manager.responses, [{
    requestId: 42,
    payload: {
      contentItems: [{ type: "inputText", text: "ok" }],
      success: true,
    },
  }]);
});

test("handleDynamicToolCallRequest responds with failure for unsupported dynamic tools", async () => {
  const manager = createManager({
    content: [],
  });

  await handleDynamicToolCallRequest({
    manager,
    message: {
      id: 9,
      method: "item/tool/call",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        namespace: "custom",
        tool: "lookup",
        arguments: {},
      },
    },
  });

  assert.deepEqual(manager.calls, []);
  assert.deepEqual(manager.responses, [{
    requestId: 9,
    payload: {
      contentItems: [{
        type: "inputText",
        text: "Unsupported dynamic tool call: custom.lookup",
      }],
      success: false,
    },
  }]);
});
