import { dedupeReviewArtifacts } from "../review-summary.ts";

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

function asRecord(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value;
}

export function reviewArtifactsFromFileChangeItem(item, recordedAt = null) {
  if (item?.type !== "fileChange" || !Array.isArray(item.changes)) {
    return [];
  }

  return dedupeReviewArtifacts(
    item.changes.map((change, index) => ({
      action: firstString(change?.kind) || "modified",
      id: firstString(item.id, change?.path) || `file-change-${index}`,
      metadata: {
        itemId: firstString(item.id),
        source: "item/completed",
        status: firstString(item.status),
      },
      path: firstString(change?.path),
      recordedAt,
      refId: firstString(item.id),
      refType: "file",
    })),
  );
}

export function reviewArtifactsFromDiffs(diffs, recordedAt = null) {
  return dedupeReviewArtifacts(
    (Array.isArray(diffs) ? diffs : []).map((diff, index) => ({
      action: "modified",
      id: firstString(diff?.path) || `diff-${index}`,
      metadata: {
        hunkCount: Array.isArray(diff?.hunks) ? diff.hunks.length : 0,
        source: "turn/diff/updated",
      },
      path: firstString(diff?.path),
      recordedAt,
      refType: "file",
    })),
  );
}

function normalizeDiffEntry(diff) {
  const record = asRecord(diff);
  if (!record) {
    return null;
  }

  const before = asRecord(record.before);
  const after = asRecord(record.after);
  const previous = asRecord(record.previous);
  const next = asRecord(record.next);
  const from = asRecord(record.from);
  const to = asRecord(record.to);
  const oldValue = asRecord(record.old);
  const newValue = asRecord(record.new);
  const file = asRecord(record.file);
  const path = firstString(
    record.path,
    record.filePath,
    record.newPath,
    record.oldPath,
    before?.path,
    after?.path,
    previous?.path,
    next?.path,
    from?.path,
    to?.path,
    oldValue?.path,
    newValue?.path,
    file?.path,
  );
  if (!path) {
    return null;
  }

  const hunks = Array.isArray(record.hunks)
    ? record.hunks
    : Array.isArray(record.diffHunks)
      ? record.diffHunks
      : [];

  return hunks.length > 0 ? { path, hunks } : { path };
}

export function resolveDiffEntries(value) {
  const diffs = [];
  const seenPaths = new Set();

  const visit = (candidate) => {
    if (typeof candidate === "string") {
      const path = firstString(candidate);
      if (path && !seenPaths.has(path)) {
        seenPaths.add(path);
        diffs.push({ path });
      }
      return;
    }

    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        visit(entry);
      }
      return;
    }

    const record = asRecord(candidate);
    if (!record) {
      return;
    }

    const normalized = normalizeDiffEntry(record);
    if (normalized && !seenPaths.has(normalized.path)) {
      seenPaths.add(normalized.path);
      diffs.push(normalized);
    }

    visit(record.diff);
    visit(record.diffs);
    visit(record.files);
    visit(record.changes);
    visit(record.fileChanges);
    visit(record.paths);
    visit(record.filePaths);
  };

  visit(value);
  return diffs;
}

export function mergeDiffEntries(existingDiffs, nextDiffs) {
  const mergedByPath = new Map();

  for (const diff of [...(Array.isArray(existingDiffs) ? existingDiffs : []), ...(Array.isArray(nextDiffs) ? nextDiffs : [])]) {
    const normalized = normalizeDiffEntry(diff);
    if (!normalized) {
      continue;
    }

    const current = mergedByPath.get(normalized.path) ?? null;
    if (!current) {
      mergedByPath.set(normalized.path, normalized);
      continue;
    }

    mergedByPath.set(normalized.path, {
      path: normalized.path,
      ...(Array.isArray(normalized.hunks) && normalized.hunks.length > 0
        ? { hunks: normalized.hunks }
        : Array.isArray(current.hunks) && current.hunks.length > 0
          ? { hunks: current.hunks }
          : {}),
    });
  }

  return Array.from(mergedByPath.values());
}
