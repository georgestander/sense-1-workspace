import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { BrowserUseIabBackend } from "./browser-use-iab-backend.ts";

const MESSAGE_LENGTH_BYTES = 4;

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

function createRpcClient(socketPath) {
  const socket = net.createConnection(socketPath);
  let pending = Buffer.alloc(0);
  let nextId = 1;
  const responses = new Map();
  const events = [];

  socket.on("data", (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    const decoded = decodeMessages(pending);
    pending = decoded.remaining;
    for (const message of decoded.messages) {
      if (message.id != null) {
        responses.get(message.id)?.(message);
        responses.delete(message.id);
      } else {
        events.push(message);
      }
    }
  });

  return {
    async request(method, params = {}) {
      const id = nextId++;
      const response = new Promise((resolve) => responses.set(id, resolve));
      socket.write(encodeMessage({ jsonrpc: "2.0", id, method, params }));
      const message = await response;
      if (message.error) {
        throw new Error(message.error.message);
      }
      return message.result;
    },
    events,
    close() {
      socket.end();
    },
  };
}

test("BrowserUseIabBackend creates a private per-profile socket path", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-browser-profile-"));
  const codexHome = path.join(profileRoot, "codex-home");
  const browser = {
    onBrowserUseCdpEvent() {
      return () => {};
    },
  };
  const backend = new BrowserUseIabBackend(browser, null);

  try {
    const socketPath = await backend.configureForCodexHome(codexHome);
    const socketDirectory = path.dirname(socketPath);

    if (process.platform === "win32") {
      assert.match(socketPath, /^\\\\\.\\pipe\\sense1-browser-use-iab-/u);
      return;
    }

    assert.equal(path.dirname(path.dirname(socketPath)), path.join(profileRoot, "browser-use-iab"));
    assert.equal(path.basename(socketPath), "browser.sock");
    assert.equal((await fs.stat(socketDirectory)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(path.dirname(socketDirectory))).mode & 0o777, 0o700);
    assert.equal(await backend.configureForCodexHome(codexHome), socketPath);
  } finally {
    await backend.stop();
    await fs.rm(profileRoot, { recursive: true, force: true });
  }
});

test("BrowserUseIabBackend speaks the Browser Use native pipe RPC protocol", async (t) => {
  const tempRoot = process.platform === "darwin" ? "/private/tmp" : os.tmpdir();
  const socketPath = path.join(await fs.mkdtemp(path.join(tempRoot, "sense1-browser-use-iab-")), "browser.sock");
  const calls = [];
  let cdpListener = null;
  const browser = {
    listBrowserUseTabs(sessionId) {
      calls.push(["getTabs", sessionId]);
      return [{ id: "42", title: "Test", url: "about:blank", active: true }];
    },
    createBrowserUseTab(sessionId) {
      calls.push(["createTab", sessionId]);
      return { id: "43", title: "New", url: "about:blank", active: true };
    },
    getBrowserUseTab(tabId) {
      calls.push(["claimUserTab", tabId]);
      return { id: String(tabId), title: "Claimed", url: "about:blank", active: true };
    },
    async browserUseAttach(tabId) {
      calls.push(["attach", tabId]);
    },
    async browserUseDetach(tabId) {
      calls.push(["detach", tabId]);
    },
    async browserUseExecuteCdp(tabId, method, params) {
      calls.push(["executeCdp", tabId, method, params]);
      return { ok: true };
    },
    async browserUseMoveMouse(tabId, x, y) {
      calls.push(["moveMouse", tabId, x, y]);
    },
    async requestBrowserUsePermission(sessionId, origin, timeoutMs) {
      calls.push(["requestPermission", sessionId, origin, timeoutMs]);
      return "accept";
    },
    async waitForBrowserUsePermission(origin, timeoutMs) {
      calls.push(["requestPermissionWithoutSession", origin, timeoutMs]);
      return "accept";
    },
    onBrowserUseCdpEvent(listener) {
      cdpListener = listener;
      return () => {
        cdpListener = null;
      };
    },
  };
  const backend = new BrowserUseIabBackend(browser, socketPath);

  try {
    try {
      await backend.start();
    } catch (error) {
      if (error?.code === "EPERM") {
        t.skip("sandbox does not allow binding a local Browser Use socket");
        return;
      }
      throw error;
    }
    const client = createRpcClient(socketPath);
    try {
      assert.equal(await client.request("ping"), "pong");
      assert.deepEqual(await client.request("getTabs", { session_id: "sess_1", turn_id: "turn_1" }), [
        { id: "42", title: "Test", url: "about:blank", active: true },
      ]);
      assert.deepEqual(await client.request("createTab", { session_id: "sess_1", turn_id: "turn_1" }), {
        id: "43",
        title: "New",
        url: "about:blank",
        active: true,
      });
      assert.deepEqual(await client.request("claimUserTab", { session_id: "sess_1", turn_id: "turn_1", tabId: 42 }), {
        id: "42",
        title: "Claimed",
        url: "about:blank",
        active: true,
      });
      await client.request("attach", { session_id: "sess_1", turn_id: "turn_1", tabId: 42 });
      assert.deepEqual(
        await client.request("requestPermission", {
          session_id: "sess_1",
          turn_id: "turn_1",
          origin: "https://openai.com",
          timeoutMs: 10,
        }),
        { action: "accept" },
      );
      assert.deepEqual(
        await client.request("executeCdp", {
          session_id: "sess_1",
          turn_id: "turn_1",
          target: { tabId: 42 },
          method: "Runtime.evaluate",
          commandParams: { expression: "location.href" },
        }),
        { ok: true },
      );
      await client.request("moveMouse", { session_id: "sess_1", turn_id: "turn_1", tabId: 42, x: 10, y: 20 });
      cdpListener?.({ tabId: "42", method: "Page.loadEventFired", params: { timestamp: 1 } });
      await new Promise((resolve) => setTimeout(resolve, 10));

      assert.deepEqual(client.events.at(-1), {
        jsonrpc: "2.0",
        method: "onCDPEvent",
        params: {
          source: { tabId: 42 },
          method: "Page.loadEventFired",
          params: { timestamp: 1 },
        },
      });
      assert.deepEqual(calls, [
        ["getTabs", "sess_1"],
        ["createTab", "sess_1"],
        ["claimUserTab", "42"],
        ["attach", "42"],
        ["requestPermission", "sess_1", "https://openai.com", 10],
        ["executeCdp", "42", "Runtime.evaluate", { expression: "location.href" }],
        ["moveMouse", "42", 10, 20],
      ]);
    } finally {
      client.close();
    }
  } finally {
    await backend.stop();
    await fs.rm(path.dirname(socketPath), { recursive: true, force: true });
  }
});
