import type { Dispatch, SetStateAction } from "react";
import { FolderArchive, FolderOpen, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "../ui/button";
import type { ThreadRenameTarget } from "../../features/threads/use-thread-shell.js";
import type { DesktopThreadSnapshot, SubstrateSessionRecord, SubstrateWorkspaceRecord } from "../../../main/contracts";
import type { WorkspaceSidebarGroup, WorkspaceSidebarThreadSummary } from "../../features/workspace/workspace-sidebar.js";
import { formatSessionActivity } from "./start-surface-utils.js";
import { ThreadSidebarItem } from "./thread-sidebar-item.js";

export type StartSurfaceCollectionsPanelProps = {
  workInFolder: boolean;
  workspaceFolder: string | null;
  workspaceThreadGroups: {
    workspaces: WorkspaceSidebarGroup<WorkspaceSidebarThreadSummary>[];
    standalone: WorkspaceSidebarThreadSummary[];
    baseOrder: string[];
    displayOrder: string[];
  };
  workspaceIdByRoot: Record<string, string>;
  workspaceMenuOpenId: string | null;
  setWorkspaceMenuOpenId: Dispatch<SetStateAction<string | null>>;
  handleArchiveWorkspace: (workspaceId: string, workspaceRoot: string) => Promise<void>;
  handleRestoreWorkspace: (workspaceId: string) => Promise<void>;
  handleDeleteWorkspace: (workspaceId: string, workspaceRoot: string) => Promise<void>;
  workspaceArchivePendingId: string | null;
  workspaceRestorePendingId: string | null;
  workspaceDeletePendingId: string | null;
  navigateToWorkspaceFolder: (path: string) => void;
  threads: DesktopThreadSnapshot[];
  threadArchivePendingId: string | null;
  threadMenuOpenId: string | null;
  setThreadMenuOpenId: Dispatch<SetStateAction<string | null>>;
  threadRenameId: string | null;
  threadRenameDraft: string;
  setThreadRenameDraft: (value: string) => void;
  handleArchiveThread: (threadId: string) => Promise<void>;
  handleDeleteThread: (threadId: string) => Promise<void>;
  threadDeletePendingId: string | null;
  threadRestorePendingId: string | null;
  openThreadRename: (thread: ThreadRenameTarget) => void;
  cancelThreadRename: () => void;
  submitThreadRename: (threadId: string) => Promise<void>;
  selectThread: (threadId: string) => void;
  archivedWorkspaces: SubstrateWorkspaceRecord[];
  archivedSessions: SubstrateSessionRecord[];
  handleRestoreThread: (threadId: string) => Promise<void>;
};

export function StartSurfaceCollectionsPanel(props: StartSurfaceCollectionsPanelProps) {
  const {
    workInFolder,
    workspaceFolder,
    workspaceThreadGroups,
    workspaceIdByRoot,
    workspaceMenuOpenId,
    setWorkspaceMenuOpenId,
    handleArchiveWorkspace,
    handleRestoreWorkspace,
    handleDeleteWorkspace,
    workspaceArchivePendingId,
    workspaceRestorePendingId,
    workspaceDeletePendingId,
    navigateToWorkspaceFolder,
    threads,
    threadArchivePendingId,
    threadMenuOpenId,
    setThreadMenuOpenId,
    threadRenameId,
    threadRenameDraft,
    setThreadRenameDraft,
    handleArchiveThread,
    handleDeleteThread,
    threadDeletePendingId,
    threadRestorePendingId,
    openThreadRename,
    cancelThreadRename,
    submitThreadRename,
    selectThread,
    archivedWorkspaces,
    archivedSessions,
    handleRestoreThread,
  } = props;

  return (
    <div className="relative z-0 mx-auto mt-6 min-h-0 w-full max-w-3xl flex-1 space-y-5 overflow-y-auto pb-4">
      {workInFolder && workspaceFolder ? null : workspaceThreadGroups.workspaces.length > 0 ? (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.11em] text-muted">Workspaces</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {workspaceThreadGroups.workspaces.map((group) => {
              const root = group.root;
              const wsThreads = group.threads;
              const folderName = root.split(/[\\/]/).pop() || root;
              const workspaceId = workspaceIdByRoot[root] ?? null;
              const workspaceMenuOpen = workspaceMenuOpenId === root;
              return (
                <div className="relative rounded-xl border border-line bg-surface-high p-3" key={root}>
                  {workspaceId ? (
                    <div className="absolute right-2 top-2 z-10">
                      <button aria-expanded={workspaceMenuOpen} aria-label={`Open actions for ${folderName}`} className="rounded-md p-1 text-muted transition-colors hover:bg-surface-soft hover:text-ink" onClick={() => setWorkspaceMenuOpenId((current) => (current === root ? null : root))} type="button">
                        <MoreHorizontal className="size-4" />
                      </button>
                      {workspaceMenuOpen ? (
                        <div className="absolute right-0 top-8 z-20 w-40 rounded-xl border border-line bg-surface-high p-1.5 shadow-[var(--shadow-menu)]">
                          <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60" disabled={workspaceArchivePendingId === workspaceId} onClick={() => void handleArchiveWorkspace(workspaceId, root)} type="button">
                            <FolderArchive className="size-3.5 text-muted" />
                            {workspaceArchivePendingId === workspaceId ? "Archiving..." : "Archive"}
                          </button>
                          <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60" disabled={workspaceDeletePendingId === workspaceId} onClick={() => void handleDeleteWorkspace(workspaceId, root)} type="button">
                            <Trash2 className="size-3.5 text-muted" />
                            {workspaceDeletePendingId === workspaceId ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <button className="flex w-full flex-col items-start text-left outline-none transition-all hover:bg-surface-strong focus-visible:ring-[3px] focus-visible:ring-accent/30 motion-reduce:transition-none" onClick={() => navigateToWorkspaceFolder(root)} type="button">
                    <FolderOpen className="size-4 text-accent" />
                    <p className="mt-1.5 w-full truncate pr-6 text-sm font-medium text-ink">{folderName}</p>
                    <p className="mt-0.5 text-[11px] text-muted">{wsThreads.length} {wsThreads.length === 1 ? "thread" : "threads"}</p>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {workInFolder && workspaceFolder ? null : (
        <section className="rounded-2xl border border-line bg-surface-high p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.11em] text-muted">Recent threads</p>
          <div className="space-y-2">
            {threads.slice(0, 5).map((thread) => (
              <ThreadSidebarItem
                archivePending={threadArchivePendingId === thread.id}
                deletePending={threadDeletePendingId === thread.id}
                isSelected={false}
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
            {threads.length === 0 ? <p className="rounded-xl bg-surface-soft px-3 py-2 text-sm text-muted">No recent threads yet.</p> : null}
          </div>
        </section>
      )}

      {workInFolder && workspaceFolder ? null : archivedWorkspaces.length > 0 ? (
        <section className="rounded-2xl border border-line bg-surface-high p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.11em] text-muted">Archived workspaces</p>
          <div className="space-y-2">
            {archivedWorkspaces.slice(0, 6).map((workspace) => (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-soft px-3 py-3" key={workspace.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{workspace.display_name || workspace.root_path}</p>
                  <p className="truncate text-xs text-muted">{workspace.root_path}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button disabled={workspaceRestorePendingId === workspace.id} onClick={() => void handleRestoreWorkspace(workspace.id)} size="sm" type="button" variant="secondary">
                    <RotateCcw className="size-3.5" />
                    {workspaceRestorePendingId === workspace.id ? "Restoring..." : "Restore"}
                  </Button>
                  <Button disabled={workspaceDeletePendingId === workspace.id} onClick={() => void handleDeleteWorkspace(workspace.id, workspace.root_path)} size="sm" type="button" variant="secondary">
                    <Trash2 className="size-3.5" />
                    {workspaceDeletePendingId === workspace.id ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {workInFolder && workspaceFolder ? null : archivedSessions.length > 0 ? (
        <section className="rounded-2xl border border-line bg-surface-high p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.11em] text-muted">Archived threads</p>
          <div className="space-y-2">
            {archivedSessions.slice(0, 6).map((session) => (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-soft px-3 py-3" key={session.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{session.title || "Untitled session"}</p>
                  <p className="text-xs text-muted">{formatSessionActivity(session.ended_at || session.started_at)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button disabled={threadRestorePendingId === session.codex_thread_id} onClick={() => session.codex_thread_id ? void handleRestoreThread(session.codex_thread_id) : undefined} size="sm" type="button" variant="secondary">
                    <RotateCcw className="size-3.5" />
                    {threadRestorePendingId === session.codex_thread_id ? "Restoring..." : "Restore"}
                  </Button>
                  <Button disabled={threadDeletePendingId === session.codex_thread_id} onClick={() => session.codex_thread_id ? void handleDeleteThread(session.codex_thread_id) : undefined} size="sm" type="button" variant="secondary">
                    <Trash2 className="size-3.5" />
                    {threadDeletePendingId === session.codex_thread_id ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
