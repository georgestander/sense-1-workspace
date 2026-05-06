import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, "node-repl-mcp-server.mjs");
const MESSAGE_LENGTH_BYTES = 4;

function startServer(t, { env = {}, onClientRequest = null } = {}) {
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      ...env,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => {
    child.kill("SIGTERM");
  });

  let buffer = "";
  const pending = new Map();
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        const message = JSON.parse(line);
        if (message.method && message.id != null && onClientRequest) {
          onClientRequest(message, (result) => {
            child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result })}\n`);
          });
          newlineIndex = buffer.indexOf("\n");
          continue;
        }
        pending.get(message.id)?.(message);
        pending.delete(message.id);
      }
      newlineIndex = buffer.indexOf("\n");
    }
  });

  let nextId = 1;
  function request(method, params = {}) {
    const id = nextId++;
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}.`));
      }, 5000);
      pending.set(id, (message) => {
        clearTimeout(timeout);
        resolve(message);
      });
    });
  }

  return { request };
}

function encodeMessage(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const frame = Buffer.alloc(MESSAGE_LENGTH_BYTES + payload.length);
  if (os.endianness() === "LE") {
    frame.writeUInt32LE(payload.length, 0);
  } else {
    frame.writeUInt32BE(payload.length, 0);
  }
  payload.copy(frame, MESSAGE_LENGTH_BYTES);
  return frame;
}

function decodeMessages(buffer) {
  const messages = [];
  let offset = 0;
  while (buffer.length - offset >= MESSAGE_LENGTH_BYTES) {
    const payloadLength = os.endianness() === "LE"
      ? buffer.readUInt32LE(offset)
      : buffer.readUInt32BE(offset);
    const frameLength = MESSAGE_LENGTH_BYTES + payloadLength;
    if (buffer.length - offset < frameLength) {
      break;
    }
    messages.push(JSON.parse(buffer.subarray(offset + MESSAGE_LENGTH_BYTES, offset + frameLength).toString("utf8")));
    offset += frameLength;
  }
  return {
    messages,
    remaining: buffer.subarray(offset),
  };
}

async function startPermissionServer(t, socketPath, onRequest) {
  const server = net.createServer((socket) => {
    let pending = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      const decoded = decodeMessages(pending);
      pending = decoded.remaining;
      for (const message of decoded.messages) {
        const result = onRequest(message);
        socket.write(encodeMessage({ jsonrpc: "2.0", id: message.id, result }));
      }
    });
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(() => resolve()));
    await fs.rm(path.dirname(socketPath), { force: true, recursive: true });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

test("node repl captures console output inside JSON-RPC tool results", async (t) => {
  const server = startServer(t);

  await server.request("initialize", { protocolVersion: "2024-11-05" });
  const response = await server.request("tools/call", {
    name: "js",
    arguments: {
      code: "console.log('hello', { ok: true });",
    },
  });

  assert.equal(response.error, undefined);
  assert.equal(response.result.content[0].type, "text");
  assert.match(response.result.content[0].text, /hello \{"ok":true\}\n/);
});

test("node repl captures console output from dynamically imported modules", async (t) => {
  const server = startServer(t);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-node-repl-import-"));
  t.after(() => {
    void fs.rm(tempDir, { force: true, recursive: true });
  });
  const modulePath = path.join(tempDir, "logs.mjs");
  await fs.writeFile(modulePath, "console.log('imported module log'); export const ok = true;\n", "utf8");

  await server.request("initialize", { protocolVersion: "2024-11-05" });
  const response = await server.request("tools/call", {
    name: "js",
    arguments: {
      code: `await import(${JSON.stringify(pathToFileURL(modulePath).href)});`,
    },
  });

  assert.equal(response.error, undefined);
  assert.equal(response.result.content[0].type, "text");
  assert.match(response.result.content[0].text, /imported module log\n/);
});

