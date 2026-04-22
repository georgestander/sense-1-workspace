import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  DesktopAuthLoginMethod,
  DesktopBootstrap,
  DesktopIdentityState,
  DesktopModelEntry,
  DesktopRunContext,
  DesktopBootstrapTeamSetup,
  DesktopUpdateState,
  DesktopWorkspacePolicyRecord,
} from "../main/contracts";
import { buildProgressSummary, formatUpdatedLabel } from "./lib/live-thread-data.js";
import {
  folderDisplayName,
  runtimeSetupGuidance,
} from "./state/session/session-selectors.js";
import type {
  FolderOption,
  PendingApproval,
  ProfileOption,
  RuntimeSetupState,
  RuntimeStatus,
  SidebarState,
  TenantIdentity,
  ThreadRecord,
} from "./state/session/session-types.js";
import { sortThreads } from "./state/threads/thread-summary-state.js";
import {
  normalizeModelCatalog,
  readCachedModelCatalog,
  writeCachedModelCatalog,
} from "./lib/model-catalog.js";
import { perfCount, perfMeasure } from "./lib/perf-debug.ts";
import { listVisibleSubstrateSessions } from "./features/workspace/substrate-thread-enrichment.js";
import { createDesktopSessionActions } from "./features/session/use-desktop-session-actions.js";
import { DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE, getDesktopBridge, requireDesktopBridge } from "./state/session/desktop-bridge.js";
import {
  applyBootstrap as applyDesktopBootstrap,
  fetchWorkspacePolicy as fetchDesktopWorkspacePolicy,
  refreshBootstrap as refreshDesktopBootstrap,
  removeThreadFromLocalState as removeDesktopThreadFromLocalState,
  removeWorkspaceFromLocalState as removeDesktopWorkspaceFromLocalState,
} from "./state/session/session-lifecycle.js";
import { DEFAULT_TEAM_SETUP_IDENTITY } from "./state/session/tenant-identity.js";
import { useSessionShellEffects } from "./state/session/use-session-shell-effects.js";
import { buildDesktopSessionViewState } from "./state/session/session-view-state.js";
import { installSessionStream } from "./state/session/session-stream.js";

export type {
  FolderOption,
  PendingApproval,
  ProfileOption,
  RuntimeSetupState,
  RuntimeStatus,
  SidebarState,
  ThreadRecord,
} from "./state/session/session-types.js";
export {
  folderDisplayName,
  runtimeSetupGuidance,
  shouldShowRightRail,
} from "./state/session/session-selectors.js";
export {
  createThreadRecord,
  mapFolderOptions,
  mapThreadSummaries,
  mergeThreadDetails,
  reconcileRecentFoldersWithBootstrap,
  reconcileThreadSummariesWithBootstrap,
  sortThreads,
  upsertRecentFolderOptions,
  upsertThread,
} from "./state/threads/thread-summary-state.js";

