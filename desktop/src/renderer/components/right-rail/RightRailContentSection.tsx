import { useMemo } from "react";
import { FileDiff } from "lucide-react";

import { cn } from "../../lib/cn";
import { getFileIcon, getFileLabel } from "../../lib/file-icons";
import { filterVisibleRightRailArtifactPaths, isVisibleRightRailArtifactPath } from "../../lib/right-rail-artifacts";
import { extractArtifactPathsFromText } from "../../lib/thread-artifacts";
import { perfMeasure } from "../../lib/perf-debug.ts";
import type {
  DesktopInteractionState,
  DesktopThreadChangeGroup,
  DesktopThreadSnapshot,
  ProjectedWorkspaceRecord,
} from "../../../main/contracts";

import { RightRailSection, type RightRailSectionSharedProps, resolveWorkspaceFilePath } from "./RightRailSection";
import { buildRightRailChangedFiles } from "./right-rail-content";

export type RightRailContentSectionProps = RightRailSectionSharedProps & {
  activeWorkspaceProjection: ProjectedWorkspaceRecord | null;
  attachedFiles: string[];
  persistedSessionWrittenPaths: string[];
  rightRailChangeGroups: DesktopThreadChangeGroup[];
  rightRailThread: DesktopThreadSnapshot | null;
  selectedThread: DesktopThreadSnapshot | null;
  threadInteractionState: DesktopInteractionState | null;
  workspacePolicy: {
    workspace_root: string;
    read_granted: number;
    known_structure: Array<{ name: string; type: string; path: string }>;
    context_paths: string[];
  } | null;
  refreshWorkspaceStructure: () => Promise<void>;
  workspaceStructureRefreshing: boolean;
};

