export function resolveDefaultScopeId(profileId: string): string;
export function resolvePrimaryActorId(profileId: string): string;
export function resolvePrivateScopeDisplayName(profileId: string): string;
export function ensureProfileSubstrate(options: {
  profileId: string;
  dbPath: string;
  actorEmail?: string | null;
  actorDisplayName?: string | null;
  now?: string;
}): Promise<{
  actorId: string;
  dbPath: string;
  scopeId: string;
}>;
export function getSubstrateActor(options: {
  dbPath: string;
  actorId: string;
}): Promise<{
  id: string;
  profile_id: string;
  scope_id: string;
  kind: string;
  display_name: string;
  role: string;
  capabilities: string[];
  trust_level: string;
  approval_envelope: Record<string, unknown>;
  created_at: string;
  metadata: Record<string, unknown>;
} | null>;
export function getSubstrateScope(options: {
  dbPath: string;
  scopeId: string;
}): Promise<{
  id: string;
  profile_id: string;
  type: string;
  display_name: string;
  parent_scope_id: string | null;
  visibility: string;
  retention_policy: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
} | null>;
export type SubstrateWorkspaceOperatingMode = "preview" | "auto" | "apply";
export type SubstrateWorkspacePolicyWriteMode = "conversation" | "trusted";
export type SubstrateWorkspacePermissionMode = "once" | "always";
export interface SubstrateWorkspaceStructureEntry {
  name: string;
  type: string;
  path: string;
}
export interface SubstrateWorkspacePolicyRecord {
  workspace_root: string;
  read_granted: number;
  read_granted_at: string | null;
  read_grant_mode: SubstrateWorkspacePermissionMode | null;
  write_mode: SubstrateWorkspacePolicyWriteMode;
  operating_mode: SubstrateWorkspaceOperatingMode;
  context_paths: string[];
  pinned_paths: string[];
  known_structure: SubstrateWorkspaceStructureEntry[];
  last_hydrated_at: string | null;
}
export function upsertWorkspacePolicy(options: {
  dbPath: string;
  workspaceRoot: string;
  readGranted?: boolean;
  readGrantedAt?: string | null;
  readGrantMode?: SubstrateWorkspacePermissionMode | null;
  writeMode?: SubstrateWorkspacePolicyWriteMode;
  operatingMode?: SubstrateWorkspaceOperatingMode;
  contextPaths?: string[];
  pinnedPaths?: string[];
  knownStructure?: SubstrateWorkspaceStructureEntry[];
  lastHydratedAt?: string | null;
}): Promise<SubstrateWorkspacePolicyRecord>;
export function loadWorkspacePolicy(options: {
  dbPath: string;
  workspaceRoot: string;
}): Promise<SubstrateWorkspacePolicyRecord>;
export function rememberSubstrateWorkspace(options: {
  actorId: string;
  dbPath: string;
  now?: string;
  profileId: string;
  scopeId: string;
  workspaceRoot: string;
}): Promise<{
  id: string;
  profile_id: string;
  scope_id: string;
  root_path: string;
  display_name: string;
  registered_at: string;
  last_active_at: string | null;
  session_count: number;
  metadata: Record<string, unknown>;
  isNew: boolean;
} | null>;
export function loadAllWorkspacePolicies(options: {
  dbPath: string;
}): Promise<SubstrateWorkspacePolicyRecord[]>;
export function upsertSubstrateActor(options: {
  dbPath: string;
  actorId: string;
  profileId: string;
  scopeId: string;
  displayName: string;
  kind?: string;
  metadata?: Record<string, unknown> | null;
  now?: string;
}): Promise<{
  id: string;
  profile_id: string;
  scope_id: string;
  kind: string;
  display_name: string;
  role: string;
  capabilities: string[];
  trust_level: string;
  approval_envelope: Record<string, unknown>;
  created_at: string;
  metadata: Record<string, unknown>;
}>;
export function upsertSubstrateScopeSettingsPolicy(options: {
  dbPath: string;
  scopeId: string;
  settingsPolicy?: Record<string, unknown> | null;
}): Promise<{
  id: string;
  profile_id: string;
  type: string;
  display_name: string;
  parent_scope_id: string | null;
  visibility: string;
  retention_policy: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}>;
