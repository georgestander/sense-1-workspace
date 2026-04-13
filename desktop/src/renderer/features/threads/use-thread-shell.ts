import { useEffect, useState, type SetStateAction } from "react";
import type { DesktopThreadSnapshot } from "../../../main/contracts";
import {
  performThreadArchive,
  performThreadDelete,
  performThreadRename,
  performThreadRestore,
} from "./thread-shell-actions.js";

type ThreadMenuSetter = (value: SetStateAction<string | null>) => void;

type UseThreadShellParams = {
  selectedThreadId: string | null;
  renameThread: (threadId: string, title: string) => Promise<boolean>;
  archiveThread: (threadId: string) => Promise<boolean>;
  restoreThread: (threadId: string) => Promise<boolean>;
  deleteThread: (threadId: string) => Promise<boolean>;
  refreshWorkspaceCollections: () => Promise<void>;
  resetToStartSurface: () => void;
  confirmDeleteThread?: (message: string) => boolean;
};

export function useThreadShell({
  selectedThreadId,
  renameThread,
  archiveThread,
  restoreThread,
  deleteThread,
  refreshWorkspaceCollections,
  resetToStartSurface,
  confirmDeleteThread = (message) => window.confirm(message),
}: UseThreadShellParams) {
  const [sidebarThreadMenuOpenId, setSidebarThreadMenuOpenId] = useState<string | null>(null);
  const [homeThreadMenuOpenId, setHomeThreadMenuOpenId] = useState<string | null>(null);
  const [threadRenameId, setThreadRenameId] = useState<string | null>(null);
  const [threadRenameDraft, setThreadRenameDraft] = useState("");
  const [threadArchivePendingId, setThreadArchivePendingId] = useState<string | null>(null);
  const [threadDeletePendingId, setThreadDeletePendingId] = useState<string | null>(null);
  const [threadRestorePendingId, setThreadRestorePendingId] = useState<string | null>(null);

  function setSidebarThreadMenu(value: SetStateAction<string | null>) {
    setSidebarThreadMenuOpenId((current) => (typeof value === "function" ? value(current) : value));
    setHomeThreadMenuOpenId(null);
  }

  function setHomeThreadMenu(value: SetStateAction<string | null>) {
    setHomeThreadMenuOpenId((current) => (typeof value === "function" ? value(current) : value));
    setSidebarThreadMenuOpenId(null);
  }

  function closeThreadMenus() {
    setSidebarThreadMenuOpenId(null);
    setHomeThreadMenuOpenId(null);
  }

  function openThreadRename(thread: DesktopThreadSnapshot) {
    closeThreadMenus();
    setThreadRenameId(thread.id);
    setThreadRenameDraft(thread.title);
  }

  function cancelThreadRename() {
    setThreadRenameId(null);
    setThreadRenameDraft("");
  }

  function resetThreadShell() {
    closeThreadMenus();
    cancelThreadRename();
  }

  useEffect(() => {
    closeThreadMenus();
  }, [selectedThreadId]);

  async function submitThreadRename(threadId: string): Promise<void> {
    await performThreadRename({
      threadId,
      threadRenameDraft,
      renameThread,
      cancelThreadRename,
    });
  }

  async function handleArchiveThread(threadId: string): Promise<void> {
    await performThreadArchive({
      threadId,
      archiveThread,
      setThreadArchivePendingId,
      threadRenameId,
      cancelThreadRename,
      closeThreadMenus,
      refreshWorkspaceCollections,
    });
  }

  async function handleRestoreThread(threadId: string): Promise<void> {
    await performThreadRestore({
      threadId,
      restoreThread,
      setThreadRestorePendingId,
      closeThreadMenus,
      refreshWorkspaceCollections,
    });
  }

  async function handleDeleteThread(threadId: string): Promise<void> {
    await performThreadDelete({
      threadId,
      selectedThreadId,
      deleteThread,
      setThreadDeletePendingId,
      threadRenameId,
      cancelThreadRename,
      closeThreadMenus,
      refreshWorkspaceCollections,
      resetToStartSurface,
      confirmDeleteThread,
    });
  }

  return {
    sidebarThreadMenuOpenId,
    homeThreadMenuOpenId,
    threadRenameId,
    threadRenameDraft,
    setThreadRenameDraft,
    threadArchivePendingId,
    threadDeletePendingId,
    threadRestorePendingId,
    setSidebarThreadMenu: setSidebarThreadMenu as ThreadMenuSetter,
    setHomeThreadMenu: setHomeThreadMenu as ThreadMenuSetter,
    closeThreadMenus,
    openThreadRename,
    cancelThreadRename,
    submitThreadRename,
    handleArchiveThread,
    handleRestoreThread,
    handleDeleteThread,
    resetThreadShell,
  };
}