export function RightRailContentSection({
  activeWorkspaceProjection,
  attachedFiles,
  isRightRailSectionOpen,
  persistedSessionWrittenPaths,
  refreshWorkspaceStructure,
  rightRailChangeGroups,
  rightRailThread,
  selectedThread,
  threadInteractionState,
  toggleRightRailSection,
  workspacePolicy,
  workspaceStructureRefreshing,
}: RightRailContentSectionProps) {
  const contentOpen = isRightRailSectionOpen("content");
  const folderRoot = selectedThread?.workspaceRoot ?? selectedThread?.cwd ?? "";
  const transcriptWorkspaceRoot = folderRoot || null;
  const selectedThreadEntries = selectedThread?.entries ?? [];
  const selectedThreadState = selectedThread?.state ?? null;
  const reviewSummary = rightRailThread?.reviewSummary ?? null;
  const artifactRoots = useMemo(
    () =>
      [selectedThread?.workspaceRoot, selectedThread?.cwd].filter(
        (rootPath): rootPath is string => typeof rootPath === "string" && rootPath.trim().length > 0,
      ),
    [selectedThread?.cwd, selectedThread?.workspaceRoot],
  );
  const changedFiles = useMemo(
    () => perfMeasure(
      "right-rail.changed-files",
      () => {
        if (!contentOpen) {
          return [];
        }

        return buildRightRailChangedFiles({
          artifactRoots,
          extractArtifactPathsFromText,
          isVisibleRightRailArtifactPath,
          persistedSessionWrittenPaths,
          rightRailChangeGroups,
          reviewSummary,
          selectedThreadEntries,
          selectedThreadState,
          transcriptWorkspaceRoot,
        });
      },
      {
        logThresholdMs: 16,
        details: () => ({
          artifactRootCount: artifactRoots.length,
          changeGroupCount: rightRailChangeGroups.length,
          contentOpen,
          entryCount: selectedThreadEntries.length,
          hasReviewSummary: Boolean(reviewSummary),
          persistedSessionWrittenPathCount: persistedSessionWrittenPaths.length,
          selectedThreadState,
        }),
      },
    ),
    [
      artifactRoots,
      contentOpen,
      persistedSessionWrittenPaths,
      reviewSummary,
      rightRailChangeGroups,
      selectedThreadEntries,
      selectedThreadState,
      transcriptWorkspaceRoot,
    ],
  );
  const recentFilePaths = useMemo(() => {
    if (!contentOpen) {
      return [];
    }

    return filterVisibleRightRailArtifactPaths(activeWorkspaceProjection?.recent_file_paths ?? [], artifactRoots);
  }, [activeWorkspaceProjection?.recent_file_paths, artifactRoots, contentOpen]);
  const hasChangedFiles = changedFiles.length > 0;
  const hasAttachedFiles = attachedFiles.length > 0;
  const hasRecentFiles = recentFilePaths.length > 0;
  const workspaceStructure = useMemo(() => {
    if (!contentOpen) {
      return [];
    }

    return (workspacePolicy?.known_structure ?? []).filter((entry) =>
      isVisibleRightRailArtifactPath(entry.path, artifactRoots),
    );
  }, [artifactRoots, contentOpen, workspacePolicy?.known_structure]);
  const hasWorkspaceStructure = workspaceStructure.length > 0;
  const canRefreshWorkspaceStructure = Boolean(selectedThread?.workspaceRoot && workspacePolicy?.read_granted === 1);
  const showEmptyWorkspaceState = canRefreshWorkspaceStructure && !hasWorkspaceStructure;
  if (!hasChangedFiles && !hasAttachedFiles && !hasRecentFiles && !hasWorkspaceStructure && !showEmptyWorkspaceState && !contentOpen) {
    return null;
  }

  if (!hasChangedFiles && !hasAttachedFiles && !hasRecentFiles && !hasWorkspaceStructure && !showEmptyWorkspaceState) {
    return null;
  }

  function fileBasename(filePath: string): string {
    return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
  }

  function fileRelativePath(filePath: string): string {
    if (folderRoot && filePath.startsWith(folderRoot)) {
      const rel = filePath.slice(folderRoot.length).replace(/^[\\/]/, "");
      return rel || filePath;
    }
    return filePath;
  }

  function openFile(filePath: string) {
    const bridge = (window as any).sense1Desktop;
    if (bridge?.workspace?.openFilePath) {
      void bridge.workspace.openFilePath(resolveWorkspaceFilePath(filePath, folderRoot));
    }
  }

  function actionBadgeClasses(action: string | null): string {
    if (action === "created") return "bg-accent-faint text-accent";
    if (action === "deleted") return "bg-surface-strong text-muted";
    return "bg-surface-strong text-ink-muted";
  }

  return (
    <RightRailSection
      bodyClassName="min-h-0"
      onToggle={() => toggleRightRailSection("content")}
      open={contentOpen}
      title="Content"
    >
      <div className="space-y-1">
        {hasChangedFiles ? (
          <>
            <p className="px-1 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-ink-muted">Changed files</p>
            {changedFiles.map(([filePath, action]) => {
              const name = fileBasename(filePath);
              const IconComponent = getFileIcon(name);
              return (
                <button
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-soft"
                  key={filePath}
                  onClick={() => openFile(filePath)}
                  type="button"
                >
                  <IconComponent className="size-4 shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-ink">{name}</p>
                    <p className="truncate text-[0.6875rem] text-ink-muted">{getFileLabel(name)}{fileRelativePath(filePath) !== name ? ` · ${fileRelativePath(filePath)}` : ""}</p>
                  </span>
                  {action ? (
                    <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.06em]", actionBadgeClasses(action))}>
                      {action}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </>
        ) : null}

        {hasAttachedFiles ? (
          <>
            <p className="px-1 pt-2 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-ink-muted">Attached files</p>
            {attachedFiles.map((filePath) => {
              const name = filePath.split(/[\\/]/).pop() ?? filePath;
              const IconComponent = getFileIcon(name);
              return (
                <div className="flex items-center gap-2.5 rounded-lg bg-surface-soft px-2 py-1.5" key={filePath}>
                  <IconComponent className="size-4 shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-ink">{name}</p>
                    <p className="truncate text-[0.6875rem] text-ink-muted">{filePath}</p>
                  </span>
                </div>
              );
            })}
          </>
        ) : null}

        {hasRecentFiles ? (
          <>
            <p className="px-1 pt-2 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-ink-muted">Recent workspace files</p>
            {recentFilePaths.slice(0, 8).map((filePath) => {
              const name = fileBasename(filePath);
              const IconComponent = getFileIcon(name);
              return (
                <button
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-soft"
                  key={filePath}
                  onClick={() => openFile(filePath)}
                  type="button"
                >
                  <IconComponent className="size-4 shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-ink">{name}</p>
                    <p className="truncate text-[0.6875rem] text-ink-muted">{fileRelativePath(filePath)}</p>
                  </span>
                </button>
              );
            })}
          </>
        ) : null}

        {hasWorkspaceStructure ? (
          <>
            <p className="px-1 pt-2 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-ink-muted">
              Workspace structure
              {workspaceStructureRefreshing ? <span className="ml-2 text-accent">(refreshing)</span> : null}
            </p>
            <div className="space-y-1">
              {workspaceStructure.slice(0, 10).map((entry) => (
                <div className="flex items-start gap-2 rounded-lg bg-surface-soft px-2 py-1.5" key={entry.path}>
                  <FileDiff className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                  <span className="min-w-0">
                    <p className="truncate text-xs font-medium text-ink">{entry.name}</p>
                    <p className="truncate text-[0.6875rem] text-ink-muted">{entry.path}</p>
                  </span>
                </div>
              ))}
            </div>
            {canRefreshWorkspaceStructure ? (
              <button
                className="mt-2 rounded-md border border-line px-2 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink"
                onClick={() => void refreshWorkspaceStructure()}
                type="button"
              >
                Refresh workspace structure
              </button>
            ) : null}
          </>
        ) : showEmptyWorkspaceState ? (
          <div className="rounded-lg bg-surface-soft px-3 py-2 text-sm text-muted">
            <p>Workspace structure is available on demand.</p>
            <button
              className="mt-2 rounded-md border border-line px-2 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface hover:text-ink"
              onClick={() => void refreshWorkspaceStructure()}
              type="button"
            >
              Load workspace structure
            </button>
          </div>
        ) : null}
      </div>
    </RightRailSection>
  );
}
