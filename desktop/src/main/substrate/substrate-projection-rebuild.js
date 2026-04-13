function buildWorkspaceProjection(workspace, { firstString, parseJsonObject }) {
  return {
    workspace_id: workspace.id,
    profile_id: workspace.profile_id,
    scope_id: workspace.scope_id,
    root_path: workspace.root_path,
    display_name: workspace.display_name,
    registered_at: workspace.registered_at,
    last_activity_at: firstString(workspace.last_active_at, workspace.registered_at),
    session_count: 0,
    event_count: 0,
    file_change_count: 0,
    command_count: 0,
    tool_count: 0,
    approval_count: 0,
    policy_count: 0,
    last_session_id: null,
    last_thread_id: null,
    recent_file_paths: [],
    activity_summary: [],
    metadata: parseJsonObject(workspace.metadata),
  };
}

function buildSessionProjection(session, { firstString, parseJsonObject }) {
  return {
    session_id: session.id,
    profile_id: session.profile_id,
    scope_id: session.scope_id,
    workspace_id: session.workspace_id,
    actor_id: session.actor_id,
    codex_thread_id: session.codex_thread_id,
    title: session.title,
    model: session.model,
    effort: session.effort,
    status: session.status,
    started_at: session.started_at,
    ended_at: session.ended_at,
    summary: session.summary,
    last_activity_at: firstString(session.started_at),
    event_count: 0,
    file_change_count: 0,
    command_count: 0,
    tool_count: 0,
    approval_count: 0,
    policy_count: 0,
    timeline: [],
    file_history: [],
    metadata: parseJsonObject(session.metadata),
  };
}

function updateProjectionCounts(projection, eventClass) {
  projection.event_count += 1;
  if (eventClass === "file") {
    projection.file_change_count += 1;
  }
  if (eventClass === "command") {
    projection.command_count += 1;
  }
  if (eventClass === "tool") {
    projection.tool_count += 1;
  }
  if (eventClass === "approval") {
    projection.approval_count += 1;
  }
  if (eventClass === "policy") {
    projection.policy_count += 1;
  }
}

function buildTimelineEntry(event, { asRecord, parseJsonObject }) {
  return {
    id: event.id,
    ts: event.ts,
    verb: event.verb,
    subjectType: event.subject_type,
    subjectId: event.subject_id,
    detail: asRecord(parseJsonObject(event.detail)) ?? null,
    engineTurnId: event.engine_turn_id,
    engineItemId: event.engine_item_id,
  };
}

function resolveEventPath(event, { asRecord, firstString, parseJsonValue }) {
  const afterState = asRecord(parseJsonValue(event.after_state));
  const beforeState = asRecord(parseJsonValue(event.before_state));
  const detail = asRecord(parseJsonValue(event.detail));
  return firstString(
    event.subject_id,
    afterState?.path,
    beforeState?.path,
    detail?.path,
  );
}

function buildFileHistoryEntry(event, helpers) {
  return {
    id: event.id,
    ts: event.ts,
    path: resolveEventPath(event, helpers),
    verb: event.verb,
    detail: helpers.asRecord(helpers.parseJsonObject(event.detail)) ?? null,
  };
}

