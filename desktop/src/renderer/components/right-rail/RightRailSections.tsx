import { Asterisk, Check, Circle, Clock3, ListChecks, MessageCircleQuestion, Send } from "lucide-react";

import { Button } from "../ui/button";
import { cn } from "../../lib/cn";
import type {
  DesktopApprovalDecision,
  DesktopApprovalEvent,
  DesktopInputRequestState,
  DesktopInteractionState,
  DesktopPlanState,
  DesktopThreadSnapshot,
  ProjectedSessionRecord,
  ProjectedWorkspaceRecord,
} from "../../../main/contracts";
import { RightRailSection, type RightRailSectionSharedProps } from "./RightRailSection";

export type RightRailContextSectionProps = RightRailSectionSharedProps & {
  isClarifying: boolean;
  processingApprovalIds: number[];
  respondToApproval: (approval: DesktopApprovalEvent, decision: DesktopApprovalDecision) => Promise<void>;
  selectedThreadApprovals: DesktopApprovalEvent[];
  threadInputRequest: DesktopInputRequestState | null;
  inputResponsePending: boolean;
  inputResponseText: string;
  setInputResponsePending: (pending: boolean) => void;
  setInputResponseText: (text: string) => void;
  respondToInputRequest: (requestId: number, text: string) => Promise<void>;
  workspaceSessions: ProjectedSessionRecord[];
  activeWorkspaceProjection: ProjectedWorkspaceRecord | null;
  selectedThreadId: string | null;
  resumeWorkspaceSession: (session: ProjectedSessionRecord, workspaceRoot: string | null) => Promise<void>;
  threadInteractionState: DesktopInteractionState | null;
};

