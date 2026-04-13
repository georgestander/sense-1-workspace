import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";

import { AppServerStdioJsonRpcClient } from "./app-server-stdio-json-rpc.js";

function createTransport() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const client = new AppServerStdioJsonRpcClient(100);

  client.attach(stdin, stdout, stderr);

  return { client, stdin, stdout, stderr };
}

test("request pairs replies by id", async () => {
  const { client, stdin, stdout } = createTransport();
  const writes = [];
  stdin.on("data", (chunk) => {
    writes.push(String(chunk));
  });

  const responsePromise = client.request("ping", { value: 1 });
  assert.equal(writes.length, 1);
  const request = JSON.parse(writes[0]);
  stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { ok: true } })}\n`);

  await assert.doesNotReject(responsePromise);
  await assert.rejects(client.request("never-answered", {}), /Timed out waiting/);

  client.close();
});

test("notifications stream independently from responses", async () => {
  const { client, stdin, stdout } = createTransport();
  const notifications = [];
  client.on("notification", (message) => notifications.push(message));

  const responsePromise = client.request("emitNotification", { kind: "progress" });
  const request = JSON.parse(String(stdin.read() ?? ""));

  stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method: "thread/item", params: { kind: "progress" } })}\n`);
  stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { ok: true } })}\n`);

  await assert.deepEqual(await responsePromise, { ok: true });
  assert.deepEqual(notifications, [{ jsonrpc: "2.0", method: "thread/item", params: { kind: "progress" } }]);

  client.close();
});

test("invalid stdout payloads surface transport errors", async () => {
  const { client, stdout } = createTransport();
  const errors = [];
  client.on("transport:error", (error) => errors.push(error.message));

  stdout.write("not json\n");

  assert.deepEqual(errors, ["Invalid app-server message: not json"]);
  client.close();
});

test("stderr lines are surfaced as transport logs", async () => {
  const { client, stderr } = createTransport();
  const logs = [];
  client.on("transport:log", (entry) => logs.push(entry));

  stderr.write("first line\nsecond line\n");

  assert.deepEqual(logs, ["first line", "second line"]);
  client.close();
});

test("respond writes JSON-RPC responses without opening a request", () => {
  const { client, stdin } = createTransport();
  const writes = [];
  stdin.on("data", (chunk) => {
    writes.push(String(chunk));
  });

  client.respond(17, "accept");

  assert.deepEqual(writes, ['{"jsonrpc":"2.0","id":17,"result":"accept"}\n']);
  client.close();
});
