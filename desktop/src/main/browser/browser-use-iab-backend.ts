import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { DESKTOP_APP_VERSION } from "../app/app-version.ts";
import type { DesktopBrowserService } from "./desktop-browser-service.ts";

const MESSAGE_LENGTH_BYTES = 4;
export const BROWSER_USE_IAB_SOCKET_ENV = "SENSE1_BROWSER_USE_IAB_SOCKET_PATH";
const NODE_REPL_MCP_SECTION_PATTERN = /^\s*\[mcp_servers\.(?:"node_repl"|'node_repl'|node_repl)\]\s*$/u;
const TOML_SECTION_PATTERN = /^\s*\[[^\]]+\]\s*$/u;

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

  const profileHash = createHash("sha256").update(resolvedCodexHome).digest("hex").slice(0, 8);
  const socketDirectory = await fs.mkdtemp(path.join(os.tmpdir(), `s1-iab-${profileHash}-`));
  await chmodPrivateDirectory(socketDirectory);
  return path.join(socketDirectory, "b.sock");
}

function formatTomlString(value: string): string {
  return JSON.stringify(value);
}

function withBrowserUseSocketEnvLine(line: string, socketPath: string): string {
  const envLineMatch = line.match(/^(\s*env\s*=\s*\{)(.*?)(\}\s*(?:#.*)?)$/u);
  if (!envLineMatch) {
    return `env = { ${BROWSER_USE_IAB_SOCKET_ENV} = ${formatTomlString(socketPath)} }`;
  }

  const [, prefix, rawBody, suffix] = envLineMatch;
  const envValue = `${BROWSER_USE_IAB_SOCKET_ENV} = ${formatTomlString(socketPath)}`;
  const envKeyPattern = new RegExp(`${BROWSER_USE_IAB_SOCKET_ENV}\\s*=\\s*(?:"(?:\\\\.|[^"])*"|'[^']*')`, "u");
  const body = rawBody.trim();
  const nextBody = envKeyPattern.test(body)
    ? body.replace(envKeyPattern, () => envValue)
    : `${body ? `${body}, ` : ""}${envValue}`;
  return `${prefix} ${nextBody} ${suffix}`;
}

function withNodeReplBrowserUseSocketEnv(rawConfig: string, socketPath: string): string {
  const lines = rawConfig.split("\n");
  const sectionStart = lines.findIndex((line) => NODE_REPL_MCP_SECTION_PATTERN.test(line));
  if (sectionStart < 0) {
    return rawConfig;
  }

  const nextSectionOffset = lines
    .slice(sectionStart + 1)
    .findIndex((line) => TOML_SECTION_PATTERN.test(line));
  const sectionEnd = nextSectionOffset < 0
    ? lines.length
    : sectionStart + 1 + nextSectionOffset;
  const envIndex = lines.findIndex((line, index) =>
    index > sectionStart
    && index < sectionEnd
    && /^\s*env\s*=/u.test(line)
  );

  if (envIndex >= 0) {
    lines[envIndex] = withBrowserUseSocketEnvLine(lines[envIndex], socketPath);
  } else {
    lines.splice(sectionEnd, 0, withBrowserUseSocketEnvLine("", socketPath));
  }

  return lines.join("\n");
}

async function syncNodeReplBrowserUseSocketEnv(codexHome: string, socketPath: string): Promise<void> {
  const configPath = path.join(codexHome, "config.toml");
  let rawConfig: string;
  try {
    rawConfig = await fs.readFile(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return;
    }
    throw error;
  }

  const nextConfig = withNodeReplBrowserUseSocketEnv(rawConfig, socketPath);
  if (nextConfig !== rawConfig) {
    await fs.writeFile(configPath, nextConfig, "utf8");
  }
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
  readonly #socketPathPromiseByCodexHome = new Map<string, Promise<string>>();
  #socketPath: string;
  #server: net.Server | null = null;
  #startPromise: Promise<void> | null = null;

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
    let socketPath = this.#socketPathByCodexHome.get(resolvedCodexHome);
    if (!socketPath) {
      let socketPathPromise = this.#socketPathPromiseByCodexHome.get(resolvedCodexHome);
      if (!socketPathPromise) {
        socketPathPromise = createPrivateSocketPathForCodexHome(resolvedCodexHome).then((createdSocketPath) => {
          this.#socketPathByCodexHome.set(resolvedCodexHome, createdSocketPath);
          return createdSocketPath;
        }).finally(() => {
          this.#socketPathPromiseByCodexHome.delete(resolvedCodexHome);
        });
        this.#socketPathPromiseByCodexHome.set(resolvedCodexHome, socketPathPromise);
      }
      socketPath = await socketPathPromise;
    }
    await this.#setSocketPath(socketPath);
    await syncNodeReplBrowserUseSocketEnv(resolvedCodexHome, socketPath);
    return socketPath;
  }

  async start(): Promise<void> {
    if (this.#server) {
      return;
    }
    if (this.#startPromise) {
      return this.#startPromise;
    }
    const socketPath = this.#socketPath;
    this.#startPromise = this.#listen(socketPath);
    try {
      await this.#startPromise;
    } finally {
      this.#startPromise = null;
    }
  }

  async #listen(socketPath: string): Promise<void> {
    if (process.platform !== "win32") {
      await ensurePrivateSocketDirectory(socketPath);
      await fs.rm(socketPath, { force: true });
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
      server.listen(socketPath, () => {
        server.off("error", reject);
        resolve();
      });
    });
    this.#server = server;
  }

  async stop(): Promise<void> {
    const startPromise = this.#startPromise;
    if (startPromise) {
      await startPromise.catch(() => {});
    }
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

    const wasRunning = this.#server !== null || this.#startPromise !== null;
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
