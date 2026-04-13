import type { DesktopThreadSnapshot } from "../../../main/contracts";

export type WorkspaceSidebarThread = {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly workspaceRoot?: string | null;
};

export type WorkspaceSidebarThreadSummary = Pick<
  DesktopThreadSnapshot,
  "id" | "title" | "updatedAt" | "updatedLabel" | "workspaceRoot" | "state" | "threadInputState"
>;

export function toWorkspaceSidebarThreadSummary(
  thread: WorkspaceSidebarThreadSummary,
): WorkspaceSidebarThreadSummary {
  return {
    id: thread.id,
    title: thread.title,
    updatedAt: thread.updatedAt,
    updatedLabel: thread.updatedLabel,
    workspaceRoot: thread.workspaceRoot,
    state: thread.state,
    threadInputState: thread.threadInputState,
  };
}

export type WorkspaceSidebarGroup<T extends WorkspaceSidebarThread = WorkspaceSidebarThread> = {
  readonly root: string;
  readonly threads: T[];
  readonly isActive: boolean;
};

export function shouldHideWorkspaceSidebarGroups(
  selectedThreadId: string | null,
  selectedThreadWorkspaceRoot: string | null,
): boolean {
  const selectedId = typeof selectedThreadId === "string" ? selectedThreadId.trim() : "";
  const selectedWorkspaceRoot = typeof selectedThreadWorkspaceRoot === "string"
    ? selectedThreadWorkspaceRoot.trim()
    : "";
  return Boolean(selectedId) && !selectedWorkspaceRoot;
}

export function resolveVisibleWorkspaceSidebarGroups<T extends WorkspaceSidebarThread>(
  workspaces: WorkspaceSidebarGroup<T>[],
  _activeWorkspaceRoot: string | null,
): WorkspaceSidebarGroup<T>[] {
  return workspaces;
}

export function resolveVisibleStandaloneSidebarThreads<T extends WorkspaceSidebarThread>(
  standalone: T[],
  selectedThreadId: string | null,
  selectedThreadWorkspaceRoot: string | null,
): T[] {
  const selectedId = typeof selectedThreadId === "string" ? selectedThreadId.trim() : "";
  const selectedWorkspaceRoot = typeof selectedThreadWorkspaceRoot === "string"
    ? selectedThreadWorkspaceRoot.trim()
    : "";
  if (!selectedId || selectedWorkspaceRoot) {
    return standalone;
  }

  const selectedThread = standalone.find((thread) => thread.id === selectedId);
  if (!selectedThread) {
    return standalone;
  }

  return [selectedThread, ...standalone.filter((thread) => thread.id !== selectedId)];
}

export function isWorkspaceSidebarGroupExpanded(params: {
  expandedWorkspaces: Record<string, boolean>;
  root: string;
  activeWorkspaceRoot: string | null;
}): boolean {
  const explicitValue = params.expandedWorkspaces[params.root];
  if (typeof explicitValue === "boolean") {
    return explicitValue;
  }

  const activeRoot = typeof params.activeWorkspaceRoot === "string" ? params.activeWorkspaceRoot.trim() : "";
  if (activeRoot) {
    return params.root === activeRoot;
  }

  return false;
}

function uniqueRoots(roots: Iterable<string | null | undefined>): string[] {
  const orderedRoots: string[] = [];
  const seen = new Set<string>();

  for (const entry of roots) {
    const root = typeof entry === "string" ? entry.trim() : "";
    if (!root || seen.has(root)) {
      continue;
    }

    seen.add(root);
    orderedRoots.push(root);
  }

  return orderedRoots;
}

function moveItem<T>(items: T[], index: number, direction: "up" | "down"): T[] {
  const offset = direction === "up" ? -1 : 1;
  const nextIndex = index + offset;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) {
    return items;
  }

  const nextItems = [...items];
  const [item] = nextItems.splice(index, 1);
  nextItems.splice(nextIndex, 0, item);
  return nextItems;
}

export function resolveWorkspaceBaseOrder(
  visibleRoots: string[],
  savedOrder: string[],
): string[] {
  const normalizedVisibleRoots = uniqueRoots(visibleRoots);
  const visibleRootSet = new Set(normalizedVisibleRoots);
  const prioritizedRoots = uniqueRoots(savedOrder).filter((root) => visibleRootSet.has(root));
  const prioritizedSet = new Set(prioritizedRoots);

  return [
    ...prioritizedRoots,
    ...normalizedVisibleRoots.filter((root) => !prioritizedSet.has(root)),
  ];
}

export function resolveWorkspaceDisplayOrder(
  baseOrder: string[],
  activeWorkspaceRoot: string | null,
): string[] {
  const normalizedBaseOrder = uniqueRoots(baseOrder);
  const activeRoot = typeof activeWorkspaceRoot === "string" ? activeWorkspaceRoot.trim() : "";
  if (!activeRoot || !normalizedBaseOrder.includes(activeRoot)) {
    return normalizedBaseOrder;
  }

  return [activeRoot, ...normalizedBaseOrder.filter((root) => root !== activeRoot)];
}