export function useDesktopSessionState({
  model,
  reasoningEffort,
  serviceTier,
}: {
  model: string;
  reasoningEffort: string;
  serviceTier: "flex" | "fast";
}) {
  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const [activeTurnIdsByThread, setActiveTurnIdsByThread] = useState<Record<string, string>>({});
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [recentFolders, setRecentFolders] = useState<FolderOption[]>([]);
  const [workspaceSidebarOrder, setWorkspaceSidebarOrder] = useState<string[]>([]);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>(null);
  const [runtimeSetup, setRuntimeSetup] = useState<RuntimeSetupState>(null);
  const [updateState, setUpdateState] = useState<DesktopUpdateState | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [accountType, setAccountType] = useState<string | null>(null);
  const [teamSetup, setTeamSetup] = useState<DesktopBootstrapTeamSetup>(DEFAULT_TEAM_SETUP_IDENTITY);
  const [tenant, setTenant] = useState<TenantIdentity>(null);
  const [profileOptions, setProfileOptions] = useState<ProfileOption[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [profileFieldValue, setProfileFieldValue] = useState("");
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [authPendingMethod, setAuthPendingMethod] = useState<DesktopAuthLoginMethod | null>(null);
  const [signInPending, setSignInPending] = useState(false);
  const [identity, setIdentity] = useState<DesktopIdentityState | null>(null);
  const [identityCompletionPending, setIdentityCompletionPending] = useState(false);
  const [identityCompletionError, setIdentityCompletionError] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [continuePending, setContinuePending] = useState(false);
  const [taskPending, setTaskPending] = useState(false);
  const [runContext, setRunContext] = useState<DesktopRunContext | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [processingApprovalIds, setProcessingApprovalIds] = useState<number[]>([]);
  const [availableModels, setAvailableModels] = useState<DesktopModelEntry[]>(() => readCachedModelCatalog());
  const [pendingPermission, setPendingPermission] = useState<{
    rootPath: string;
    displayName: string;
    originalRequest: { prompt: string; threadId?: string | null; workspaceRoot?: string | null };
  } | null>(null);
  const [workspacePolicy, setWorkspacePolicy] = useState<DesktopWorkspacePolicyRecord | null>(null);
  const [workspaceHydrateSummary, setWorkspaceHydrateSummary] = useState<{
    rootPath: string;
    displayName: string;
    fileCount: number;
    keyFiles: string[];
    projectType: string;
    lastHydrated: string | null;
  } | null>(null);
  const [perThreadSidebar, setPerThreadSidebar] = useState<Record<string, SidebarState>>({});
  const hasRestoredInitialSelectionRef = useRef(false);
  const selectedThreadIdRef = useRef<string | null>(null);
  const bootstrapRequestIdRef = useRef(0);
  const sessionStream = installSessionStream({
    selectedProfileId,
    selectedThreadIdRef,
    threads,
    setActiveTurnIdsByThread,
    setPerThreadSidebar,
    setThreads,
  });
  const {
    flushPendingThreadDeltas,
    rememberKnownThreadIds,
    threadDeltaBufferRef,
  } = sessionStream;
  const bootstrapStateRef = useRef({
    accountEmail,
    accountType,
    continuePending,
    isSignedIn,
    logoutPending,
    runContext,
    selectedProfileId,
    signInPending,
    teamSetup,
    tenant,
  });
  bootstrapStateRef.current = {
    accountEmail,
    accountType,
    continuePending,
    isSignedIn,
    logoutPending,
    runContext,
    selectedProfileId,
    signInPending,
    teamSetup,
    tenant,
  };
  const sessionStreamCallbacksRef = useRef({
    flushPendingThreadDeltas,
    rememberKnownThreadIds,
  });
  sessionStreamCallbacksRef.current = {
    flushPendingThreadDeltas,
    rememberKnownThreadIds,
  };

  const applyBootstrap = useCallback((
    bootstrap: DesktopBootstrap,
    options: {
      preferredThreadId?: string | null;
      restoreSelection?: boolean;
      pruneMissing?: boolean;
      replaceSessionState?: boolean;
      preserveSignedInShell?: boolean;
    } = {},
  ) => {
    const bootstrapState = bootstrapStateRef.current;
    applyDesktopBootstrap(
      {
        accountEmail: bootstrapState.accountEmail,
        accountType: bootstrapState.accountType,
        continuePending: bootstrapState.continuePending,
        isSignedIn: bootstrapState.isSignedIn,
        logoutPending: bootstrapState.logoutPending,
        runContext: bootstrapState.runContext,
        teamSetup: bootstrapState.teamSetup,
        selectedProfileId: bootstrapState.selectedProfileId,
        selectedThreadIdRef,
        signInPending: bootstrapState.signInPending,
        tenant: bootstrapState.tenant,
        hasRestoredInitialSelectionRef,
        flushPendingThreadDeltas: (threadId) => sessionStreamCallbacksRef.current.flushPendingThreadDeltas(threadId),
        rememberKnownThreadIds: (threadIds, rememberOptions) =>
          sessionStreamCallbacksRef.current.rememberKnownThreadIds(threadIds, rememberOptions),
        setAccountEmail,
        setAccountType,
        setActiveTurnIdsByThread,
        setIdentity,
        setIsSignedIn,
        setPendingApprovals,
        setPerThreadSidebar,
        setProfileOptions,
        setProfileFieldValue,
        setRecentFolders,
        setRunContext,
        setRuntimeSetup,
        setRuntimeStatus,
        setSelectedProfileId,
        setSelectedThreadId,
        setTeamSetup,
        setTenant,
        setTaskError,
        setThreads,
        setWorkspaceSidebarOrder,
        threadDeltaBufferRef,
      },
      bootstrap,
      options,
    );
  }, []);

  const refreshBootstrap = useCallback(async (
    options: {
      preferredThreadId?: string | null;
      pruneMissing?: boolean;
      restoreSelection?: boolean;
      preserveSignedInShell?: boolean;
    } = {},
  ): Promise<DesktopBootstrap | null> => {
    return refreshDesktopBootstrap(
      {
        bootstrapRequestIdRef,
        applyBootstrap,
        setBootstrapError,
      },
      options,
    );
  }, [applyBootstrap]);

  async function removeThreadFromLocalState(threadId: string): Promise<void> {
    await removeDesktopThreadFromLocalState(threadId, {
      selectedThreadIdRef,
      threadDeltaBufferRef,
      setActiveTurnIdsByThread,
      setPendingApprovals,
      setPerThreadSidebar,
      setSelectedThreadId,
      setThreads,
    });
  }

  async function removeWorkspaceFromLocalState(workspaceRoot: string): Promise<void> {
    await removeDesktopWorkspaceFromLocalState(
      workspaceRoot,
      {
        selectedThreadIdRef,
        threadDeltaBufferRef,
        setActiveTurnIdsByThread,
        setPendingApprovals,
        setPerThreadSidebar,
        setRecentFolders,
        setSelectedThreadId,
        setThreads,
        setWorkspaceSidebarOrder,
      },
      threads,
    );
  }

  const fetchWorkspacePolicy = useCallback(async (rootPath: string): Promise<DesktopWorkspacePolicyRecord | null> => {
    return fetchDesktopWorkspacePolicy(rootPath, {
      setWorkspacePolicy,
    });
  }, []);

  const sessionView = useMemo(() => perfMeasure("session-view.build", () => buildDesktopSessionViewState({
    activeTurnIdsByThread,
    pendingApprovals,
    perThreadSidebar,
    selectedThreadId,
    taskPending,
    threads,
  }), {
    logThresholdMs: 24,
    details: () => ({
      activeTurnThreadCount: Object.keys(activeTurnIdsByThread).length,
      pendingApprovalCount: pendingApprovals.length,
      selectedThreadId,
      sidebarThreadCount: Object.keys(perThreadSidebar).length,
      taskPending,
      threadCount: threads.length,
    }),
  }), [
    activeTurnIdsByThread,
    pendingApprovals,
    perThreadSidebar,
    selectedThreadId,
    taskPending,
    threads,
  ]);
  const {
    activeRoot,
    activeTurnId,
    currentSidebar,
    interactionState,
    rightRailThread,
    selectedThread,
    selectedThreadApprovals,
    selectedThreadFolderRoot,
    showRightRail,
    threadDiffState,
    threadInputRequest,
    threadPlanState,
  } = sessionView;
  useSessionShellEffects({
    accountType,
    activeRoot,
    applyBootstrap,
    bootstrapRequestIdRef,
    fetchWorkspacePolicy,
    isSignedIn,
    selectedProfileId,
    selectedThreadId,
    selectedThreadIdRef,
    setAvailableModels,
    setBootstrapError,
    setBootstrapLoading,
    setPendingPermission,
    setThreads,
    setUpdateState,
    setWorkspaceHydrateSummary,
    setWorkspacePolicy,
  });

  const sessionActions = useMemo(() => createDesktopSessionActions({
    applyBootstrap,
    fetchWorkspacePolicy,
    flushPendingThreadDeltas,
    getActiveTurnIdsByThread: () => activeTurnIdsByThread,
    getIsSignedIn: () => isSignedIn,
    getPendingPermission: () => pendingPermission,
    getProfileFieldValue: () => profileFieldValue,
    getRunContext: () => runContext,
    getSelectedProfileId: () => selectedProfileId,
    getSelectedThreadId: () => selectedThreadId,
    getWorkspaceSidebarOrder: () => workspaceSidebarOrder,
    hasRestoredInitialSelectionRef,
    model,
    refreshBootstrap,
    rememberKnownThreadIds,
    requireDesktopBridge,
    reasoningEffort,
    serviceTier,
    removeThreadFromLocalState,
    removeWorkspaceFromLocalState,
    selectedThreadIdRef,
    setActiveTurnIdsByThread,
    setBootstrapError,
    setContinuePending,
    setAuthPendingMethod,
    setIdentityCompletionPending,
    setIdentityCompletionError,
    setLogoutPending,
    setPendingPermission,
    setPerThreadSidebar,
    setProcessingApprovalIds,
    setProfileFieldValue,
    setRecentFolders,
    setSelectedProfileId,
    setSelectedThreadId,
    setSignInPending,
    setTaskError,
    setTaskPending,
    setThreads,
    setUpdateState,
    setWorkspacePolicy,
    setWorkspaceHydrateSummary,
    setWorkspaceSidebarOrder,
  }), [
    activeTurnIdsByThread,
    applyBootstrap,
    fetchWorkspacePolicy,
    flushPendingThreadDeltas,
    hasRestoredInitialSelectionRef,
    isSignedIn,
    model,
    pendingPermission,
    profileFieldValue,
    reasoningEffort,
    refreshBootstrap,
    rememberKnownThreadIds,
    removeThreadFromLocalState,
    removeWorkspaceFromLocalState,
    runContext,
    selectedProfileId,
    selectedThreadId,
    selectedThreadIdRef,
    serviceTier,
    workspaceSidebarOrder,
  ]);

  return {
    accountEmail,
    accountType,
    authPendingMethod,
    availableModels,
    bootstrapError,
    bootstrapLoading,
    ...sessionActions,
    continuePending,
    identity,
    identityCompletionError,
    identityCompletionPending,
    isSignedIn,
    logoutPending,
    pendingApprovals,
    processingApprovalIds,
    profileFieldValue,
    profileOptions,
    recentFolders,
    refreshBootstrap,
    rightRailThread,
    runtimeSetup,
    runtimeStatus,
    selectedProfileId,
    selectedThread,
    selectedThreadApprovals,
    selectedThreadId,
    setProfileFieldValue,
    setTaskError,
    showRightRail,
    signInPending,
    taskError,
    taskPending,
    teamSetup,
    tenant,
    threadDiffState,
    threadInputRequest,
    threadPlanState,
    threads,
    updateState,
    workspaceSidebarOrder,
    workspacePolicy,
    workspaceHydrateSummary,
    pendingPermission,
    activeTurnId,
    requestWorkspacePermission: (rootPath: string, displayName: string, originalRequest?: { prompt: string; workspaceRoot?: string | null }) => {
      setPendingPermission({
        rootPath,
        displayName,
        originalRequest: originalRequest ?? { prompt: "", workspaceRoot: rootPath },
      });
    },
  };
}
  perfCount("render.useDesktopSessionState");