test("node repl exposes Codex turn metadata to dynamically imported modules", async (t) => {
  const server = startServer(t);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-node-repl-meta-"));
  t.after(() => {
    void fs.rm(tempDir, { force: true, recursive: true });
  });
  const modulePath = path.join(tempDir, "meta.mjs");
  await fs.writeFile(
    modulePath,
    [
      "export function turnMetadata() {",
      "  return globalThis.nodeRepl?.requestMeta?.['x-codex-turn-metadata'] ?? null;",
      "}",
    ].join("\n"),
    "utf8",
  );

  await server.request("initialize", { protocolVersion: "2024-11-05" });
  const response = await server.request("tools/call", {
    name: "js",
    arguments: {
      code: [
        `const mod = await import(${JSON.stringify(pathToFileURL(modulePath).href)});`,
        "console.log(JSON.stringify(mod.turnMetadata()));",
      ].join("\n"),
      _meta: {
        "x-codex-turn-metadata": {
          session_id: "thread-1",
          turn_id: "turn-1",
        },
      },
    },
  });

  assert.equal(response.error, undefined);
  assert.equal(response.result.content[0].type, "text");
  assert.match(response.result.content[0].text, /\{"session_id":"thread-1","turn_id":"turn-1"\}\n/);
});

test("node repl does not preinstall fallback Browser Use globals before browser-client setup", async (t) => {
  const server = startServer(t);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-node-repl-browser-client-"));
  t.after(() => {
    void fs.rm(tempDir, { force: true, recursive: true });
  });
  const modulePath = path.join(tempDir, "browser-client.mjs");
  await fs.writeFile(
    modulePath,
    [
      "export async function setupAtlasRuntime({ globals }) {",
      "  if (globals.agent != null) return;",
      "  globals.agent = { source: 'browser-client' };",
      "}",
    ].join("\n"),
    "utf8",
  );

  await server.request("initialize", { protocolVersion: "2024-11-05" });
  const response = await server.request("tools/call", {
    name: "js",
    arguments: {
      code: [
        `const { setupAtlasRuntime } = await import(${JSON.stringify(pathToFileURL(modulePath).href)});`,
        "await setupAtlasRuntime({ globals: globalThis, backend: 'iab' });",
        "console.log(agent.source);",
      ].join("\n"),
    },
  });

  assert.equal(response.error, undefined);
  assert.equal(response.result.content[0].type, "text");
  assert.match(response.result.content[0].text, /browser-client\n/);
});

test("node repl keeps fallback Browser Use globals for bundled marketplace browser-client setup", async (t) => {
  const server = startServer(t);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-node-repl-bundled-client-"));
  t.after(() => {
    void fs.rm(tempRoot, { force: true, recursive: true });
  });
  const moduleDir = path.join(tempRoot, ".codex", ".tmp", "bundled-marketplaces", "openai-bundled", "plugins", "browser-use", "scripts");
  await fs.mkdir(moduleDir, { recursive: true });
  const modulePath = path.join(moduleDir, "browser-client.mjs");
  await fs.writeFile(
    modulePath,
    [
      "export async function setupAtlasRuntime({ globals }) {",
      "  if (globals.agent != null) return;",
      "  globals.agent = { source: 'browser-client' };",
      "}",
    ].join("\n"),
    "utf8",
  );

  await server.request("initialize", { protocolVersion: "2024-11-05" });
  const response = await server.request("tools/call", {
    name: "js",
    arguments: {
      code: [
        `const { setupAtlasRuntime } = await import(${JSON.stringify(pathToFileURL(modulePath).href)});`,
        "await setupAtlasRuntime({ globals: globalThis, backend: 'iab' });",
        "console.log(typeof agent.browser);",
      ].join("\n"),
    },
  });

  assert.equal(response.error, undefined);
  assert.equal(response.result.content[0].type, "text");
  assert.match(response.result.content[0].text, /object\n/);
});

