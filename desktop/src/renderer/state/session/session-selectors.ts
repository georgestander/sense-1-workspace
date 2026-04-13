import { type PendingApproval, type RuntimeSetupState, type SidebarState, type ThreadRecord } from "./session-types.js";

export function folderDisplayName(folderPath: string): string {
  return folderPath.split(/[\\/]/).filter(Boolean).at(-1) ?? folderPath;
}

export function shouldShowRightRail(options: {
  selectedThread: ThreadRecord | null;
  selectedThreadApprovals: PendingApproval[];
  selectedThreadFolderRoot: string | null;
  threadInputRequest: SidebarState["inputRequestState"] | null;
  threadPlanState: SidebarState["planState"];
  threadDiffState: SidebarState["diffState"];
  taskPending: boolean;
  activeTurnId: string | null;
}): boolean {
  const {
    selectedThread,
    selectedThreadApprovals,
    selectedThreadFolderRoot,
    threadInputRequest,
    threadPlanState,
    threadDiffState,
    taskPending,
    activeTurnId,
  } = options;

  if (!selectedThread) {
    return false;
  }

  const isFolderWorkThread = Boolean(
    selectedThreadFolderRoot ||
      selectedThread.changeGroups.length > 0 ||
      selectedThreadApprovals.some((approval) => Boolean(approval.grantRoot)),
  );
  const hasApprovals = selectedThreadApprovals.length > 0;
  const hasInputRequests = Boolean(threadInputRequest);
  const hasThreadContent = selectedThread.entries.length > 0;
  const hasDeltaSidebarState = Boolean(threadPlanState || threadDiffState || threadInputRequest);
  const isThreadBusy =
    taskPending ||
    Boolean(activeTurnId) ||
    selectedThread.state === "running";

  if (isFolderWorkThread) return true;
  if (isThreadBusy) return true;
  if (hasDeltaSidebarState) return true;
  if (hasThreadContent) return true;
  if (hasApprovals || hasInputRequests) return true;
  return false;
}

export function runtimeSetupGuidance(setup: RuntimeSetupState): string {
  if (!setup) {
    return "";
  }

  if (setup.code === "missing_codex_runtime") {
    return "Install or restore Codex on this Mac, then reopen Sense-1 or retry the runtime check.";
  }

  if (setup.code === "auth_restore_failed") {
    return "Retry startup first. If sign-in still does not restore, start the ChatGPT sign-in flow again from the desktop app.";
  }

  if (setup.code === "recent_threads_restore_failed") {
    return "Retry startup to reload local thread state. If it keeps failing, inspect the local runtime logs before continuing.";
  }

  return "Retry startup after the local runtime is healthy again.";
}
