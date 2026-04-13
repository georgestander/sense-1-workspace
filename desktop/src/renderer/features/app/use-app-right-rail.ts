import { useEffect, useRef, useState, type RefObject } from "react";

import type {
  DesktopApprovalEvent,
  DesktopInputRequestState,
  DesktopInteractionState,
  DesktopThreadChangeGroup,
  DesktopThreadSnapshot,
  ProjectedSessionRecord,
  ProjectedWorkspaceRecord,
} from "../../../main/contracts";
import type { RightRailProps } from "../../components/RightRail";
import { buildTranscriptScrollAnchor, shouldAutoFollowTranscript } from "./transcript-scroll.js";

const PRE_EXECUTION_STATES = new Set<DesktopInteractionState>(["conversation", "clarification"]);

const DEFAULT_RIGHT_RAIL_SECTIONS_OPEN: Record<string, boolean> = {
  approvals: true,
  content: false,
  input: true,
  plan: true,
  progress: true,
  diffs: true,
  diffGroups: true,
  history: true,
  thread: true,
};

type UseAppRightRailArgs = {
  activeWorkspaceProjection: ProjectedWorkspaceRecord | null;
  attachedFiles: string[];
  inputResponsePending: boolean;
  inputResponseText: string;
  pendingApprovals: DesktopApprovalEvent[];
  persistedSessionActivityLoading: boolean;
  persistedSessionActivitySummary: RightRailProps["persistedSessionActivitySummary"];
  persistedSessionWrittenPaths: string[];
  processingApprovalIds: number[];
  refreshWorkspaceStructure: () => Promise<void>;
  respondToApproval: RightRailProps["respondToApproval"];
  respondToInputRequest: (requestId: number, text: string) => Promise<void>;
  resumeWorkspaceSession: RightRailProps["resumeWorkspaceSession"];
  rightRailThread: DesktopThreadSnapshot | null;
  selectedThread: DesktopThreadSnapshot | null;
  selectedThreadApprovals: DesktopApprovalEvent[];
  selectedThreadId: string | null;
  setInputResponsePending: (pending: boolean) => void;
  setInputResponseText: (text: string) => void;
  showRightRail: boolean;
  taskPending: boolean;
  threadInputRequest: DesktopInputRequestState | null;
  threadPlanState: RightRailProps["threadPlanState"];
  transcriptContainerRef: RefObject<HTMLDivElement | null>;
  transcriptEndRef: RefObject<HTMLDivElement | null>;
  workspacePolicy: RightRailProps["workspacePolicy"];
  workspaceSessions: ProjectedSessionRecord[];
  workspaceStructureRefreshing: boolean;
};

