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

function normalizeReasoningEffort(effort) {
  if (typeof effort === "string") {
    return firstString(effort);
  }

  if (!effort || typeof effort !== "object" || Array.isArray(effort)) {
    return null;
  }

  return firstString(effort.reasoningEffort, effort.effort);
}

function normalizeRuntimeModelEntry(entry) {
  const id = firstString(entry?.id, entry?.model);
  if (!id) {
    return null;
  }

  const supportedReasoningEfforts = Array.isArray(entry?.supportedReasoningEfforts)
    ? entry.supportedReasoningEfforts
        .map((effort) => normalizeReasoningEffort(effort))
        .filter(Boolean)
    : [];

  return {
    id,
    name: firstString(entry?.name, entry?.displayName, entry?.model, id) ?? id,
    supportedReasoningEfforts,
    ...(typeof entry?.isDefault === "boolean" ? { isDefault: entry.isDefault } : {}),
    ...(
      typeof entry?.defaultReasoningEffort === "string" && entry.defaultReasoningEffort.trim()
        ? { defaultReasoningEffort: entry.defaultReasoningEffort.trim() }
        : {}
    ),
  };
}

function filterAllowedModels(models, allowedModels) {
  if (!Array.isArray(allowedModels) || allowedModels.length === 0) {
    return models;
  }

  const allowed = new Set(allowedModels.filter((modelId) => typeof modelId === "string" && modelId.trim()));
  return models.filter((entry) => allowed.has(entry.id));
}

export function normalizeRuntimeModelCatalog(rawModels, {
  accountType = null,
  authMode = null,
  allowedModels = null,
} = {}) {
  const seen = new Set();
  const normalized = (Array.isArray(rawModels) ? rawModels : [])
    .map((entry) => normalizeRuntimeModelEntry(entry))
    .filter((entry) => {
      if (!entry || seen.has(entry.id)) {
        return false;
      }
      seen.add(entry.id);
      return true;
    });

  return filterAllowedModels(normalized, allowedModels);
}

export function projectSupportedRuntimeModels(rawModels, options = {}) {
  return normalizeRuntimeModelCatalog(rawModels, options).map((entry) => ({
    id: entry.id,
    supportedReasoningEfforts: entry.supportedReasoningEfforts,
  }));
}
