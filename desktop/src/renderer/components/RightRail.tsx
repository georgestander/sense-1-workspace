import type {
  DesktopApprovalDecision,
  DesktopApprovalEvent,
  DesktopInputRequestState,
  DesktopInteractionState,
  DesktopPlanState,
  DesktopThreadChangeGroup,
  DesktopThreadSnapshot,
  ProjectedSessionRecord,
  ProjectedWorkspaceRecord,
} from "../../main/contracts";
import { RightRailContentSection } from "./right-rail/RightRailContentSection";
import { RightRailContextSection, RightRailProgressSection } from "./right-rail/RightRailSections";

const PRE_EXECUTION_STATES = new Set<DesktopInteractionState>(["conversation", "clarification"]);

export interface RightRailProps {
  showRightRail: boolean;
  rightRailOpen: boolean;
  rightRailSectionsOpen: Record<string, boolean>;
  toggleRightRailSection: (section: string) => void;
  isRightRailSectionOpen: (section: string) => boolean;
  threadInteractionState: DesktopInteractionState | null;
  selectedThread: DesktopThreadSnapshot | null;
  selectedThreadId: string | null;
  selectedThreadApprovals: DesktopApprovalEvent[];
  pendingApprovals: DesktopApprovalEvent[];
  respondToApproval: (approval: DesktopApprovalEvent, decision: DesktopApprovalDecision) => Promise<void>;
  processingApprovalIds: number[];
  threadInputRequest: DesktopInputRequestState | null;
  inputResponseText: string;
  setInputResponseText: (text: string) => void;
  inputResponsePending: boolean;
  setInputResponsePending: (pending: boolean) => void;
  respondToInputRequest: (requestId: number, text: string) => Promise<void>;
  effectiveRightRailProgressSummary: string[];
  persistedSessionActivitySummary: {
    approvalsGranted: number;
    commandsRun: number;
    fileWrites: number;
    lastActivity: string | null;
  } | null;
  persistedSessionActivityLoading: boolean;
  rightRailChangeGroups: DesktopThreadChangeGroup[];
  threadPlanState: DesktopPlanState | null;
  rightRailThread: DesktopThreadSnapshot | null;
  attachedFiles: string[];
  activeWorkspaceProjection: ProjectedWorkspaceRecord | null;
  workspacePolicy: {
    workspace_root: string;
    read_granted: number;
    known_structure: Array<{ name: string; type: string; path: string }>;
    context_paths: string[];
  } | null;
  persistedSessionWrittenPaths: string[];
  refreshWorkspaceStructure: () => Promise<void>;
  workspaceStructureRefreshing: boolean;
  workspaceSessions: ProjectedSessionRecord[];
  resumeWorkspaceSession: (session: ProjectedSessionRecord, workspaceRoot: string | null) => Promise<void>;
  isClarifying: boolean;
}

export function RightRail(props: RightRailProps) {
  const {
    showRightRail,
    rightRailOpen,
    toggleRightRailSection,
    isRightRailSectionOpen,
    threadInteractionState,
    selectedThread,
    selectedThreadId,
    selectedThreadApprovals,
    pendingApprovals,
    respondToApproval,
    processingApprovalIds,
    threadInputRequest,
    inputResponseText,
    setInputResponseText,
    inputResponsePending,
    setInputResponsePending,
    respondToInputRequest,
    effectiveRightRailProgressSummary,
    persistedSessionActivitySummary,
    persistedSessionActivityLoading,
    rightRailChangeGroups,
    threadPlanState,
    rightRailThread,
    attachedFiles,
    activeWorkspaceProjection,
    workspacePolicy,
    persistedSessionWrittenPaths,
    refreshWorkspaceStructure,
    workspaceStructureRefreshing,
    workspaceSessions,
    resumeWorkspaceSession,
    isClarifying,
  } = props;

  if (!showRightRail || !rightRailOpen) {
    return null;
  }

  const isPreExecution = threadInteractionState ? PRE_EXECUTION_STATES.has(threadInteractionState) : false;

  return (
    <aside
      className="z-20 min-h-0 shrink-0 w-80 bg-surface-soft p-4 transition-all duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:shadow-2xl"
    >
      <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain pr-1">
        {!isPreExecution ? (
          <div className="animate-execution-enter px-1 pb-[0.65rem]">
            {threadInteractionState === "review" ? (
              <>
                <p className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-muted">COMPLETE</p>
                <p className="mt-1 text-[0.8125rem] leading-[1.52] text-ink-muted">Work has finished. Review the changes below.</p>
              </>
            ) : (
              <>
                <p className="flex items-center gap-1.5 text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-accent">
                  <span className="inline-block size-1.5 animate-pulse rounded-full bg-accent" />
                  EXECUTING
                </p>
                <p className="mt-1 text-[0.8125rem] leading-[1.52] text-ink-muted">Work is in progress.</p>
              </>
            )}
          </div>
        ) : null}
        <RightRailContextSection
          activeWorkspaceProjection={activeWorkspaceProjection}
          isClarifying={isClarifying}
          isRightRailSectionOpen={isRightRailSectionOpen}
          processingApprovalIds={processingApprovalIds}
          respondToApproval={respondToApproval}
          respondToInputRequest={respondToInputRequest}
          resumeWorkspaceSession={resumeWorkspaceSession}
          selectedThreadApprovals={selectedThreadApprovals}
          selectedThreadId={selectedThreadId}
          setInputResponsePending={setInputResponsePending}
          setInputResponseText={setInputResponseText}
          threadInputRequest={threadInputRequest}
          threadInteractionState={threadInteractionState}
          toggleRightRailSection={toggleRightRailSection}
          inputResponsePending={inputResponsePending}
          inputResponseText={inputResponseText}
          workspaceSessions={workspaceSessions}
        />
        <RightRailProgressSection
          effectiveRightRailProgressSummary={effectiveRightRailProgressSummary}
          isRightRailSectionOpen={isRightRailSectionOpen}
          persistedSessionActivityLoading={persistedSessionActivityLoading}
          persistedSessionActivitySummary={persistedSessionActivitySummary}
          selectedThread={selectedThread}
          threadInteractionState={threadInteractionState}
          threadPlanState={threadPlanState}
          toggleRightRailSection={toggleRightRailSection}
        />
        <RightRailContentSection
          activeWorkspaceProjection={activeWorkspaceProjection}
          attachedFiles={attachedFiles}
          isRightRailSectionOpen={isRightRailSectionOpen}
          persistedSessionWrittenPaths={persistedSessionWrittenPaths}
          refreshWorkspaceStructure={refreshWorkspaceStructure}
          rightRailChangeGroups={rightRailChangeGroups}
          rightRailThread={rightRailThread}
          selectedThread={selectedThread}
          threadInteractionState={threadInteractionState}
          toggleRightRailSection={toggleRightRailSection}
          workspacePolicy={workspacePolicy}
          workspaceStructureRefreshing={workspaceStructureRefreshing}
        />
      </div>
    </aside>
  );
}
