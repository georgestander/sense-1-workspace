import {
  listRecentWorkspaces as queryRecentWorkspaces,
  listRecentSessions as queryRecentSessions,
  listSessionsByWorkspace as querySessionsByWorkspace,
  getSession as querySession,
  getWorkspace as queryWorkspace,
  listEventsBySession as queryEventsBySession,
  listObjectRefsBySession as queryObjectRefsBySession,
} from "./substrate-reader.js";
import {
  getProjectedWorkspaceByRootPath,
  listProjectedSessions,
  listProjectedWorkspaces,
} from "./substrate-projections.js";
import { resolveProfileSubstrateDbPath } from "../profile/profile-state.js";
import {
  type ProjectedSessionsResult,
  type ProjectedWorkspaceDetailResult,
  type ProjectedWorkspacesResult,
  type SubstrateEventsResult,
  type SubstrateObjectRefsResult,
  type SubstrateSessionDetailResult,
  type SubstrateSessionsResult,
  type SubstrateWorkspaceDetailResult,
  type SubstrateWorkspacesResult,
} from "../contracts.ts";
import {
  isWorkspaceArchived,
  resolveWorkspaceLifecycleState,
} from "../../shared/lifecycle.js";

export class DesktopQueryService {
  readonly #env: NodeJS.ProcessEnv;
  readonly #resolveProfile: () => Promise<{ id: string }>;

  constructor({
    env = process.env,
    resolveProfile,
  }: {
    env?: NodeJS.ProcessEnv;
    resolveProfile: () => Promise<{ id: string }>;
  }) {
    this.#env = env;
    this.#resolveProfile = resolveProfile;
  }

