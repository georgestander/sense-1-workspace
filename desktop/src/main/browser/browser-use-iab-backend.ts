import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { DESKTOP_APP_VERSION } from "../app/app-version.ts";
import type { DesktopBrowserService } from "./desktop-browser-service.ts";

const MESSAGE_LENGTH_BYTES = 4;
export const BROWSER_USE_IAB_SOCKET_ENV = "SENSE1_BROWSER_USE_IAB_SOCKET_PATH";

type JsonRpcRequest = {
  readonly id?: number | string | null;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
};

function createEphemeralBrowserUseSocketPath(): string {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\sense1-browser-use-iab-${process.pid}-${randomUUID()}`;
  }
  return path.join(os.tmpdir(), `sense1-browser-use-iab-${process.pid}-${randomUUID()}`, "browser.sock");
}

async function chmodPrivateDirectory(directoryPath: string): Promise<void> {
  if (process.platform === "win32") {
    return;
  }
  await fs.chmod(directoryPath, 0o700);
}

async function ensurePrivateSocketDirectory(socketPath: string): Promise<void> {
  if (process.platform === "win32") {
    return;
  }
  const socketDirectory = path.dirname(socketPath);
  await fs.mkdir(socketDirectory, { recursive: true, mode: 0o700 });
  await chmodPrivateDirectory(socketDirectory);
}

async function createPrivateSocketPathForCodexHome(codexHome: string): Promise<string> {
  const resolvedCodexHome = path.resolve(codexHome);
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\sense1-browser-use-iab-${path.basename(path.dirname(resolvedCodexHome))}-${randomUUID()}`;
  }

  const profileRoot = path.dirname(resolvedCodexHome);
  const socketRoot = path.join(profileRoot, "browser-use-iab");
  await fs.mkdir(socketRoot, { recursive: true, mode: 0o700 });
  await chmodPrivateDirectory(socketRoot);
  const socketDirectory = await fs.mkdtemp(path.join(socketRoot, "socket-"));
  await chmodPrivateDirectory(socketDirectory);
  return path.join(socketDirectory, "browser.sock");
}

