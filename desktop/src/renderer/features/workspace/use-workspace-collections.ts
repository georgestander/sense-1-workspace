import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ProjectedSessionRecord,
  ProjectedWorkspaceRecord,
  SubstrateSessionRecord,
  SubstrateWorkspaceRecord,
} from "../../../main/contracts";
import { perfCount } from "../../lib/perf-debug.ts";
import {
  findSubstrateWorkspaceByRoot,
  matchesWorkspaceSession,
  projectSubstrateSessionToProjectedSession,
  projectSubstrateWorkspaceToProjectedWorkspace,
  sortProjectedSessionsByContinuity,
  synthesizeProjectedWorkspaceFromSessions,
} from "./workspace-continuity.js";
import { normalizeUserFacingWorkspaceRoot } from "../../../shared/workspace-roots.ts";

type WorkspaceCollectionsResult = {
  activeWorkspaceProjection: ProjectedWorkspaceRecord | null;
  archivedSessions: SubstrateSessionRecord[];
  archivedWorkspaces: SubstrateWorkspaceRecord[];
  knownWorkspaces: SubstrateWorkspaceRecord[];
  projectedWorkspaces: ProjectedWorkspaceRecord[];
  refreshWorkspaceCollections: () => Promise<void>;
  removeWorkspaceFromCollections: (workspaceId: string, workspaceRoot: string) => void;
  workspaceSessions: ProjectedSessionRecord[];
  workspaceSessionsLoading: boolean;
};

const WORKSPACE_SESSION_HISTORY_LIMIT = 50;

