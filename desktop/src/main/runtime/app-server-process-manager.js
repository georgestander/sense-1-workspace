import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { EventEmitter } from "node:events";

import { AppServerStdioJsonRpcClient } from "./app-server-stdio-json-rpc.js";
import {
  buildIsolatedRuntimeEnv,
  ensureRuntimeConfigDefaults,
  ensureRuntimeIsolationDirectories,
  resolveRealtimeAuthEnvOverrides,
} from "./app-server-runtime-isolation.js";
import {
  buildRuntimePath,
  defaultCodexHomeForProfile,
  defaultRuntimePathEntriesForPlatform,
} from "./app-server-runtime-paths.js";
import {
  buildReadDirectoryRequest,
  buildReviewStartRequest,
  buildSteerTurnRequest,
} from "./app-server-request-shaping.js";
import { resolveRuntimeLaunch } from "./app-server-runtime-launch.js";
import { DESKTOP_APP_VERSION } from "../app/app-version.ts";

export const DEFAULT_STARTUP_TIMEOUT_MS = 5000;
export const DEFAULT_REQUEST_TIMEOUT_MS = 8000;
export const DEFAULT_MAX_RESTARTS = 1;
const DEFAULT_RUNTIME_ORIGINATOR = "sense-1-workspace desktop";
const DEFAULT_RUNTIME_CONFIG = [
  'approval_policy = { granular = { mcp_elicitations = true, rules = true, sandbox_approval = true, request_permissions = true, skill_approval = true } }',
  'sandbox_mode = "read-only"',
  "sandbox_workspace_write.network_access = true",
  'trust_level = "medium"',
  'model = "gpt-5.4-mini"',
  'web_search = "live"',
  'developer_instructions = ""',
  'instructions = ""',
  "",
  "[realtime]",
  'version = "v2"',
  'type = "conversational"',
  "",
  "[features]",
  "realtime_conversation = true",
  "",
  "[tools]",
  "view_image = true",
  "",
].join("\n");

const DEFAULT_APP_SERVER_ARGS = [
  "app-server",
  "--listen",
  "stdio://",
  "--enable",
  "realtime_conversation",
  "-c",
  'realtime.version="v2"',
  "-c",
  'realtime.type="conversational"',
];

export const APP_SERVER_STATES = [
  "idle",
  "starting",
  "ready",
  "busy",
  "stopped",
  "crashed",
  "errored",
];

export { defaultRuntimePathEntriesForPlatform } from "./app-server-runtime-paths.js";

