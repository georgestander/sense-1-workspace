import type { DesktopSessionActionDependencies, DesktopSessionActionHandlers } from "../session-action-types.js";
import { createRememberSelectedThread } from "./session-action-shared.ts";
import { createThreadRecord, upsertThread } from "../../../state/threads/thread-summary-state.js";
import { normalizeDesktopSummary } from "../../../lib/live-thread-data.js";

export function createSessionThreadActions(
  deps: DesktopSessionActionDependencies,
): Pick<
  DesktopSessionActionHandlers,
  | "selectThread"
  | "clearSelectedThread"
  | "renameThread"
  | "archiveThread"
  | "restoreThread"
  | "deleteThread"
  | "interruptTurn"
  | "steerTurn"
> {
  const rememberSelectedThread = createRememberSelectedThread(deps);

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

  async function selectThread(threadId: string, options: { workspaceRoot?: string | null } = {}) {
    const resumeWorkspaceRoot = options.workspaceRoot?.trim() || null;
    if (resumeWorkspaceRoot) {
      try {
        const bridge = deps.requireDesktopBridge();
        await bridge.workspace.rememberThreadRoot({
          threadId,
          workspaceRoot: resumeWorkspaceRoot,
        });
      } catch {
        // Keep the resume path working even if the workspace hint cannot be persisted before selection.
      }
    }
    deps.setSelectedThreadId(threadId);
    await rememberSelectedThread(threadId);
    await deps.refreshBootstrap({ restoreSelection: true });
  }

  async function clearSelectedThread() {
    deps.setSelectedThreadId(null);
    await rememberSelectedThread(null);
  }

  async function renameThread(threadId: string, title: string): Promise<boolean> {
    const nextTitle = title.trim();
    if (!nextTitle) {
      deps.setTaskError("Thread title cannot be empty.");
      return false;
    }

    try {
      const bridge = deps.requireDesktopBridge();
      await bridge.threads.rename({ threadId, title: nextTitle });
      deps.setThreads((current) =>
        current.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                title: nextTitle,
                updatedAt: new Date().toISOString(),
                updatedLabel: "just now",
              }
            : thread,
        ),
      );
      await deps.refreshBootstrap({ restoreSelection: true });
      deps.setTaskError(null);
      return true;
    } catch (error) {
      deps.setTaskError(error instanceof Error ? error.message : "Could not rename the thread.");
      return false;
    }
  }

  async function archiveThread(threadId: string): Promise<boolean> {
    try {
      const bridge = deps.requireDesktopBridge();
      await bridge.threads.archive({ threadId });
      await deps.removeThreadFromLocalState(threadId);
      await deps.refreshBootstrap({ restoreSelection: true });
      deps.setTaskError(null);
      return true;
    } catch (error) {
      deps.setTaskError(error instanceof Error ? error.message : "Could not archive the thread.");
      return false;
    }
  }

  async function restoreThread(threadId: string): Promise<boolean> {
    try {
      const bridge = deps.requireDesktopBridge();
      await bridge.threads.restore({ threadId });
      await deps.refreshBootstrap({ restoreSelection: true });
      deps.setTaskError(null);
      return true;
    } catch (error) {
      deps.setTaskError(error instanceof Error ? error.message : "Could not restore the thread.");
      return false;
    }
  }

  async function deleteThread(threadId: string): Promise<boolean> {
    try {
      const bridge = deps.requireDesktopBridge();
      await bridge.threads.delete({ threadId });
      await deps.removeThreadFromLocalState(threadId);
      await deps.refreshBootstrap({ restoreSelection: true });
      deps.setTaskError(null);
      return true;
    } catch (error) {
      deps.setTaskError(error instanceof Error ? error.message : "Could not delete the thread.");
      return false;
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

  return {
    archiveThread,
    clearSelectedThread,
    deleteThread,
    interruptTurn,
    renameThread,
    restoreThread,
    selectThread,
    steerTurn,
  };
}