  async substrateRecentWorkspaces(limit = 20): Promise<SubstrateWorkspacesResult> {
    const profile = await this.#resolveProfile();
    const dbPath = resolveProfileSubstrateDbPath(profile.id, this.#env);
    const workspaces = (await queryRecentWorkspaces({ dbPath, profileId: profile.id, limit })).map((workspace) => ({
      ...workspace,
      archived_at: mapWorkspaceArchivedAt(workspace.metadata),
      status: mapWorkspaceStatus(workspace.metadata),
    }));
    return { workspaces };
  }

  async substrateRecentSessions(limit = 20): Promise<SubstrateSessionsResult> {
    const profile = await this.#resolveProfile();
    const dbPath = resolveProfileSubstrateDbPath(profile.id, this.#env);
    const sessions = await queryRecentSessions({ dbPath, profileId: profile.id, limit });
    return { sessions };
  }

  async substrateSessionsByWorkspace(workspaceId: string, limit = 20): Promise<SubstrateSessionsResult> {
    const dbPath = await this.#resolveDbPath();
    const sessions = await querySessionsByWorkspace({ dbPath, workspaceId, limit });
    return { sessions };
  }

  async substrateSessionDetail(sessionId: string): Promise<SubstrateSessionDetailResult> {
    const dbPath = await this.#resolveDbPath();
    const session = await querySession({ dbPath, sessionId });
    return { session };
  }

  async substrateWorkspaceDetail(workspaceId: string): Promise<SubstrateWorkspaceDetailResult> {
    const dbPath = await this.#resolveDbPath();
    const workspaceRecord = await queryWorkspace({ dbPath, workspaceId });
    const workspace = workspaceRecord
      ? {
          ...workspaceRecord,
          archived_at: mapWorkspaceArchivedAt(workspaceRecord.metadata),
          status: mapWorkspaceStatus(workspaceRecord.metadata),
        }
      : null;
    return { workspace };
  }

  async substrateEventsBySession(sessionId: string, limit = 100): Promise<SubstrateEventsResult> {
    const dbPath = await this.#resolveDbPath();
    const events = await queryEventsBySession({ dbPath, sessionId, limit });
    return { events };
  }

  async substrateObjectRefsBySession(sessionId: string, limit = 100): Promise<SubstrateObjectRefsResult> {
    const dbPath = await this.#resolveDbPath();
    const refs = await queryObjectRefsBySession({ dbPath, sessionId, limit });
    return { refs };
  }

  async projectedWorkspaces(limit = 20): Promise<ProjectedWorkspacesResult> {
    const profile = await this.#resolveProfile();
    const dbPath = resolveProfileSubstrateDbPath(profile.id, this.#env);
    const rows = await listProjectedWorkspaces({ dbPath, profileId: profile.id, limit });
    const workspaces = rows
      .map((row) => ({
        workspace_id: row.workspace_id,
        profile_id: row.profile_id,
        scope_id: row.scope_id,
        root_path: row.root_path,
        display_name: row.display_name,
        status: mapWorkspaceStatus(row.metadata),
        archived_at: mapWorkspaceArchivedAt(row.metadata),
        registered_at: row.registered_at,
        last_activity_at: row.last_activity_at,
        session_count: row.session_count,
        event_count: row.event_count,
        file_change_count: row.file_change_count,
        last_session_id: row.last_session_id,
        last_thread_id: row.last_thread_id,
        recent_file_paths: row.recent_file_paths,
        metadata: row.metadata,
      }))
      .filter((workspace) => workspace.status === "active");
    return { workspaces };
  }

  async projectedWorkspaceByRoot(rootPath: string): Promise<ProjectedWorkspaceDetailResult> {
    const profile = await this.#resolveProfile();
    const dbPath = resolveProfileSubstrateDbPath(profile.id, this.#env);
    const row = await getProjectedWorkspaceByRootPath({
      dbPath,
      profileId: profile.id,
      rootPath,
    });
    if (!row || mapWorkspaceStatus(row.metadata) === "archived") {
      return { workspace: null };
    }

    return {
      workspace: {
        workspace_id: row.workspace_id,
        profile_id: row.profile_id,
        scope_id: row.scope_id,
        root_path: row.root_path,
        display_name: row.display_name,
        status: mapWorkspaceStatus(row.metadata),
        archived_at: mapWorkspaceArchivedAt(row.metadata),
        registered_at: row.registered_at,
        last_activity_at: row.last_activity_at,
        session_count: row.session_count,
        event_count: row.event_count,
        file_change_count: row.file_change_count,
        last_session_id: row.last_session_id,
        last_thread_id: row.last_thread_id,
        recent_file_paths: row.recent_file_paths,
        metadata: row.metadata,
      },
    };
  }

  async projectedSessions(workspaceId: string | null = null, limit = 20): Promise<ProjectedSessionsResult> {
    const profile = await this.#resolveProfile();
    const dbPath = resolveProfileSubstrateDbPath(profile.id, this.#env);
    const rows = await listProjectedSessions({ dbPath, profileId: profile.id, workspaceId, limit });
    const sessions = rows
      .map((row) => ({
        session_id: row.session_id,
        profile_id: row.profile_id,
        workspace_id: row.workspace_id,
        actor_id: row.actor_id,
        codex_thread_id: row.codex_thread_id,
        title: row.title,
        model: row.model,
        status: row.status,
        started_at: row.started_at,
        ended_at: row.ended_at,
        last_activity_at: row.last_activity_at,
        event_count: row.event_count,
        file_change_count: row.file_change_count,
        metadata: row.metadata,
      }))
      .filter((session) => session.status !== "archived");
    return { sessions };
  }

  async #resolveDbPath(): Promise<string> {
    const profile = await this.#resolveProfile();
    return resolveProfileSubstrateDbPath(profile.id, this.#env);
  }
}

function mapWorkspaceStatus(metadata: Record<string, unknown> | null | undefined): "active" | "archived" {
  return isWorkspaceArchived(metadata ?? {}) ? "archived" : "active";
}

function mapWorkspaceArchivedAt(metadata: Record<string, unknown> | null | undefined): string | null {
  return resolveWorkspaceLifecycleState(metadata ?? {}).archivedAt;
}
