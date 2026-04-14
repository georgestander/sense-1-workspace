import type { Dispatch, RefObject, SetStateAction } from "react";
import { type DesktopApprovalDecision, type DesktopApprovalEvent, type DesktopBootstrapTeamSetup, type DesktopBootstrapTenant, type DesktopExtensionOverviewResult, type DesktopInputQuestion, type DesktopInputRequestState, type DesktopModelEntry, type DesktopThreadChangeGroup, type DesktopThreadSnapshot } from "../../main/contracts";
import { ThreadComposer } from "./thread-view/thread-composer.js";
import { ThreadTranscript } from "./thread-view/thread-transcript.js";

export interface ThreadViewProps {
  selectedThreadId: string;
  tenant: DesktopBootstrapTenant | null;
  teamSetup: DesktopBootstrapTeamSetup;
  selectedThread: DesktopThreadSnapshot;
  threadInteractionState: string | null;
  selectedThreadApprovals: DesktopApprovalEvent[];
  pendingApprovals: DesktopApprovalEvent[];
  respondToApproval: (approval: DesktopApprovalEvent, decision: DesktopApprovalDecision) => Promise<void>;
  processingApprovalIds: number[];
  clarificationAnswer: string;
  setClarificationAnswer: Dispatch<SetStateAction<string>>;
  clarificationPending: boolean;
  setClarificationPending: Dispatch<SetStateAction<boolean>>;
  selectedChipIndex: number | null;
  setSelectedChipIndex: Dispatch<SetStateAction<number | null>>;
  structuredQuestions: DesktopInputQuestion[];
  hasStructuredQuestions: boolean;
  isClarifying: boolean;
  threadInputRequest: DesktopInputRequestState | null;
  respondToInputRequest: (requestId: number, text: string) => Promise<void>;
  inputResponseText: string;
  setInputResponseText: Dispatch<SetStateAction<string>>;
  inputResponsePending: boolean;
  extensionOverview: Pick<DesktopExtensionOverviewResult, "apps" | "plugins" | "skills"> | null;
  threadPromptOverride: string;
  attachedFiles: string[];
  setAttachedFiles: Dispatch<SetStateAction<string[]>>;
  pickFiles: () => Promise<string[]>;
  queueSelectedThreadPrompt: (threadPrompt: string) => Promise<boolean>;
  queuedMessageCount: number;
  submitSelectedThreadPrompt: (threadPrompt: string) => Promise<boolean>;
  model: string;
  reasoning: string;
  selectedModel: string;
  selectedReasoning: string;
  setReasoning: Dispatch<SetStateAction<string>>;
  modelOptions: string[];
  reasoningOptions: string[];
  handleModelSelection: (nextModel: string) => void;
  REASONING_LABELS: Record<string, string>;
  availableModels: DesktopModelEntry[];
  taskPending: boolean;
  taskError: string | null;
  setTaskError: Dispatch<SetStateAction<string | null>>;
  effectiveThreadBusy: boolean;
  interruptTurn: () => Promise<void>;
  steerTurn: (text: string) => Promise<void>;
  pendingPermission: {
    rootPath: string;
    displayName: string;
    originalRequest: { prompt: string; threadId?: string | null; workspaceRoot?: string | null };
  } | null;
  grantWorkspacePermission: (mode: "always" | "once") => Promise<void>;
  cancelWorkspacePermission: () => void;
  rightRailChangeGroups: DesktopThreadChangeGroup[];
  transcriptContainerRef: RefObject<HTMLDivElement | null>;
  transcriptEndRef: RefObject<HTMLDivElement | null>;
  configNotices: Array<{ id: number; text: string }>;
  footerStatusText: string;
}

export function ThreadView(props: ThreadViewProps) {
  const {
    selectedThreadId,
    selectedThread,
    tenant,
    teamSetup,
    threadInteractionState,
    selectedThreadApprovals,
    respondToApproval,
    processingApprovalIds,
    clarificationAnswer,
    setClarificationAnswer,
    clarificationPending,
    setClarificationPending,
    selectedChipIndex,
    setSelectedChipIndex,
    structuredQuestions,
    hasStructuredQuestions,
    isClarifying,
    threadInputRequest,
    respondToInputRequest,
    extensionOverview,
    threadPromptOverride,
    attachedFiles,
    setAttachedFiles,
    pickFiles,
    queueSelectedThreadPrompt,
    queuedMessageCount,
    submitSelectedThreadPrompt,
    selectedModel,
    selectedReasoning,
    setReasoning,
    modelOptions,
    reasoningOptions,
    handleModelSelection,
    REASONING_LABELS,
    availableModels,
    taskError,
    effectiveThreadBusy,
    interruptTurn,
    pendingPermission,
    grantWorkspacePermission,
    cancelWorkspacePermission,
    rightRailChangeGroups,
    transcriptContainerRef,
    transcriptEndRef,
    configNotices,
    footerStatusText,
  } = props;
  return (
    <>
      <div className="mx-auto max-w-3xl px-6 pb-2 pt-5">
        <h2 className="font-display truncate text-lg font-semibold tracking-tight">{selectedThread.title}</h2>
      </div>

      <ThreadTranscript
        cancelWorkspacePermission={cancelWorkspacePermission}
        clarificationAnswer={clarificationAnswer}
        clarificationPending={clarificationPending}
        configNotices={configNotices}
        effectiveThreadBusy={effectiveThreadBusy}
        footerStatusText={footerStatusText}
        grantWorkspacePermission={grantWorkspacePermission}
        hasStructuredQuestions={hasStructuredQuestions}
        isClarifying={isClarifying}
        pendingPermission={pendingPermission}
        processingApprovalIds={processingApprovalIds}
        rightRailChangeGroups={rightRailChangeGroups}
        respondToApproval={respondToApproval}
        respondToInputRequest={respondToInputRequest}
        selectedChipIndex={selectedChipIndex}
        selectedThread={selectedThread}
        selectedThreadApprovals={selectedThreadApprovals}
        setClarificationAnswer={setClarificationAnswer}
        setClarificationPending={setClarificationPending}
        setSelectedChipIndex={setSelectedChipIndex}
        structuredQuestions={structuredQuestions}
        threadInteractionState={threadInteractionState}
        threadInputRequest={threadInputRequest}
        transcriptContainerRef={transcriptContainerRef}
        transcriptEndRef={transcriptEndRef}
      />

      <ThreadComposer
        availableModels={availableModels}
        effectiveThreadBusy={effectiveThreadBusy}
        extensionOverview={extensionOverview}
        handleModelSelection={handleModelSelection}
        interruptTurn={interruptTurn}
        modelOptions={modelOptions}
        pickFiles={pickFiles}
        queueSelectedThreadPrompt={queueSelectedThreadPrompt}
        queuedMessageCount={queuedMessageCount}
        reasoningOptions={reasoningOptions}
        REASONING_LABELS={REASONING_LABELS}
        selectedThreadId={selectedThreadId}
        selectedModel={selectedModel}
        selectedReasoning={selectedReasoning}
        setAttachedFiles={setAttachedFiles}
        setReasoning={setReasoning}
        submitSelectedThreadPrompt={submitSelectedThreadPrompt}
        taskError={taskError}
        tenant={tenant}
        teamSetup={teamSetup}
        threadPromptOverride={threadPromptOverride}
        attachedFiles={attachedFiles}
      />
    </>
  );
}