export function getWorkspaceMoveState(
  baseOrder: string[],
  activeWorkspaceRoot: string | null,
  root: string,
): { canMoveUp: boolean; canMoveDown: boolean } {
  const normalizedRoot = root.trim();
  if (!normalizedRoot) {
    return { canMoveUp: false, canMoveDown: false };
  }

  const activeRoot = typeof activeWorkspaceRoot === "string" ? activeWorkspaceRoot.trim() : "";
  if (activeRoot && normalizedRoot === activeRoot) {
    return { canMoveUp: false, canMoveDown: false };
  }

  const movableRoots = uniqueRoots(baseOrder).filter((entry) => entry !== activeRoot);
  const index = movableRoots.indexOf(normalizedRoot);
  if (index === -1) {
    return { canMoveUp: false, canMoveDown: false };
  }

  return {
    canMoveUp: index > 0,
    canMoveDown: index < movableRoots.length - 1,
  };
}

export function mergeWorkspaceOrder(
  savedOrder: string[],
  visibleRoots: string[],
  nextVisibleBaseOrder: string[],
): string[] {
  const normalizedSavedOrder = uniqueRoots(savedOrder);
  const visibleRootSet = new Set(uniqueRoots(visibleRoots));
  const replacementRoots = [...uniqueRoots(nextVisibleBaseOrder).filter((root) => visibleRootSet.has(root))];
  const nextOrder: string[] = [];

  for (const root of normalizedSavedOrder) {
    if (visibleRootSet.has(root)) {
      const replacement = replacementRoots.shift();
      if (replacement) {
        nextOrder.push(replacement);
      }
      continue;
    }

    nextOrder.push(root);
  }

  nextOrder.push(...replacementRoots);
  return uniqueRoots(nextOrder);
}

export function moveWorkspaceOrder(params: {
  savedOrder: string[];
  visibleRoots: string[];
  activeWorkspaceRoot: string | null;
  targetRoot: string;
  direction: "up" | "down";
}): string[] {
  const visibleRoots = uniqueRoots(params.visibleRoots);
  const baseOrder = resolveWorkspaceBaseOrder(visibleRoots, params.savedOrder);
  const activeRoot = typeof params.activeWorkspaceRoot === "string" ? params.activeWorkspaceRoot.trim() : "";
  const targetRoot = params.targetRoot.trim();
  if (!targetRoot || (activeRoot && targetRoot === activeRoot)) {
    return uniqueRoots(params.savedOrder);
  }

  const movableRoots = baseOrder.filter((root) => root !== activeRoot);
  const index = movableRoots.indexOf(targetRoot);
  if (index === -1) {
    return uniqueRoots(params.savedOrder);
  }

  const nextMovableRoots = moveItem(movableRoots, index, params.direction);
  if (nextMovableRoots === movableRoots || nextMovableRoots.join("\n") === movableRoots.join("\n")) {
    return uniqueRoots(params.savedOrder);
  }

  const nextVisibleBaseOrder = activeRoot
    ? baseOrder.map((root) => (root === activeRoot ? root : nextMovableRoots.shift() ?? root))
    : nextMovableRoots;

  return mergeWorkspaceOrder(params.savedOrder, visibleRoots, nextVisibleBaseOrder);
}

export function buildWorkspaceSidebarGroups<T extends WorkspaceSidebarThread>(params: {
  threads: T[];
  savedOrder: string[];
  activeWorkspaceRoot: string | null;
}): {
  workspaces: WorkspaceSidebarGroup<T>[];
  standalone: T[];
  baseOrder: string[];
  displayOrder: string[];
} {
  const groups = new Map<string, T[]>();
  const standalone: T[] = [];

  for (const thread of params.threads) {
    const root = typeof thread.workspaceRoot === "string" ? thread.workspaceRoot.trim() : "";
    if (!root) {
      standalone.push(thread);
      continue;
    }

    const existing = groups.get(root);
    if (existing) {
      existing.push(thread);
    } else {
      groups.set(root, [thread]);
    }
  }

  const activeRoot = typeof params.activeWorkspaceRoot === "string" ? params.activeWorkspaceRoot.trim() : "";
  const visibleRoots = uniqueRoots([
    ...groups.keys(),
    activeRoot || null,
  ]);
  const baseOrder = resolveWorkspaceBaseOrder(visibleRoots, params.savedOrder);
  const displayOrder = resolveWorkspaceDisplayOrder(baseOrder, activeRoot || null);

  return {
    workspaces: displayOrder.map((root) => ({
      root,
      threads: groups.get(root) ?? [],
      isActive: Boolean(activeRoot) && root === activeRoot,
    })),
    standalone,
    baseOrder,
    displayOrder,
  };
}