test("node repl routes Browser Use elicitations through the native IAB permission socket", async (t) => {
  const tempRoot = process.platform === "darwin" ? "/private/tmp" : os.tmpdir();
  const socketPath = path.join(await fs.mkdtemp(path.join(tempRoot, "sense1-node-repl-iab-")), "browser.sock");
  const permissionRequests = [];
  await startPermissionServer(t, socketPath, (message) => {
    permissionRequests.push(message);
    return { action: "accept" };
  });

  const server = startServer(t, {
    env: {
      SENSE1_BROWSER_USE_IAB_SOCKET_PATH: socketPath,
    },
  });

  await server.request("initialize", { protocolVersion: "2024-11-05" });
  const response = await server.request("tools/call", {
    name: "js",
    arguments: {
      code: [
        "const result = await nodeRepl.createElicitation({",
        "  message: 'Allow Browser Use to access https://openai.com?',",
        "  meta: { connector_id: 'browser-use', connector_name: 'Browser Use', origin: 'https://openai.com' },",
        "});",
        "console.log(JSON.stringify(result));",
      ].join("\n"),
      _meta: {
        "x-codex-turn-metadata": {
          session_id: "thread-1",
          turn_id: "turn-1",
        },
      },
    },
  });

  assert.equal(response.error, undefined);
  assert.equal(response.result.content[0].type, "text");
  assert.match(response.result.content[0].text, /\{"action":"accept"\}/);
  assert.equal(permissionRequests.length, 1);
  assert.equal(permissionRequests[0].method, "requestPermission");
  assert.deepEqual(permissionRequests[0].params, {
    origin: "https://openai.com",
    message: "Allow Browser Use to access https://openai.com?",
    session_id: "thread-1",
    turn_id: "turn-1",
    timeoutMs: 60000,
  });
});

test("node repl exposes Browser Use agent helpers through the native IAB socket", async (t) => {
  const tempRoot = process.platform === "darwin" ? "/private/tmp" : os.tmpdir();
  const socketPath = path.join(await fs.mkdtemp(path.join(tempRoot, "sense1-node-repl-agent-iab-")), "browser.sock");
  const requests = [];
  const tab = {
    id: 42,
    title: "Blank",
    url: "about:blank",
    active: true,
  };
  await startPermissionServer(t, socketPath, (message) => {
    requests.push(message);
    switch (message.method) {
      case "requestPermission":
        return { action: "accept" };
      case "nameSession":
      case "attach":
        return {};
      case "createTab":
        return tab;
      case "getTabs":
        return [tab];
      case "executeCdp": {
        const method = message.params.method;
        if (method === "Page.navigate") {
          tab.url = message.params.commandParams.url;
          tab.title = "OpenAI | OpenAI";
          return {};
        }
        if (method === "Runtime.evaluate") {
          return { result: { type: "string", value: "complete" } };
        }
        return {};
      }
      default:
        throw new Error(`Unexpected Browser Use method: ${message.method}`);
    }
  });

  const server = startServer(t, {
    env: {
      SENSE1_BROWSER_USE_IAB_SOCKET_PATH: socketPath,
    },
  });

  await server.request("initialize", { protocolVersion: "2024-11-05" });
  const response = await server.request("tools/call", {
    name: "js",
    arguments: {
      code: [
        "await agent.browser.nameSession('OpenAI title');",
        "globalThis.tab = await agent.browser.tabs.new();",
        "await tab.goto('https://openai.com');",
        "await tab.playwright.waitForLoadState({ state: 'load', timeoutMs: 500 });",
        "console.log(JSON.stringify({ url: await tab.url(), title: await tab.title() }));",
      ].join("\n"),
      _meta: {
        "x-codex-turn-metadata": {
          session_id: "thread-1",
          turn_id: "turn-1",
        },
      },
    },
  });

  assert.equal(response.error, undefined);
  assert.equal(response.result.content[0].type, "text");
  assert.match(response.result.content[0].text, /\{"url":"https:\/\/openai.com","title":"OpenAI \| OpenAI"\}/);
  assert.deepEqual(
    requests.map((request) => request.method),
    ["nameSession", "createTab", "requestPermission", "attach", "executeCdp", "executeCdp", "executeCdp", "getTabs", "getTabs"],
  );
  assert.equal(requests[2].params.origin, "https://openai.com");
  assert.equal(requests[2].params.session_id, "thread-1");
});

