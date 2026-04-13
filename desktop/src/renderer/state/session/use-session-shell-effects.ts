import { useEffect } from "react";

import type {
  DesktopBootstrap,
  DesktopModelEntry,
  DesktopRunContext,
  DesktopRuntimeEvent,
  DesktopUpdateState,
  DesktopWorkspacePolicyRecord,
  SubstrateSessionRecord,
  SubstrateWorkspaceRecord,
} from "../../../main/contracts";
import { buildProgressSummary, formatUpdatedLabel } from "../../lib/live-thread-data.js";
import {
  normalizeModelCatalog,
  writeCachedModelCatalog,
} from "../../lib/model-catalog.js";
import { listVisibleSubstrateSessions } from "../../features/workspace/substrate-thread-enrichment.js";
import { folderDisplayName } from "./session-selectors.js";
import { DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE, getDesktopBridge, requireDesktopBridge } from "./desktop-bridge.js";
import { sortThreads } from "../threads/thread-summary-state.js";
import type { ThreadRecord } from "./session-types.js";

type ApplyBootstrapFn = (
  bootstrap: DesktopBootstrap,
  options?: {
    preferredThreadId?: string | null;
    restoreSelection?: boolean;
    pruneMissing?: boolean;
    replaceSessionState?: boolean;
    preserveSignedInShell?: boolean;
  },
) => void;

type FetchWorkspacePolicyFn = (rootPath: string) => Promise<DesktopWorkspacePolicyRecord | null>;

type DesktopSessionEffectsOptions = {
  activeRoot: string | null;
  applyBootstrap: ApplyBootstrapFn;
  bootstrapRequestIdRef: React.MutableRefObject<number>;
  fetchWorkspacePolicy: FetchWorkspacePolicyFn;
  isSignedIn: boolean;
  selectedProfileId: string;
  selectedThreadId: string | null;
  selectedThreadIdRef: React.MutableRefObject<string | null>;
  setAvailableModels: React.Dispatch<React.SetStateAction<DesktopModelEntry[]>>;
  setBootstrapError: React.Dispatch<React.SetStateAction<string | null>>;
  setBootstrapLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingPermission: React.Dispatch<React.SetStateAction<{
    rootPath: string;
    displayName: string;
    originalRequest: { prompt: string; threadId?: string | null; workspaceRoot?: string | null };
  } | null>>;
  setThreads: React.Dispatch<React.SetStateAction<ThreadRecord[]>>;
  setUpdateState: React.Dispatch<React.SetStateAction<DesktopUpdateState | null>>;
  setWorkspaceHydrateSummary: React.Dispatch<React.SetStateAction<{
    rootPath: string;
    displayName: string;
    fileCount: number;
    keyFiles: string[];
    projectType: string;
    lastHydrated: string | null;
  } | null>>;
  setWorkspacePolicy: React.Dispatch<React.SetStateAction<DesktopWorkspacePolicyRecord | null>>;
};