export function RightRailContextSection({
  activeWorkspaceProjection,
  isClarifying,
  isRightRailSectionOpen,
  processingApprovalIds,
  respondToApproval,
  respondToInputRequest,
  resumeWorkspaceSession,
  selectedThreadApprovals,
  selectedThreadId,
  setInputResponsePending,
  setInputResponseText,
  threadInputRequest,
  toggleRightRailSection,
  inputResponsePending,
  inputResponseText,
  workspaceSessions,
}: RightRailContextSectionProps) {
  const hasApprovalContent = selectedThreadApprovals.length > 0;
  const hasInputContent = Boolean(threadInputRequest) && !isClarifying;
  const hasHistoryContent = workspaceSessions.length > 0;
  if (!hasApprovalContent && !hasInputContent && !hasHistoryContent) {
    return null;
  }

  return (
    <RightRailSection
      badge={hasApprovalContent ? <span className="rounded-full bg-surface-strong px-2 py-0.5 text-[11px] text-muted">{selectedThreadApprovals.length}</span> : undefined}
      onToggle={() => toggleRightRailSection("context")}
      open={isRightRailSectionOpen("context")}
      title="Context"
    >
      <div className="space-y-4">
        {hasApprovalContent ? (
          <div className="space-y-2">
            {selectedThreadApprovals.map((approval) => {
              const isProcessing = processingApprovalIds.includes(approval.id);
              return (
                <article className="rounded-xl bg-surface-strong p-3" key={approval.id}>
                  <p className="text-sm font-medium text-ink">
                    {approval.grantRoot ? `Workspace access for ${approval.grantRoot}` : approval.reason || "Approval required"}
                  </p>
                  {approval.command.length > 0 ? (
                    <p className="mt-1 break-all text-xs text-muted">{approval.command.join(" ")}</p>
                  ) : null}
                  <div className="mt-3 flex gap-2">
                    <Button className="rounded-md bg-ink text-canvas hover:bg-ink/90" disabled={isProcessing} onClick={() => void respondToApproval(approval, "accept")} size="sm">Approve</Button>
                    <Button className="rounded-md bg-surface-low text-ink hover:bg-surface" disabled={isProcessing} onClick={() => void respondToApproval(approval, "acceptForSession")} size="sm">Trust for session</Button>
                    <Button className="rounded-md bg-surface-low text-ink-muted hover:text-ink hover:bg-surface" disabled={isProcessing} onClick={() => void respondToApproval(approval, "decline")} size="sm">Decline</Button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        {hasInputContent && threadInputRequest ? (
          <div>
            <div className="flex items-start gap-2 text-sm text-ink">
              <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-accent" />
              <span>{threadInputRequest.prompt}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="flex-1 rounded-lg border border-accent/30 bg-canvas px-2.5 py-1.5 text-sm outline-none placeholder:text-muted focus-visible:ring-[3px] focus-visible:ring-accent/30"
                disabled={inputResponsePending}
                onChange={(event) => setInputResponseText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && inputResponseText.trim() && threadInputRequest.requestId != null) {
                    event.preventDefault();
                    setInputResponsePending(true);
                    void respondToInputRequest(threadInputRequest.requestId, inputResponseText.trim()).finally(() => {
                      setInputResponsePending(false);
                      setInputResponseText("");
                    });
                  }
                }}
                placeholder="Type your response..."
                value={inputResponseText}
              />
              <Button
                disabled={inputResponsePending || !inputResponseText.trim() || threadInputRequest.requestId == null}
                onClick={() => {
                  if (threadInputRequest.requestId == null) return;
                  setInputResponsePending(true);
                  void respondToInputRequest(threadInputRequest.requestId, inputResponseText.trim()).finally(() => {
                    setInputResponsePending(false);
                    setInputResponseText("");
                  });
                }}
                size="sm"
                variant="default"
              >
                <Send className="size-3.5" />
              </Button>
            </div>
          </div>
        ) : null}

        {hasHistoryContent ? (
          <div className="space-y-1.5 text-sm">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Workspace history</p>
            {workspaceSessions.map((session) => (
              <button
                className={cn("flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-soft", session.codex_thread_id === selectedThreadId ? "bg-surface-soft" : "")}
                key={session.session_id}
                onClick={() => {
                  if (session.codex_thread_id) {
                    void resumeWorkspaceSession(session, activeWorkspaceProjection?.root_path ?? null);
                  }
                }}
                type="button"
              >
                <Clock3 className="mt-0.5 size-3.5 shrink-0 text-muted" />
                <span className="min-w-0">
                  <p className="truncate text-sm text-ink">{session.title || "Untitled session"}</p>
                  <p className="text-xs text-muted">
                    {new Date(session.started_at).toLocaleDateString()}
                    {session.file_change_count > 0 ? ` · ${session.file_change_count} files` : ""}
                  </p>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </RightRailSection>
  );
}

export type RightRailProgressSectionProps = RightRailSectionSharedProps & {
  persistedSessionActivityLoading: boolean;
  persistedSessionActivitySummary: {
    approvalsGranted: number;
    commandsRun: number;
    fileWrites: number;
    lastActivity: string | null;
  } | null;
  threadPlanState: DesktopPlanState | null;
  selectedThread: DesktopThreadSnapshot | null;
};

export function RightRailProgressSection({
  isRightRailSectionOpen,
  persistedSessionActivityLoading,
  persistedSessionActivitySummary,
  selectedThread,
  threadPlanState,
  toggleRightRailSection,
}: RightRailProgressSectionProps) {
  const folderRoot = selectedThread?.workspaceRoot ?? selectedThread?.cwd ?? "";
  const structuredSteps = threadPlanState?.planSteps ?? [];
  const hasStructuredSteps = structuredSteps.length > 0;
  const hasPlanSteps = hasStructuredSteps || Boolean(threadPlanState && threadPlanState.steps.length > 0);
  const hasPersistedActivity = Boolean(
    persistedSessionActivitySummary
    && (
      persistedSessionActivitySummary.fileWrites > 0
      || persistedSessionActivitySummary.commandsRun > 0
      || persistedSessionActivitySummary.approvalsGranted > 0
      || persistedSessionActivitySummary.lastActivity
    ),
  );
  const isWorkspaceThread = Boolean(folderRoot);
  if (!hasPlanSteps && !hasPersistedActivity && !persistedSessionActivityLoading && !isWorkspaceThread) {
    return null;
  }

  const totalSteps = hasStructuredSteps ? structuredSteps.length : (threadPlanState?.steps.length ?? 0);
  const completedSteps = hasStructuredSteps ? structuredSteps.filter((s) => s.status === "completed").length : 0;
  const inProgressSteps = hasStructuredSteps ? structuredSteps.filter((s) => s.status === "inProgress").length : 0;
  const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  const progressBadge = hasStructuredSteps && totalSteps > 0 ? (
    <span className="inline-flex items-center rounded-full bg-surface-soft px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink-faint">
      {completedSteps}/{totalSteps}
    </span>
  ) : null;

  return (
    <RightRailSection
      badge={progressBadge}
      onToggle={() => toggleRightRailSection("progress")}
      open={isRightRailSectionOpen("progress")}
      title="Progress"
    >
      <div className="space-y-4">
        {hasStructuredSteps && totalSteps > 0 ? (
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-ink-faint">
                {inProgressSteps > 0 ? "In progress" : completedSteps === totalSteps ? "Complete" : "Queued"}
              </span>
              <span className="text-[11px] font-semibold tabular-nums text-ink">{progressPct}%</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-soft">
              <div
                aria-label={`${completedSteps} of ${totalSteps} steps complete`}
                aria-valuemax={totalSteps}
                aria-valuemin={0}
                aria-valuenow={completedSteps}
                className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
                role="progressbar"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : null}

        {hasStructuredSteps ? (
          <ol className="space-y-1.5 text-[13px] text-ink">
            {structuredSteps.map((planStep, index) => (
              <li className="flex items-start gap-2.5" key={index}>
                {planStep.status === "completed" ? (
                  <span className="mt-[1px] flex size-4 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
                    <Check className="size-2.5" strokeWidth={3} />
                  </span>
                ) : planStep.status === "inProgress" ? (
                  <span className="mt-[1px] flex size-4 shrink-0 items-center justify-center rounded-full bg-accent-faint text-accent">
                    <Asterisk className="size-2.5 animate-starburst" strokeWidth={2.5} />
                  </span>
                ) : (
                  <span className="mt-[1px] flex size-4 shrink-0 items-center justify-center rounded-full border border-line text-ink-muted">
                    <Circle className="size-2" strokeWidth={2} />
                  </span>
                )}
                <span className={cn("text-[13px] leading-[1.45]", planStep.status === "completed" ? "text-ink-faint line-through decoration-ink-faint/40" : "text-ink")}>{planStep.step}</span>
              </li>
            ))}
          </ol>
        ) : hasPlanSteps && threadPlanState ? (
          <ol className="space-y-1.5 text-[13px] text-ink">
            {threadPlanState.steps.map((step, index) => (
              <li className="flex items-start gap-2" key={index}>
                <ListChecks className="mt-0.5 size-3.5 shrink-0 text-muted" />
                <span>{step}</span>
              </li>
            ))}
          </ol>
        ) : null}

        {persistedSessionActivityLoading ? (
          <p className="text-[12px] leading-[1.5] text-ink-muted">Loading activity...</p>
        ) : hasPersistedActivity && persistedSessionActivitySummary ? (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Session activity</p>
            <dl className="space-y-1 text-[12px] text-ink">
              <div className="flex items-center justify-between gap-3"><dt className="text-ink-muted">Files changed</dt><dd className="tabular-nums">{persistedSessionActivitySummary.fileWrites}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-ink-muted">Commands run</dt><dd className="tabular-nums">{persistedSessionActivitySummary.commandsRun}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-ink-muted">Approvals granted</dt><dd className="tabular-nums">{persistedSessionActivitySummary.approvalsGranted}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-ink-muted">Last activity</dt><dd className="text-right text-ink">{persistedSessionActivitySummary.lastActivity ? new Date(persistedSessionActivitySummary.lastActivity).toLocaleString() : "No activity yet"}</dd></div>
            </dl>
          </div>
        ) : null}

        {!hasPlanSteps && !hasPersistedActivity && !persistedSessionActivityLoading && isWorkspaceThread ? (
          <p className="text-[12px] leading-[1.5] text-ink-muted">No activity yet.</p>
        ) : null}
      </div>
    </RightRailSection>
  );
}
