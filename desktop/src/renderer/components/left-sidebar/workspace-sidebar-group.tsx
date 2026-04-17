import type { DragEvent } from "react";
import { ChevronDown, ChevronRight, FolderArchive, FolderOpen, GripVertical, MoreHorizontal, Plus, Trash2 } from "lucide-react";

import { cn } from "../../lib/cn";
import type { ThreadRenameTarget } from "../../features/threads/use-thread-shell.js";
import { folderDisplayName } from "../../state/session/session-selectors.js";
import {
  isWorkspaceSidebarGroupExpanded,
  type WorkspaceSidebarGroup,
  type WorkspaceSidebarThreadSummary,
} from "../../features/workspace/workspace-sidebar.js";
import { type DesktopThreadSnapshot } from "../../../main/contracts";
import { ThreadSidebarItem } from "./thread-sidebar-item.js";

export type WorkspaceSidebarGroupProps = {
  group: WorkspaceSidebarGroup<WorkspaceSidebarThreadSummary>;
  expandedWorkspaces: Record<string, boolean>;
  toggleWorkspaceExpanded: (root: string) => void;
  activeWorkspaceRoot: string | null;
  selectedThread: DesktopThreadSnapshot | null;
  workspaceMenuOpenId: string | null;
  setWorkspaceMenuOpenId: (value: string | null | ((current: string | null) => string | null)) => void;
  handleArchiveWorkspace: (workspaceId: string, workspaceRoot: string) => Promise<void> | void;
  handleDeleteWorkspace: (workspaceId: string, workspaceRoot: string) => Promise<void> | void;
  workspaceArchivePendingId: string | null;
  workspaceDeletePendingId: string | null;
  workspaceIdByRoot: Record<string, string>;
  dragOverRoot: string | null;
  handleWorkspaceDragStart: (event: DragEvent, root: string) => void;
  handleWorkspaceDragEnd: (event: DragEvent) => void;
  handleWorkspaceDragOver: (event: DragEvent, root: string) => void;
  handleWorkspaceDragLeave: () => void;
  handleWorkspaceDrop: (event: DragEvent, root: string) => Promise<void> | void;
  onNewThreadInWorkspace: (root: string) => void;
  threadArchivePendingId: string | null;
  threadDeletePendingId: string | null;
  threadMenuOpenId: string | null;
  setThreadMenuOpenId: (value: string | null | ((current: string | null) => string | null)) => void;
  threadRenameId: string | null;
  threadRenameDraft: string;
  setThreadRenameDraft: (value: string) => void;
  openThreadRename: (thread: ThreadRenameTarget) => void;
  submitThreadRename: (threadId: string) => Promise<void> | void;
  cancelThreadRename: () => void;
  handleArchiveThread: (threadId: string) => Promise<void> | void;
  handleDeleteThread: (threadId: string) => Promise<void> | void;
  selectThread: (threadId: string) => Promise<void> | void;
};