export function useSessionShellEffects({
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
}: DesktopSessionEffectsOptions): void {
  useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId;
  }, [selectedThreadId, selectedThreadIdRef]);

  useEffect(() => {
    let isActive = true;

    async function loadBootstrap() {
      setBootstrapLoading(true);
      setBootstrapError(null);
      const requestId = ++bootstrapRequestIdRef.current;

      try {
        const bridge = requireDesktopBridge();
        const bootstrap = await bridge.session.get();
        if (!isActive || requestId !== bootstrapRequestIdRef.current) {
          return;
        }

        applyBootstrap(bootstrap, { restoreSelection: true });
      } catch (error) {
        if (!isActive || requestId !== bootstrapRequestIdRef.current) {
          return;
        }
        setBootstrapError(error instanceof Error ? error.message : "Could not load desktop bootstrap.");
      } finally {
        if (isActive && requestId === bootstrapRequestIdRef.current) {
          setBootstrapLoading(false);
        }
      }
    }

    void loadBootstrap();

    return () => {
      isActive = false;
    };
  }, [applyBootstrap, bootstrapRequestIdRef, setBootstrapError, setBootstrapLoading]);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.updates?.getState) {
      return;
    }

    let isActive = true;
    void bridge.updates.getState().then((state) => {
      if (isActive) {
        setUpdateState(state);
      }
    }).catch(() => {
      // Non-fatal — updater state is supplementary to the session shell.
    });

    return () => {
      isActive = false;
    };
  }, [setUpdateState]);

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }

    const bridge = getDesktopBridge();
    if (!bridge) {
      return;
    }

    let isActive = true;
    void bridge.models.list().then((result) => {
      const normalizedModels = normalizeModelCatalog(result.models);
      if (isActive && normalizedModels.length > 0) {
        setAvailableModels(normalizedModels);
        writeCachedModelCatalog(normalizedModels);
      }
    }).catch(() => {
      // Non-fatal — the renderer will continue with the last known-good model catalog.
    });

    return () => {
      isActive = false;
    };
  }, [isSignedIn, setAvailableModels]);

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }

    const bridge = getDesktopBridge();
    if (!bridge?.substrate?.recentSessions) {
      return;
    }

    let isActive = true;
    void (async () => {
      try {
        const [sessResult, wsResult] = await Promise.all([
          bridge.substrate.recentSessions({ limit: 50 }),
          bridge.substrate.recentWorkspaces({ limit: 50 }),
        ]);
        if (!isActive || !sessResult.sessions.length) {
          return;
        }

        setThreads((current) => {
          const substrateThreads: ThreadRecord[] = listVisibleSubstrateSessions({
            existingThreadIds: current.map((thread) => thread.id),
            sessions: sessResult.sessions as SubstrateSessionRecord[],
            workspaces: wsResult.workspaces as SubstrateWorkspaceRecord[],
          }).map((session) => ({
            id: session.threadId,
            title: session.title,
            subtitle: session.workspaceRoot ? folderDisplayName(session.workspaceRoot) : "Chat",
            state: session.status === "active" ? "active" : "idle",
            interactionState: "conversation",
            updatedAt: session.updatedAt,
            updatedLabel: formatUpdatedLabel(session.updatedAt),
            workspaceRoot: session.workspaceRoot,
            cwd: null,
            entries: [],
            changeGroups: [],
            progressSummary: buildProgressSummary([], "idle"),
            reviewSummary: null,
            hasLoadedDetails: false,
          }));

          if (substrateThreads.length === 0) {
            return current;
          }

          return sortThreads([...current, ...substrateThreads]);
        });
      } catch {
        // Non-fatal — engine threads still work without substrate enrichment.
      }
    })().catch(() => {
      // Non-fatal — engine threads still work without substrate enrichment.
    });

    return () => {
      isActive = false;
    };
  }, [isSignedIn, selectedProfileId, setThreads]);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) {
      setBootstrapError(DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE);
      setBootstrapLoading(false);
      return;
    }

    let isActive = true;
    const unsubscribe = bridge.session.subscribe((bootstrap) => {
      if (!isActive) {
        return;
      }
      bootstrapRequestIdRef.current += 1;
      applyBootstrap(bootstrap, { restoreSelection: true });
      setBootstrapError(null);
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [applyBootstrap, bootstrapRequestIdRef, setBootstrapError, setBootstrapLoading]);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.session?.onRuntimeEvent) {
      return;
    }

    const unsubscribe = bridge.session.onRuntimeEvent((event: DesktopRuntimeEvent) => {
      if (event.kind === "permissionRequired") {
        setPendingPermission({
          rootPath: event.rootPath,
          displayName: event.displayName,
          originalRequest: { prompt: "", workspaceRoot: event.rootPath },
        });
        return;
      }

      if (event.kind === "updateStateChanged") {
        setUpdateState(event.update);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [setPendingPermission, setUpdateState]);

  useEffect(() => {
    if (!activeRoot) {
      setWorkspacePolicy(null);
      setWorkspaceHydrateSummary(null);
      return;
    }
    void fetchWorkspacePolicy(activeRoot);
  }, [activeRoot, fetchWorkspacePolicy, setWorkspaceHydrateSummary, setWorkspacePolicy]);
}
