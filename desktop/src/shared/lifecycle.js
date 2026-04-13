function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

export function resolveWorkspaceLifecycleState(metadata) {
  const record = asRecord(metadata);
  const lifecycle = asRecord(record?.lifecycle);
  const status = firstString(
    lifecycle?.status,
    record?.workspaceStatus,
  );

  if (status === "archived") {
    return {
      status: "archived",
      archivedAt: firstString(lifecycle?.archivedAt, record?.workspaceArchivedAt),
    };
  }

  return {
    status: "active",
    archivedAt: null,
  };
}

export function setWorkspaceLifecycleState(metadata, status, archivedAt = null) {
  const record = asRecord(metadata) ? { ...metadata } : {};
  const nextLifecycle = {
    ...(asRecord(record.lifecycle) ?? {}),
    status: status === "archived" ? "archived" : "active",
    archivedAt: status === "archived" ? firstString(archivedAt) ?? new Date().toISOString() : null,
  };

  record.lifecycle = nextLifecycle;
  return record;
}

export function isWorkspaceArchived(metadata) {
  return resolveWorkspaceLifecycleState(metadata).status === "archived";
}

export function isSessionArchived(session) {
  return firstString(session?.status) === "archived";
}
