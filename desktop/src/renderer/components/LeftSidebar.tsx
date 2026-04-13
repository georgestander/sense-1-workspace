import type { DragEvent } from "react";
import { ChevronDown, Plus, PlugZap, CalendarClock, Settings, LogOut, UserCircle2 } from "lucide-react";

import { Button } from "./ui/button";
import { cn } from "../lib/cn";
import { type DesktopBootstrapTeamSetup, type DesktopBootstrapTenant, type DesktopThreadSnapshot } from "../../main/contracts";
import { ThreadSidebarItem } from "./left-sidebar/thread-sidebar-item.js";
import { WorkspaceSidebarGroup } from "./left-sidebar/workspace-sidebar-group.js";
import { type WorkspaceSidebarGroup as WorkspaceSidebarGroupType } from "../features/workspace/workspace-sidebar.js";
import { buildSidebarIdentity } from "../state/session/tenant-identity.js";

export type LeftSidebarProps = {
  activeView: "home" | "plugins" | "automations";
  leftRailOpen: boolean;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  filteredThreads: DesktopThreadSnapshot[];
  noThreadSearchMatches: boolean;
  trimmedSearchQuery: string;
  workspaceThreadGroups: {
    workspaces: WorkspaceSidebarGroupType<DesktopThreadSnapshot>[];
    standalone: DesktopThreadSnapshot[];
  };
  expandedWorkspaces: Record<string, boolean>;
  toggleWorkspaceExpanded: (root: string) => void;
  activeWorkspaceRoot: string | null;
  selectedThread: DesktopThreadSnapshot | null;
  selectThread: (threadId: string) => Promise<void> | void;
  openThreadRename: (thread: DesktopThreadSnapshot) => void;
  threadRenameId: string | null;
  threadRenameDraft: string;
  setThreadRenameDraft: (value: string) => void;
  submitThreadRename: (threadId: string) => Promise<void> | void;
  cancelThreadRename: () => void;
  handleArchiveThread: (threadId: string) => Promise<void> | void;
  threadArchivePendingId: string | null;
  handleDeleteThread: (threadId: string) => Promise<void> | void;
  threadDeletePendingId: string | null;
  threadMenuOpenId: string | null;
  setThreadMenuOpenId: (value: string | null | ((current: string | null) => string | null)) => void;
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
  openAutomations: () => void;
  openPlugins: () => void;
  resetToStartSurface: () => void;
  accountMenuOpen: boolean;
  setAccountMenuOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  accountEmail: string | null | undefined;
  tenant: DesktopBootstrapTenant | null;
  teamSetup: DesktopBootstrapTeamSetup;
  openSettings: () => Promise<void> | void;
  handleLogout: () => Promise<void> | void;
  logoutPending: boolean;
};

