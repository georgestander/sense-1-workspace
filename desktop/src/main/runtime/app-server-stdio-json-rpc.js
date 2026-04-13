import { EventEmitter } from "node:events";

/**
 * @typedef {import("node:stream").Writable} WritableStream
 * @typedef {import("node:stream").Readable} ReadableStream
 * @typedef {{
 *   id?: number;
 *   method?: string;
 *   params?: unknown;
 *   result?: unknown;
 *   error?: {
 *     message?: string;
 *     code?: number;
 *   };
 * }} AppServerJsonRpcMessage
 */

const DEFAULT_REQUEST_TIMEOUT_MS = 8000;

/**
 * Browser-safe parser for JSON-RPC framed over stdio.
 */
export class AppServerStdioJsonRpcClient extends EventEmitter {
  /**
   * @param {number | undefined} requestTimeoutMs
   */
  constructor(requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
    super();

    this.nextRequestId = 1;
    this.requestTimeoutMs = requestTimeoutMs;
    this.pending = new Map();
    this.readBuffer = "";
    this.stdin = null;
    this.stdout = null;
    this.stderr = null;
    this.closed = false;
  }

  /**
   * @param {WritableStream} stdin
   * @param {ReadableStream} stdout
   * @param {ReadableStream} stderr
   */
  attach(stdin, stdout, stderr) {
    this.detach();

    this.stdin = stdin;
    this.stdout = stdout;
    this.stderr = stderr;
    this.closed = false;

    this._bindStream(stdout, this._handleStdoutData.bind(this));
    this._bindStream(stderr, this._handleStderrData.bind(this));
  }

  detach() {
    if (this.stdout) {
      this.stdout.removeAllListeners("data");
      this.stdout.removeAllListeners("error");
    }

    if (this.stderr) {
      this.stderr.removeAllListeners("data");
      this.stderr.removeAllListeners("error");
    }

    this.stdout = null;
    this.stderr = null;
    this.stdin = null;
    this.readBuffer = "";
  }

  close() {
    if (this.closed) {
      return;
    }

    this.closed = true;

    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("App Server transport closed before response."));
      this.pending.delete(requestId);
    }

    this.detach();
  }

  /**
   * @param {string} method
   * @param {unknown} [params]
   * @param {number} [timeoutMs]
   */
  async request(method, params, timeoutMs = this.requestTimeoutMs) {
    if (!this.stdin || this.closed) {
      throw new Error("App Server transport is not connected.");
    }

    const id = this.nextRequestId++;
    const payload = JSON.stringify(
      this._buildPayload({ id, method, params: params ?? {} }),
    ) + "\n";

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.pending.get(id);
        if (!pending) {
          return;
        }

        this.pending.delete(id);
        reject(new Error(`Timed out waiting for app-server reply to ${method}.`));
      }, timeoutMs);

      this.pending.set(id, {
        method,
        timeout: timer,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });

      try {
        this.stdin?.write(payload);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error("App Server transport write failed."));
      }
    });
  }

  /**
   * @param {string} method
   * @param {unknown} [params]
   */
  notify(method, params) {
    this._send({ method, params: params ?? {} });
  }

  /**
   * @param {number} id
   * @param {unknown} result
   */
  respond(id, result) {
    this._send({ id, result });
  }

  _send(payload) {
    if (!this.stdin || this.closed) {
      throw new Error("App Server transport is not connected.");
    }

    this.stdin.write(JSON.stringify(this._buildPayload(payload)) + "\n");
  }

  _bindStream(stream, handler) {
    stream.on("data", handler);
    stream.on("error", () => {
      this.emit("transport:error", new Error("App Server stdio transport stream error."));
    });
  }

  _handleStdoutData(chunk) {
    this.readBuffer += String(chunk);
    const lines = this.readBuffer.split("\n");
    this.readBuffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      let message;
      try {
        message = /** @type {AppServerJsonRpcMessage} */ (JSON.parse(line));
      } catch {
        this.emit("transport:error", new Error(`Invalid app-server message: ${line}`));
        continue;
      }

      this._dispatchMessage(message);
    }
  }

  _handleStderrData(chunk) {
    const text = String(chunk);
    if (!text) {
      return;
    }

    for (const line of text.split("\n")) {
      const entry = line.trim();
      if (!entry) {
        continue;
      }

      this.emit("transport:log", entry);
    }
  }

  _dispatchMessage(message) {
    if (message.id !== undefined && message.method == null) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        this.emit("transport:error", new Error(`Received uncorrelated response id=${message.id}.`));
        return;
      }

      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || "App Server request failed."));
        return;
      }

      pending.resolve(message.result);
      return;
    }

    this.emit("notification", message);
  }

  _buildPayload(data) {
    return {
      jsonrpc: "2.0",
      ...data,
    };
  }
}
