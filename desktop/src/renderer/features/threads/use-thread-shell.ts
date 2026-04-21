import { useCallback, useEffect, useState, type SetStateAction } from "react";
import type { DesktopThreadSnapshot } from "../../../main/contracts";
import {
  performThreadArchive,
  performThreadDelete,
  performThreadRename,
  performThreadRestore,
} from "./thread-shell-actions.js";

type ThreadMenuSetter = (value: SetStateAction<string | null>) => void;
export type ThreadRenameTarget = Pick<DesktopThreadSnapshot, "id" | "title">;

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

  const setSidebarThreadMenu = useCallback((value: SetStateAction<string | null>) => {
    setSidebarThreadMenuOpenId((current) => (typeof value === "function" ? value(current) : value));
    setHomeThreadMenuOpenId(null);
  }, []);

  const setHomeThreadMenu = useCallback((value: SetStateAction<string | null>) => {
    setHomeThreadMenuOpenId((current) => (typeof value === "function" ? value(current) : value));
    setSidebarThreadMenuOpenId(null);
  }, []);

  const closeThreadMenus = useCallback(() => {
    setSidebarThreadMenuOpenId(null);
    setHomeThreadMenuOpenId(null);
  }, []);

  const openThreadRename = useCallback((thread: ThreadRenameTarget) => {
    closeThreadMenus();
    setThreadRenameId(thread.id);
    setThreadRenameDraft(thread.title);
  }, [closeThreadMenus]);

  const cancelThreadRename = useCallback(() => {
    setThreadRenameId(null);
    setThreadRenameDraft("");
  }, []);

  const resetThreadShell = useCallback(() => {
    closeThreadMenus();
    cancelThreadRename();
  }, [cancelThreadRename, closeThreadMenus]);

  useEffect(() => {
    closeThreadMenus();
  }, [selectedThreadId]);

  const submitThreadRename = useCallback(async (threadId: string): Promise<void> => {
    await performThreadRename({
      threadId,
      threadRenameDraft,
      renameThread,
      cancelThreadRename,
    });
  }, [cancelThreadRename, renameThread, threadRenameDraft]);

  const handleArchiveThread = useCallback(async (threadId: string): Promise<void> => {
    await performThreadArchive({
      threadId,
      archiveThread,
      setThreadArchivePendingId,
      threadRenameId,
      cancelThreadRename,
      closeThreadMenus,
      refreshWorkspaceCollections,
    });
  }, [archiveThread, closeThreadMenus, refreshWorkspaceCollections, threadRenameId, cancelThreadRename]);

  const handleRestoreThread = useCallback(async (threadId: string): Promise<void> => {
    await performThreadRestore({
      threadId,
      restoreThread,
      setThreadRestorePendingId,
      closeThreadMenus,
      refreshWorkspaceCollections,
    });
  }, [closeThreadMenus, refreshWorkspaceCollections, restoreThread]);

  const handleDeleteThread = useCallback(async (threadId: string): Promise<void> => {
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
  }, [
    cancelThreadRename,
    closeThreadMenus,
    confirmDeleteThread,
    deleteThread,
    refreshWorkspaceCollections,
    resetToStartSurface,
    selectedThreadId,
    threadRenameId,
  ]);

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
