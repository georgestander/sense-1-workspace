export function listRecentWorkspaces(options: {
  dbPath: string;
  profileId: string;
  limit?: number;
}): Promise<Array<{
  id: string;
  profile_id: string;
  scope_id: string;
  root_path: string;
  display_name: string | null;
  registered_at: string;
  last_active_at: string | null;
  session_count: number;
  metadata: Record<string, unknown>;
}>>;
export function listRecentSessions(options: {
  dbPath: string;
  profileId: string;
  limit?: number;
}): Promise<Array<{
  id: string;
  profile_id: string;
  scope_id: string;
  actor_id: string;
  codex_thread_id: string | null;
  workspace_id: string | null;
  title: string | null;
  model: string | null;
  effort: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
}>>;
export function listSessionsByWorkspace(options: {
  dbPath: string;
  workspaceId: string;
  limit?: number;
}): Promise<Array<{
  id: string;
  profile_id: string;
  scope_id: string;
  actor_id: string;
  codex_thread_id: string | null;
  workspace_id: string | null;
  title: string | null;
  model: string | null;
  effort: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
}>>;
export function getSession(options: {
  dbPath: string;
  sessionId: string;
}): Promise<{
  id: string;
  profile_id: string;
  scope_id: string;
  actor_id: string;
  codex_thread_id: string | null;
  workspace_id: string | null;
  title: string | null;
  model: string | null;
  effort: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
} | null>;
export function getWorkspace(options: {
  dbPath: string;
  workspaceId: string;
}): Promise<{
  id: string;
  profile_id: string;
  scope_id: string;
  root_path: string;
  display_name: string | null;
  registered_at: string;
  last_active_at: string | null;
  session_count: number;
  metadata: Record<string, unknown>;
} | null>;
export function getPlan(options: {
  dbPath: string;
  planId: string;
}): Promise<{
  id: string;
  session_id: string;
  profile_id: string;
  scope_id: string;
  actor_id: string;
  status: string;
  request_summary: string | null;
  assumptions: string[];
  intended_actions: string[];
  affected_locations: string[];
  approval_status: string;
  approved_by_actor_id: string | null;
  approved_at: string | null;
  rejected_by_actor_id: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
} | null>;
export function listPlansBySession(options: {
  dbPath: string;
  sessionId: string;
  limit?: number;
}): Promise<Array<{
  id: string;
  session_id: string;
  profile_id: string;
  scope_id: string;
  actor_id: string;
  status: string;
  request_summary: string | null;
  assumptions: string[];
  intended_actions: string[];
  affected_locations: string[];
  approval_status: string;
  approved_by_actor_id: string | null;
  approved_at: string | null;
  rejected_by_actor_id: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}>>;
export function listEventsBySession(options: {
  dbPath: string;
  sessionId: string;
  limit?: number;
}): Promise<Array<{
  id: string;
  ts: string;
  actor_id: string;
  scope_id: string;
  verb: string;
  subject_type: string | null;
  subject_id: string | null;
  before_state: unknown;
  after_state: unknown;
  detail: unknown;
  engine_turn_id: string | null;
  engine_item_id: string | null;
  source_event_ids: string[] | null;
  causation_id: string | null;
  correlation_id: string | null;
  session_id: string | null;
  profile_id: string;
}>>;
export function listObjectRefsBySession(options: {
  dbPath: string;
  sessionId: string;
  limit?: number;
}): Promise<Array<{
  id: string;
  session_id: string;
  ref_type: string;
  ref_path: string | null;
  ref_id: string | null;
  action: string | null;
  ts: string;
  metadata: Record<string, unknown>;
}>>;
export function listQuestionsBySession(options: {
  dbPath: string;
  sessionId: string;
  limit?: number;
}): Promise<Array<{
  id: string;
  profile_id: string;
  scope_id: string;
  session_id: string;
  actor_id: string;
  codex_thread_id: string;
  engine_turn_id: string | null;
  request_id: number | null;
  prompt: string;
  status: string;
  answer_text: string | null;
  asked_at: string;
  answered_at: string | null;
  target_kind: string;
  target_id: string | null;
  target_snapshot: unknown;
  metadata: Record<string, unknown>;
}>>;
export function getPendingQuestionByThreadId(options: {
  dbPath: string;
  codexThreadId: string;
}): Promise<{
  id: string;
  profile_id: string;
  scope_id: string;
  session_id: string;
  actor_id: string;
  codex_thread_id: string;
  engine_turn_id: string | null;
  request_id: number | null;
  prompt: string;
  status: string;
  answer_text: string | null;
  asked_at: string;
  answered_at: string | null;
  target_kind: string;
  target_id: string | null;
  target_snapshot: unknown;
  metadata: Record<string, unknown>;
} | null>;
export function getPendingQuestionByRequestId(options: {
  dbPath: string;
  requestId: number;
}): Promise<{
  id: string;
  profile_id: string;
  scope_id: string;
  session_id: string;
  actor_id: string;
  codex_thread_id: string;
  engine_turn_id: string | null;
  request_id: number | null;
  prompt: string;
  status: string;
  answer_text: string | null;
  asked_at: string;
  answered_at: string | null;
  target_kind: string;
  target_id: string | null;
  target_snapshot: unknown;
  metadata: Record<string, unknown>;
} | null>;
export function getLatestPlanForSession(options: {
  dbPath: string;
  sessionId: string;
  engineTurnId?: string | null;
}): Promise<{
  eventId: string;
  subjectId: string | null;
  engineTurnId: string | null;
  planText: string | null;
  planSteps: string[];
  ts: string;
} | null>;