export function LeftSidebar({
  activeView,
  leftRailOpen,
  filteredThreads,
  noThreadSearchMatches,
  trimmedSearchQuery,
  workspaceThreadGroups,
  expandedWorkspaces,
  toggleWorkspaceExpanded,
  activeWorkspaceRoot,
  selectedThread,
  selectThread,
  openThreadRename,
  threadRenameId,
  threadRenameDraft,
  setThreadRenameDraft,
  submitThreadRename,
  cancelThreadRename,
  handleArchiveThread,
  threadArchivePendingId,
  handleDeleteThread,
  threadDeletePendingId,
  threadMenuOpenId,
  setThreadMenuOpenId,
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
  openAutomations,
  openPlugins,
  resetToStartSurface,
  accountMenuOpen,
  setAccountMenuOpen,
  accountEmail,
  tenant,
  teamSetup,
  openSettings,
  handleLogout,
  logoutPending,
}: LeftSidebarProps) {
  const tenantIdentity = buildSidebarIdentity(tenant, teamSetup);

  return (
    <aside
      className={cn("z-20 min-h-0 bg-surface-soft transition-all duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] max-lg:absolute max-lg:inset-y-0 max-lg:left-0", leftRailOpen ? "w-72 p-3 max-lg:shadow-2xl" : "w-0 overflow-hidden p-0 max-lg:hidden")}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="sticky top-0 z-10 shrink-0 bg-surface-soft pb-4">
          <Button className="w-full justify-start" onClick={resetToStartSurface} variant="default">
            <Plus />
            New chat
          </Button>
          <div className="mt-3 grid gap-2">
            <button
              className={cn("flex items-center gap-2 rounded-2xl px-3 py-2 text-sm transition-colors", activeView === "plugins" ? "bg-ink text-white" : "bg-surface-strong text-ink hover:bg-surface-high")}
              onClick={openPlugins}
              type="button"
            >
              <PlugZap className="size-4" />
              Plugins
            </button>
            <button
              className={cn("flex items-center gap-2 rounded-2xl px-3 py-2 text-sm transition-colors", activeView === "automations" ? "bg-ink text-white" : "bg-surface-strong text-ink hover:bg-surface-high")}
              onClick={openAutomations}
              type="button"
            >
              <CalendarClock className="size-4" />
              Automations
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <div className="space-y-1 pb-2">
            {filteredThreads.length === 0 && workspaceThreadGroups.workspaces.length === 0 ? (
              noThreadSearchMatches ? (
                <p className="rounded-xl bg-surface-strong px-3 py-2 text-sm text-muted">No recent threads match &quot;{trimmedSearchQuery}&quot;.</p>
              ) : (
                <p className="rounded-xl bg-surface-strong px-3 py-2 text-sm text-muted">No recent threads yet.</p>
              )
            ) : (
              <>
                {workspaceThreadGroups.workspaces.length > 0 ? (
                  <div className="space-y-1">
                    <p className="px-1 pt-2 text-[0.6875rem] font-semibold uppercase tracking-[0.11em] text-muted">Workspaces</p>
                    {workspaceThreadGroups.workspaces.map((group) => (
                        <WorkspaceSidebarGroup
                          activeWorkspaceRoot={activeWorkspaceRoot}
                          cancelThreadRename={cancelThreadRename}
                          dragOverRoot={dragOverRoot}
                          expandedWorkspaces={expandedWorkspaces}
                          group={group}
                          handleArchiveThread={handleArchiveThread}
                          handleArchiveWorkspace={handleArchiveWorkspace}
                          handleDeleteThread={handleDeleteThread}
                          handleDeleteWorkspace={handleDeleteWorkspace}
                          handleWorkspaceDragEnd={handleWorkspaceDragEnd}
                          handleWorkspaceDragLeave={handleWorkspaceDragLeave}
                          handleWorkspaceDragOver={handleWorkspaceDragOver}
                          handleWorkspaceDragStart={handleWorkspaceDragStart}
                          handleWorkspaceDrop={handleWorkspaceDrop}
                          key={group.root}
                          onNewThreadInWorkspace={onNewThreadInWorkspace}
                          openThreadRename={openThreadRename}
                          selectThread={selectThread}
                          selectedThread={selectedThread}
                          setThreadMenuOpenId={setThreadMenuOpenId}
                          setThreadRenameDraft={setThreadRenameDraft}
                          setWorkspaceMenuOpenId={setWorkspaceMenuOpenId}
                          submitThreadRename={submitThreadRename}
                          threadArchivePendingId={threadArchivePendingId}
                          threadDeletePendingId={threadDeletePendingId}
                          threadMenuOpenId={threadMenuOpenId}
                          threadRenameDraft={threadRenameDraft}
                          threadRenameId={threadRenameId}
                          toggleWorkspaceExpanded={toggleWorkspaceExpanded}
                          workspaceArchivePendingId={workspaceArchivePendingId}
                          workspaceDeletePendingId={workspaceDeletePendingId}
                          workspaceIdByRoot={workspaceIdByRoot}
                          workspaceMenuOpenId={workspaceMenuOpenId}
                        />
                    ))}
                  </div>
                ) : null}

                {workspaceThreadGroups.standalone.length > 0 ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between px-1 pt-2">
                      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.11em] text-muted">Threads</p>
                      <button className="rounded-full bg-ink px-2 py-0.5 text-[0.5625rem] font-medium text-on-accent transition-opacity hover:opacity-80" onClick={resetToStartSurface} type="button">
                        New thread
                      </button>
                    </div>
                    {workspaceThreadGroups.standalone.map((thread) => (
                      <ThreadSidebarItem
                        archivePending={threadArchivePendingId === thread.id}
                        deletePending={threadDeletePendingId === thread.id}
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
              </>
            )}
          </div>
        </div>

        <div className="mt-4 shrink-0 rounded-2xl bg-surface-strong p-3">
          <button className="flex w-full items-center gap-2 text-left" onClick={() => setAccountMenuOpen((value) => !value)} type="button">
            <UserCircle2 className="text-muted" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{accountEmail ?? "Signed in with ChatGPT"}</p>
              <p className="truncate text-xs text-muted">{tenantIdentity.summary}</p>
              <p className="truncate text-[11px] text-muted/80">{tenantIdentity.detail}</p>
            </div>
            <ChevronDown className={cn("size-3.5 text-muted transition-transform", accountMenuOpen && "rotate-180")} />
          </button>
          {accountMenuOpen ? (
            <div className="mt-2 flex flex-col gap-1 pt-2">
              <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-ink-soft transition-colors hover:bg-surface-strong" onClick={() => void openSettings()} type="button">
                <Settings className="size-3.5" />
                Settings
              </button>
              <button
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-ink-soft transition-colors hover:bg-surface-strong"
                disabled={logoutPending}
                onClick={() => {
                  setAccountMenuOpen(false);
                  void handleLogout();
                }}
                type="button"
              >
                <LogOut className="size-3.5" />
                {logoutPending ? "Signing out..." : "Sign out"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
