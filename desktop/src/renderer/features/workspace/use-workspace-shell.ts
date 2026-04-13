import { useRef, useState, type Dispatch, type DragEvent, type SetStateAction } from "react";

import type {
  DesktopOperatingMode,
  DesktopThreadSnapshot,
  DesktopWorkspacePolicyRecord,
  ProjectedWorkspaceRecord,
  SubstrateWorkspaceRecord,
} from "../../../main/contracts";
import type { FolderOption } from "../../state/session/session-types.js";
import {
  buildWorkspaceSidebarGroups,
  isWorkspaceSidebarGroupExpanded,
  mergeWorkspaceOrder,
  resolveVisibleStandaloneSidebarThreads,
  resolveVisibleWorkspaceSidebarGroups,
  shouldHideWorkspaceSidebarGroups,
} from "./workspace-sidebar.ts";
import {
  buildWorkspaceIdByRoot,
  resolveActiveWorkspaceOperatingMode,
} from "./workspace-shell-state.ts";
import { useWorkspaceNavigation } from "./use-workspace-navigation.ts";

type UseWorkspaceShellArgs = {
  archiveWorkspace: (workspaceId: string) => Promise<boolean>;
  chooseDifferentFolderFromSession: () => Promise<FolderOption | null>;
  clearSelectedThread: () => Promise<void>;
  defaultOperatingMode: DesktopOperatingMode | null | undefined;
  deleteWorkspace: (workspaceId: string, options?: { workspaceRoot?: string | null }) => Promise<boolean>;
  filteredThreads: DesktopThreadSnapshot[];
  isSignedIn: boolean;
  knownWorkspaces: SubstrateWorkspaceRecord[];
  projectedWorkspaces: ProjectedWorkspaceRecord[];
  refreshWorkspaceCollections: () => Promise<void>;
  removeWorkspaceFromCollections: (workspaceId: string, workspaceRoot: string) => void;
  rememberWorkspaceSidebarOrder: (rootPaths: string[]) => Promise<boolean>;
  requestWorkspacePermission: (rootPath: string, displayName: string) => void;
  restoreWorkspace: (workspaceId: string) => Promise<boolean>;
  selectThread: (threadId: string, options?: { workspaceRoot?: string | null }) => Promise<void>;
  selectedThread: DesktopThreadSnapshot | null;
  setAttachedFiles: Dispatch<SetStateAction<string[]>>;
  setDraftPrompt: (value: string) => void;
  setFolderMenuOpen: Dispatch<SetStateAction<boolean>>;
  setTaskError: (value: string | null) => void;
  setWorkInFolder: Dispatch<SetStateAction<boolean>>;
  setWorkspaceOperatingMode: (rootPath: string, mode: DesktopOperatingMode) => Promise<DesktopWorkspacePolicyRecord | null>;
  setWorkspaceFolder: Dispatch<SetStateAction<string | null>>;
  threads: DesktopThreadSnapshot[];
  workInFolder: boolean;
  workspaceFolder: string | null;
  workspacePolicy: DesktopWorkspacePolicyRecord | null;
  workspaceSidebarOrder: string[];
};

type UseWorkspaceShellResult = {
  activeOperatingMode: DesktopOperatingMode | null;
  activeWorkspaceRoot: string | null;
  changeWorkspaceOperatingMode: (mode: DesktopOperatingMode) => Promise<void>;
  chooseDifferentFolder: () => Promise<void>;
  closeWorkspaceMenus: () => void;
  dragOverRoot: string | null;
  expandedWorkspaces: Record<string, boolean>;
  handleArchiveWorkspace: (workspaceId: string, workspaceRoot: string) => Promise<void>;
  handleDeleteWorkspace: (workspaceId: string, workspaceRoot: string) => Promise<void>;
  handleRestoreWorkspace: (workspaceId: string) => Promise<void>;
  handleWorkspaceDragEnd: (event: DragEvent) => void;
  handleWorkspaceDragLeave: () => void;
  handleWorkspaceDragOver: (event: DragEvent, root: string) => void;
  handleWorkspaceDragStart: (event: DragEvent, root: string) => void;
  handleWorkspaceDrop: (event: DragEvent, root: string) => Promise<void>;
  homeWorkspaceMenuOpenId: string | null;
  navigateToWorkspaceFolder: (path: string) => void;
  onNewThreadInWorkspace: (root: string) => void;
  pickRecentFolder: (path: string) => void;
  resetWorkspaceShell: () => void;
  resumeWorkspaceSession: ReturnType<typeof useWorkspaceNavigation>["resumeWorkspaceSession"];
  setHomeWorkspaceMenu: (value: string | null | ((current: string | null) => string | null)) => void;
  setSidebarWorkspaceMenu: (value: string | null | ((current: string | null) => string | null)) => void;
  sidebarWorkspaceMenuOpenId: string | null;
  toggleWorkspaceExpanded: (root: string) => void;
  visibleWorkspaceThreadGroups: {
    workspaces: ReturnType<typeof buildWorkspaceSidebarGroups<DesktopThreadSnapshot>>["workspaces"];
    standalone: DesktopThreadSnapshot[];
  };
  workspaceArchivePendingId: string | null;
  workspaceDeletePendingId: string | null;
  workspaceIdByRoot: Record<string, string>;
  workspaceRestorePendingId: string | null;
  workspaceThreadGroups: ReturnType<typeof buildWorkspaceSidebarGroups<DesktopThreadSnapshot>>;
};

