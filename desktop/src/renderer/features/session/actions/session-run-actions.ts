import type { DesktopApprovalResponseRequest } from "../../../../main/contracts";
import type { DesktopSessionActionDependencies, DesktopSessionActionHandlers } from "../session-action-types.js";
import type { PendingApproval } from "../../../state/session/session-types.js";
import { createThreadRecord, upsertThread } from "../../../state/threads/thread-summary-state.js";
import { normalizeDesktopSummary } from "../../../lib/live-thread-data.js";

export function createSessionRunActions(
  deps: DesktopSessionActionDependencies,
): Pick<
  DesktopSessionActionHandlers,
  "respondToApproval" | "respondToInputRequest" | "runTask" | "interruptTurn" | "steerTurn" | "queueTurnInput"
> {
  function buildPermissionRetryRequest(
    request: {
      prompt: string;
      threadId?: string | null;
      cwd?: string | null;
      workspaceRoot?: string | null;
      attachments?: string[];
    },
    result: {
      permissionRequest?: { rootPath?: string | null } | null;
      workspaceRoot?: string | null;
    },
  ) {
    const grantedWorkspaceRoot =
      (typeof result.workspaceRoot === "string" && result.workspaceRoot.trim())
      || (typeof result.permissionRequest?.rootPath === "string" && result.permissionRequest.rootPath.trim())
      || request.workspaceRoot
      || null;

    return {
      ...request,
      workspaceRoot: grantedWorkspaceRoot,
    };
  }

  async function respondToApproval(
    approval: PendingApproval,
    decision: DesktopApprovalResponseRequest["decision"],
  ) {
    deps.setProcessingApprovalIds((current) => [...current, approval.id]);
    try {
      const bridge = deps.requireDesktopBridge();
      await bridge.approvals.respond({
        requestId: approval.id,
        decision,
      });
      if (decision !== "decline" && approval.grantRoot) {
        await bridge.workspace.rememberThreadRoot({
          threadId: approval.threadId,
          workspaceRoot: approval.grantRoot,
        });
      }
      await deps.refreshBootstrap({ restoreSelection: true });
    } catch (error) {
      deps.setTaskError(error instanceof Error ? error.message : "Could not resolve the approval.");
    } finally {
      deps.setProcessingApprovalIds((current) => current.filter((itemId) => itemId !== approval.id));
    }
  }

  async function runTask(request: {
    prompt: string;
    threadId?: string | null;
    cwd?: string | null;
    workspaceRoot?: string | null;
    attachments?: string[];
  }) {
    const prompt = request.prompt.trim();
    if (!prompt) {
      return;
    }

    deps.setTaskPending(true);
    deps.setTaskError(null);

    try {
      const bridge = deps.requireDesktopBridge();
      const result = await bridge.turns.run({
        prompt,
        threadId: request.threadId ?? undefined,
        cwd: request.cwd ?? request.workspaceRoot ?? undefined,
        workspaceRoot: request.workspaceRoot ?? undefined,
        model: deps.model || undefined,
        reasoningEffort: deps.reasoningEffort || undefined,
        attachments: request.attachments?.length ? request.attachments : undefined,
        runContext: deps.getRunContext() ?? undefined,
      });

      if (result.status === "permissionRequired") {
        deps.setPendingPermission(result.permissionRequest ? {
          rootPath: result.permissionRequest.rootPath,
          displayName: result.permissionRequest.displayName,
          originalRequest: buildPermissionRetryRequest(request, result),
        } : null);
        return;
      }

      if (result.status === "approvalRequired") {
        deps.rememberKnownThreadIds([result.threadId]);
        deps.setThreads((current) => {
          const record = createThreadRecord(
            normalizeDesktopSummary(result.thread, result.workspaceRoot ?? null),
            current.find((thread) => thread.id === result.threadId),
          );
          return upsertThread(current, { ...record, state: "idle" });
        });
        deps.flushPendingThreadDeltas(result.threadId);
        deps.setSelectedThreadId(result.threadId);
        deps.selectedThreadIdRef.current = result.threadId;
        await bridge.threads.rememberLastSelected({ threadId: result.threadId });
        await deps.refreshBootstrap({ preferredThreadId: result.threadId, restoreSelection: true });
        return;
      }

      deps.rememberKnownThreadIds([result.threadId]);
      deps.setThreads((current) => {
        const record = createThreadRecord(
          normalizeDesktopSummary(result.thread, result.workspaceRoot ?? null),
          current.find((thread) => thread.id === result.threadId),
        );
        return upsertThread(current, { ...record, state: "running" });
      });
      deps.flushPendingThreadDeltas(result.threadId);
      deps.setSelectedThreadId(result.threadId);
      deps.selectedThreadIdRef.current = result.threadId;
      deps.setActiveTurnIdsByThread((current) => (
        result.turnId
          ? { ...current, [result.threadId]: result.turnId }
          : current
      ));
      await bridge.threads.rememberLastSelected({ threadId: result.threadId });
    } catch (error) {
      deps.setTaskError(error instanceof Error ? error.message : "Could not start the desktop task.");
    } finally {
      deps.setTaskPending(false);
    }
  }

  async function interruptTurn() {
    const threadId = deps.getSelectedThreadId();
    const activeTurnIdsByThread = deps.getActiveTurnIdsByThread();
    const turnId = threadId ? activeTurnIdsByThread[threadId] ?? null : null;
    if (!threadId) {
      deps.setTaskError("Sense-1 could not find the active run to stop.");
      return;
    }

    try {
      const bridge = deps.requireDesktopBridge();
      await bridge.turns.interrupt({ threadId, turnId });
      await deps.refreshBootstrap({ restoreSelection: true });
    } catch (error) {
      deps.setTaskError(error instanceof Error ? error.message : "Could not stop the active run.");
    }
  }

  async function steerTurn(input: string) {
    const threadId = deps.getSelectedThreadId();
    const trimmedInput = input.trim();
    if (!threadId) {
      deps.setTaskError("Sense-1 could not find the thread to revise.");
      return;
    }
    if (!trimmedInput) {
      deps.setTaskError("Add revision guidance before revising the run.");
      return;
    }

    try {
      const bridge = deps.requireDesktopBridge();
      await bridge.turns.steer({
        threadId,
        input: trimmedInput,
      });
    } catch (error) {
      deps.setTaskError(error instanceof Error ? error.message : "Could not revise the active run.");
    }
  }

  async function queueTurnInput(input: string) {
    const threadId = deps.getSelectedThreadId();
    const trimmedInput = input.trim();
    if (!threadId) {
      deps.setTaskError("Sense-1 could not find the thread to queue.");
      return;
    }
    if (!trimmedInput) {
      deps.setTaskError("Add follow-up guidance before queueing.");
      return;
    }

    try {
      const bridge = deps.requireDesktopBridge();
      await bridge.turns.queue({
        threadId,
        input: trimmedInput,
      });
    } catch (error) {
      deps.setTaskError(error instanceof Error ? error.message : "Could not queue the follow-up.");
    }
  }

  async function respondToInputRequest(requestId: number, text: string) {
    try {
      const bridge = deps.requireDesktopBridge();
      await bridge.input.respond({ requestId, text });
      const selectedThreadId = deps.getSelectedThreadId();
      if (selectedThreadId) {
        deps.setPerThreadSidebar((prev) => ({
          ...prev,
          [selectedThreadId]: {
            ...(prev[selectedThreadId] || { planState: null, diffState: null, inputRequestState: null }),
            inputRequestState:
              prev[selectedThreadId]?.inputRequestState?.requestId === requestId
                ? null
                : (prev[selectedThreadId]?.inputRequestState ?? null),
          },
        }));
      }
    } catch (error) {
      deps.setTaskError(error instanceof Error ? error.message : "Could not submit the input response.");
    }
  }

  return {
    interruptTurn,
    queueTurnInput,
    respondToApproval,
    respondToInputRequest,
    runTask,
    steerTurn,
  };
}
