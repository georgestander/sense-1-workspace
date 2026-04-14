import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type {
  DesktopBootstrap,
  DesktopBootstrapTenant,
  DesktopBootstrapTeamSetup,
  DesktopRunContext,
  DesktopWorkspacePolicyRecord,
} from "../../../main/contracts";
import { requireDesktopBridge } from "./desktop-bridge.js";
import { mapFolderOptions, mapThreadSummaries, mergeThreadDetails, reconcileRecentFoldersWithBootstrap, reconcileThreadSummariesWithBootstrap, upsertThread } from "../threads/thread-summary-state.js";
import type { FolderOption, PendingApproval, ProfileOption, RuntimeSetupState, RuntimeStatus, SidebarState, TeamSetupIdentity, TenantIdentity, ThreadRecord } from "./session-types.js";
import { resolveEffectiveTeamSetup, resolveEffectiveTenant } from "./tenant-identity.js";

type PendingPermissionState = {
  rootPath: string;
  displayName: string;
  originalRequest: { prompt: string; threadId?: string | null; workspaceRoot?: string | null };
} | null;

type ThreadDeltaBuffer = {
  clear: () => void;
  drain: (threadId: string) => Iterable<unknown>;
  dropThread: (threadId: string) => void;
  rememberKnownThreadIds: (threadIds: Iterable<string>) => void;
};

export type DesktopSessionBootstrapApplyOptions = {
  preferredThreadId?: string | null;
  restoreSelection?: boolean;
  pruneMissing?: boolean;
  replaceSessionState?: boolean;
  preserveSignedInShell?: boolean;
};