test("node repl fallback Browser Use tab exposes inspection helpers", async (t) => {
  const tempRoot = process.platform === "darwin" ? "/private/tmp" : os.tmpdir();
  const socketPath = path.join(await fs.mkdtemp(path.join(tempRoot, "sense1-node-repl-agent-inspect-iab-")), "browser.sock");
  await startPermissionServer(t, socketPath, (message) => {
    switch (message.method) {
      case "requestPermission":
        return { action: "accept" };
      case "nameSession":
      case "attach":
        return {};
      case "createTab":
        return {
          id: 42,
          title: "Premier League Football News, Fixtures, Scores & Results",
          url: "https://www.premierleague.com/en",
          active: true,
        };
      case "getTabs":
        return [{
          id: 42,
          title: "Premier League Football News, Fixtures, Scores & Results",
          url: "https://www.premierleague.com/en",
          active: true,
        }];
      case "executeCdp": {
        const method = message.params.method;
        const expression = message.params.commandParams?.expression ?? "";
        if (method === "Page.navigate") {
          return {};
        }
        if (method === "Runtime.evaluate" && expression === "document.readyState") {
          return { result: { type: "string", value: "complete" } };
        }
        if (method === "Runtime.evaluate" && String(expression).includes("Visible text:")) {
          return { result: { type: "string", value: "Visible text:\nSat 9 May Liverpool 13:30 Chelsea" } };
        }
        if (method === "Runtime.evaluate" && String(expression).includes("includeNonInteractable")) {
          return {
            result: {
              type: "object",
              value: {
                text: "Sat 9 May Liverpool 13:30 Chelsea",
                elements: [],
              },
            },
          };
        }
        if (method === "Page.captureScreenshot") {
          return { data: "iVBORw0KGgo=" };
        }
        return { result: { type: "string", value: "" } };
      }
      default:
        throw new Error(`Unexpected Browser Use method: ${message.method}`);
    }
  });

  const server = startServer(t, {
    env: {
      SENSE1_BROWSER_USE_IAB_SOCKET_PATH: socketPath,
    },
  });

  await server.request("initialize", { protocolVersion: "2024-11-05" });
  const response = await server.request("tools/call", {
    name: "js",
    arguments: {
      code: [
        "await agent.browser.nameSession('Liverpool fixture');",
        "globalThis.tab = await agent.browser.tabs.new();",
        "await tab.goto('https://www.premierleague.com/en');",
        "await tab.playwright.waitForLoadState({ state: 'load', timeoutMs: 500 });",
        "const snapshot = await tab.playwright.domSnapshot();",
        "const visibleDom = await tab.dom_cua.get_visible_dom();",
        "const screenshot = await tab.playwright.screenshot({ fullPage: false });",
        "console.log(JSON.stringify({",
        "  snapshot,",
        "  visibleText: visibleDom.text,",
        "  screenshot: screenshot.toBase64(),",
        "  getByText: typeof tab.playwright.getByText,",
        "}));",
      ].join("\n"),
      _meta: {
        "x-codex-turn-metadata": {
          session_id: "thread-1",
          turn_id: "turn-1",
        },
      },
    },
  });

  assert.equal(response.error, undefined);
  assert.equal(response.result.content[0].type, "text");
  assert.match(response.result.content[0].text, /Liverpool 13:30 Chelsea/);
  assert.match(response.result.content[0].text, /iVBORw0KGgo=/);
  assert.match(response.result.content[0].text, /"getByText":"function"/);
});

test("node repl forwards non-Browser Use elicitations to the MCP client", async (t) => {
  const clientRequests = [];
  const server = startServer(t, {
    onClientRequest(message, respond) {
      clientRequests.push(message);
      respond({ action: "accept" });
    },
  });

  await server.request("initialize", { protocolVersion: "2024-11-05" });
  const response = await server.request("tools/call", {
    name: "js",
    arguments: {
      code: [
        "const result = await nodeRepl.createElicitation({",
        "  message: 'Allow another tool?',",
        "  meta: { connector_id: 'other-tool', connector_name: 'Other Tool' },",
        "});",
        "console.log(JSON.stringify(result));",
      ].join("\n"),
      _meta: {
        "x-codex-turn-metadata": {
          session_id: "thread-1",
          turn_id: "turn-1",
        },
      },
    },
  });

  assert.equal(response.error, undefined);
  assert.equal(response.result.content[0].type, "text");
  assert.match(response.result.content[0].text, /\{"action":"accept"\}/);
  assert.equal(clientRequests.length, 1);
  assert.equal(clientRequests[0].method, "elicitation/create");
  assert.equal(clientRequests[0].params.meta.connector_id, "other-tool");
});
