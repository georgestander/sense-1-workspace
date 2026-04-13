export interface ProjectedWorkspaceRecord {
  readonly workspace_id: string;
  readonly profile_id: string;
  readonly scope_id: string;
  readonly root_path: string;
  readonly display_name: string | null;
  readonly status: "active" | "archived";
  readonly archived_at: string | null;
  readonly registered_at: string;
  readonly last_activity_at: string | null;
  readonly session_count: number;
  readonly event_count: number;
  readonly file_change_count: number;
  readonly last_session_id: string | null;
  readonly last_thread_id: string | null;
  readonly recent_file_paths: string[];
  readonly metadata: Record<string, unknown>;
}

export interface ProjectedSessionRecord {
  readonly session_id: string;
  readonly profile_id: string;
  readonly workspace_id: string | null;
  readonly actor_id: string;
  readonly codex_thread_id: string | null;
  readonly title: string | null;
  readonly model: string | null;
  readonly status: string;
  readonly started_at: string;
  readonly ended_at: string | null;
  readonly last_activity_at: string | null;
  readonly event_count: number;
  readonly file_change_count: number;
  readonly metadata: Record<string, unknown>;
}

export interface ProjectedWorkspacesRequest {
  readonly limit?: number;
  readonly rootPath?: string | null;
}

export interface ProjectedSessionsRequest {
  readonly workspaceId?: string | null;
  readonly limit?: number;
}

export interface ProjectedWorkspacesResult {
  readonly workspaces: ProjectedWorkspaceRecord[];
}

export interface ProjectedWorkspaceByRootRequest {
  readonly rootPath: string;
}

export interface ProjectedWorkspaceDetailResult {
  readonly workspace: ProjectedWorkspaceRecord | null;
}

export interface ProjectedSessionsResult {
  readonly sessions: ProjectedSessionRecord[];
}