export function applyBootstrap(
  deps: {
    accountEmail: string | null;
    accountType: string | null;
    continuePending: boolean;
    isSignedIn: boolean;
    logoutPending: boolean;
    runContext: DesktopRunContext | null;
    teamSetup: DesktopBootstrapTeamSetup;
    tenant: DesktopBootstrapTenant | null;
    selectedProfileId: string;
    selectedThreadIdRef: MutableRefObject<string | null>;
    signInPending: boolean;
    hasRestoredInitialSelectionRef: MutableRefObject<boolean>;
    flushPendingThreadDeltas: (threadId: string) => void;
    rememberKnownThreadIds: (threadIds: Iterable<string>, options?: { replace?: boolean }) => void;
    setAccountEmail: Dispatch<SetStateAction<string | null>>;
    setAccountType: Dispatch<SetStateAction<string | null>>;
    setActiveTurnIdsByThread: Dispatch<SetStateAction<Record<string, string>>>;
    setIsSignedIn: Dispatch<SetStateAction<boolean>>;
    setPendingApprovals: Dispatch<SetStateAction<PendingApproval[]>>;
    setPerThreadSidebar: Dispatch<SetStateAction<Record<string, SidebarState>>>;
    setProfileOptions: Dispatch<SetStateAction<ProfileOption[]>>;
    setProfileFieldValue: Dispatch<SetStateAction<string>>;
    setRecentFolders: Dispatch<SetStateAction<FolderOption[]>>;
    setRunContext: Dispatch<SetStateAction<DesktopRunContext | null>>;
    setRuntimeSetup: Dispatch<SetStateAction<RuntimeSetupState>>;
    setRuntimeStatus: Dispatch<SetStateAction<RuntimeStatus>>;
    setSelectedProfileId: Dispatch<SetStateAction<string>>;
    setSelectedThreadId: Dispatch<SetStateAction<string | null>>;
    setTeamSetup: Dispatch<SetStateAction<TeamSetupIdentity>>;
    setTenant: Dispatch<SetStateAction<TenantIdentity>>;
    setTaskError: (value: string | null) => void;
    setThreads: Dispatch<SetStateAction<ThreadRecord[]>>;
    setWorkspaceSidebarOrder: Dispatch<SetStateAction<string[]>>;
    threadDeltaBufferRef: MutableRefObject<ThreadDeltaBuffer>;
  },
  bootstrap: DesktopBootstrap,
  options: DesktopSessionBootstrapApplyOptions = {},
) {
  const shouldReplaceSessionState =
    options.replaceSessionState || (deps.selectedProfileId.trim() && deps.selectedProfileId !== bootstrap.profileId);
  const shouldPreserveSignedInShell =
    options.preserveSignedInShell !== false &&
    !shouldReplaceSessionState &&
    deps.isSignedIn &&
    !bootstrap.isSignedIn &&
    !deps.logoutPending &&
    !deps.signInPending &&
    !deps.continuePending &&
    bootstrap.runtimeSetup?.code !== "auth_restore_failed";
  const nextThreadSummaries = mapThreadSummaries(bootstrap.recentThreads);
  const nextFolderOptions = mapFolderOptions(bootstrap.recentFolders);
  const nextSelectedThread = bootstrap.selectedThread;
  const nextSelectedThreadSidebar = nextSelectedThread
    ? {
        planState: nextSelectedThread.planState ?? null,
        diffState: nextSelectedThread.diffState ?? null,
        inputRequestState: nextSelectedThread.inputRequestState
          ? {
              requestId: nextSelectedThread.inputRequestState.requestId,
              prompt: nextSelectedThread.inputRequestState.prompt,
              threadId: nextSelectedThread.inputRequestState.threadId,
              questions: nextSelectedThread.inputRequestState.questions,
            }
          : null,
      }
    : null;
  const nextPendingApprovals = bootstrap.pendingApprovals.map((approval) => approval);
  const effectiveIsSignedIn = shouldPreserveSignedInShell ? true : bootstrap.isSignedIn;
  const effectiveAccountEmail = shouldPreserveSignedInShell ? deps.accountEmail : bootstrap.accountEmail;
  const effectiveAccountType = shouldPreserveSignedInShell ? deps.accountType : bootstrap.auth.accountType;
  const effectiveRunContext = shouldPreserveSignedInShell ? (bootstrap.runContext ?? deps.runContext) : bootstrap.runContext;
  const effectiveTenant = resolveEffectiveTenant({
    bootstrapTenant: bootstrap.tenant,
    preserveSignedInShell: shouldPreserveSignedInShell,
    currentTenant: deps.tenant,
  });
  const effectiveTeamSetup = resolveEffectiveTeamSetup({
    bootstrapTeamSetup: bootstrap.teamSetup,
    preserveSignedInShell: shouldPreserveSignedInShell,
    currentTeamSetup: deps.teamSetup,
  });
  const shouldPruneMissing =
    options.pruneMissing === true || shouldReplaceSessionState || !effectiveIsSignedIn;
  const bootstrapThreadIds = [
    ...nextThreadSummaries.map((thread) => thread.id),
    ...(nextSelectedThread ? [nextSelectedThread.id] : []),
  ];

  if (shouldReplaceSessionState || !effectiveIsSignedIn) {
    deps.threadDeltaBufferRef.current.clear();
  }
  deps.rememberKnownThreadIds(bootstrapThreadIds, { replace: shouldReplaceSessionState || !effectiveIsSignedIn });

  deps.setRuntimeStatus(bootstrap.runtimeStatus);
  deps.setRuntimeSetup(bootstrap.runtimeSetup);
  deps.setIsSignedIn(effectiveIsSignedIn);
  deps.setAccountEmail(effectiveAccountEmail);
  deps.setAccountType(effectiveAccountType);
  deps.setProfileOptions(bootstrap.profileOptions);
  deps.setSelectedProfileId(bootstrap.profileId);
  deps.setProfileFieldValue((current) => (shouldReplaceSessionState ? bootstrap.profileId : current || bootstrap.profileId));
  deps.setRunContext(effectiveRunContext);
  deps.setTeamSetup(effectiveTeamSetup);
  deps.setTenant(effectiveTenant);
  deps.setThreads((current) => {
    const mergedThreads = reconcileThreadSummariesWithBootstrap(current, nextThreadSummaries, {
      pruneMissing: shouldPruneMissing,
    });
    if (!nextSelectedThread) {
      return mergedThreads;
    }
    const existingThread =
      current.find((thread) => thread.id === nextSelectedThread.id) ??
      mergedThreads.find((thread) => thread.id === nextSelectedThread.id);
    return upsertThread(mergedThreads, mergeThreadDetails(existingThread, nextSelectedThread));
  });
  deps.setRecentFolders((current) =>
    reconcileRecentFoldersWithBootstrap(current, nextFolderOptions, { pruneMissing: shouldPruneMissing }),
  );
  deps.setWorkspaceSidebarOrder(bootstrap.workspaceSidebarOrder ?? []);
  deps.setPendingApprovals(nextPendingApprovals);
  deps.setPerThreadSidebar((current) => {
    const base =
      shouldReplaceSessionState || !effectiveIsSignedIn
        ? {}
        : shouldPruneMissing
          ? Object.fromEntries(
              Object.entries(current).filter(([threadId]) => bootstrapThreadIds.includes(threadId)),
            )
          : { ...current };
    if (!nextSelectedThread || !nextSelectedThreadSidebar) {
      return base;
    }

    base[nextSelectedThread.id] = nextSelectedThreadSidebar;
    return base;
  });

  if (options.restoreSelection) {
    const preferredThreadId = options.preferredThreadId?.trim() || null;
    const currentSelectedThreadId =
      !shouldReplaceSessionState && effectiveIsSignedIn
        ? deps.selectedThreadIdRef.current?.trim() || null
        : null;
    const currentSelectionStillVisible =
      currentSelectedThreadId &&
      (nextSelectedThread?.id === currentSelectedThreadId ||
        nextThreadSummaries.some((thread) => thread.id === currentSelectedThreadId))
        ? currentSelectedThreadId
        : null;
    const restoreThreadId =
      bootstrap.lastSelectedThreadId &&
      (nextSelectedThread?.id === bootstrap.lastSelectedThreadId ||
        nextThreadSummaries.some((thread) => thread.id === bootstrap.lastSelectedThreadId))
        ? bootstrap.lastSelectedThreadId
        : preferredThreadId || currentSelectionStillVisible;
    deps.setSelectedThreadId(restoreThreadId);
    deps.selectedThreadIdRef.current = restoreThreadId;
    deps.hasRestoredInitialSelectionRef.current = true;
  }

  if (shouldReplaceSessionState || !effectiveIsSignedIn) {
    deps.setActiveTurnIdsByThread({});
    deps.setTaskError(null);
  }

  if (shouldReplaceSessionState && !options.restoreSelection) {
    deps.setSelectedThreadId(null);
    deps.selectedThreadIdRef.current = null;
  }

  if (!effectiveIsSignedIn) {
    deps.setSelectedThreadId(null);
    deps.selectedThreadIdRef.current = null;
  }

  for (const threadId of bootstrapThreadIds) {
    deps.flushPendingThreadDeltas(threadId);
  }
}

