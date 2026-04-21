import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  DesktopWorkspaceHydrateResult,
  DesktopWorkspacePolicyRecord,
  ProjectedSessionRecord,
  SubstrateEventRecord,
} from "../../../main/contracts";
import { perfCount } from "../../lib/perf-debug.ts";

type WorkspaceActivitySummary = {
  approvalsGranted: number;
  commandsRun: number;
  fileWrites: number;
  lastActivity: string | null;
};

export function useWorkspaceActivity({
  hydrateWorkspace,
  selectedThreadId,
  selectedThreadWorkspaceRoot,
  workspacePolicy,
  workspaceSessions,
}: {
  hydrateWorkspace: (rootPath: string) => Promise<DesktopWorkspaceHydrateResult | null>;
  selectedThreadId: string | null;
  selectedThreadWorkspaceRoot: string | null;
  workspacePolicy: DesktopWorkspacePolicyRecord | null;
  workspaceSessions: ProjectedSessionRecord[];
}) {
  perfCount("render.useWorkspaceActivity");
  const [persistedSessionWrittenPaths, setPersistedSessionWrittenPaths] = useState<string[]>([]);
  const [persistedSessionActivitySummary, setPersistedSessionActivitySummary] = useState<WorkspaceActivitySummary | null>(null);
  const [persistedSessionActivityLoading, setPersistedSessionActivityLoading] = useState(false);
  const [workspaceStructureRefreshing, setWorkspaceStructureRefreshing] = useState(false);
  const activityRequestIdRef = useRef(0);
  const selectedWorkspaceSession = useMemo(
    () => (
      selectedThreadId
        ? workspaceSessions.find((session) => session.codex_thread_id === selectedThreadId) ?? null
        : null
    ),
    [selectedThreadId, workspaceSessions],
  );
  const selectedWorkspaceSessionId = useMemo(
    () => resolveSessionId(selectedWorkspaceSession),
    [selectedWorkspaceSession],
  );

  function extractWrittenPath(event: SubstrateEventRecord): string | null {
    if (event.verb !== "file.write") {
      return null;
    }

    if (typeof event.subject_id === "string" && event.subject_id.trim()) {
      return event.subject_id.trim();
    }

    if (!event.detail || typeof event.detail !== "object" || Array.isArray(event.detail)) {
      return null;
    }

    const detailPath = (event.detail as { path?: unknown }).path;
    return typeof detailPath === "string" && detailPath.trim() ? detailPath.trim() : null;
  }

  useEffect(() => {
    if (!selectedThreadId) {
      setPersistedSessionWrittenPaths([]);
      setPersistedSessionActivitySummary(null);
      setPersistedSessionActivityLoading(false);
      return;
    }

    const bridge = window.sense1Desktop;
    if (!bridge?.substrate?.recentSessions || !bridge?.substrate?.eventsBySession) {
      setPersistedSessionWrittenPaths([]);
      setPersistedSessionActivitySummary(null);
      setPersistedSessionActivityLoading(false);
      return;
    }

    const requestId = ++activityRequestIdRef.current;
    let isActive = true;
    setPersistedSessionActivityLoading(true);
    perfCount("workspace-activity.fetch-session-events");

    void (async () => {
      try {
        const recentSessionsResult = selectedWorkspaceSessionId
          ? null
          : await bridge.substrate.recentSessions({ limit: 200 });
        const fallbackSession = Array.isArray(recentSessionsResult?.sessions)
          ? recentSessionsResult.sessions.find((session: { codex_thread_id?: string | null }) => session.codex_thread_id === selectedThreadId) ?? null
          : null;
        const sessionId = selectedWorkspaceSessionId ?? resolveSessionId(fallbackSession);
        if (!sessionId || requestId !== activityRequestIdRef.current || !isActive) {
          if (isActive) {
            setPersistedSessionWrittenPaths([]);
            setPersistedSessionActivitySummary(null);
          }
          return;
        }

        const eventsResult = await bridge.substrate.eventsBySession({
          sessionId,
          limit: 500,
        });
        if (!isActive || requestId !== activityRequestIdRef.current) {
          return;
        }

        const nextPaths: string[] = [];
        const seen = new Set<string>();
        let fileWrites = 0;
        let commandsRun = 0;
        let approvalsGranted = 0;
        let lastActivity: string | null = null;
        for (const event of Array.isArray(eventsResult?.events) ? eventsResult.events : []) {
          if (event.verb === "file.write") {
            fileWrites += 1;
          } else if (event.verb === "command.execute") {
            commandsRun += 1;
          } else if (event.verb === "approval.granted" || event.verb === "approval.trusted") {
            approvalsGranted += 1;
          }
          if (typeof event.ts === "string" && event.ts.trim()) {
            lastActivity = event.ts;
          }
          const writtenPath = extractWrittenPath(event);
          if (!writtenPath || seen.has(writtenPath)) {
            continue;
          }
          seen.add(writtenPath);
          nextPaths.push(writtenPath);
        }

        setPersistedSessionWrittenPaths(nextPaths);
        setPersistedSessionActivitySummary({
          approvalsGranted,
          commandsRun,
          fileWrites,
          lastActivity,
        });
      } catch {
        if (isActive) {
          setPersistedSessionWrittenPaths([]);
          setPersistedSessionActivitySummary(null);
        }
      } finally {
        if (isActive) {
          setPersistedSessionActivityLoading(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [selectedThreadId, selectedWorkspaceSessionId]);

  useEffect(() => {
    const rootPath = selectedThreadWorkspaceRoot;
    if (!rootPath || workspaceStructureRefreshing) {
      return;
    }
    if (workspacePolicy && workspacePolicy.known_structure.length > 0) {
      return;
    }
    if (workspacePolicy && workspacePolicy.read_granted !== 1) {
      return;
    }

    let cancelled = false;
    setWorkspaceStructureRefreshing(true);
    perfCount("workspace-activity.hydrate-structure");
    void hydrateWorkspace(rootPath).finally(() => {
      if (!cancelled) {
        setWorkspaceStructureRefreshing(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [hydrateWorkspace, selectedThreadWorkspaceRoot, workspacePolicy?.known_structure?.length, workspacePolicy?.read_granted]);

  const refreshWorkspaceStructure = useCallback(async () => {
    if (!selectedThreadWorkspaceRoot) {
      return;
    }

    setWorkspaceStructureRefreshing(true);
    perfCount("workspace-activity.manual-refresh");
    try {
      await hydrateWorkspace(selectedThreadWorkspaceRoot);
    } finally {
      setWorkspaceStructureRefreshing(false);
    }
  }, [hydrateWorkspace, selectedThreadWorkspaceRoot]);

  return useMemo(() => ({
    persistedSessionActivityLoading,
    persistedSessionActivitySummary,
    persistedSessionWrittenPaths,
    refreshWorkspaceStructure,
    workspaceStructureRefreshing,
  }), [
    persistedSessionActivityLoading,
    persistedSessionActivitySummary,
    persistedSessionWrittenPaths,
    refreshWorkspaceStructure,
    workspaceStructureRefreshing,
  ]);
}

function resolveSessionId(session: ProjectedSessionRecord | { id?: string | null } | null): string | null {
  if (!session) {
    return null;
  }

  if ("session_id" in session && typeof session.session_id === "string" && session.session_id.trim()) {
    return session.session_id;
  }

  if ("id" in session && typeof session.id === "string" && session.id.trim()) {
    return session.id;
  }

  return null;
}
