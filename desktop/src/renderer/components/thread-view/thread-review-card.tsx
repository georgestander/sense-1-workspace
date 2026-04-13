import { Check, FileDiff, FileText } from "lucide-react";

import { cn } from "../../lib/cn";
import { resolveWorkspaceFilePath } from "./thread-view-utils.js";
import { type DesktopThreadChangeGroup, type DesktopThreadSnapshot } from "../../../main/contracts";

type ThreadReviewCardProps = {
  selectedThread: DesktopThreadSnapshot;
  rightRailChangeGroups: DesktopThreadChangeGroup[];
  threadFolderRoot: string | null;
};

export function ThreadReviewCard({ selectedThread, rightRailChangeGroups, threadFolderRoot }: ThreadReviewCardProps) {
  const reviewSummaryText = selectedThread.reviewSummary?.summary?.trim() || null;
  const reviewWorkspaceRoot = threadFolderRoot ?? "";

  const reviewChangedFileMap = new Map<string, string | null>();
  for (const group of rightRailChangeGroups) {
    for (const filePath of group.files) {
      if (!reviewChangedFileMap.has(filePath)) {
        reviewChangedFileMap.set(filePath, null);
      }
    }
  }

  const reviewArtifactsList = selectedThread.reviewSummary?.changedArtifacts ?? [];
  for (const artifact of reviewArtifactsList) {
    if (artifact.path) {
      if (!reviewChangedFileMap.has(artifact.path)) {
        reviewChangedFileMap.set(artifact.path, artifact.action);
      } else if (artifact.action) {
        reviewChangedFileMap.set(artifact.path, artifact.action);
      }
    }
  }

  const reviewChangedFiles = Array.from(reviewChangedFileMap.entries());
  const hasReviewChangedFiles = reviewChangedFiles.length > 0;
  const nonFileArtifacts = reviewArtifactsList.filter((artifact) => artifact.refType !== "file" && !reviewChangedFileMap.has(artifact.path ?? ""));
  const hasNonFileArtifacts = nonFileArtifacts.length > 0;

  function reviewFileRelPath(filePath: string): string {
    if (reviewWorkspaceRoot && filePath.startsWith(reviewWorkspaceRoot)) {
      const rel = filePath.slice(reviewWorkspaceRoot.length).replace(/^[\\/]/, "");
      return rel || filePath;
    }
    return filePath;
  }

  function reviewFileBasename(filePath: string): string {
    return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
  }

  function reviewOpenFile(filePath: string) {
    const bridge = (window as any).sense1Desktop;
    if (bridge?.workspace?.openFilePath) {
      void bridge.workspace.openFilePath(resolveWorkspaceFilePath(filePath, reviewWorkspaceRoot));
    }
  }

  function reviewActionBadge(action: string | null): string {
    if (action === "created") return "bg-accent-faint text-accent";
    if (action === "deleted") return "bg-surface-strong text-muted";
    return "bg-surface-strong text-ink-muted";
  }

  return (
    <article className="animate-fade-in-up border-l-2 border-ink-muted rounded-lg bg-surface-high p-[1.25rem]">
      <div className="flex items-center gap-2">
        <Check className="size-4 text-ink-muted" />
        <p className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-muted">Work complete</p>
      </div>
      <p className="font-display mt-[0.65rem] text-[1.1rem] font-semibold leading-[1.4] tracking-[-0.01em] text-ink">{selectedThread.title}</p>
      <p className="mt-[0.4rem] text-[0.875rem] leading-[1.6] text-ink-faint">{reviewSummaryText ?? "The task has completed. Review the changes below."}</p>

      {hasReviewChangedFiles ? (
        <div className="mt-[0.9rem]">
          <p className="mb-[0.4rem] text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-muted">Changed files</p>
          <div className="space-y-[0.4rem]">
            {reviewChangedFiles.map(([filePath, action]) => (
              <button
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-soft"
                key={filePath}
                onClick={() => reviewOpenFile(filePath)}
                type="button"
              >
                <FileDiff className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <p className="truncate text-[0.875rem] text-ink">{reviewFileBasename(filePath)}</p>
                  <p className="truncate text-[0.8125rem] leading-[1.52] text-muted">{reviewFileRelPath(filePath)}</p>
                </span>
                {action ? (
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] uppercase tracking-[0.08em]", reviewActionBadge(action))}>{action}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {hasNonFileArtifacts ? (
        <div className="mt-[0.9rem]">
          <p className="mb-[0.4rem] text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-muted">Outputs</p>
          <div className="space-y-[0.4rem]">
            {nonFileArtifacts.map((artifact) => (
              <div className="flex items-center gap-2 rounded-lg px-2 py-1.5" key={artifact.id}>
                <FileText className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <p className="truncate text-[0.875rem] text-ink">{artifact.path ?? artifact.refId ?? artifact.refType}</p>
                </span>
                {artifact.action ? (
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] uppercase tracking-[0.08em]", reviewActionBadge(artifact.action))}>
                    {artifact.action}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!hasReviewChangedFiles && !reviewSummaryText ? <p className="mt-[0.65rem] text-[0.8125rem] leading-[1.52] text-ink-muted">No file changes recorded.</p> : null}

      <button
        className="mt-[0.9rem] rounded-md bg-transparent px-0 py-1 text-[0.875rem] font-medium text-accent transition-colors hover:bg-surface-low hover:px-2"
        onClick={() => {
          const composer = document.querySelector<HTMLTextAreaElement>("textarea[placeholder*='Continue this thread']");
          if (composer) {
            composer.scrollIntoView({ behavior: "smooth", block: "center" });
            window.setTimeout(() => composer.focus(), 200);
          }
        }}
        type="button"
      >
        Start a follow-up
      </button>
    </article>
  );
}
