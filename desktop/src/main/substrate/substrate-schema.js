import { firstString } from "./substrate-store-core.js";

function sanitizeScopeToken(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");

  return normalized || fallback;
}

function sanitizeActorToken(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || fallback;
}

function toDisplayName(email) {
  const localPart = firstString(email)?.split("@")[0] ?? "";
  const normalized = localPart.replace(/[._-]+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS scopes (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    type TEXT NOT NULL,
    display_name TEXT NOT NULL,
    parent_scope_id TEXT,
    visibility TEXT NOT NULL DEFAULT 'private',
    retention_policy TEXT,
    created_at TEXT NOT NULL,
    metadata TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_scopes_profile ON scopes(profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_scopes_type ON scopes(type)`,
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    verb TEXT NOT NULL,
    subject_type TEXT,
    subject_id TEXT,
    before_state TEXT,
    after_state TEXT,
    detail TEXT,
    engine_turn_id TEXT,
    engine_item_id TEXT,
    source_event_ids TEXT,
    causation_id TEXT,
    correlation_id TEXT,
    session_id TEXT,
    profile_id TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_events_scope ON events(scope_id)`,
  `CREATE INDEX IF NOT EXISTS idx_events_verb ON events(verb)`,
  `CREATE INDEX IF NOT EXISTS idx_events_subject ON events(subject_type, subject_id)`,
  `CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts)`,
  `CREATE INDEX IF NOT EXISTS idx_events_profile ON events(profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_events_engine_turn ON events(engine_turn_id)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    codex_thread_id TEXT,
    workspace_id TEXT,
    title TEXT,
    model TEXT,
    effort TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    started_at TEXT NOT NULL,
    ended_at TEXT,
    summary TEXT,
    metadata TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_profile ON sessions(profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_scope ON sessions(scope_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`,
  `CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed',
    request_summary TEXT,
    assumptions TEXT,
    intended_actions TEXT,
    affected_locations TEXT,
    approval_status TEXT NOT NULL DEFAULT 'pending',
    approved_by_actor_id TEXT,
    approved_at TEXT,
    rejected_by_actor_id TEXT,
    rejected_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    metadata TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_plans_session ON plans(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_plans_profile ON plans(profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_plans_approval_status ON plans(approval_status)`,
  `CREATE INDEX IF NOT EXISTS idx_plans_updated ON plans(updated_at)`,
  `CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    root_path TEXT NOT NULL,
    display_name TEXT,
    registered_at TEXT NOT NULL,
    last_active_at TEXT,
    session_count INTEGER DEFAULT 0,
    metadata TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_path ON workspaces(scope_id, root_path)`,
  `CREATE INDEX IF NOT EXISTS idx_workspaces_profile ON workspaces(profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_workspaces_scope ON workspaces(scope_id)`,
  `CREATE INDEX IF NOT EXISTS idx_workspaces_active ON workspaces(last_active_at)`,
  `CREATE TABLE IF NOT EXISTS workspace_policies (
    workspace_root TEXT PRIMARY KEY,
    read_granted INTEGER NOT NULL DEFAULT 0,
    read_granted_at TEXT,
    read_grant_mode TEXT,
    write_mode TEXT NOT NULL DEFAULT 'conversation',
    operating_mode TEXT NOT NULL DEFAULT 'auto',
    context_paths TEXT NOT NULL DEFAULT '[]',
    pinned_paths TEXT NOT NULL DEFAULT '[]',
    known_structure TEXT NOT NULL DEFAULT '[]',
    last_hydrated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS actors (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    capabilities TEXT NOT NULL DEFAULT '[]',
    trust_level TEXT NOT NULL DEFAULT 'medium',
    approval_envelope TEXT,
    created_at TEXT NOT NULL,
    metadata TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_actors_profile ON actors(profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_actors_scope ON actors(scope_id)`,
  `CREATE INDEX IF NOT EXISTS idx_actors_role ON actors(role)`,
  `CREATE INDEX IF NOT EXISTS idx_actors_trust_level ON actors(trust_level)`,
  `CREATE TABLE IF NOT EXISTS object_refs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    ref_type TEXT NOT NULL,
    ref_path TEXT,
    ref_id TEXT,
    action TEXT,
    ts TEXT NOT NULL,
    metadata TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_object_refs_session ON object_refs(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_object_refs_type ON object_refs(ref_type)`,
  `CREATE INDEX IF NOT EXISTS idx_object_refs_path ON object_refs(ref_path)`,
  `CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    codex_thread_id TEXT NOT NULL,
    engine_turn_id TEXT,
    request_id INTEGER,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    answer_text TEXT,
    asked_at TEXT NOT NULL,
    answered_at TEXT,
    target_kind TEXT NOT NULL DEFAULT 'pending_run',
    target_id TEXT,
    target_snapshot TEXT,
    metadata TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_questions_session ON questions(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_questions_thread ON questions(codex_thread_id)`,
  `CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status)`,
  `CREATE INDEX IF NOT EXISTS idx_questions_asked_at ON questions(asked_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_session_request
    ON questions(session_id, request_id)
    WHERE request_id IS NOT NULL`,
];

const ACTOR_COLUMN_MIGRATIONS = [
  "role TEXT NOT NULL DEFAULT 'member'",
  "capabilities TEXT NOT NULL DEFAULT '[]'",
  "trust_level TEXT NOT NULL DEFAULT 'medium'",
  "approval_envelope TEXT",
];

const WORKSPACE_POLICY_COLUMN_MIGRATIONS = [
  "read_grant_mode TEXT",
  "operating_mode TEXT NOT NULL DEFAULT 'auto'",
];

export function resolveDefaultScopeId(profileId) {
  return `scope_${sanitizeScopeToken(profileId, "default")}_private`;
}

export function resolvePrimaryActorId(profileId) {
  return `actor_${sanitizeActorToken(profileId, "default")}_primary`;
}

export function resolvePrivateScopeDisplayName(profileId) {
  const resolvedProfileId = firstString(profileId) ?? "default";
  return `${resolvedProfileId} private`;
}

export function resolveActorDisplayName({ actorDisplayName, actorEmail, existingDisplayName }) {
  return (
    firstString(actorDisplayName) ||
    toDisplayName(actorEmail) ||
    firstString(existingDisplayName) ||
    "Primary user"
  );
}

export function ensureActorSchemaColumns(db) {
  const existingColumns = new Set(
    db.prepare("PRAGMA table_info(actors)").all().map((row) => String(row.name)),
  );
  for (const columnDefinition of ACTOR_COLUMN_MIGRATIONS) {
    const columnName = columnDefinition.split(/\s+/)[0];
    if (existingColumns.has(columnName)) {
      continue;
    }

    db.exec(`ALTER TABLE actors ADD COLUMN ${columnDefinition}`);
  }

  db.exec("CREATE INDEX IF NOT EXISTS idx_actors_role ON actors(role)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_actors_trust_level ON actors(trust_level)");
}

export function ensureWorkspacePolicySchemaColumns(db) {
  const existingColumns = new Set(
    db.prepare("PRAGMA table_info(workspace_policies)").all().map((row) => String(row.name)),
  );
  for (const columnDefinition of WORKSPACE_POLICY_COLUMN_MIGRATIONS) {
    const columnName = columnDefinition.split(/\s+/)[0];
    if (existingColumns.has(columnName)) {
      continue;
    }

    db.exec(`ALTER TABLE workspace_policies ADD COLUMN ${columnDefinition}`);
  }
}