export function useWorkspaceCollections({
  activeWorkspaceRoot,
  isSignedIn,
  selectedProfileId,
}: {
  activeWorkspaceRoot: string | null;
  isSignedIn: boolean;
  selectedProfileId: string;
}): WorkspaceCollectionsResult {
  perfCount("render.useWorkspaceCollections");
  const resolvedActiveWorkspaceRoot = normalizeUserFacingWorkspaceRoot(activeWorkspaceRoot);
  const [projectedWorkspaces, setProjectedWorkspaces] = useState<ProjectedWorkspaceRecord[]>([]);
  const [knownWorkspaces, setKnownWorkspaces] = useState<SubstrateWorkspaceRecord[]>([]);
  const [archivedWorkspaces, setArchivedWorkspaces] = useState<SubstrateWorkspaceRecord[]>([]);
  const [archivedSessions, setArchivedSessions] = useState<SubstrateSessionRecord[]>([]);
  const [activeWorkspaceProjection, setActiveWorkspaceProjection] = useState<ProjectedWorkspaceRecord | null>(null);
  const [workspaceSessions, setWorkspaceSessions] = useState<ProjectedSessionRecord[]>([]);
  const [workspaceSessionsLoading, setWorkspaceSessionsLoading] = useState(false);
  const workspaceCollectionsRequestIdRef = useRef(0);
  const activeWorkspaceRequestIdRef = useRef(0);

  const refreshWorkspaceCollections = useCallback(async () => {
    if (!isSignedIn) {
      workspaceCollectionsRequestIdRef.current += 1;
      setProjectedWorkspaces([]);
      setKnownWorkspaces([]);
      setArchivedWorkspaces([]);
      setArchivedSessions([]);
      return;
    }

    const bridge = window.sense1Desktop;
    if (!bridge?.projections?.workspaces || !bridge?.substrate?.recentWorkspaces || !bridge?.substrate?.recentSessions) {
      return;
    }

    const requestId = ++workspaceCollectionsRequestIdRef.current;
    perfCount("workspace-collections.refresh");
    const [projectedResult, workspaceResult, sessionResult] = await Promise.all([
      bridge.projections.workspaces({ limit: 20 }) as Promise<{ workspaces: ProjectedWorkspaceRecord[] }>,
      bridge.substrate.recentWorkspaces({ limit: 50 }) as Promise<{ workspaces: SubstrateWorkspaceRecord[] }>,
      bridge.substrate.recentSessions({ limit: 50 }) as Promise<{ sessions: SubstrateSessionRecord[] }>,
    ]);
    if (requestId !== workspaceCollectionsRequestIdRef.current) {
      return;
    }

    setProjectedWorkspaces(projectedResult.workspaces);
    setKnownWorkspaces(workspaceResult.workspaces);
    setArchivedWorkspaces(workspaceResult.workspaces.filter((workspace) => workspace.status === "archived"));
    setArchivedSessions(sessionResult.sessions.filter((session) => session.status === "archived"));
  }, [isSignedIn]);

  const removeWorkspaceFromCollections = useCallback((workspaceId: string, workspaceRoot: string) => {
    setProjectedWorkspaces((current) => current.filter((workspace) => workspace.workspace_id !== workspaceId));
    setKnownWorkspaces((current) => current.filter((workspace) => workspace.id !== workspaceId));
    setArchivedWorkspaces((current) => current.filter((workspace) => workspace.id !== workspaceId));
    setArchivedSessions((current) => current.filter((session) => session.workspace_id !== workspaceId));
    setActiveWorkspaceProjection((current) => (
      current?.workspace_id === workspaceId || current?.root_path === workspaceRoot
        ? null
        : current
    ));
    setWorkspaceSessions((current) => current.filter((session) => session.workspace_id !== workspaceId));
  }, []);

  useEffect(() => {
    void refreshWorkspaceCollections().catch(() => {});
  }, [isSignedIn, selectedProfileId]);

  useEffect(() => {
    if (!isSignedIn || !resolvedActiveWorkspaceRoot) {
      activeWorkspaceRequestIdRef.current += 1;
      setActiveWorkspaceProjection(null);
      setWorkspaceSessions([]);
      setWorkspaceSessionsLoading(false);
      return;
    }

    const bridge = window.sense1Desktop;
    if ((!bridge?.projections?.workspaceByRoot || !bridge?.projections?.sessions)
      && (!bridge?.substrate?.recentSessions || !bridge?.substrate?.recentWorkspaces)) {
      activeWorkspaceRequestIdRef.current += 1;
      setActiveWorkspaceProjection(null);
      setWorkspaceSessions([]);
      setWorkspaceSessionsLoading(false);
      return;
    }

    const requestId = ++activeWorkspaceRequestIdRef.current;
    let isActive = true;
    setWorkspaceSessionsLoading(true);
    perfCount("workspace-collections.load-active-workspace");
    void (async () => {
      try {
        const [wsResult, recentSessionResult, recentWorkspaceResult] = await Promise.all([
          bridge?.projections?.workspaceByRoot
            ? bridge.projections.workspaceByRoot({ rootPath: resolvedActiveWorkspaceRoot })
            : Promise.resolve({ workspace: null }),
          bridge?.substrate?.recentSessions
            ? bridge.substrate.recentSessions({ limit: 200 }) as Promise<{ sessions: SubstrateSessionRecord[] }>
            : Promise.resolve({ sessions: [] }),
          bridge?.substrate?.recentWorkspaces
            ? bridge.substrate.recentWorkspaces({ limit: 200 }) as Promise<{ workspaces: SubstrateWorkspaceRecord[] }>
            : Promise.resolve({ workspaces: [] }),
        ]);
        if (!isActive || requestId !== activeWorkspaceRequestIdRef.current) {
          return;
        }

        const fallbackWorkspaceRecord = findSubstrateWorkspaceByRoot(recentWorkspaceResult.workspaces, resolvedActiveWorkspaceRoot);
        let workspace = wsResult.workspace ?? (
          fallbackWorkspaceRecord
            ? projectSubstrateWorkspaceToProjectedWorkspace(fallbackWorkspaceRecord)
            : null
        );

        let sessions: ProjectedSessionRecord[] = [];
        if (workspace && bridge?.projections?.sessions) {
          const sessResult = await bridge.projections.sessions({
            workspaceId: workspace.workspace_id,
            limit: WORKSPACE_SESSION_HISTORY_LIMIT,
          });
          if (!isActive || requestId !== activeWorkspaceRequestIdRef.current) {
            return;
          }
          sessions = Array.isArray(sessResult.sessions) ? sessResult.sessions : [];
        }

        if (sessions.length === 0) {
          const fallbackSessions = (Array.isArray(recentSessionResult.sessions) ? recentSessionResult.sessions : [])
            .filter((session) => matchesWorkspaceSession(session, {
              workspaceId: workspace?.workspace_id ?? fallbackWorkspaceRecord?.id ?? null,
              workspaceRoot: resolvedActiveWorkspaceRoot,
            }))
            .map((session) => projectSubstrateSessionToProjectedSession(
              session,
              workspace?.workspace_id ?? fallbackWorkspaceRecord?.id ?? null,
            ));
          sessions = sortProjectedSessionsByContinuity(fallbackSessions).slice(0, WORKSPACE_SESSION_HISTORY_LIMIT);
        }
        if (!workspace && sessions.length > 0) {
          workspace = synthesizeProjectedWorkspaceFromSessions({
            profileId: sessions[0]?.profile_id ?? selectedProfileId,
            rootPath: resolvedActiveWorkspaceRoot,
            sessions,
          });
        }
        setActiveWorkspaceProjection(workspace);
        setWorkspaceSessions(sessions);
      } catch {
        if (!isActive || requestId !== activeWorkspaceRequestIdRef.current) {
          return;
        }
        setActiveWorkspaceProjection(null);
        setWorkspaceSessions([]);
      } finally {
        if (isActive && requestId === activeWorkspaceRequestIdRef.current) {
          setWorkspaceSessionsLoading(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [isSignedIn, resolvedActiveWorkspaceRoot, selectedProfileId]);

  return useMemo(() => ({
    activeWorkspaceProjection,
    archivedSessions,
    archivedWorkspaces,
    knownWorkspaces,
    projectedWorkspaces,
    refreshWorkspaceCollections,
    removeWorkspaceFromCollections,
    workspaceSessions,
    workspaceSessionsLoading,
  }), [
    activeWorkspaceProjection,
    archivedSessions,
    archivedWorkspaces,
    knownWorkspaces,
    projectedWorkspaces,
    refreshWorkspaceCollections,
    removeWorkspaceFromCollections,
    workspaceSessions,
    workspaceSessionsLoading,
  ]);
}
