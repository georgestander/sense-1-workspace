function parseJsonObject(value) {
  if (typeof value !== "string" || !value.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value) {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function mapWorkspaceProjectionRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    activity_summary: parseJsonArray(row.activity_summary),
    metadata: parseJsonObject(row.metadata),
    recent_file_paths: parseJsonArray(row.recent_file_paths),
  };
}

export function mapSessionProjectionRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    file_history: parseJsonArray(row.file_history),
    metadata: parseJsonObject(row.metadata),
    timeline: parseJsonArray(row.timeline),
  };
}

const PROJECTION_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS workspace_projections (
    workspace_id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    root_path TEXT NOT NULL,
    display_name TEXT,
    registered_at TEXT NOT NULL,
    last_activity_at TEXT,
    session_count INTEGER NOT NULL DEFAULT 0,
    event_count INTEGER NOT NULL DEFAULT 0,
    file_change_count INTEGER NOT NULL DEFAULT 0,
    command_count INTEGER NOT NULL DEFAULT 0,
    tool_count INTEGER NOT NULL DEFAULT 0,
    approval_count INTEGER NOT NULL DEFAULT 0,
    policy_count INTEGER NOT NULL DEFAULT 0,
    last_session_id TEXT,
    last_thread_id TEXT,
    recent_file_paths TEXT NOT NULL DEFAULT '[]',
    activity_summary TEXT NOT NULL DEFAULT '[]',
    metadata TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_workspace_projections_profile ON workspace_projections(profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_workspace_projections_activity ON workspace_projections(last_activity_at)`,
  `CREATE TABLE IF NOT EXISTS session_projections (
    session_id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    workspace_id TEXT,
    actor_id TEXT NOT NULL,
    codex_thread_id TEXT,
    title TEXT,
    model TEXT,
    effort TEXT,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    summary TEXT,
    last_activity_at TEXT,
    event_count INTEGER NOT NULL DEFAULT 0,
    file_change_count INTEGER NOT NULL DEFAULT 0,
    command_count INTEGER NOT NULL DEFAULT 0,
    tool_count INTEGER NOT NULL DEFAULT 0,
    approval_count INTEGER NOT NULL DEFAULT 0,
    policy_count INTEGER NOT NULL DEFAULT 0,
    timeline TEXT NOT NULL DEFAULT '[]',
    file_history TEXT NOT NULL DEFAULT '[]',
    metadata TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_session_projections_profile ON session_projections(profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_session_projections_workspace ON session_projections(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_session_projections_activity ON session_projections(last_activity_at)`,
];

export function ensureProjectionSchema(db) {
  for (const statement of PROJECTION_SCHEMA) {
    db.exec(statement);
  }
}

export function clearProjectionRows(db, profileId = null, firstString) {
  const resolvedProfileId = firstString(profileId);
  if (resolvedProfileId) {
    db.prepare("DELETE FROM workspace_projections WHERE profile_id = ?").run(resolvedProfileId);
    db.prepare("DELETE FROM session_projections WHERE profile_id = ?").run(resolvedProfileId);
    return;
  }

  db.exec("DELETE FROM workspace_projections");
  db.exec("DELETE FROM session_projections");
}
