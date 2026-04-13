type PendingIdSetter = (value: string | null | ((current: string | null) => string | null)) => void;

type ThreadRenameDeps = {
  threadId: string;
  threadRenameDraft: string;
  renameThread: (threadId: string, title: string) => Promise<boolean>;
  cancelThreadRename: () => void;
};

type ThreadArchiveDeps = {
  threadId: string;
  archiveThread: (threadId: string) => Promise<boolean>;
  setThreadArchivePendingId: PendingIdSetter;
  threadRenameId: string | null;
  cancelThreadRename: () => void;
  closeThreadMenus: () => void;
  refreshWorkspaceCollections: () => Promise<void>;
};

type ThreadRestoreDeps = {
  threadId: string;
  restoreThread: (threadId: string) => Promise<boolean>;
  setThreadRestorePendingId: PendingIdSetter;
  closeThreadMenus: () => void;
  refreshWorkspaceCollections: () => Promise<void>;
};

type ThreadDeleteDeps = {
  threadId: string;
  selectedThreadId: string | null;
  deleteThread: (threadId: string) => Promise<boolean>;
  setThreadDeletePendingId: PendingIdSetter;
  threadRenameId: string | null;
  cancelThreadRename: () => void;
  closeThreadMenus: () => void;
  refreshWorkspaceCollections: () => Promise<void>;
  resetToStartSurface: () => void;
  confirmDeleteThread: (message: string) => boolean;
};

const DELETE_THREAD_PROMPT =
  "Delete this thread from Sense-1 permanently? This removes its app history and session files, but does not touch files in your workspace folder.";

export async function performThreadRename({
  threadId,
  threadRenameDraft,
  renameThread,
  cancelThreadRename,
}: ThreadRenameDeps): Promise<boolean> {
  const didRename = await renameThread(threadId, threadRenameDraft);
  if (didRename) {
    cancelThreadRename();
  }
  return didRename;
}

export async function performThreadArchive({
  threadId,
  archiveThread,
  setThreadArchivePendingId,
  threadRenameId,
  cancelThreadRename,
  closeThreadMenus,
  refreshWorkspaceCollections,
}: ThreadArchiveDeps): Promise<boolean> {
  closeThreadMenus();
  setThreadArchivePendingId(threadId);
  const didArchive = await archiveThread(threadId);
  setThreadArchivePendingId((current) => (current === threadId ? null : current));
  if (didArchive && threadRenameId === threadId) {
    cancelThreadRename();
  }
  if (didArchive) {
    await refreshWorkspaceCollections();
  }
  return didArchive;
}

export async function performThreadRestore({
  threadId,
  restoreThread,
  setThreadRestorePendingId,
  closeThreadMenus,
  refreshWorkspaceCollections,
}: ThreadRestoreDeps): Promise<boolean> {
  closeThreadMenus();
  setThreadRestorePendingId(threadId);
  const didRestore = await restoreThread(threadId);
  setThreadRestorePendingId((current) => (current === threadId ? null : current));
  if (didRestore) {
    await refreshWorkspaceCollections();
  }
  return didRestore;
}

export async function performThreadDelete({
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
}: ThreadDeleteDeps): Promise<boolean> {
  if (!confirmDeleteThread(DELETE_THREAD_PROMPT)) {
    return false;
  }

  const deletingSelectedThread = selectedThreadId === threadId;
  closeThreadMenus();
  setThreadDeletePendingId(threadId);
  const didDelete = await deleteThread(threadId);
  setThreadDeletePendingId((current) => (current === threadId ? null : current));
  if (didDelete && threadRenameId === threadId) {
    cancelThreadRename();
  }
  if (didDelete) {
    if (deletingSelectedThread) {
      resetToStartSurface();
    }
    await refreshWorkspaceCollections();
  }
  return didDelete;
}

export { DELETE_THREAD_PROMPT };
