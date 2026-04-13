import type { DesktopThreadSnapshot } from "../../main/contracts";

export type ThreadIndicatorState = {
  tone: "running" | "completed" | "failed" | "queued" | "idle";
  queuedMessageCount: number;
  statusLabel: string | null;
};

export function resolveThreadIndicatorState(
  thread: Pick<DesktopThreadSnapshot, "state" | "threadInputState">,
): ThreadIndicatorState {
  const queuedMessageCount = thread.threadInputState?.queuedMessages.length ?? 0;
  const lastCompletionStatus = thread.threadInputState?.lastCompletionStatus ?? null;
  const hasUnseenCompletion = thread.threadInputState?.hasUnseenCompletion === true;

  if (thread.state === "running") {
    return {
      tone: "running",
      queuedMessageCount,
      statusLabel: queuedMessageCount > 0 ? `${queuedMessageCount} queued` : "Running",
    };
  }

  if (hasUnseenCompletion) {
    if (lastCompletionStatus === "failed") {
      return {
        tone: "failed",
        queuedMessageCount,
        statusLabel: "Failed",
      };
    }

    return {
      tone: "completed",
      queuedMessageCount,
      statusLabel: lastCompletionStatus === "interrupted" ? "Stopped" : "Completed",
    };
  }

  if (queuedMessageCount > 0) {
    return {
      tone: "queued",
      queuedMessageCount,
      statusLabel: `${queuedMessageCount} queued`,
    };
  }

  return {
    tone: "idle",
    queuedMessageCount: 0,
    statusLabel: null,
  };
}