export async function refreshBootstrap(
  deps: {
    bootstrapRequestIdRef: MutableRefObject<number>;
    applyBootstrap: (bootstrap: DesktopBootstrap, options?: DesktopSessionBootstrapApplyOptions) => void;
    setBootstrapError: (value: string | null) => void;
  },
  options: DesktopSessionBootstrapApplyOptions = {},
): Promise<DesktopBootstrap | null> {
  const requestId = ++deps.bootstrapRequestIdRef.current;
  try {
    const bridge = requireDesktopBridge();
    const bootstrap = await bridge.session.get();
    if (requestId !== deps.bootstrapRequestIdRef.current) {
      return null;
    }
    deps.applyBootstrap(bootstrap, {
      ...options,
      pruneMissing: options.pruneMissing ?? false,
    });
    deps.setBootstrapError(null);
    return bootstrap;
  } catch (error) {
    if (requestId !== deps.bootstrapRequestIdRef.current) {
      return null;
    }
    deps.setBootstrapError(error instanceof Error ? error.message : "Could not refresh desktop bootstrap.");
    return null;
  }
}

export async function fetchWorkspacePolicy(
  rootPath: string,
  deps: {
    setWorkspacePolicy: Dispatch<SetStateAction<DesktopWorkspacePolicyRecord | null>>;
  },
): Promise<DesktopWorkspacePolicyRecord | null> {
  try {
    const bridge = requireDesktopBridge();
    const result = await bridge.workspace.getPolicy({ rootPath });
    deps.setWorkspacePolicy(result.policy);
    return result.policy;
  } catch {
    return null;
  }
}

