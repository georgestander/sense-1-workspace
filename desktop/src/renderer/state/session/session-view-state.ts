import type { DesktopThreadSnapshot } from "../../../main/contracts";
import { shouldShowRightRail } from "./session-selectors.js";
import type { PendingApproval, SidebarState, ThreadRecord } from "./session-types.js";

type ThreadPlanState = Exclude<SidebarState["planState"], undefined>;
type ThreadDiffState = Exclude<SidebarState["diffState"], undefined>;
type ThreadInputRequestState = Exclude<SidebarState["inputRequestState"], undefined>;

export type DesktopSessionViewState = {
  activeRoot: string | null;
  activeTurnId: string | null;
  currentSidebar: SidebarState | null;
  interactionState: DesktopThreadSnapshot["interactionState"] | null;
  rightRailThread: ThreadRecord | null;
  selectedThread: ThreadRecord | null;
  selectedThreadApprovals: PendingApproval[];
  selectedThreadFolderRoot: string | null;
  showRightRail: boolean;
  threadDiffState: ThreadDiffState;
  threadInputRequest: ThreadInputRequestState;
  threadPlanState: ThreadPlanState;
};

export function buildDesktopSessionViewState({
  activeTurnIdsByThread,
  pendingApprovals,
  perThreadSidebar,
  selectedThreadId,
  taskPending,
  threads,
}: {
  activeTurnIdsByThread: Record<string, string>;
  pendingApprovals: PendingApproval[];
  perThreadSidebar: Record<string, SidebarState>;
  selectedThreadId: string | null;
  taskPending: boolean;
  threads: ThreadRecord[];
}): DesktopSessionViewState {
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? null;
  const selectedThreadApprovals = pendingApprovals.filter((approval) => approval.threadId === selectedThreadId);
  const selectedThreadFolderRoot = selectedThread?.workspaceRoot ?? selectedThread?.cwd ?? null;
  const currentSidebar = selectedThreadId ? perThreadSidebar[selectedThreadId] ?? null : null;
  const threadPlanState = currentSidebar?.planState ?? null;
  const threadDiffState = currentSidebar?.diffState ?? null;
  const threadInputRequest = currentSidebar?.inputRequestState ?? null;
  const activeTurnId = selectedThreadId ? activeTurnIdsByThread[selectedThreadId] ?? null : null;
  const interactionState = selectedThread?.interactionState ?? null;
  const showRightRail = shouldShowRightRail({
    selectedThread,
    selectedThreadApprovals,
    selectedThreadFolderRoot,
    threadInputRequest,
    threadPlanState,
    threadDiffState,
    taskPending,
    activeTurnId,
  });

  return {
    activeRoot: selectedThreadFolderRoot,
    activeTurnId,
    currentSidebar,
    interactionState,
    rightRailThread: showRightRail ? selectedThread : null,
    selectedThread,
    selectedThreadApprovals,
    selectedThreadFolderRoot,
    showRightRail,
    threadDiffState,
    threadInputRequest,
    threadPlanState,
  };
}
