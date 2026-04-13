import type { DesktopThreadSnapshot } from "../../../main/contracts";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { cn } from "../../lib/cn";
import { CheckCircle2, Folder, LoaderCircle, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { folderDisplayName } from "../../state/session/session-selectors.js";
import { getThreadListStatus } from "../../lib/thread-list-status.ts";

export type ThreadSidebarItemProps = {
  archivePending: boolean;
  deletePending?: boolean;
  isNested?: boolean;
  isSelected: boolean;
  menuOpen: boolean;
  onArchive: () => void;
  onDelete?: () => void;
  onRename: () => void;
  onRenameCancel: () => void;
  onRenameSubmit: () => void;
  onRenameValueChange: (value: string) => void;
  onSelect: () => void;
  onToggleMenu: () => void;
  renameValue: string;
  renaming: boolean;
  thread: DesktopThreadSnapshot;
};

export function ThreadSidebarItem({
  archivePending,
  deletePending,
  isNested = false,
  isSelected,
  menuOpen,
  onArchive,
  onDelete,
  onRename,
  onRenameCancel,
  onRenameSubmit,
  onRenameValueChange,
  onSelect,
  onToggleMenu,
  renameValue,
  renaming,
  thread,
}: ThreadSidebarItemProps) {
  const threadStatus = getThreadListStatus(thread);

  return (
    <div className={cn("relative", isNested ? "py-0.5" : "")}>
      <div className={cn("group flex items-start gap-2 rounded-xl", isSelected ? "bg-surface-strong" : "hover:bg-surface-soft")}>
        <button
          className={cn("min-w-0 flex-1 rounded-xl text-left outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-accent/30 motion-reduce:transition-none", isNested ? "px-2 py-1.5" : "px-3 py-2")}
          onClick={onSelect}
          type="button"
        >
          <div className="flex min-w-0 items-center gap-2">
            {threadStatus === "running" ? (
              <LoaderCircle aria-label="Running" className="size-3.5 shrink-0 animate-spin text-ink-muted" />
            ) : threadStatus === "completed" ? (
              <CheckCircle2 aria-label="Completed in background" className="size-3.5 shrink-0 text-emerald-600" />
            ) : null}
            <p className={cn("truncate text-ink", isNested ? "text-sm" : "text-sm font-medium")}>{thread.title}</p>
          </div>
          {!isNested && thread.workspaceRoot ? (
            <p className="mt-0.5 flex items-center gap-[0.2rem] truncate text-xs text-muted">
              <Folder className="size-3 shrink-0" />
              {folderDisplayName(thread.workspaceRoot)}
            </p>
          ) : null}
          <p className={cn("text-muted", isNested ? "text-[0.6875rem]" : "mt-0.5 text-xs")}>{thread.updatedLabel}</p>
        </button>
        <div className="relative shrink-0 px-1.5 pt-1.5">
          <button
            aria-expanded={menuOpen}
            aria-label={`Open actions for ${thread.title}`}
            className={cn("rounded-md p-1 text-muted outline-none transition-colors hover:bg-white hover:text-ink focus-visible:ring-[3px] focus-visible:ring-accent/30", menuOpen || renaming ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100")}
            onClick={(event) => {
              event.stopPropagation();
              onToggleMenu();
            }}
            type="button"
          >
            <MoreHorizontal className="size-4" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-9 z-30 w-36 rounded-xl bg-white p-1.5 shadow-[0_20px_40px_-10px_rgba(10,15,20,0.1)]">
              <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-soft" onClick={(event) => { event.stopPropagation(); onRename(); }} type="button">
                <Pencil className="size-3.5 text-muted" />
                Rename
              </button>
              <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60" disabled={archivePending} onClick={(event) => { event.stopPropagation(); onArchive(); }} type="button">
                <Trash2 className="size-3.5 text-muted" />
                {archivePending ? "Archiving..." : "Archive"}
              </button>
              {onDelete ? (
                <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60" disabled={deletePending} onClick={(event) => { event.stopPropagation(); onDelete(); }} type="button">
                  <Trash2 className="size-3.5 text-muted" />
                  {deletePending ? "Deleting..." : "Delete"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {renaming ? (
        <form className={cn("mt-2 rounded-xl bg-white p-2 shadow-[0_20px_40px_-10px_rgba(10,15,20,0.08)]", isNested ? "ml-2" : "")} onSubmit={(event) => { event.preventDefault(); onRenameSubmit(); }}>
          <Input autoFocus onChange={(event) => onRenameValueChange(event.target.value)} placeholder="Thread title" value={renameValue} />
          <div className="mt-2 flex justify-end gap-2">
            <Button onClick={onRenameCancel} size="sm" type="button" variant="secondary">Cancel</Button>
            <Button disabled={!renameValue.trim()} size="sm" type="submit" variant="default">Save</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
