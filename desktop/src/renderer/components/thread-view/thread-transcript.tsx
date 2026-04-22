import { memo, useEffect, useState, type Dispatch, type SetStateAction, type RefObject } from "react";
import { Asterisk, ChevronDown, Folder, Sparkles } from "lucide-react";

import { Button } from "../ui/button";
import { ThreadEntryList } from "./thread-entry-list.js";
import { ThreadReviewCard } from "./thread-review-card.js";
import { ThreadClarificationPanel } from "./thread-clarification-panel.js";
import { shouldShowReviewArtifacts } from "./thread-transcript-visibility.js";
import { summarizeCommand } from "./thread-view-utils.js";
import { perfCount } from "../../lib/perf-debug.ts";
import { type DesktopApprovalDecision, type DesktopApprovalEvent, type DesktopExtensionOverviewResult, type DesktopInputQuestion, type DesktopInputRequestState, type DesktopThreadChangeGroup, type DesktopThreadEntry, type DesktopThreadSnapshot } from "../../../main/contracts";

type ThreadTranscriptProps = {
  selectedThread: DesktopThreadSnapshot;
  extensionOverview: Pick<DesktopExtensionOverviewResult, "apps" | "plugins" | "skills"> | null;
  threadInteractionState: string | null;
  selectedThreadApprovals: DesktopApprovalEvent[];
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
  rightRailChangeGroups: DesktopThreadChangeGroup[];
  transcriptContainerRef: RefObject<HTMLDivElement | null>;
  transcriptEndRef: RefObject<HTMLDivElement | null>;
  configNotices: Array<{ id: number; text: string }>;
  footerStatusText: string;
  effectiveThreadBusy: boolean;
  pendingPermission: {
    rootPath: string;
    displayName: string;
    originalRequest: { prompt: string; threadId?: string | null; workspaceRoot?: string | null };
  } | null;
  grantWorkspacePermission: (mode: "always" | "once") => Promise<void>;
  cancelWorkspacePermission: () => void;
};