export function useWorkspaceShell({
  archiveWorkspace,
  chooseDifferentFolderFromSession,
  clearSelectedThread,
  defaultOperatingMode,
  deleteWorkspace,
  filteredThreads,
  isSignedIn,
  knownWorkspaces,
  projectedWorkspaces,
  refreshWorkspaceCollections,
  removeWorkspaceFromCollections,
  rememberWorkspaceSidebarOrder,
  requestWorkspacePermission,
  restoreWorkspace,
  selectThread,
  selectedThread,
  setAttachedFiles,
  setDraftPrompt,
  setFolderMenuOpen,
  setTaskError,
  setWorkInFolder,
  setWorkspaceOperatingMode,
  setWorkspaceFolder,
  threads,
  workInFolder,
  workspaceFolder,
  workspacePolicy,
  workspaceSidebarOrder,
}: UseWorkspaceShellArgs): UseWorkspaceShellResult {
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Record<string, boolean>>({});
  const [sidebarWorkspaceMenuOpenId, setSidebarWorkspaceMenuOpenId] = useState<string | null>(null);
  const [homeWorkspaceMenuOpenId, setHomeWorkspaceMenuOpenId] = useState<string | null>(null);
  const [workspaceArchivePendingId, setWorkspaceArchivePendingId] = useState<string | null>(null);
  const [workspaceRestorePendingId, setWorkspaceRestorePendingId] = useState<string | null>(null);
  const [workspaceDeletePendingId, setWorkspaceDeletePendingId] = useState<string | null>(null);
  const [dragOverRoot, setDragOverRoot] = useState<string | null>(null);
  const draggedWorkspaceRef = useRef<string | null>(null);

  const activeWorkspaceRoot = selectedThread?.workspaceRoot ?? (workInFolder ? workspaceFolder : null);
  const workspaceIdByRoot = buildWorkspaceIdByRoot({ knownWorkspaces, projectedWorkspaces });
  const activeOperatingMode = resolveActiveWorkspaceOperatingMode({
    defaultOperatingMode,
    selectedThreadWorkspaceRoot: selectedThread?.workspaceRoot,
    workspacePolicy,
  });
  const {
    chooseDifferentFolder,
    navigateToWorkspaceFolder,
    onNewThreadInWorkspace,
    pickRecentFolder,
    resetWorkspaceShell: resetWorkspaceNavigation,
    resumeWorkspaceSession,
  } = useWorkspaceNavigation({
    chooseDifferentFolderFromSession,
    clearSelectedThread,
    isSignedIn,
    projectedWorkspaces,
    requestWorkspacePermission,
    selectThread,
    setAttachedFiles,
    setDraftPrompt,
    setFolderMenuOpen,
    setTaskError,
    setWorkInFolder,
    setWorkspaceFolder,
    threads,
    workInFolder,
  });

  const workspaceThreadGroups = buildWorkspaceSidebarGroups({
    threads: filteredThreads,
    savedOrder: workspaceSidebarOrder,
    activeWorkspaceRoot,
  });
  const hideWorkspaceSidebarGroups = shouldHideWorkspaceSidebarGroups(
    selectedThread?.id ?? null,
    selectedThread?.workspaceRoot ?? null,
  );
  const visibleWorkspaceThreadGroups = {
    ...workspaceThreadGroups,
    workspaces: hideWorkspaceSidebarGroups
      ? []
      : resolveVisibleWorkspaceSidebarGroups(workspaceThreadGroups.workspaces, activeWorkspaceRoot),
    standalone: resolveVisibleStandaloneSidebarThreads(
      workspaceThreadGroups.standalone,
      selectedThread?.id ?? null,
      selectedThread?.workspaceRoot ?? null,
    ),
  };

  function setSidebarWorkspaceMenu(value: string | null | ((current: string | null) => string | null)) {
    setSidebarWorkspaceMenuOpenId((current) => (typeof value === "function" ? value(current) : value));
    setHomeWorkspaceMenuOpenId(null);
  }

  function setHomeWorkspaceMenu(value: string | null | ((current: string | null) => string | null)) {
    setHomeWorkspaceMenuOpenId((current) => (typeof value === "function" ? value(current) : value));
    setSidebarWorkspaceMenuOpenId(null);
  }

  function closeWorkspaceMenus() {
    setSidebarWorkspaceMenuOpenId(null);
    setHomeWorkspaceMenuOpenId(null);
  }

  function resetWorkspaceShell() {
    resetWorkspaceNavigation();
    closeWorkspaceMenus();
  }

  function toggleWorkspaceExpanded(root: string) {
    setExpandedWorkspaces((prev) => ({
      ...prev,
      [root]: !isWorkspaceSidebarGroupExpanded({
        expandedWorkspaces: prev,
        root,
        activeWorkspaceRoot,
      }),
    }));
  }

  async function changeWorkspaceOperatingMode(mode: DesktopOperatingMode) {
    if (!selectedThread?.workspaceRoot) {
      return;
    }

    await setWorkspaceOperatingMode(selectedThread.workspaceRoot, mode);
  }

  async function handleArchiveWorkspace(workspaceId: string, workspaceRoot: string) {
    if (!window.confirm("Archive this workspace? It will leave the normal workspace and thread lists, but you can restore it later.")) {
      return;
    }
    closeWorkspaceMenus();
    setWorkspaceArchivePendingId(workspaceId);
    const didArchive = await archiveWorkspace(workspaceId);
    setWorkspaceArchivePendingId((current) => (current === workspaceId ? null : current));
    if (didArchive && activeWorkspaceRoot === workspaceRoot) {
      resetWorkspaceShell();
    }
    if (didArchive) {
      await refreshWorkspaceCollections();
    }
  }

  async function handleRestoreWorkspace(workspaceId: string) {
    closeWorkspaceMenus();
    setWorkspaceRestorePendingId(workspaceId);
    const didRestore = await restoreWorkspace(workspaceId);
    setWorkspaceRestorePendingId((current) => (current === workspaceId ? null : current));
    if (didRestore) {
      await refreshWorkspaceCollections();
    }
  }

  async function handleDeleteWorkspace(workspaceId: string, workspaceRoot: string) {
    if (!window.confirm("Delete this workspace from Sense-1 permanently? The local folder stays on disk, but Sense-1 will remove its saved threads, sessions, and app-owned artifacts for this workspace.")) {
      return;
    }
    closeWorkspaceMenus();
    setWorkspaceDeletePendingId(workspaceId);
    const didDelete = await deleteWorkspace(workspaceId, { workspaceRoot });
    setWorkspaceDeletePendingId((current) => (current === workspaceId ? null : current));
    if (didDelete && activeWorkspaceRoot === workspaceRoot) {
      resetWorkspaceShell();
    }
    if (didDelete) {
      removeWorkspaceFromCollections(workspaceId, workspaceRoot);
      await refreshWorkspaceCollections();
    }
  }

  function handleWorkspaceDragStart(event: DragEvent, root: string) {
    if (root === activeWorkspaceRoot) {
      event.preventDefault();
      return;
    }
    draggedWorkspaceRef.current = root;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", root);
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.opacity = "0.5";
    }
  }

  function handleWorkspaceDragEnd(event: DragEvent) {
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.opacity = "";
    }
    draggedWorkspaceRef.current = null;
    setDragOverRoot(null);
  }

  function handleWorkspaceDragOver(event: DragEvent, root: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (draggedWorkspaceRef.current && draggedWorkspaceRef.current !== root) {
      setDragOverRoot(root);
    }
  }

  function handleWorkspaceDragLeave() {
    setDragOverRoot(null);
  }

  async function handleWorkspaceDrop(event: DragEvent, targetRoot: string) {
    event.preventDefault();
    setDragOverRoot(null);
    const sourceRoot = draggedWorkspaceRef.current;
    draggedWorkspaceRef.current = null;
    if (!sourceRoot || sourceRoot === targetRoot) {
      return;
    }

    const visibleRoots = visibleWorkspaceThreadGroups.workspaces.map((group) => group.root);
    const currentOrder = [...visibleRoots];
    const sourceIndex = currentOrder.indexOf(sourceRoot);
    const targetIndex = currentOrder.indexOf(targetRoot);
    if (sourceIndex === -1 || targetIndex === -1) {
      return;
    }

    currentOrder.splice(sourceIndex, 1);
    currentOrder.splice(targetIndex, 0, sourceRoot);

    const nextOrder = mergeWorkspaceOrder(workspaceSidebarOrder, visibleRoots, currentOrder);
    if (nextOrder.join("\n") !== workspaceSidebarOrder.join("\n")) {
      await rememberWorkspaceSidebarOrder(nextOrder);
    }
  }

  return {
    activeOperatingMode,
    activeWorkspaceRoot,
    changeWorkspaceOperatingMode,
    chooseDifferentFolder,
    closeWorkspaceMenus,
    dragOverRoot,
    expandedWorkspaces,
    handleArchiveWorkspace,
    handleDeleteWorkspace,
    handleRestoreWorkspace,
    handleWorkspaceDragEnd,
    handleWorkspaceDragLeave,
    handleWorkspaceDragOver,
    handleWorkspaceDragStart,
    handleWorkspaceDrop,
    homeWorkspaceMenuOpenId,
    navigateToWorkspaceFolder,
    onNewThreadInWorkspace,
    pickRecentFolder,
    resetWorkspaceShell,
    resumeWorkspaceSession,
    setHomeWorkspaceMenu,
    setSidebarWorkspaceMenu,
    sidebarWorkspaceMenuOpenId,
    toggleWorkspaceExpanded,
    visibleWorkspaceThreadGroups,
    workspaceArchivePendingId,
    workspaceDeletePendingId,
    workspaceIdByRoot,
    workspaceRestorePendingId,
    workspaceThreadGroups,
  };
}