export async function removeThreadFromLocalState(
  threadId: string,
  deps: {
    selectedThreadIdRef: MutableRefObject<string | null>;
    threadDeltaBufferRef: MutableRefObject<ThreadDeltaBuffer>;
    setActiveTurnIdsByThread: Dispatch<SetStateAction<Record<string, string>>>;
    setPendingApprovals: Dispatch<SetStateAction<PendingApproval[]>>;
    setPerThreadSidebar: Dispatch<SetStateAction<Record<string, SidebarState>>>;
    setSelectedThreadId: Dispatch<SetStateAction<string | null>>;
    setThreads: Dispatch<SetStateAction<ThreadRecord[]>>;
  },
): Promise<void> {
  deps.threadDeltaBufferRef.current.dropThread(threadId);
  deps.setThreads((current) => current.filter((thread) => thread.id !== threadId));
  deps.setPendingApprovals((current) => current.filter((approval) => approval.threadId !== threadId));
  deps.setPerThreadSidebar((current) => {
    if (!(threadId in current)) {
      return current;
    }
    const next = { ...current };
    delete next[threadId];
    return next;
  });
  deps.setActiveTurnIdsByThread((current) => {
    if (!(threadId in current)) {
      return current;
    }
    const next = { ...current };
    delete next[threadId];
    return next;
  });
  if (deps.selectedThreadIdRef.current === threadId) {
    deps.setSelectedThreadId(null);
    deps.selectedThreadIdRef.current = null;
    const bridge = requireDesktopBridge();
    await bridge.threads.rememberLastSelected({ threadId: null });
  }
}

export async function removeWorkspaceFromLocalState(
  workspaceRoot: string,
  deps: {
    selectedThreadIdRef: MutableRefObject<string | null>;
    threadDeltaBufferRef: MutableRefObject<ThreadDeltaBuffer>;
    setActiveTurnIdsByThread: Dispatch<SetStateAction<Record<string, string>>>;
    setPendingApprovals: Dispatch<SetStateAction<PendingApproval[]>>;
    setPerThreadSidebar: Dispatch<SetStateAction<Record<string, SidebarState>>>;
    setRecentFolders: Dispatch<SetStateAction<FolderOption[]>>;
    setSelectedThreadId: Dispatch<SetStateAction<string | null>>;
    setThreads: Dispatch<SetStateAction<ThreadRecord[]>>;
    setWorkspaceSidebarOrder: Dispatch<SetStateAction<string[]>>;
  },
  threads: ThreadRecord[],
): Promise<void> {
  const resolvedWorkspaceRoot = workspaceRoot.trim();
  if (!resolvedWorkspaceRoot) {
    return;
  }

  const deletedThreadIds = new Set(
    threads
      .filter((thread) => thread.workspaceRoot === resolvedWorkspaceRoot)
      .map((thread) => thread.id),
  );
  for (const threadId of deletedThreadIds) {
    deps.threadDeltaBufferRef.current.dropThread(threadId);
  }

  deps.setThreads((current) => current.filter((thread) => thread.workspaceRoot !== resolvedWorkspaceRoot));
  deps.setPendingApprovals((current) => current.filter((approval) => !deletedThreadIds.has(approval.threadId)));
  deps.setPerThreadSidebar((current) => Object.fromEntries(
    Object.entries(current).filter(([threadId]) => !deletedThreadIds.has(threadId)),
  ));
  deps.setActiveTurnIdsByThread((current) => Object.fromEntries(
    Object.entries(current).filter(([threadId]) => !deletedThreadIds.has(threadId)),
  ));
  deps.setRecentFolders((current) => current.filter((folder) => folder.path !== resolvedWorkspaceRoot));
  deps.setWorkspaceSidebarOrder((current) => current.filter((rootPath) => rootPath !== resolvedWorkspaceRoot));

  if (deps.selectedThreadIdRef.current && deletedThreadIds.has(deps.selectedThreadIdRef.current)) {
    deps.setSelectedThreadId(null);
    deps.selectedThreadIdRef.current = null;
    const bridge = requireDesktopBridge();
    await bridge.threads.rememberLastSelected({ threadId: null });
  }
}