function insertWorkspaceProjection(db, projection) {
  db.prepare(
    `INSERT INTO workspace_projections (
      workspace_id,
      profile_id,
      scope_id,
      root_path,
      display_name,
      registered_at,
      last_activity_at,
      session_count,
      event_count,
      file_change_count,
      command_count,
      tool_count,
      approval_count,
      policy_count,
      last_session_id,
      last_thread_id,
      recent_file_paths,
      activity_summary,
      metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    projection.workspace_id,
    projection.profile_id,
    projection.scope_id,
    projection.root_path,
    projection.display_name,
    projection.registered_at,
    projection.last_activity_at,
    projection.session_count,
    projection.event_count,
    projection.file_change_count,
    projection.command_count,
    projection.tool_count,
    projection.approval_count,
    projection.policy_count,
    projection.last_session_id,
    projection.last_thread_id,
    JSON.stringify([...projection.recent_file_paths].reverse()),
    JSON.stringify([...projection.activity_summary].reverse()),
    JSON.stringify(projection.metadata),
  );
}

function insertSessionProjection(db, projection) {
  db.prepare(
    `INSERT INTO session_projections (
      session_id,
      profile_id,
      scope_id,
      workspace_id,
      actor_id,
      codex_thread_id,
      title,
      model,
      effort,
      status,
      started_at,
      ended_at,
      summary,
      last_activity_at,
      event_count,
      file_change_count,
      command_count,
      tool_count,
      approval_count,
      policy_count,
      timeline,
      file_history,
      metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    projection.session_id,
    projection.profile_id,
    projection.scope_id,
    projection.workspace_id,
    projection.actor_id,
    projection.codex_thread_id,
    projection.title,
    projection.model,
    projection.effort,
    projection.status,
    projection.started_at,
    projection.ended_at,
    projection.summary,
    projection.last_activity_at,
    projection.event_count,
    projection.file_change_count,
    projection.command_count,
    projection.tool_count,
    projection.approval_count,
    projection.policy_count,
    JSON.stringify(projection.timeline),
    JSON.stringify([...projection.file_history].reverse()),
    JSON.stringify(projection.metadata),
  );
}

function classifyEvent(verb, subjectType, { firstString }) {
  const resolvedVerb = firstString(verb) ?? "";
  const resolvedSubjectType = firstString(subjectType) ?? "";
  if (resolvedVerb.startsWith("file.") || resolvedSubjectType === "file") {
    return "file";
  }

  if (resolvedVerb.startsWith("command.") || resolvedSubjectType === "command") {
    return "command";
  }

  if (resolvedVerb.startsWith("tool.") || resolvedSubjectType === "tool") {
    return "tool";
  }

  if (resolvedVerb.startsWith("approval.") || resolvedSubjectType === "approval") {
    return "approval";
  }

  if (resolvedVerb.startsWith("policy.") || resolvedSubjectType === "policy") {
    return "policy";
  }

  return "activity";
}

export function rebuildProjectionRows({
  eventRows,
  helpers,
  sessionRows,
  workspaceRows,
}) {
  const workspaceProjectionById = new Map();
  const sessionProjectionById = new Map();

  for (const row of workspaceRows) {
    workspaceProjectionById.set(row.id, buildWorkspaceProjection(row, helpers));
  }

  for (const row of sessionRows) {
    const projection = buildSessionProjection(row, helpers);
    sessionProjectionById.set(row.id, projection);
    if (projection.workspace_id && workspaceProjectionById.has(projection.workspace_id)) {
      const workspaceProjection = workspaceProjectionById.get(projection.workspace_id);
      workspaceProjection.session_count += 1;
      workspaceProjection.last_session_id = projection.session_id;
      workspaceProjection.last_thread_id = projection.codex_thread_id;
      workspaceProjection.last_activity_at = helpers.maxTimestamp(
        workspaceProjection.last_activity_at,
        projection.started_at,
      );
    }
  }

  for (const row of eventRows) {
    const sessionProjection = helpers.firstString(row.session_id)
      ? sessionProjectionById.get(row.session_id)
      : null;
    const eventClass = classifyEvent(row.verb, row.subject_type, helpers);
    if (sessionProjection) {
      sessionProjection.last_activity_at = helpers.maxTimestamp(sessionProjection.last_activity_at, row.ts);
      updateProjectionCounts(sessionProjection, eventClass);
      helpers.pushBounded(sessionProjection.timeline, buildTimelineEntry(row, helpers), 25);
      if (eventClass === "file" && resolveEventPath(row, helpers)) {
        helpers.pushBounded(sessionProjection.file_history, buildFileHistoryEntry(row, helpers), 25);
      }
    }

    const workspaceProjection = sessionProjection?.workspace_id
      ? workspaceProjectionById.get(sessionProjection.workspace_id)
      : null;
    if (workspaceProjection) {
      workspaceProjection.last_activity_at = helpers.maxTimestamp(workspaceProjection.last_activity_at, row.ts);
      workspaceProjection.last_session_id = sessionProjection.session_id;
      workspaceProjection.last_thread_id = sessionProjection.codex_thread_id;
      updateProjectionCounts(workspaceProjection, eventClass);
      helpers.pushBounded(workspaceProjection.activity_summary, buildTimelineEntry(row, helpers), 15);
      const eventPath = eventClass === "file" ? resolveEventPath(row, helpers) : null;
      if (eventPath) {
        helpers.pushUniqueRecent(workspaceProjection.recent_file_paths, eventPath, 15);
      }
    }
  }

  return {
    sessionProjectionById,
    workspaceProjectionById,
  };
}

export function insertProjectionRows({
  db,
  sessionProjectionById,
  workspaceProjectionById,
}) {
  for (const projection of workspaceProjectionById.values()) {
    insertWorkspaceProjection(db, projection);
  }

  for (const projection of sessionProjectionById.values()) {
    insertSessionProjection(db, projection);
  }
}
