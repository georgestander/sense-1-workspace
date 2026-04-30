import { memo, useCallback, useEffect, useState, type Dispatch, type PointerEvent, type RefObject, type SetStateAction } from "react";
import { type DesktopApprovalDecision, type DesktopApprovalEvent, type DesktopBootstrapTeamSetup, type DesktopBootstrapTenant, type DesktopBrowserState, type DesktopExtensionOverviewResult, type DesktopInputQuestion, type DesktopInputRequestState, type DesktopModelEntry, type DesktopThreadChangeGroup, type DesktopThreadSnapshot } from "../../main/contracts";
import { ThreadBrowserPane } from "./browser/ThreadBrowserPane.js";
import { ThreadComposer } from "./thread-view/thread-composer.js";
import { ThreadTranscript } from "./thread-view/thread-transcript.js";

const BROWSER_COMPOSER_RAIL_WIDTH_KEY = "sense1.browser-composer-rail-width.v1";
const BROWSER_COMPOSER_MIN_WIDTH = 320;
const BROWSER_COMPOSER_DEFAULT_WIDTH = 360;
const BROWSER_COMPOSER_MAX_WIDTH = 520;

function readBrowserComposerRailWidth(): number {
  const parsed = Number(window.localStorage.getItem(BROWSER_COMPOSER_RAIL_WIDTH_KEY));
  return Number.isFinite(parsed) ? Math.min(BROWSER_COMPOSER_MAX_WIDTH, Math.max(BROWSER_COMPOSER_MIN_WIDTH, parsed)) : BROWSER_COMPOSER_DEFAULT_WIDTH;
}

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
  selectedModel: string;
  selectedReasoning: string;
  selectedServiceTier: "flex" | "fast";
  setReasoning: Dispatch<SetStateAction<string>>;
  modelOptions: string[];
  reasoningOptions: string[];
  handleModelSelection: (nextModel: string) => void;
  handleServiceTierSelection: (nextServiceTier: "flex" | "fast") => void;
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
  onReportBug: () => void;
  browserOpen: boolean;
  setBrowserOpen: Dispatch<SetStateAction<boolean>>;
}

export const ThreadView = memo(function ThreadView(props: ThreadViewProps) {
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
    selectedServiceTier,
    modelOptions,
    reasoningOptions,
    handleModelSelection,
    handleServiceTierSelection,
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
    onReportBug,
    browserOpen,
    setBrowserOpen,
  } = props;
  const [browserRequestedUrl, setBrowserRequestedUrl] = useState<string | null>(null);
  const [browserState, setBrowserState] = useState<DesktopBrowserState | null>(null);
  const [composerRailWidth, setComposerRailWidth] = useState(readBrowserComposerRailWidth);

  const openInternalBrowser = useCallback((url?: string) => {
    if (url?.trim()) {
      setBrowserRequestedUrl(url);
    }
    setBrowserOpen(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(BROWSER_COMPOSER_RAIL_WIDTH_KEY, String(composerRailWidth));
  }, [composerRailWidth]);

  function handleComposerRailResizeStart(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = composerRailWidth;
    const maxWidth = Math.min(BROWSER_COMPOSER_MAX_WIDTH, Math.max(BROWSER_COMPOSER_MIN_WIDTH, Math.round(window.innerWidth * 0.45)));

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const nextWidth = Math.min(maxWidth, Math.max(BROWSER_COMPOSER_MIN_WIDTH, startWidth + moveEvent.clientX - startX));
      setComposerRailWidth(nextWidth);
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div
        className={browserOpen ? "flex min-h-0 min-w-0 shrink-0 flex-col bg-canvas" : "flex min-w-0 flex-1 flex-col"}
        style={browserOpen ? { width: composerRailWidth } : undefined}
      >
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-6 pb-2 pt-5">
          <h2 className="font-display min-w-0 truncate text-lg font-semibold tracking-tight">{selectedThread.title}</h2>
        </div>

        <ThreadTranscript
          cancelWorkspacePermission={cancelWorkspacePermission}
          clarificationAnswer={clarificationAnswer}
          clarificationPending={clarificationPending}
          configNotices={configNotices}
          effectiveThreadBusy={effectiveThreadBusy}
          extensionOverview={extensionOverview}
          footerStatusText={footerStatusText}
          grantWorkspacePermission={grantWorkspacePermission}
          hasStructuredQuestions={hasStructuredQuestions}
          isClarifying={isClarifying}
          onOpenInternalBrowser={openInternalBrowser}
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
          browserUseContext={{ threadId: selectedThreadId, url: browserState?.url ?? null, title: browserState?.title ?? null }}
          effectiveThreadBusy={effectiveThreadBusy}
          extensionOverview={extensionOverview}
          handleModelSelection={handleModelSelection}
          interruptTurn={interruptTurn}
          modelOptions={modelOptions}
          onReportBug={onReportBug}
          pickFiles={pickFiles}
          queueSelectedThreadPrompt={queueSelectedThreadPrompt}
          queuedMessageCount={queuedMessageCount}
          reasoningOptions={reasoningOptions}
          REASONING_LABELS={REASONING_LABELS}
          selectedThreadId={selectedThreadId}
          selectedModel={selectedModel}
          selectedReasoning={selectedReasoning}
          selectedServiceTier={selectedServiceTier}
          setAttachedFiles={setAttachedFiles}
          setReasoning={setReasoning}
          submitSelectedThreadPrompt={submitSelectedThreadPrompt}
          taskError={taskError}
          tenant={tenant}
          teamSetup={teamSetup}
          threadPromptOverride={threadPromptOverride}
          handleServiceTierSelection={handleServiceTierSelection}
          attachedFiles={attachedFiles}
          variant={browserOpen ? "rail" : "floating"}
        />
      </div>

      {browserOpen ? (
        <div
          aria-label="Resize thread and browser panes"
          className="w-1.5 shrink-0 cursor-col-resize border-x border-line bg-surface-soft hover:bg-accent/20"
          onPointerDown={handleComposerRailResizeStart}
          role="separator"
        />
      ) : null}

      {browserOpen ? (
        <ThreadBrowserPane
          onClose={() => setBrowserOpen(false)}
          onStateChange={setBrowserState}
          requestedUrl={browserRequestedUrl}
          submitSelectedThreadPrompt={submitSelectedThreadPrompt}
          threadId={selectedThreadId}
        />
      ) : null}
    </div>
  );
});
