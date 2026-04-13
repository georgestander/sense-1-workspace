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

function parseJsonStringArray(value) {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export function parseJsonOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function mapSessionRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    metadata: parseJsonObject(row.metadata),
  };
}

export function mapWorkspaceRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    metadata: parseJsonObject(row.metadata),
  };
}

export function mapPlanRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    affected_locations: parseJsonStringArray(row.affected_locations),
    assumptions: parseJsonStringArray(row.assumptions),
    intended_actions: parseJsonStringArray(row.intended_actions),
    metadata: parseJsonObject(row.metadata),
  };
}

export function mapEventRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    before_state: parseJsonOrNull(row.before_state),
    after_state: parseJsonOrNull(row.after_state),
    detail: parseJsonOrNull(row.detail),
    source_event_ids: parseJsonOrNull(row.source_event_ids),
  };
}

export function mapObjectRefRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    metadata: parseJsonObject(row.metadata),
  };
}

export function mapQuestionRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    metadata: parseJsonObject(row.metadata),
    target_snapshot: parseJsonOrNull(row.target_snapshot),
  };
}