export function WorkspaceSidebarGroup({
  group,
  expandedWorkspaces,
  toggleWorkspaceExpanded,
  activeWorkspaceRoot,
  selectedThread,
  workspaceMenuOpenId,
  setWorkspaceMenuOpenId,
  handleArchiveWorkspace,
  handleDeleteWorkspace,
  workspaceArchivePendingId,
  workspaceDeletePendingId,
  workspaceIdByRoot,
  dragOverRoot,
  handleWorkspaceDragStart,
  handleWorkspaceDragEnd,
  handleWorkspaceDragOver,
  handleWorkspaceDragLeave,
  handleWorkspaceDrop,
  onNewThreadInWorkspace,
  threadArchivePendingId,
  threadDeletePendingId,
  threadMenuOpenId,
  setThreadMenuOpenId,
  threadRenameId,
  threadRenameDraft,
  setThreadRenameDraft,
  openThreadRename,
  submitThreadRename,
  cancelThreadRename,
  handleArchiveThread,
  handleDeleteThread,
  selectThread,
}: WorkspaceSidebarGroupProps) {
  const root = group.root;
  const wsThreads = group.threads;
  const folderName = folderDisplayName(root);
  const isExpanded = isWorkspaceSidebarGroupExpanded({ expandedWorkspaces, root, activeWorkspaceRoot });
  const isDraggable = root !== activeWorkspaceRoot;
  const workspaceId = workspaceIdByRoot[root] ?? null;
  const workspaceMenuOpen = workspaceMenuOpenId === root;

  return (
    <div
      className={cn("group rounded-lg transition-colors", dragOverRoot === root && "bg-accent/5")}
      draggable={isDraggable}
      onDragEnd={handleWorkspaceDragEnd}
      onDragLeave={handleWorkspaceDragLeave}
      onDragOver={(event) => handleWorkspaceDragOver(event, root)}
      onDragStart={(event) => handleWorkspaceDragStart(event, root)}
      onDrop={(event) => void handleWorkspaceDrop(event, root)}
    >
      <div className="flex items-center gap-0.5">
        {isDraggable ? (
          <GripVertical className="size-3 shrink-0 cursor-grab text-muted opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing" />
        ) : null}
        <button
          aria-label={`${isExpanded ? "Collapse" : "Expand"} workspace ${folderName}`}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1 rounded-lg px-1 py-1.5 text-left text-xs transition-colors",
            group.isActive ? "bg-surface-strong text-ink" : "text-ink-faint hover:bg-surface-soft",
          )}
          onClick={() => toggleWorkspaceExpanded(root)}
          type="button"
        >
          {isExpanded ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
          <FolderOpen className={cn("size-3.5 shrink-0", group.isActive ? "text-accent" : "")} />
          <span className="min-w-0 flex-1 truncate font-medium">{folderName}</span>
          {group.isActive ? (
            <span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-accent">
              Active
            </span>
          ) : null}
          <span className="shrink-0 text-[0.625rem] text-muted">{wsThreads.length}</span>
        </button>
        <button
          aria-label={`New thread in ${folderName}`}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-surface-strong hover:text-ink"
          onClick={(event) => {
            event.stopPropagation();
            onNewThreadInWorkspace(root);
          }}
          title={`New thread in ${folderName}`}
          type="button"
        >
          <Plus className="size-3" />
        </button>
        {workspaceId ? (
          <div className="relative">
            <button
              aria-expanded={workspaceMenuOpen}
              aria-label={`Open actions for ${folderName}`}
              className="flex size-5 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-surface-strong hover:text-ink"
              onClick={(event) => {
                event.stopPropagation();
                setWorkspaceMenuOpenId((current) => (current === root ? null : root));
              }}
              type="button"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
            {workspaceMenuOpen ? (
              <div className="absolute right-0 top-7 z-30 w-40 rounded-xl border border-line bg-surface-high p-1.5 shadow-[var(--shadow-menu)]">
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={workspaceArchivePendingId === workspaceId}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleArchiveWorkspace(workspaceId, root);
                  }}
                  type="button"
                >
                  <FolderArchive className="size-3.5 text-muted" />
                  {workspaceArchivePendingId === workspaceId ? "Archiving..." : "Archive"}
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={workspaceDeletePendingId === workspaceId}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDeleteWorkspace(workspaceId, root);
                  }}
                  type="button"
                >
                  <Trash2 className="size-3.5 text-muted" />
                  {workspaceDeletePendingId === workspaceId ? "Deleting..." : "Delete"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {isExpanded ? (
        <div className="space-y-0.5 pl-3">
          {wsThreads.map((thread) => (
            <ThreadSidebarItem
              archivePending={threadArchivePendingId === thread.id}
              deletePending={threadDeletePendingId === thread.id}
              isNested
              isSelected={selectedThread?.id === thread.id}
              key={thread.id}
              menuOpen={threadMenuOpenId === thread.id}
              onArchive={() => void handleArchiveThread(thread.id)}
              onDelete={() => void handleDeleteThread(thread.id)}
              onRename={() => openThreadRename(thread)}
              onRenameCancel={cancelThreadRename}
              onRenameSubmit={() => void submitThreadRename(thread.id)}
              onRenameValueChange={setThreadRenameDraft}
              onSelect={() => {
                setThreadMenuOpenId(null);
                void selectThread(thread.id);
              }}
              onToggleMenu={() => {
                setThreadMenuOpenId((current) => (current === thread.id ? null : thread.id));
                if (threadRenameId && threadRenameId !== thread.id) {
                  cancelThreadRename();
                }
              }}
              renameValue={threadRenameId === thread.id ? threadRenameDraft : thread.title}
              renaming={threadRenameId === thread.id}
              thread={thread}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
