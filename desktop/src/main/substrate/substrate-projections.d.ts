export function clearSubstrateProjections(options: {
  dbPath: string;
  profileId?: string | null;
}): Promise<void>;

export function rebuildSubstrateProjections(options: {
  dbPath: string;
  profileId?: string | null;
}): Promise<{
  profileId: string | null;
  rebuiltAt: string;
  sessionCount: number;
  sourceEventCount: number;
  workspaceCount: number;
}>;

export function listProjectedWorkspaces(options: {
  dbPath: string;
  profileId: string;
  limit?: number;
  rootPath?: string | null;
}): Promise<Array<{
  workspace_id: string;
  profile_id: string;
  scope_id: string;
  root_path: string;
  display_name: string | null;
  registered_at: string;
  last_activity_at: string | null;
  session_count: number;
  event_count: number;
  file_change_count: number;
  command_count: number;
  tool_count: number;
  approval_count: number;
  policy_count: number;
  last_session_id: string | null;
  last_thread_id: string | null;
  recent_file_paths: string[];
  activity_summary: Array<{
    id: string;
    ts: string;
    verb: string;
    subjectType: string | null;
    subjectId: string | null;
    detail: Record<string, unknown> | null;
    engineTurnId: string | null;
    engineItemId: string | null;
  }>;
  metadata: Record<string, unknown>;
}>>;

export function listProjectedSessions(options: {
  dbPath: string;
  profileId: string;
  workspaceId?: string | null;
  limit?: number;
}): Promise<Array<{
  session_id: string;
  profile_id: string;
  scope_id: string;
  workspace_id: string | null;
  actor_id: string;
  codex_thread_id: string | null;
  title: string | null;
  model: string | null;
  effort: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  last_activity_at: string | null;
  event_count: number;
  file_change_count: number;
  command_count: number;
  tool_count: number;
  approval_count: number;
  policy_count: number;
  timeline: Array<{
    id: string;
    ts: string;
    verb: string;
    subjectType: string | null;
    subjectId: string | null;
    detail: Record<string, unknown> | null;
    engineTurnId: string | null;
    engineItemId: string | null;
  }>;
  file_history: Array<{
    id: string;
    ts: string;
    path: string | null;
    verb: string;
    detail: Record<string, unknown> | null;
  }>;
  metadata: Record<string, unknown>;
}>>;

export function getProjectedWorkspace(options: {
  dbPath: string;
  workspaceId: string;
}): Promise<{
  workspace_id: string;
  profile_id: string;
  scope_id: string;
  root_path: string;
  display_name: string | null;
  registered_at: string;
  last_activity_at: string | null;
  session_count: number;
  event_count: number;
  file_change_count: number;
  command_count: number;
  tool_count: number;
  approval_count: number;
  policy_count: number;
  last_session_id: string | null;
  last_thread_id: string | null;
  recent_file_paths: string[];
  activity_summary: Array<{
    id: string;
    ts: string;
    verb: string;
    subjectType: string | null;
    subjectId: string | null;
    detail: Record<string, unknown> | null;
    engineTurnId: string | null;
    engineItemId: string | null;
  }>;
  metadata: Record<string, unknown>;
} | null>;

export function getProjectedWorkspaceByRootPath(options: {
  dbPath: string;
  profileId: string;
  rootPath: string;
}): Promise<{
  workspace_id: string;
  profile_id: string;
  scope_id: string;
  root_path: string;
  display_name: string | null;
  registered_at: string;
  last_activity_at: string | null;
  session_count: number;
  event_count: number;
  file_change_count: number;
  command_count: number;
  tool_count: number;
  approval_count: number;
  policy_count: number;
  last_session_id: string | null;
  last_thread_id: string | null;
  recent_file_paths: string[];
  activity_summary: Array<{
    id: string;
    ts: string;
    verb: string;
    subjectType: string | null;
    subjectId: string | null;
    detail: Record<string, unknown> | null;
    engineTurnId: string | null;
    engineItemId: string | null;
  }>;
  metadata: Record<string, unknown>;
} | null>;

export function getProjectedSession(options: {
  dbPath: string;
  sessionId: string;
}): Promise<{
  session_id: string;
  profile_id: string;
  scope_id: string;
  workspace_id: string | null;
  actor_id: string;
  codex_thread_id: string | null;
  title: string | null;
  model: string | null;
  effort: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  last_activity_at: string | null;
  event_count: number;
  file_change_count: number;
  command_count: number;
  tool_count: number;
  approval_count: number;
  policy_count: number;
  timeline: Array<{
    id: string;
    ts: string;
    verb: string;
    subjectType: string | null;
    subjectId: string | null;
    detail: Record<string, unknown> | null;
    engineTurnId: string | null;
    engineItemId: string | null;
  }>;
  file_history: Array<{
    id: string;
    ts: string;
    path: string | null;
    verb: string;
    detail: Record<string, unknown> | null;
  }>;
  metadata: Record<string, unknown>;
} | null>;
