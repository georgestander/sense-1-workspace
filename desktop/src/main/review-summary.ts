type ReviewArtifactRecord = Record<string, unknown>;

type ReviewArtifactRef = {
  action: string | null;
  id: string;
  metadata: ReviewArtifactRecord;
  path: string | null;
  recordedAt: string | null;
  refId: string | null;
  refType: string;
};

type BuildStructuredReviewSummaryOptions = {
  changedArtifacts?: unknown[];
  summary?: string | null;
  updatedAt?: string | null;
};

function firstString(...values: Array<string | null | undefined>): string | null {
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

function asRecord(value: unknown): ReviewArtifactRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as ReviewArtifactRecord;
}

const CREATED_ACTIONS = new Set(["add", "added", "create", "created", "exported", "generated", "saved", "write", "written"]);
const MODIFIED_ACTIONS = new Set(["change", "changed", "edit", "edited", "modify", "modified", "patch", "patched", "rename", "renamed", "rewrite", "rewritten", "update", "updated"]);

function normalizedActionKind(action: string | null | undefined): string | null {
  const resolvedAction = firstString(action)?.toLowerCase();
  if (!resolvedAction) {
    return null;
  }

  if (CREATED_ACTIONS.has(resolvedAction)) {
    return "created";
  }

  if (MODIFIED_ACTIONS.has(resolvedAction)) {
    return "modified";
  }

  return resolvedAction;
}

function isFileArtifact(artifact: Partial<ReviewArtifactRef> | null | undefined): boolean {
  return firstString(artifact?.refType)?.toLowerCase() === "file" && Boolean(firstString(artifact?.path));
}

function isOutputArtifact(artifact: Partial<ReviewArtifactRef> | null | undefined): boolean {
  const refType = firstString(artifact?.refType)?.toLowerCase();
  if (!refType || refType === "question" || refType === "plan") {
    return false;
  }

  const metadata = asRecord(artifact?.metadata);
  const metadataRole = firstString(
    typeof metadata?.role === "string" ? metadata.role : null,
    typeof metadata?.kind === "string" ? metadata.kind : null,
    typeof metadata?.category === "string" ? metadata.category : null,
  )?.toLowerCase();
  if (metadata?.output === true || metadata?.isOutput === true || metadataRole === "output") {
    return true;
  }

  if (refType !== "file") {
    return true;
  }

  return normalizedActionKind(artifact?.action) === "created";
}

export function normalizeReviewArtifactRef({
  action = null,
  id = null,
  metadata = null,
  path = null,
  recordedAt = null,
  refId = null,
  refType = "file",
}: {
  action?: string | null;
  id?: string | null;
  metadata?: unknown;
  path?: string | null;
  recordedAt?: string | null;
  refId?: string | null;
  refType?: string | null;
} = {}): ReviewArtifactRef | null {
  const resolvedPath = firstString(path);
  const resolvedId = firstString(id, refId, resolvedPath);
  const resolvedMetadata = asRecord(metadata) ? { ...asRecord(metadata)! } : {};
  if (!resolvedId) {
    return null;
  }

  return {
    id: resolvedId,
    refType: firstString(refType) || "file",
    path: resolvedPath,
    refId: firstString(refId),
    action: firstString(action),
    recordedAt: firstString(recordedAt),
    metadata: resolvedMetadata,
  };
}

export function dedupeReviewArtifacts(artifacts: unknown): ReviewArtifactRef[] {
  const byKey = new Map<string, ReviewArtifactRef>();
  for (const artifact of Array.isArray(artifacts) ? artifacts : []) {
    const normalized = normalizeReviewArtifactRef(artifact as Parameters<typeof normalizeReviewArtifactRef>[0]);
    if (!normalized) {
      continue;
    }

    const key = [normalized.refType, normalized.path ?? "", normalized.refId ?? "", normalized.action ?? ""].join("::");
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, normalized);
      continue;
    }

    const existingTime = Date.parse(existing.recordedAt ?? "");
    const nextTime = Date.parse(normalized.recordedAt ?? "");
    if (Number.isNaN(existingTime) || (!Number.isNaN(nextTime) && nextTime >= existingTime)) {
      byKey.set(key, normalized);
    }
  }

  return Array.from(byKey.values()).sort((left, right) => {
    const leftTime = Date.parse(left.recordedAt ?? "");
    const rightTime = Date.parse(right.recordedAt ?? "");
    if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime) && rightTime !== leftTime) {
      return rightTime - leftTime;
    }

    return (left.path ?? left.id).localeCompare(right.path ?? right.id);
  });
}

export function buildStructuredReviewSummary({
  changedArtifacts = [],
  summary = null,
  updatedAt = null,
}: BuildStructuredReviewSummaryOptions = {}) {
  const normalizedChangedArtifacts = dedupeReviewArtifacts(changedArtifacts);
  const createdFiles = normalizedChangedArtifacts.filter((artifact) =>
    isFileArtifact(artifact) && normalizedActionKind(artifact.action) === "created",
  );
  const modifiedFiles = normalizedChangedArtifacts.filter((artifact) =>
    isFileArtifact(artifact) && normalizedActionKind(artifact.action) === "modified",
  );
  const outputArtifacts = normalizedChangedArtifacts.filter((artifact) => isOutputArtifact(artifact));

  if (!firstString(summary) && normalizedChangedArtifacts.length === 0) {
    return null;
  }

  return {
    summary: firstString(summary),
    outputArtifacts,
    createdFiles,
    modifiedFiles,
    changedArtifacts: normalizedChangedArtifacts,
    updatedAt: firstString(updatedAt),
  };
}