export class AppServerProcessManager extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} [options.command]
   * @param {string[]} [options.args]
   * @param {number} [options.startupTimeoutMs]
   * @param {number} [options.requestTimeoutMs]
   * @param {number} [options.maxRestarts]
   * @param {number} [options.restartDelayMs]
   * @param {string} [options.codexHome]
   * @param {NodeJS.ProcessEnv} [options.env]
   */
  constructor(options = {}) {
    super();

    const {
      command = "codex",
      args = DEFAULT_APP_SERVER_ARGS,
      startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS,
      requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
      maxRestarts = DEFAULT_MAX_RESTARTS,
      restartDelayMs = 300,
      codexHome,
      env,
    } = options;

    this.command = command;
    this.args = args;
    this.startupTimeoutMs = startupTimeoutMs;
    this.requestTimeoutMs = requestTimeoutMs;
    this.maxRestarts = Math.max(0, maxRestarts);
    this.restartDelayMs = Math.max(0, restartDelayMs);
    this.codexHome = codexHome;
    this.env = env;

    this.rpc = new AppServerStdioJsonRpcClient(requestTimeoutMs);
    this.state = "idle";
    this.lastError = null;
    this.lastStateAt = new Date().toISOString();
    this.restartCount = 0;
    this.restartInProgress = false;
    this.shouldStop = false;
    this.suppressRestartOnExit = false;
    this.lastStopReason = null;
    this.child = null;
    this.startupTimeout = null;
    this.transportLogs = [];
    this.maxTransportLogs = 20;
    this.generation = 0;
    this.cachedInitParams = null;
    this.rpc.on("notification", (message) => {
      this.emit("notification", message);
    });
    this.rpc.on("transport:error", (error) => {
      this.emit("transport:error", error);
    });
    this.rpc.on("transport:log", (log) => {
      this._appendTransportLog(log);
      this.emit("transport:log", log);
    });
  }

  get summary() {
    return {
      state: this.state,
      lastError: this.lastError,
      restartCount: this.restartCount,
      lastStateAt: this.lastStateAt,
      recentTransportLogs: [...this.transportLogs],
    };
  }

  async start() {
    if (this.state === "starting" || this.state === "ready" || this.state === "busy") {
      return;
    }

    const resolvedCodexHome = this.codexHome ?? this._defaultCodexHome();
    try {
      await fs.mkdir(resolvedCodexHome, { recursive: true });
      await ensureRuntimeIsolationDirectories(resolvedCodexHome);
      await ensureRuntimeConfigDefaults(resolvedCodexHome, DEFAULT_RUNTIME_CONFIG);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.lastError = `Could not prepare app-server home at ${resolvedCodexHome}: ${detail}`;
      this._setState("errored");
      this.emit("state:errored", this.summary);
      throw new Error(this.lastError);
    }

    this.shouldStop = false;
    this.lastStopReason = null;
    this.suppressRestartOnExit = false;
    if (!this.restartInProgress) {
      this.restartCount = 0;
    }
    this._setState("starting");
    this.lastError = null;
    this._clearTransportLogs();

    const [rawCommand, rawArgs] = this._buildCommand();
    const realtimeAuthEnvOverrides = await resolveRealtimeAuthEnvOverrides(resolvedCodexHome, this.env);
    const nextEnv = buildIsolatedRuntimeEnv({
      codexHome: resolvedCodexHome,
      defaultRuntimeOriginator: DEFAULT_RUNTIME_ORIGINATOR,
      envOverrides: {
        ...realtimeAuthEnvOverrides,
        ...this.env,
      },
      processEnv: process.env,
      runtimePath: buildRuntimePath(),
    });
    let launch = {
      code: rawCommand,
      args: rawArgs,
      envPatch: {},
    };
    try {
      launch = await resolveRuntimeLaunch({
        command: rawCommand,
        args: rawArgs,
        env: nextEnv,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.lastError = detail;
      this._setState("errored");
      this.emit("state:errored", this.summary);
      throw new Error(detail);
    }

    const gen = ++this.generation;
    const childEnv = {
      ...nextEnv,
      ...(launch.envPatch ?? {}),
    };

    const child = spawn(launch.code, launch.args, {
      cwd: resolvedCodexHome,
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;
    let childErrorReject = null;
    const childErrorPromise = new Promise((_, reject) => {
      childErrorReject = reject;
    });

    child.once("error", (error) => {
      if (gen !== this.generation) return;
      this.lastError = error.message;
      this._clearStartupTimer();
      this._setState("errored");
      this.emit("state:errored", this.summary);
      this.rpc.close();
      this.child = null;
      childErrorReject?.(error);
    });

    child.once("exit", (exitCode, signal) => {
      if (gen !== this.generation) return;
      this._onChildExit(exitCode, signal);
    });

    this.rpc.attach(child.stdin, child.stdout, child.stderr);

    try {
      await Promise.race([this._initializeClient(), childErrorPromise]);
      this.rpc.notify("initialized", {});
      this._setState("ready");
    } catch (error) {
      if (gen !== this.generation) return;
      const message = error instanceof Error ? error.message : "App Server process failed to initialize.";
      this.lastError = message;
      this._setState("errored");
      this.suppressRestartOnExit = true;
      await this._stopChild({ forceKillMs: 500 });
      throw error;
    }
  }

  async stop() {
    this.shouldStop = true;
    this.lastStopReason = "manual stop requested";
    this._clearStartupTimer();

    if (this.state === "idle") {
      this._setState("stopped");
      return;
    }

    this._setState("stopped");
    await this._stopChild({ forceKillMs: 500 });
  }

  async request(method, params) {
    if (method === "initialize") {
      this.cachedInitParams = params ?? {};
    }

    if (this.state !== "ready" && this.state !== "busy") {
      throw new Error("App Server is not ready yet.");
    }

    this._setState("busy");
    try {
      const result = await this.rpc.request(method, params);
      if (this.state === "busy") {
        this._setState("ready");
      }
      return result;
    } catch (error) {
      if (this.state === "busy") {
        this._setState("ready");
      }
      throw error;
    }
  }

  async readDirectory(directoryPath, options = {}) {
    return await this.request("fs/readDirectory", buildReadDirectoryRequest(directoryPath, options));
  }

  async requestReview(threadId, options = {}) {
    return await this.request("review/start", buildReviewStartRequest(threadId, options));
  }

  async steerTurn(threadId, input, options = {}) {
    return await this.request("turn/steer", buildSteerTurnRequest(threadId, input, options));
  }

  notify(method, params) {
    this.rpc.notify(method, params);
  }

  respond(requestId, result) {
    if (this.state !== "ready" && this.state !== "busy") {
      throw new Error("App Server is not ready yet.");
    }

    this.rpc.respond(requestId, result);
  }

  async handleProfileChange(codexHome) {
    const nextCodexHome = codexHome || this._defaultCodexHome();
    const currentCodexHome = this.codexHome || this._defaultCodexHome();
    if (this.child && currentCodexHome === nextCodexHome) {
      this.codexHome = nextCodexHome;
      return;
    }

    this.codexHome = nextCodexHome;

    if (!this.child) {
      return;
    }

    if (this.state === "starting") {
      // Process hasn't served any data yet — replace it silently with the
      // correct CODEX_HOME instead of going through the restart cascade
      // that produces noisy "Already initialized" errors.
      this.suppressRestartOnExit = true;
      await this._stopChild({ forceKillMs: 500 });
      await this.start();
      return;
    }

    await this.restart("profile-change");
  }

  async restart(reason = "manual") {
    if (this.restartInProgress) {
      return;
    }

    if (this.maxRestarts <= 0) {
      this._setState("errored");
      this.lastError = `Restart disabled. Last stop reason: ${reason}.`;
      return;
    }

    if (this.restartCount >= this.maxRestarts) {
      this._setState("errored");
      this.lastError = `Restart budget exhausted after ${this.restartCount} attempt(s).`;
      this.emit("state:errored", this.summary);
      return;
    }

    this.shouldStop = false;
    this.restartCount += 1;
    this.restartInProgress = true;
    try {
      await this._stopChild({ forceKillMs: 500 });
      await new Promise((resolve) => setTimeout(resolve, this.restartDelayMs));

      await this.start();
    } finally {
      this.restartInProgress = false;
      this.shouldStop = false;
    }
  }

  _setState(nextState) {
    this.state = nextState;
    this.lastStateAt = new Date().toISOString();
    this.emit("state", this.summary);
  }

  async _initializeClient() {
    const initParams = this.cachedInitParams ?? {
      capabilities: {
        experimentalApi: true,
      },
      clientInfo: {
        name: "sense-1-workspace-desktop-shell",
        title: "sense-1 workspace desktop",
        version: DESKTOP_APP_VERSION,
      },
    };

    return await Promise.race([
      this.rpc.request("initialize", initParams).catch((error) => {
        // A restarted server may already be initialized from a prior session
        // in the same CODEX_HOME. Treat "Already initialized" as success.
        if (error instanceof Error && /already initialized/i.test(error.message)) {
          return undefined;
        }
        throw error;
      }),
      new Promise((_, reject) => {
        this.startupTimeout = setTimeout(() => {
          reject(new Error(`Timed out waiting ${this.startupTimeoutMs}ms for app-server initialize.`));
        }, this.startupTimeoutMs);
      }),
    ]).finally(() => {
      this._clearStartupTimer();
    });
  }

  async _stopChild({ forceKillMs = 1000 } = {}) {
    const child = this.child;
    if (!child || child.exitCode !== null) {
      this.child = null;
      this.rpc.close();
      return;
    }

    const exited = new Promise((resolve) => {
      child.once("exit", () => resolve());
    });

    child.kill("SIGTERM");

    const forced = new Promise((resolve) => {
      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
        resolve();
      }, forceKillMs);
    });

    await Promise.race([exited, forced]);
    this.rpc.close();
    this.child = null;
  }

  _onChildExit(exitCode, signal) {
    this._clearStartupTimer();
    this.rpc.close();

    if (this.shouldStop) {
      this._setState("stopped");
      this.lastError = this.lastStopReason;
      return;
    }

    if (this.suppressRestartOnExit) {
      this.suppressRestartOnExit = false;
      this._setState("errored");
      this.emit("state:errored", this.summary);
      return;
    }

    const reason = [
      signal ? `signal=${signal}` : null,
      Number.isInteger(exitCode) ? `code=${exitCode}` : null,
      this.lastError ? `error=${this.lastError}` : null,
    ]
      .filter(Boolean)
      .join(" ");

    const tail = this.transportLogs.length > 0 ? this.transportLogs.at(-1) : null;
    const tailMessage = tail ? ` Last transport output: ${tail}` : "";
    this.lastError = reason
      ? `App-server exited unexpectedly (${reason}).${tailMessage}`
      : `App-server exited unexpectedly.${tailMessage}`;

    if (this.state === "starting") {
      this._setState("errored");
      this.emit("state:errored", this.summary);
      return;
    }

    this._setState("crashed");
    this.emit("state:crashed", this.summary);

    if (!this.shouldStop && this.restartCount < this.maxRestarts) {
      void this.restart("unexpected-exit");
      return;
    }

    this._setState("errored");
    this.emit("state:errored", this.summary);
  }

  _buildCommand() {
    return [this.command, this.args];
  }

  _defaultCodexHome() {
    return defaultCodexHomeForProfile();
  }

  _clearStartupTimer() {
    if (this.startupTimeout) {
      clearTimeout(this.startupTimeout);
      this.startupTimeout = null;
    }
  }

  _appendTransportLog(log) {
    const line = String(log).trim();
    if (!line) {
      return;
    }

    this.transportLogs = [...this.transportLogs.slice(-(this.maxTransportLogs - 1)), line];
  }

  _clearTransportLogs() {
    this.transportLogs = [];
  }
}
