import type { AppServerProcessManager } from "../runtime/app-server-process-manager.js";

const INACTIVE_TURN_STATUSES = new Set([
  "canceled",
  "cancelled",
  "completed",
  "failed",
  "interrupted",
]);

type TurnReadResult = {
  thread?: {
    turns?: Array<{
      id?: string | null;
      status?: string | null;
    }>;
  } | null;
};

export class ThreadTurnControlService {
  readonly #manager: AppServerProcessManager;

  constructor(manager: AppServerProcessManager) {
    this.#manager = manager;
  }

  async interruptTurn({
    threadId,
    turnId,
  }: {
    threadId: string;
    turnId?: string | null;
  }): Promise<void> {
    const resolvedThreadId = threadId?.trim();
    if (!resolvedThreadId) {
      throw new Error("No thread to interrupt.");
    }
    let resolvedTurnId = turnId?.trim() || null;
    if (!resolvedTurnId) {
      try {
        resolvedTurnId = await this.#resolveActiveTurnId(resolvedThreadId);
      } catch (error) {
        if (error instanceof Error && /No active run to revise\./i.test(error.message)) {
          throw new Error("No active run to interrupt.");
        }
        throw error;
      }
    }

    await this.#manager.request("turn/interrupt", {
      threadId: resolvedThreadId,
      turnId: resolvedTurnId,
      expectedTurnId: resolvedTurnId,
    });
  }

  async steerTurn(threadId: string, input: string): Promise<void> {
    const resolvedThreadId = threadId?.trim();
    const resolvedInput = input?.trim();
    if (!resolvedThreadId) {
      throw new Error("Choose a thread before revising the run.");
    }
    if (!resolvedInput) {
      throw new Error("Add revision guidance before revising the run.");
    }

    const activeTurnId = await this.#resolveActiveTurnId(resolvedThreadId);
    const manager = this.#manager as AppServerProcessManager & {
      steerTurn?: (
        threadId: string,
        input: unknown,
        options?: { expectedTurnId?: string },
      ) => Promise<unknown>;
    };
    const turnInput = [
      {
        type: "text",
        text: resolvedInput,
      },
    ];
    if (typeof manager.steerTurn === "function") {
      await manager.steerTurn(resolvedThreadId, turnInput, {
        expectedTurnId: activeTurnId,
      });
      return;
    }

    await this.#manager.request("turn/steer", {
      threadId: resolvedThreadId,
      input: turnInput,
      expectedTurnId: activeTurnId,
    });
  }

  async #resolveActiveTurnId(threadId: string): Promise<string> {
    const result = await this.#manager.request("thread/read", {
      threadId,
      includeTurns: true,
    }) as TurnReadResult;
    const turns = Array.isArray(result?.thread?.turns) ? result.thread.turns : [];
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const candidate = turns[index];
      const turnId = firstString(candidate?.id);
      const status = firstString(candidate?.status);
      if (!turnId) {
        continue;
      }
      if (!status || !INACTIVE_TURN_STATUSES.has(status)) {
        return turnId;
      }
    }

    throw new Error("No active run to revise.");
  }
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
