import { useCallback, useMemo, useRef, useState, type Dispatch, type DragEvent, type SetStateAction } from "react";

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
  toWorkspaceSidebarThreadSummary,
  type WorkspaceSidebarThreadSummary,
} from "./workspace-sidebar.ts";
import {
  buildWorkspaceIdByRoot,
  resolveActiveWorkspaceOperatingMode,
} from "./workspace-shell-state.ts";
import { useWorkspaceNavigation } from "./use-workspace-navigation.ts";
import { perfMeasure } from "../../lib/perf-debug.ts";

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
    workspaces: ReturnType<typeof buildWorkspaceSidebarGroups<WorkspaceSidebarThreadSummary>>["workspaces"];
    standalone: WorkspaceSidebarThreadSummary[];
  };
  workspaceArchivePendingId: string | null;
  workspaceDeletePendingId: string | null;
  workspaceIdByRoot: Record<string, string>;
  workspaceRestorePendingId: string | null;
  workspaceThreadGroups: ReturnType<typeof buildWorkspaceSidebarGroups<WorkspaceSidebarThreadSummary>>;
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
  const previousSidebarThreadSummariesRef = useRef<WorkspaceSidebarThreadSummary[]>([]);

  const activeWorkspaceRoot = selectedThread?.workspaceRoot ?? (workInFolder ? workspaceFolder : null);
  const workspaceIdByRoot = useMemo(
    () => buildWorkspaceIdByRoot({ knownWorkspaces, projectedWorkspaces }),
    [knownWorkspaces, projectedWorkspaces],
  );
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

  const filteredSidebarThreads = useMemo(
    () => perfMeasure(
      "workspace-sidebar.thread-summary",
      () => {
        const previousSummaries = previousSidebarThreadSummariesRef.current;
        const previousSummariesById = new Map(previousSummaries.map((summary) => [summary.id, summary]));
        const nextSummaries = filteredThreads.map((thread) => (
          toWorkspaceSidebarThreadSummary(thread, previousSummariesById.get(thread.id))
        ));
        const isUnchanged = previousSummaries.length === nextSummaries.length
          && previousSummaries.every((summary, index) => summary === nextSummaries[index]);
        if (isUnchanged) {
          return previousSummaries;
        }
        previousSidebarThreadSummariesRef.current = nextSummaries;
        return nextSummaries;
      },
      {
        logThresholdMs: 16,
        details: () => ({
          filteredThreadCount: filteredThreads.length,
        }),
      },
    ),
    [filteredThreads],
  );
  const workspaceThreadGroups = useMemo(
    () => {
      let traceDetails: Record<string, unknown> | null = null;
      return perfMeasure(
        "workspace-sidebar.groups",
        () => {
          const groups = buildWorkspaceSidebarGroups({
            threads: filteredSidebarThreads,
            savedOrder: workspaceSidebarOrder,
            activeWorkspaceRoot,
          });
          traceDetails = {
            activeWorkspaceRoot,
            baseOrderCount: groups.baseOrder.length,
            displayOrderCount: groups.displayOrder.length,
            filteredThreadCount: filteredSidebarThreads.length,
            savedOrderCount: workspaceSidebarOrder.length,
            standaloneCount: groups.standalone.length,
            workspaceCount: groups.workspaces.length,
          };
          return groups;
        },
        {
          logThresholdMs: 24,
          details: () => traceDetails ?? {
            activeWorkspaceRoot,
            filteredThreadCount: filteredSidebarThreads.length,
            savedOrderCount: workspaceSidebarOrder.length,
          },
        },
      );
    },
    [activeWorkspaceRoot, filteredSidebarThreads, workspaceSidebarOrder],
  );
  const hideWorkspaceSidebarGroups = shouldHideWorkspaceSidebarGroups(
    selectedThread?.id ?? null,
    selectedThread?.workspaceRoot ?? null,
  );
  const visibleWorkspaceThreadGroups = useMemo(() => perfMeasure(
    "workspace-sidebar.visible-groups",
    () => ({
      ...workspaceThreadGroups,
      workspaces: hideWorkspaceSidebarGroups
        ? []
        : resolveVisibleWorkspaceSidebarGroups(workspaceThreadGroups.workspaces, activeWorkspaceRoot),
      standalone: resolveVisibleStandaloneSidebarThreads(
        workspaceThreadGroups.standalone,
        selectedThread?.id ?? null,
        selectedThread?.workspaceRoot ?? null,
      ),
    }),
    {
      logThresholdMs: 16,
      details: () => ({
        activeWorkspaceRoot,
        hideWorkspaceSidebarGroups,
        selectedThreadId: selectedThread?.id ?? null,
        standaloneCount: workspaceThreadGroups.standalone.length,
        workspaceCount: workspaceThreadGroups.workspaces.length,
      }),
    },
  ), [
    activeWorkspaceRoot,
    hideWorkspaceSidebarGroups,
    selectedThread?.id,
    selectedThread?.workspaceRoot,
    workspaceThreadGroups,
  ]);

  const setSidebarWorkspaceMenu = useCallback((value: string | null | ((current: string | null) => string | null)) => {
    setSidebarWorkspaceMenuOpenId((current) => (typeof value === "function" ? value(current) : value));
    setHomeWorkspaceMenuOpenId(null);
  }, []);

  const setHomeWorkspaceMenu = useCallback((value: string | null | ((current: string | null) => string | null)) => {
    setHomeWorkspaceMenuOpenId((current) => (typeof value === "function" ? value(current) : value));
    setSidebarWorkspaceMenuOpenId(null);
  }, []);

  const closeWorkspaceMenus = useCallback(() => {
    setSidebarWorkspaceMenuOpenId(null);
    setHomeWorkspaceMenuOpenId(null);
  }, []);

  const resetWorkspaceShell = useCallback(() => {
    resetWorkspaceNavigation();
    closeWorkspaceMenus();
  }, [closeWorkspaceMenus, resetWorkspaceNavigation]);

  const toggleWorkspaceExpanded = useCallback((root: string) => {
    setExpandedWorkspaces((prev) => ({
      ...prev,
      [root]: !isWorkspaceSidebarGroupExpanded({
        expandedWorkspaces: prev,
        root,
        activeWorkspaceRoot,
      }),
    }));
  }, [activeWorkspaceRoot]);

  const changeWorkspaceOperatingMode = useCallback(async (mode: DesktopOperatingMode) => {
    if (!selectedThread?.workspaceRoot) {
      return;
    }

    await setWorkspaceOperatingMode(selectedThread.workspaceRoot, mode);
  }, [selectedThread?.workspaceRoot, setWorkspaceOperatingMode]);

  const handleArchiveWorkspace = useCallback(async (workspaceId: string, workspaceRoot: string) => {
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
  }, [activeWorkspaceRoot, archiveWorkspace, closeWorkspaceMenus, refreshWorkspaceCollections, resetWorkspaceShell]);

  const handleRestoreWorkspace = useCallback(async (workspaceId: string) => {
    closeWorkspaceMenus();
    setWorkspaceRestorePendingId(workspaceId);
    const didRestore = await restoreWorkspace(workspaceId);
    setWorkspaceRestorePendingId((current) => (current === workspaceId ? null : current));
    if (didRestore) {
      await refreshWorkspaceCollections();
    }
  }, [closeWorkspaceMenus, refreshWorkspaceCollections, restoreWorkspace]);

  const handleDeleteWorkspace = useCallback(async (workspaceId: string, workspaceRoot: string) => {
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
  }, [
    activeWorkspaceRoot,
    closeWorkspaceMenus,
    deleteWorkspace,
    refreshWorkspaceCollections,
    removeWorkspaceFromCollections,
    resetWorkspaceShell,
  ]);

  const handleWorkspaceDragStart = useCallback((event: DragEvent, root: string) => {
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
  }, [activeWorkspaceRoot]);

  const handleWorkspaceDragEnd = useCallback((event: DragEvent) => {
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.opacity = "";
    }
    draggedWorkspaceRef.current = null;
    setDragOverRoot(null);
  }, []);

  const handleWorkspaceDragOver = useCallback((event: DragEvent, root: string) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (draggedWorkspaceRef.current && draggedWorkspaceRef.current !== root) {
      setDragOverRoot(root);
    }
  }, []);

  const handleWorkspaceDragLeave = useCallback(() => {
    setDragOverRoot(null);
  }, []);

  const handleWorkspaceDrop = useCallback(async (event: DragEvent, targetRoot: string) => {
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
  }, [rememberWorkspaceSidebarOrder, visibleWorkspaceThreadGroups.workspaces, workspaceSidebarOrder]);

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