function encodeMessage(message: Record<string, unknown>): Buffer {
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

function decodeMessages(buffer: Buffer): { messages: JsonRpcRequest[]; remaining: Buffer } {
  const messages: JsonRpcRequest[] = [];
  let offset = 0;
  while (buffer.length - offset >= MESSAGE_LENGTH_BYTES) {
    const payloadLength = os.endianness() === "LE"
      ? buffer.readUInt32LE(offset)
      : buffer.readUInt32BE(offset);
    const frameLength = MESSAGE_LENGTH_BYTES + payloadLength;
    if (buffer.length - offset < frameLength) {
      break;
    }
    const payload = buffer.subarray(offset + MESSAGE_LENGTH_BYTES, offset + frameLength).toString("utf8");
    offset += frameLength;
    messages.push(JSON.parse(payload) as JsonRpcRequest);
  }
  return {
    messages,
    remaining: buffer.subarray(offset),
  };
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

function numberParam(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function idParam(params: Record<string, unknown>, ...keys: string[]): string {
  const raw = keys.map((key) => params[key]).find((value) => typeof value === "string" || typeof value === "number");
  const value = typeof raw === "number" ? String(raw) : firstString(raw);
  if (!value) {
    throw new Error(`Browser Use request is missing ${keys[0] ?? "tabId"}.`);
  }
  return value;
}

function debugBrowserUseIab(message: string, details: Record<string, unknown> = {}): void {
  if (process.env.SENSE1_BROWSER_USE_IAB_DEBUG !== "1") {
    return;
  }
  console.info("[browser-use-iab]", message, details);
}

export class BrowserUseIabBackend {
  readonly #browser: DesktopBrowserService;
  readonly #onOpen: ((event: { threadId: string }) => void) | null;
  readonly #socketPathByCodexHome = new Map<string, string>();
  #socketPath: string;
  #server: net.Server | null = null;

  constructor(
    browser: DesktopBrowserService,
    socketPath: string | null = null,
    onOpen: ((event: { threadId: string }) => void) | null = null,
  ) {
    this.#browser = browser;
    this.#socketPath = socketPath ?? createEphemeralBrowserUseSocketPath();
    this.#onOpen = onOpen;
  }

  get socketPath(): string {
    return this.#socketPath;
  }

  async configureForCodexHome(codexHome: string): Promise<string> {
    const resolvedCodexHome = path.resolve(codexHome);
    const socketPath = this.#socketPathByCodexHome.get(resolvedCodexHome)
      ?? await createPrivateSocketPathForCodexHome(resolvedCodexHome);
    this.#socketPathByCodexHome.set(resolvedCodexHome, socketPath);
    await this.#setSocketPath(socketPath);
    return socketPath;
  }

  async start(): Promise<void> {
    if (this.#server) {
      return;
    }
    if (process.platform !== "win32") {
      await ensurePrivateSocketDirectory(this.#socketPath);
      await fs.rm(this.#socketPath, { force: true });
    }

    const server = net.createServer((socket) => {
      let pending: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      const unsubscribe = this.#browser.onBrowserUseCdpEvent((event) => {
        socket.write(encodeMessage({
          jsonrpc: "2.0",
          method: "onCDPEvent",
          params: {
            source: { tabId: Number(event.tabId) },
            method: event.method,
            params: event.params,
          },
        }));
      });
      socket.on("data", (chunk: Buffer | string) => {
        const nextChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        pending = Buffer.concat([pending, nextChunk]);
        const decoded = decodeMessages(pending);
        pending = decoded.remaining;
        for (const message of decoded.messages) {
          void this.#handleMessage(socket, message);
        }
      });
      socket.on("close", unsubscribe);
      socket.on("error", unsubscribe);
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.#socketPath, () => {
        server.off("error", reject);
        resolve();
      });
    });
    this.#server = server;
  }

  async stop(): Promise<void> {
    const server = this.#server;
    if (!server) {
      return;
    }
    this.#server = null;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (process.platform !== "win32") {
      await fs.rm(this.#socketPath, { force: true });
    }
  }

  async #setSocketPath(socketPath: string): Promise<void> {
    if (this.#socketPath === socketPath) {
      return;
    }

    const wasRunning = this.#server !== null;
    if (wasRunning) {
      await this.stop();
    }
    this.#socketPath = socketPath;
    if (wasRunning) {
      await this.start();
    }
  }

  async #handleMessage(socket: net.Socket, message: JsonRpcRequest): Promise<void> {
    if (message.id == null) {
      return;
    }
    try {
      debugBrowserUseIab("request", {
        id: message.id,
        method: message.method,
        params: message.params,
      });
      const result = await this.#dispatch(message.method ?? "", message.params ?? {});
      debugBrowserUseIab("response", {
        id: message.id,
        method: message.method,
      });
      socket.write(encodeMessage({
        jsonrpc: "2.0",
        id: message.id,
        result,
      }));
    } catch (error) {
      debugBrowserUseIab("error", {
        id: message.id,
        method: message.method,
        error: error instanceof Error ? error.message : String(error),
      });
      socket.write(encodeMessage({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: 1,
          message: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  }

  async #dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case "ping":
        return "pong";
      case "getInfo":
        return {
          name: "Sense-1 Browser",
          version: DESKTOP_APP_VERSION,
          type: "iab",
          metadata: {
            codexSessionId: firstString(params.session_id) ?? "",
          },
          capabilities: {
            downloads: false,
            fileUploads: false,
            mediaDownloads: false,
          },
        };
      case "getTabs": {
        const sessionId = idParam(params, "session_id");
        this.#onOpen?.({ threadId: sessionId });
        return this.#browser.listBrowserUseTabs(sessionId);
      }
      case "createTab": {
        const sessionId = idParam(params, "session_id");
        this.#onOpen?.({ threadId: sessionId });
        return this.#browser.createBrowserUseTab(sessionId);
      }
      case "getUserTabs": {
        const sessionId = idParam(params, "session_id");
        this.#onOpen?.({ threadId: sessionId });
        return this.#browser.listBrowserUseTabs(sessionId);
      }
      case "requestPermission": {
        const origin = firstString(params.origin, params.url);
        if (!origin) {
          return { action: "decline" };
        }
        const sessionId = firstString(params.session_id);
        if (sessionId) {
          this.#onOpen?.({ threadId: sessionId });
        }
        return {
          action: sessionId
            ? await this.#browser.requestBrowserUsePermission(sessionId, origin, numberParam(params.timeoutMs, 60_000))
            : await this.#browser.waitForBrowserUsePermission(origin, numberParam(params.timeoutMs, 60_000)),
        };
      }
      case "claimUserTab":
        return this.#browser.getBrowserUseTab(idParam(params, "tabId", "tab_id"));
      case "attach":
        await this.#browser.browserUseAttach(idParam(params, "tabId", "tab_id"));
        return {};
      case "detach":
        await this.#browser.browserUseDetach(idParam(params, "tabId", "tab_id"));
        return {};
      case "executeCdp": {
        const target = params.target && typeof params.target === "object" ? params.target as Record<string, unknown> : {};
        const tabId = idParam(target, "tabId", "tab_id");
        const command = firstString(params.method);
        if (!command) {
          throw new Error("Browser Use executeCdp request is missing method.");
        }
        const commandParams = params.commandParams && typeof params.commandParams === "object"
          ? params.commandParams as Record<string, unknown>
          : {};
        return await this.#browser.browserUseExecuteCdp(tabId, command, commandParams);
      }
      case "moveMouse":
        await this.#browser.browserUseMoveMouse(
          idParam(params, "tabId", "tab_id"),
          numberParam(params.x),
          numberParam(params.y),
        );
        return {};
      case "nameSession":
      case "finalizeTabs":
        return {};
      default:
        throw new Error(`No Browser Use IAB handler registered for method: ${method}`);
    }
  }
}