export function getSubstrateSessionByThreadId(options: {
  dbPath: string;
  codexThreadId: string;
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
export function deleteSubstrateSession(options: {
  dbPath: string;
  sessionId: string;
}): Promise<void>;
export function setSubstrateSessionStatus(options: {
  dbPath: string;
  sessionId: string;
  status: string;
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
export function setSubstrateWorkspaceLifecycleState(options: {
  dbPath: string;
  workspaceId: string;
  status: string;
  archivedAt?: string | null;
}): Promise<import("./contracts").SubstrateWorkspaceRecord | null>;
export function deleteSubstrateWorkspace(options: {
  dbPath: string;
  workspaceId: string;
}): Promise<import("./contracts").SubstrateWorkspaceRecord | null>;
export function listSubstrateSessionsByWorkspace(options: {
  dbPath: string;
  workspaceId: string;
}): Promise<import("./contracts").SubstrateSessionRecord[]>;
export function createSubstratePlan(options: {
  dbPath: string;
  sessionId: string;
  actorId?: string | null;
  status?: string | null;
  requestSummary?: string | null;
  assumptions?: string[];
  intendedActions?: string[];
  affectedLocations?: string[];
  metadata?: Record<string, unknown> | null;
  now?: string;
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
}>;
export function updateSubstratePlan(options: {
  dbPath: string;
  planId: string;
  actorId?: string | null;
  status?: string | null;
  requestSummary?: string | null;
  assumptions?: string[];
  intendedActions?: string[];
  affectedLocations?: string[];
  metadata?: Record<string, unknown> | null;
  now?: string;
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
}>;
export function ingestSubstratePlanSuggestion(options: {
  dbPath: string;
  sessionId: string;
  actorId?: string | null;
  prompt?: string | null;
  planData?: Record<string, unknown> | null;
  planText?: string | null;
  source?: string | null;
  turnId?: string | null;
  metadata?: Record<string, unknown> | null;
  now?: string;
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
}>;
export function resolveSubstratePlanApproval(options: {
  dbPath: string;
  planId: string;
  actorId: string;
  decision: string;
  now?: string;
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
}>;
export function appendSubstrateEvent(options: {
  dbPath: string;
  actorId: string;
  profileId: string;
  scopeId: string;
  verb: string;
  sessionId?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  detail?: unknown;
  engineTurnId?: string | null;
  engineItemId?: string | null;
  sourceEventIds?: string[] | null;
  causationId?: string | null;
  correlationId?: string | null;
  ts?: string;
}): Promise<string>;
export function appendSubstrateObjectRef(options: {
  dbPath: string;
  sessionId: string;
  refType: string;
  refPath?: string | null;
  refId?: string | null;
  action?: string | null;
  metadata?: unknown;
  ts?: string;
}): Promise<string>;
export function updateSubstrateSessionThreadTitle(options: {
  dbPath: string;
  codexThreadId: string;
  title?: string | null;
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
export function upsertSubstrateQuestion(options: {
  dbPath: string;
  sessionId: string;
  profileId: string;
  scopeId: string;
  actorId: string;
  codexThreadId: string;
  engineTurnId?: string | null;
  requestId?: number | null;
  questionId?: string | null;
  prompt: string;
  status?: string;
  answerText?: string | null;
  answeredAt?: string | null;
  targetKind?: string;
  targetId?: string | null;
  targetSnapshot?: unknown;
  metadata?: Record<string, unknown> | null;
  ts?: string;
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
}>;
export function answerSubstrateQuestion(options: {
  dbPath: string;
  questionId: string;
  answerText: string;
  answeredAt?: string;
  targetKind?: string;
  targetId?: string | null;
  targetSnapshot?: unknown;
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
export function updateSubstrateSessionReviewSummary(options: {
  dbPath: string;
  sessionId: string;
  summary?: string | null;
  updatedAt?: string | null;
}): Promise<{
  sessionId: string;
  summary: string | null;
  updatedAt: string;
}>;
export function createSubstrateSessionShell(options: {
  dbPath: string;
  profileId: string;
  scopeId: string;
  actorId: string;
  workspaceRoot?: string | null;
  artifactRoot?: string | null;
  model?: string | null;
  effort?: string | null;
  title?: string | null;
  now?: string;
}): Promise<{
  sessionId: string;
  workspaceId: string | null;
  workspaceRoot: string | null;
}>;
export function deleteSubstrateSession(options: {
  dbPath: string;
  sessionId: string;
}): Promise<void>;
export function finalizeSubstrateSessionStart(options: {
  dbPath: string;
  sessionId: string;
  codexThreadId: string;
  actorId: string;
  profileId: string;
  scopeId: string;
  artifactRoot?: string | null;
  model?: string | null;
  effort?: string | null;
  threadTitle?: string | null;
  turnId?: string | null;
  workspaceRoot?: string | null;
  now?: string;
}): Promise<{
  sessionId: string;
  workspaceId: string | null;
}>;
export function ensureSubstrateSessionForThread(options: {
  dbPath: string;
  codexThreadId: string;
  actorId: string;
  profileId: string;
  scopeId: string;
  workspaceRoot?: string | null;
  artifactRoot?: string | null;
  model?: string | null;
  effort?: string | null;
  threadTitle?: string | null;
  turnId?: string | null;
  now?: string;
}): Promise<{
  created: boolean;
  sessionId: string;
  workspaceId: string | null;
}>;
