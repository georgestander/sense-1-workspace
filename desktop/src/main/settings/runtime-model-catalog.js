const OPENAI_ALPHA_MODEL_IDS = Object.freeze([
  "gpt-5.4-mini",
  "gpt-5.4",
]);

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

function normalizeAuthType(accountType, authMode) {
  const resolved = firstString(accountType, authMode);
  return resolved ? resolved.toLowerCase() : null;
}

function normalizeRuntimeModelEntry(entry) {
  const id = firstString(entry?.id);
  if (!id) {
    return null;
  }

  const supportedReasoningEfforts = Array.isArray(entry?.supportedReasoningEfforts)
    ? entry.supportedReasoningEfforts.filter((effort) => typeof effort === "string" && effort.trim())
    : [];

  return {
    id,
    name: firstString(entry?.name, id) ?? id,
    supportedReasoningEfforts,
    ...(typeof entry?.isDefault === "boolean" ? { isDefault: entry.isDefault } : {}),
    ...(
      typeof entry?.defaultReasoningEffort === "string" && entry.defaultReasoningEffort.trim()
        ? { defaultReasoningEffort: entry.defaultReasoningEffort.trim() }
        : {}
    ),
  };
}

function shapeAlphaOpenAiModelSurface(models) {
  const alphaModels = models.filter((entry) => OPENAI_ALPHA_MODEL_IDS.includes(entry.id));
  return alphaModels.length > 0 ? alphaModels : models;
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

  const normalizedAuthType = normalizeAuthType(accountType, authMode);
  const authShaped = normalizedAuthType === "chatgpt" || normalizedAuthType === "apikey"
    ? shapeAlphaOpenAiModelSurface(normalized)
    : normalized;

  return filterAllowedModels(authShaped, allowedModels);
}

export function projectSupportedRuntimeModels(rawModels, options = {}) {
  return normalizeRuntimeModelCatalog(rawModels, options).map((entry) => ({
    id: entry.id,
    supportedReasoningEfforts: entry.supportedReasoningEfforts,
  }));
}
