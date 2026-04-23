import { EventEmitter } from "node:events";
import type { AppServerNotification } from "../contracts";

export interface AppServerSummary {
  state: string;
  lastError: string | null;
  restartCount: number;
  lastStateAt: string;
  recentTransportLogs: string[];
}

export interface AppServerProcessManagerOptions {
  command?: string;
  args?: string[];
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
  maxRestarts?: number;
  restartDelayMs?: number;
  codexHome?: string;
  env?: NodeJS.ProcessEnv;
}

export class AppServerProcessManager extends EventEmitter {
  constructor(options?: AppServerProcessManagerOptions);
  readonly state: string;
  readonly lastError: string | null;
  readonly summary: AppServerSummary;
  start(): Promise<void>;
  stop(): Promise<void>;
  request(method: string, params?: unknown): Promise<unknown>;
  readDirectory(directoryPath: string, options?: Record<string, unknown>): Promise<unknown>;
  requestReview(
    threadId: string,
    options?: {
      delivery?: string;
      target?: string | Record<string, unknown>;
    },
  ): Promise<unknown>;
  steerTurn(
    threadId: string,
    input: unknown,
    options?: {
      expectedTurnId?: string;
    },
  ): Promise<unknown>;
  notify(method: string, params?: unknown): void;
  respond(requestId: number, result: unknown): void;
  handleProfileChange(codexHome: string): Promise<void>;
  restart(reason?: string): Promise<void>;
  on(event: "state", listener: (summary: AppServerSummary) => void): this;
  on(event: "state:crashed", listener: (summary: AppServerSummary) => void): this;
  on(event: "state:errored", listener: (summary: AppServerSummary) => void): this;
  on(event: "notification", listener: (message: AppServerNotification) => void): this;
  on(event: "transport:error", listener: (error: Error) => void): this;
}

export const DEFAULT_STARTUP_TIMEOUT_MS: number;
export const DEFAULT_REQUEST_TIMEOUT_MS: number;
export const DEFAULT_MAX_RESTARTS: number;
export const APP_SERVER_STATES: string[];
