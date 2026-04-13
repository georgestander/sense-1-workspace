export function parseJsonObject(value) {
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

export function parseJsonStringArray(value) {
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

export function parseJsonValue(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function serializeJson(value) {
  if (value === undefined || value === null) {
    return null;
  }

  return JSON.stringify(value);
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

export function mapScopeRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    metadata: parseJsonObject(row.metadata),
  };
}

export function mapActorRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    approval_envelope: parseJsonObject(row.approval_envelope),
    capabilities: (() => {
      if (Array.isArray(row.capabilities)) {
        return row.capabilities.filter((entry) => typeof entry === "string");
      }

      if (typeof row.capabilities !== "string" || !row.capabilities.trim()) {
        return [];
      }

      try {
        const parsed = JSON.parse(row.capabilities);
        return Array.isArray(parsed)
          ? parsed.filter((entry) => typeof entry === "string")
          : [];
      } catch {
        return [];
      }
    })(),
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
    target_snapshot: parseJsonValue(row.target_snapshot),
  };
}
