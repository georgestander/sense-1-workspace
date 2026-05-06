import assert from "node:assert/strict";
import test from "node:test";

import {
  handleMcpServerElicitationRequest,
  isMcpServerElicitationRequest,
} from "./mcp-elicitation-service.ts";

function createManager() {
  const responses = [];
  return {
    responses,
    respond(requestId, payload) {
      responses.push({ requestId, payload });
    },
  };
}

function createBrowser(decision = "accept") {
  const calls = [];
  return {
    calls,
    async requestBrowserUsePermission(threadId, origin, timeoutMs) {
      calls.push({ threadId, origin, timeoutMs });
      return decision;
    },
  };
}

test("isMcpServerElicitationRequest detects app-server MCP elicitation requests", () => {
  assert.equal(isMcpServerElicitationRequest({
    id: 12,
    method: "mcpServer/elicitation/request",
    params: {},
  }), true);
  assert.equal(isMcpServerElicitationRequest({
    method: "mcpServer/elicitation/request",
    params: {},
  }), false);
});

test("handleMcpServerElicitationRequest routes Browser Use URL permission through browser trust", async () => {
  const manager = createManager();
  const browser = createBrowser("accept");

  await handleMcpServerElicitationRequest({
    browser,
    manager,
    message: {
      id: 77,
      method: "mcpServer/elicitation/request",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        serverName: "node_repl",
        mode: "url",
        message: "Allow Browser Use to access https://openai.com?",
        url: "https://openai.com",
        elicitationId: "browser-use-1",
        _meta: {
          connector_id: "browser-use",
          connector_name: "Browser Use",
          origin: "https://openai.com",
        },
      },
    },
  });

  assert.deepEqual(browser.calls, [{
    threadId: "thread-1",
    origin: "https://openai.com",
    timeoutMs: 60_000,
  }]);
  assert.deepEqual(manager.responses, [{
    requestId: 77,
    payload: {
      action: "accept",
      content: null,
      _meta: null,
    },
  }]);
});

test("handleMcpServerElicitationRequest accepts Browser Use node_repl tool calls", async () => {
  const manager = createManager();
  const browser = createBrowser("accept");

  await handleMcpServerElicitationRequest({
    browser,
    manager,
    message: {
      id: 81,
      method: "mcpServer/elicitation/request",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        serverName: "node_repl",
        mode: "form",
        message: "Allow the node_repl MCP server to run tool \"js\"?",
        requestedSchema: { type: "object", properties: {} },
        _meta: {
          codex_approval_kind: "mcp_tool_call",
          tool_params: {
            title: "Open page",
            code: "await agent.browser.nameSession('OpenAI'); await tab.goto('https://openai.com');",
          },
        },
      },
    },
  });

  assert.deepEqual(browser.calls, []);
  assert.deepEqual(manager.responses, [{
    requestId: 81,
    payload: {
      action: "accept",
      content: null,
      _meta: null,
    },
  }]);
});

test("handleMcpServerElicitationRequest accepts Browser Use continuation cells that reuse tab", async () => {
  const manager = createManager();
  const browser = createBrowser("accept");

  await handleMcpServerElicitationRequest({
    browser,
    manager,
    message: {
      id: 82,
      method: "mcpServer/elicitation/request",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        serverName: "node_repl",
        mode: "form",
        message: "Allow the node_repl MCP server to run tool \"js\"?",
        requestedSchema: { type: "object", properties: {} },
        _meta: {
          codex_approval_kind: "mcp_tool_call",
          tool_params: {
            title: "Inspect page state",
            code: "console.log('URL:', await tab.url()); const snap = await tab.playwright.domSnapshot(); console.log(snap.slice(0, 4000));",
          },
        },
      },
    },
  });

  assert.deepEqual(browser.calls, []);
  assert.deepEqual(manager.responses, [{
    requestId: 82,
    payload: {
      action: "accept",
      content: null,
      _meta: null,
    },
  }]);
});

test("handleMcpServerElicitationRequest accepts node_repl js_reset for Browser Use recovery", async () => {
  const manager = createManager();
  const browser = createBrowser("accept");

  await handleMcpServerElicitationRequest({
    browser,
    manager,
    message: {
      id: 83,
      method: "mcpServer/elicitation/request",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        serverName: "node_repl",
        mode: "form",
        message: "Allow the node_repl MCP server to run tool \"js_reset\"?",
        requestedSchema: { type: "object", properties: {} },
        _meta: {
          codex_approval_kind: "mcp_tool_call",
          tool_params: {},
        },
      },
    },
  });

  assert.deepEqual(browser.calls, []);
  assert.deepEqual(manager.responses, [{
    requestId: 83,
    payload: {
      action: "accept",
      content: null,
      _meta: null,
    },
  }]);
});

test("handleMcpServerElicitationRequest cancels unsupported MCP elicitations", async () => {
  const manager = createManager();
  const browser = createBrowser("accept");

  await handleMcpServerElicitationRequest({
    browser,
    manager,
    message: {
      id: 88,
      method: "mcpServer/elicitation/request",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        serverName: "node_repl",
        mode: "form",
        message: "Pick a value",
        requestedSchema: { type: "object", properties: {} },
        _meta: null,
      },
    },
  });

  assert.deepEqual(browser.calls, []);
  assert.deepEqual(manager.responses, [{
    requestId: 88,
    payload: {
      action: "cancel",
      content: null,
      _meta: null,
    },
  }]);
});
