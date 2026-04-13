export interface SubstrateSessionRecord {
  readonly id: string;
  readonly profile_id: string;
  readonly scope_id: string;
  readonly actor_id: string;
  readonly codex_thread_id: string | null;
  readonly workspace_id: string | null;
  readonly title: string | null;
  readonly model: string | null;
  readonly effort: string | null;
  readonly status: string;
  readonly started_at: string;
  readonly ended_at: string | null;
  readonly summary: string | null;
  readonly metadata: Record<string, unknown>;
}

export interface SubstrateWorkspaceRecord {
  readonly id: string;
  readonly profile_id: string;
  readonly scope_id: string;
  readonly root_path: string;
  readonly display_name: string | null;
  readonly status: "active" | "archived";
  readonly archived_at: string | null;
  readonly registered_at: string;
  readonly last_active_at: string | null;
  readonly session_count: number;
  readonly metadata: Record<string, unknown>;
}

export interface SubstrateEventRecord {
  readonly id: string;
  readonly ts: string;
  readonly actor_id: string;
  readonly scope_id: string;
  readonly verb: string;
  readonly subject_type: string | null;
  readonly subject_id: string | null;
  readonly before_state: unknown;
  readonly after_state: unknown;
  readonly detail: unknown;
  readonly engine_turn_id: string | null;
  readonly engine_item_id: string | null;
  readonly source_event_ids: string[] | null;
  readonly causation_id: string | null;
  readonly correlation_id: string | null;
  readonly session_id: string | null;
  readonly profile_id: string;
}

export interface SubstrateObjectRefRecord {
  readonly id: string;
  readonly session_id: string;
  readonly ref_type: string;
  readonly ref_path: string | null;
  readonly ref_id: string | null;
  readonly action: string | null;
  readonly ts: string;
  readonly metadata: Record<string, unknown>;
}

export interface SubstrateRecentWorkspacesRequest {
  readonly limit?: number;
}

export interface SubstrateRecentSessionsRequest {
  readonly limit?: number;
}

export interface SubstrateSessionsByWorkspaceRequest {
  readonly workspaceId: string;
  readonly limit?: number;
}

export interface SubstrateSessionDetailRequest {
  readonly sessionId: string;
}

export interface SubstrateWorkspaceDetailRequest {
  readonly workspaceId: string;
}

export interface SubstrateEventsBySessionRequest {
  readonly sessionId: string;
  readonly limit?: number;
}

export interface SubstrateObjectRefsBySessionRequest {
  readonly sessionId: string;
  readonly limit?: number;
}

export interface SubstrateWorkspacesResult {
  readonly workspaces: SubstrateWorkspaceRecord[];
}

export interface SubstrateSessionsResult {
  readonly sessions: SubstrateSessionRecord[];
}

export interface SubstrateSessionDetailResult {
  readonly session: SubstrateSessionRecord | null;
}

export interface SubstrateWorkspaceDetailResult {
  readonly workspace: SubstrateWorkspaceRecord | null;
}

export interface SubstrateEventsResult {
  readonly events: SubstrateEventRecord[];
}

export interface SubstrateObjectRefsResult {
  readonly refs: SubstrateObjectRefRecord[];
}