export function useAppRightRail({
  activeWorkspaceProjection,
  attachedFiles,
  inputResponsePending,
  inputResponseText,
  pendingApprovals,
  persistedSessionActivityLoading,
  persistedSessionActivitySummary,
  persistedSessionWrittenPaths,
  processingApprovalIds,
  refreshWorkspaceStructure,
  respondToApproval,
  respondToInputRequest,
  resumeWorkspaceSession,
  rightRailThread,
  selectedThread,
  selectedThreadApprovals,
  selectedThreadId,
  setInputResponsePending,
  setInputResponseText,
  showRightRail,
  taskPending,
  threadInputRequest,
  threadPlanState,
  transcriptContainerRef,
  transcriptEndRef,
  workspacePolicy,
  workspaceSessions,
  workspaceStructureRefreshing,
}: UseAppRightRailArgs) {
  const [rightRailOpen, setRightRailOpen] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return window.innerWidth >= 1280;
  });
  const [rightRailSectionsOpen, setRightRailSectionsOpen] = useState<Record<string, boolean>>(
    DEFAULT_RIGHT_RAIL_SECTIONS_OPEN,
  );
  const autoFollowFrameRef = useRef<number | null>(null);

  const rightRailProgressSummary = Array.isArray(rightRailThread?.progressSummary)
    ? rightRailThread.progressSummary
    : [];
  const rightRailChangeGroups = Array.isArray(rightRailThread?.changeGroups)
    ? rightRailThread.changeGroups
    : [];
  const threadInteractionState = selectedThread?.interactionState ?? null;
  const effectiveThreadBusy =
    taskPending || selectedThread?.state === "active" || selectedThread?.state === "running";
  const footerStatusText =
    selectedThreadApprovals.length > 0
      ? "Waiting for your approval before continuing."
      : effectiveThreadBusy
        ? "Streaming live runtime updates."
        : "Ready for the next prompt.";
  const isPreExecution = threadInteractionState
    ? PRE_EXECUTION_STATES.has(threadInteractionState)
    : false;
  const isClarifying = threadInteractionState === "clarification" && Boolean(threadInputRequest);
  const structuredQuestions = threadInputRequest?.questions ?? [];
  const hasStructuredQuestions =
    structuredQuestions.length > 0 && structuredQuestions.some((question) => question.choices.length > 0);

  const effectiveRightRailProgressSummary = isPreExecution
    ? []
    : threadInteractionState === "review"
      ? [
          ...(selectedThread?.reviewSummary?.summary?.trim()
            ? [selectedThread.reviewSummary.summary.trim()]
            : []),
          ...rightRailProgressSummary.filter((line) => !/actively working/i.test(line)),
        ].filter((line, index, values) => values.indexOf(line) === index)
      : rightRailProgressSummary;

  function isRightRailSectionOpen(section: string): boolean {
    return rightRailSectionsOpen[section] !== false;
  }

  function toggleRightRailSection(section: string) {
    setRightRailSectionsOpen((current) => ({
      ...current,
      [section]: current[section] === false,
    }));
  }

  const entryCount = selectedThread?.entries.length ?? 0;
  const lastEntry = selectedThread?.entries[entryCount - 1];
  const lastEntryAnchor = buildTranscriptScrollAnchor(lastEntry);
  useEffect(() => {
    if (!entryCount) {
      return;
    }
    const container = transcriptContainerRef.current;
    if (!container) {
      return;
    }
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (!shouldAutoFollowTranscript(distanceFromBottom)) {
      return;
    }
    if (autoFollowFrameRef.current !== null) {
      window.cancelAnimationFrame(autoFollowFrameRef.current);
    }
    autoFollowFrameRef.current = window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
      autoFollowFrameRef.current = null;
    });
    return () => {
      if (autoFollowFrameRef.current !== null) {
        window.cancelAnimationFrame(autoFollowFrameRef.current);
        autoFollowFrameRef.current = null;
      }
    };
  }, [entryCount, lastEntryAnchor, transcriptContainerRef]);

  const rightRailProps: RightRailProps = {
    showRightRail,
    rightRailOpen,
    rightRailSectionsOpen,
    toggleRightRailSection,
    isRightRailSectionOpen,
    threadInteractionState,
    selectedThread,
    selectedThreadId,
    selectedThreadApprovals,
    pendingApprovals,
    respondToApproval,
    processingApprovalIds,
    threadInputRequest: threadInputRequest ?? null,
    inputResponseText,
    setInputResponseText,
    inputResponsePending,
    setInputResponsePending,
    respondToInputRequest,
    effectiveRightRailProgressSummary,
    persistedSessionActivitySummary,
    persistedSessionActivityLoading,
    rightRailChangeGroups,
    threadPlanState: threadPlanState ?? null,
    rightRailThread: rightRailThread ?? null,
    attachedFiles,
    activeWorkspaceProjection,
    workspacePolicy,
    persistedSessionWrittenPaths,
    refreshWorkspaceStructure,
    workspaceStructureRefreshing,
    workspaceSessions,
    resumeWorkspaceSession,
    isClarifying,
  };

  return {
    effectiveThreadBusy,
    footerStatusText,
    hasStructuredQuestions,
    isClarifying,
    rightRailChangeGroups,
    rightRailOpen,
    rightRailProps,
    setRightRailOpen,
    structuredQuestions,
    threadInteractionState,
  };
}
