import { useEffect, useRef, useState } from "react";

import type {
  ProjectedSessionRecord,
  ProjectedWorkspaceRecord,
  SubstrateSessionRecord,
  SubstrateWorkspaceRecord,
} from "../../../main/contracts";

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
  const [projectedWorkspaces, setProjectedWorkspaces] = useState<ProjectedWorkspaceRecord[]>([]);
  const [knownWorkspaces, setKnownWorkspaces] = useState<SubstrateWorkspaceRecord[]>([]);
  const [archivedWorkspaces, setArchivedWorkspaces] = useState<SubstrateWorkspaceRecord[]>([]);
  const [archivedSessions, setArchivedSessions] = useState<SubstrateSessionRecord[]>([]);
  const [activeWorkspaceProjection, setActiveWorkspaceProjection] = useState<ProjectedWorkspaceRecord | null>(null);
  const [workspaceSessions, setWorkspaceSessions] = useState<ProjectedSessionRecord[]>([]);
  const [workspaceSessionsLoading, setWorkspaceSessionsLoading] = useState(false);
  const workspaceCollectionsRequestIdRef = useRef(0);
  const activeWorkspaceRequestIdRef = useRef(0);

  async function refreshWorkspaceCollections() {
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
  }

  function removeWorkspaceFromCollections(workspaceId: string, workspaceRoot: string) {
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
  }

  useEffect(() => {
    void refreshWorkspaceCollections().catch(() => {});
  }, [isSignedIn, selectedProfileId]);

  useEffect(() => {
    if (!isSignedIn || !activeWorkspaceRoot) {
      activeWorkspaceRequestIdRef.current += 1;
      setActiveWorkspaceProjection(null);
      setWorkspaceSessions([]);
      setWorkspaceSessionsLoading(false);
      return;
    }

    const bridge = window.sense1Desktop;
    if (!bridge?.projections?.workspaceByRoot || !bridge?.projections?.sessions) {
      activeWorkspaceRequestIdRef.current += 1;
      setActiveWorkspaceProjection(null);
      setWorkspaceSessions([]);
      setWorkspaceSessionsLoading(false);
      return;
    }

    const requestId = ++activeWorkspaceRequestIdRef.current;
    let isActive = true;
    setWorkspaceSessionsLoading(true);
    void (async () => {
      try {
        const wsResult = await bridge.projections.workspaceByRoot({ rootPath: activeWorkspaceRoot });
        if (!isActive || requestId !== activeWorkspaceRequestIdRef.current) {
          return;
        }

        const workspace = wsResult.workspace ?? null;
        setActiveWorkspaceProjection(workspace);
        if (workspace) {
          const sessResult = await bridge.projections.sessions({
            workspaceId: workspace.workspace_id,
            limit: WORKSPACE_SESSION_HISTORY_LIMIT,
          });
          if (!isActive || requestId !== activeWorkspaceRequestIdRef.current) {
            return;
          }
          setWorkspaceSessions(sessResult.sessions);
        } else {
          setWorkspaceSessions([]);
        }
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
  }, [activeWorkspaceRoot, isSignedIn, selectedProfileId]);

  return {
    activeWorkspaceProjection,
    archivedSessions,
    archivedWorkspaces,
    knownWorkspaces,
    projectedWorkspaces,
    refreshWorkspaceCollections,
    removeWorkspaceFromCollections,
    workspaceSessions,
    workspaceSessionsLoading,
  };
}
