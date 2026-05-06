const DEFAULT_RUNTIME_MODEL_CATALOG = [
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    supportedReasoningEfforts: ["low", "medium", "high", "xhigh"],
    defaultReasoningEffort: "medium",
    isDefault: true,
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    supportedReasoningEfforts: ["low", "medium", "high", "xhigh"],
    defaultReasoningEffort: "medium",
  },
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    supportedReasoningEfforts: ["low", "medium", "high", "xhigh"],
    defaultReasoningEffort: "medium",
  },
];

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

function normalizeUniqueModelEntries(entries) {
  const seen = new Set();
  return entries
    .map((entry) => normalizeRuntimeModelEntry(entry))
    .filter((entry) => {
      if (!entry || seen.has(entry.id)) {
        return false;
      }
      seen.add(entry.id);
      return true;
    });
}

function mergeDefaultAndRuntimeModels(defaultModels, runtimeModels) {
  const runtimeById = new Map(runtimeModels.map((entry) => [entry.id, entry]));
  const merged = defaultModels.map((defaultEntry) => ({
    ...defaultEntry,
    ...(runtimeById.get(defaultEntry.id) ?? {}),
  }));
  const defaultIds = new Set(defaultModels.map((entry) => entry.id));

  for (const runtimeEntry of runtimeModels) {
    if (!defaultIds.has(runtimeEntry.id)) {
      merged.push(runtimeEntry);
    }
  }

  return merged;
}

export function normalizeRuntimeModelCatalog(rawModels, {
  accountType = null,
  authMode = null,
  allowedModels = null,
} = {}) {
  const defaultModels = normalizeUniqueModelEntries(DEFAULT_RUNTIME_MODEL_CATALOG);
  const runtimeModels = normalizeUniqueModelEntries(Array.isArray(rawModels) ? rawModels : []);
  const normalized = mergeDefaultAndRuntimeModels(defaultModels, runtimeModels);

  return filterAllowedModels(normalized, allowedModels);
}

export function projectSupportedRuntimeModels(rawModels, options = {}) {
  return normalizeRuntimeModelCatalog(rawModels, options).map((entry) => ({
    id: entry.id,
    supportedReasoningEfforts: entry.supportedReasoningEfforts,
  }));
}