function ApprovalsPanel({
  selectedThreadApprovals,
  processingApprovalIds,
  respondToApproval,
}: {
  selectedThreadApprovals: DesktopApprovalEvent[];
  processingApprovalIds: number[];
  respondToApproval: (approval: DesktopApprovalEvent, decision: DesktopApprovalDecision) => Promise<void>;
}) {
  if (selectedThreadApprovals.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {selectedThreadApprovals.map((approval) => {
        const isProcessing = processingApprovalIds.includes(approval.id);
        return (
          <article className="rounded-2xl border border-line bg-surface-strong px-4 py-3" key={approval.id}>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent">
              {approval.kind === "command"
                ? "Command approval"
                : approval.kind === "file"
                  ? "File change approval"
                  : approval.kind === "permissions"
                    ? "Permission approval"
                    : "Approval required"}
            </p>
            <p className="mt-1 text-sm font-medium text-ink">{approval.reason || "sense-1 needs your approval to continue."}</p>
            {approval.command.length > 0 ? <pre className="mt-2 overflow-x-auto rounded-lg bg-canvas px-3 py-2 text-xs text-ink-soft">{approval.command.join(" ")}</pre> : null}
            {approval.cwd ? <p className="mt-1 text-xs text-muted">in {approval.cwd}</p> : null}
            <div className="mt-3 flex gap-2">
              <Button className="rounded-md bg-ink text-canvas hover:bg-ink/90" disabled={isProcessing} onClick={() => void respondToApproval(approval, "accept")} size="sm">
                Approve
              </Button>
              <Button
                className="rounded-md bg-surface-low text-ink hover:bg-surface"
                disabled={isProcessing}
                onClick={() => void respondToApproval(approval, "acceptForSession")}
                size="sm"
              >
                Trust for session
              </Button>
              <Button className="rounded-md bg-surface-low text-ink-muted hover:text-ink hover:bg-surface" disabled={isProcessing} onClick={() => void respondToApproval(approval, "decline")} size="sm">
                Decline
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function PermissionPanel({
  pendingPermission,
  grantWorkspacePermission,
  cancelWorkspacePermission,
}: {
  pendingPermission: {
    rootPath: string;
    displayName: string;
    originalRequest: { prompt: string; threadId?: string | null; workspaceRoot?: string | null };
  } | null;
  grantWorkspacePermission: (mode: "always" | "once") => Promise<void>;
  cancelWorkspacePermission: () => void;
}) {
  if (!pendingPermission) {
    return null;
  }

  return (
    <article className="animate-fade-in-up rounded-2xl bg-surface-high p-[1.25rem]">
      <div className="flex items-center gap-2">
        <Folder className="size-4 text-ink" />
        <p className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-muted">Workspace access</p>
      </div>
      <p className="mt-[0.65rem] text-[1rem] leading-[1.6] text-ink">
        Allow sense-1 to read <span className="font-semibold">{pendingPermission.displayName}</span>?
      </p>
      <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-ink-muted">{pendingPermission.rootPath}</p>
      <div className="mt-[0.9rem] flex items-center gap-[0.4rem]">
        <Button className="rounded-md bg-ink text-canvas hover:bg-ink/90" onClick={() => void grantWorkspacePermission("always")} size="sm">
          Allow always
        </Button>
        <Button className="rounded-md bg-ink text-canvas hover:bg-ink/90" onClick={() => void grantWorkspacePermission("once")} size="sm">
          Allow this time
        </Button>
        <Button className="rounded-md bg-ink text-canvas hover:bg-ink/90" onClick={() => cancelWorkspacePermission()} size="sm">
          Cancel
        </Button>
      </div>
    </article>
  );
}

function latestActivityLabel(entries: DesktopThreadEntry[]): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.kind === "command") {
      return summarizeCommand(entry.command);
    }
    if (entry.kind === "tool") {
      const toolName = entry.body.split(" \u2022 ")[0];
      return toolName || "Using a tool";
    }
    if (entry.kind === "reasoning") {
      return "Thinking";
    }
    if (entry.kind === "assistant" || entry.kind === "user") {
      break;
    }
  }
  return null;
}

function StatusFooter({
  effectiveThreadBusy,
  footerStatusText,
  liveActivityLabel,
}: {
  effectiveThreadBusy: boolean;
  footerStatusText: string;
  liveActivityLabel: string | null;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      {effectiveThreadBusy ? <Asterisk className="size-4 animate-starburst text-accent" /> : <Sparkles className="size-3.5" />}
      {effectiveThreadBusy ? (liveActivityLabel ?? "Working on it...") : footerStatusText}
    </div>
  );
}

function ThreadTranscriptInner({
  selectedThread,
  extensionOverview,
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
  rightRailChangeGroups,
  transcriptContainerRef,
  transcriptEndRef,
  configNotices,
  footerStatusText,
  effectiveThreadBusy,
  pendingPermission,
  grantWorkspacePermission,
  cancelWorkspacePermission,
}: ThreadTranscriptProps) {
  perfCount("render.ThreadTranscript");
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const threadFolderRoot = selectedThread.workspaceRoot ?? selectedThread.cwd ?? null;
  const hasReviewArtifacts = shouldShowReviewArtifacts({
    effectiveThreadBusy,
    reviewSummary: selectedThread.reviewSummary,
    rightRailChangeGroups,
    threadInteractionState,
  });

  useEffect(() => {
    setShowScrollToBottom(false);
  }, [selectedThread.id]);

  return (
    <>
      <div
        ref={transcriptContainerRef}
        className="relative min-h-0 flex-1 overflow-y-auto px-6 pb-5"
        onScroll={(event) => {
          const el = event.currentTarget;
          const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          const nextShowScrollToBottom = distanceFromBottom > 300;
          setShowScrollToBottom((current) => current === nextShowScrollToBottom ? current : nextShowScrollToBottom);
        }}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2.5 pb-10">
          {threadInteractionState === "review" || hasReviewArtifacts ? (
            <ThreadReviewCard rightRailChangeGroups={rightRailChangeGroups} selectedThread={selectedThread} threadFolderRoot={threadFolderRoot} />
          ) : null}

          {selectedThread.entries.length > 0 ? (
            <ThreadEntryList
              entries={selectedThread.entries}
              extensionOverview={extensionOverview}
              suppressFileChanges={hasReviewArtifacts}
              threadId={selectedThread.id}
              workspaceRoot={threadFolderRoot}
            />
          ) : (
            <article className="rounded-2xl bg-surface-soft px-4 py-3 text-sm text-ink-soft">
              {selectedThread.hasLoadedDetails ? "This thread is live, but it does not have any transcript items yet." : "Loading the live transcript for this thread."}
            </article>
          )}

          <ApprovalsPanel processingApprovalIds={processingApprovalIds} respondToApproval={respondToApproval} selectedThreadApprovals={selectedThreadApprovals} />

          {isClarifying ? (
            <ThreadClarificationPanel
              clarificationAnswer={clarificationAnswer}
              clarificationPending={clarificationPending}
              hasStructuredQuestions={hasStructuredQuestions}
              respondToInputRequest={respondToInputRequest}
              selectedChipIndex={selectedChipIndex}
              setClarificationAnswer={setClarificationAnswer}
              setClarificationPending={setClarificationPending}
              setSelectedChipIndex={setSelectedChipIndex}
              structuredQuestions={structuredQuestions}
              threadInputRequest={threadInputRequest}
            />
          ) : null}

          <PermissionPanel cancelWorkspacePermission={cancelWorkspacePermission} grantWorkspacePermission={grantWorkspacePermission} pendingPermission={pendingPermission} />

          {configNotices.map((notice) => (
            <div className="flex items-center justify-center gap-1.5 text-[0.6875rem] text-ink-faint" key={notice.id}>
              <span className="h-px w-6 bg-line/40" />
              {notice.text}
              <span className="h-px w-6 bg-line/40" />
            </div>
          ))}

          <StatusFooter effectiveThreadBusy={effectiveThreadBusy} footerStatusText={footerStatusText} liveActivityLabel={effectiveThreadBusy ? latestActivityLabel(selectedThread.entries) : null} />
          <div ref={transcriptEndRef} />
        </div>
      </div>

      {showScrollToBottom ? (
        <div className="pointer-events-none sticky bottom-52 z-50 flex justify-center">
          <button
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-canvas shadow-[var(--shadow-raised)] transition-opacity hover:opacity-90"
            onClick={() => transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" })}
            type="button"
          >
            <ChevronDown className="size-3.5" />
            Jump to latest
          </button>
        </div>
      ) : null}
    </>
  );
}

function areArraysShallowEqual<T>(
  previousItems: readonly T[],
  nextItems: readonly T[],
): boolean {
  return previousItems.length === nextItems.length
    && previousItems.every((item, index) => item === nextItems[index]);
}

function areConfigNoticesEqual(
  previousNotices: ThreadTranscriptProps["configNotices"],
  nextNotices: ThreadTranscriptProps["configNotices"],
): boolean {
  return previousNotices.length === nextNotices.length
    && previousNotices.every((notice, index) => (
      notice.id === nextNotices[index]?.id
      && notice.text === nextNotices[index]?.text
    ));
}

function areTranscriptThreadsEquivalent(
  previousThread: ThreadTranscriptProps["selectedThread"],
  nextThread: ThreadTranscriptProps["selectedThread"],
): boolean {
  return previousThread === nextThread || (
    previousThread.id === nextThread.id
    && previousThread.title === nextThread.title
    && previousThread.workspaceRoot === nextThread.workspaceRoot
    && previousThread.cwd === nextThread.cwd
    && previousThread.entries === nextThread.entries
    && previousThread.reviewSummary === nextThread.reviewSummary
    && previousThread.hasLoadedDetails === nextThread.hasLoadedDetails
  );
}

function areThreadTranscriptPropsEqual(
  previousProps: ThreadTranscriptProps,
  nextProps: ThreadTranscriptProps,
): boolean {
  return previousProps === nextProps || (
    areTranscriptThreadsEquivalent(previousProps.selectedThread, nextProps.selectedThread)
    && previousProps.extensionOverview === nextProps.extensionOverview
    && previousProps.threadInteractionState === nextProps.threadInteractionState
    && areArraysShallowEqual(previousProps.selectedThreadApprovals, nextProps.selectedThreadApprovals)
    && previousProps.respondToApproval === nextProps.respondToApproval
    && areArraysShallowEqual(previousProps.processingApprovalIds, nextProps.processingApprovalIds)
    && previousProps.clarificationAnswer === nextProps.clarificationAnswer
    && previousProps.setClarificationAnswer === nextProps.setClarificationAnswer
    && previousProps.clarificationPending === nextProps.clarificationPending
    && previousProps.setClarificationPending === nextProps.setClarificationPending
    && previousProps.selectedChipIndex === nextProps.selectedChipIndex
    && previousProps.setSelectedChipIndex === nextProps.setSelectedChipIndex
    && previousProps.structuredQuestions === nextProps.structuredQuestions
    && previousProps.hasStructuredQuestions === nextProps.hasStructuredQuestions
    && previousProps.isClarifying === nextProps.isClarifying
    && previousProps.threadInputRequest === nextProps.threadInputRequest
    && previousProps.respondToInputRequest === nextProps.respondToInputRequest
    && previousProps.rightRailChangeGroups === nextProps.rightRailChangeGroups
    && previousProps.transcriptContainerRef === nextProps.transcriptContainerRef
    && previousProps.transcriptEndRef === nextProps.transcriptEndRef
    && areConfigNoticesEqual(previousProps.configNotices, nextProps.configNotices)
    && previousProps.footerStatusText === nextProps.footerStatusText
    && previousProps.effectiveThreadBusy === nextProps.effectiveThreadBusy
    && previousProps.pendingPermission === nextProps.pendingPermission
    && previousProps.grantWorkspacePermission === nextProps.grantWorkspacePermission
    && previousProps.cancelWorkspacePermission === nextProps.cancelWorkspacePermission
  );
}

export const ThreadTranscript = memo(ThreadTranscriptInner, areThreadTranscriptPropsEqual);
