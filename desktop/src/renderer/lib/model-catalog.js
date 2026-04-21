export const MODEL_CATALOG_CACHE_KEY = "sense1.desktop.modelCatalog.v1";

const REASONING_HIGH_ONLY = ["high"];
const REASONING_NONE_LOW_MEDIUM_HIGH = ["none", "low", "medium", "high"];
const REASONING_LOW_MEDIUM_HIGH_XHIGH = ["low", "medium", "high", "xhigh"];

function getStorage(storage) {
  if (storage) {
    return storage;
  }

  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function normalizeModelEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  if (!id) {
    return null;
  }

  const name = typeof entry.name === "string" && entry.name.trim() ? entry.name : id;
  const supportedReasoningEfforts = Array.isArray(entry.supportedReasoningEfforts)
    ? entry.supportedReasoningEfforts.filter((effort) => typeof effort === "string" && effort.trim())
    : [];
  const normalized = {
    id,
    name,
    supportedReasoningEfforts,
  };

  if (typeof entry.isDefault === "boolean") {
    normalized.isDefault = entry.isDefault;
  }

  if (typeof entry.defaultReasoningEffort === "string" && entry.defaultReasoningEffort.trim()) {
    normalized.defaultReasoningEffort = entry.defaultReasoningEffort.trim();
  }

  return normalized;
}

export function normalizeModelCatalog(entries) {
  const normalized = [];
  const seen = new Set();

  for (const entry of Array.isArray(entries) ? entries : []) {
    const nextEntry = normalizeModelEntry(entry);
    if (!nextEntry || seen.has(nextEntry.id)) {
      continue;
    }
    seen.add(nextEntry.id);
    normalized.push(nextEntry);
  }

  return normalized;
}

export function readCachedModelCatalog(storage) {
  const resolvedStorage = getStorage(storage);
  if (!resolvedStorage) {
    return [];
  }

  try {
    const raw = resolvedStorage.getItem(MODEL_CATALOG_CACHE_KEY);
    if (!raw) {
      return [];
    }

    return normalizeModelCatalog(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeCachedModelCatalog(models, storage) {
  const resolvedStorage = getStorage(storage);
  if (!resolvedStorage) {
    return;
  }

  try {
    resolvedStorage.setItem(
      MODEL_CATALOG_CACHE_KEY,
      JSON.stringify(normalizeModelCatalog(models)),
    );
  } catch {
    // Non-fatal: the live list still works for this session.
  }
}

function resolveDefaultModelEntry(models) {
  if (!models.length) {
    return null;
  }

  return models.find((entry) => entry.isDefault) ?? models[0] ?? null;
}

export function readRuntimeReasoningEfforts(modelEntry) {
  return Array.isArray(modelEntry?.supportedReasoningEfforts)
    ? modelEntry.supportedReasoningEfforts.filter(
        (effort) => typeof effort === "string" && effort.trim(),
      )
    : [];
}

function inferFallbackReasoningEfforts(modelEntry) {
  const modelId = typeof modelEntry?.id === "string" ? modelEntry.id.trim().toLowerCase() : "";
  const defaultReasoningEffort = typeof modelEntry?.defaultReasoningEffort === "string"
    ? modelEntry.defaultReasoningEffort.trim().toLowerCase()
    : "";

  if (modelId.includes("pro")) {
    return REASONING_HIGH_ONLY;
  }

  if (
    defaultReasoningEffort === "none"
    || modelId.startsWith("gpt-5.1")
  ) {
    return REASONING_NONE_LOW_MEDIUM_HIGH;
  }

  return REASONING_LOW_MEDIUM_HIGH_XHIGH;
}

function resolveSupportedReasoningEfforts(modelEntry) {
  const runtime = readRuntimeReasoningEfforts(modelEntry);
  if (runtime.length > 0) {
    return runtime;
  }
  return inferFallbackReasoningEfforts(modelEntry);
}

export function resolveModelSelection({ models, requestedModel }) {
  const normalizedModels = normalizeModelCatalog(models);
  const preferredModel = typeof requestedModel === "string" ? requestedModel.trim() : "";

  if (preferredModel && normalizedModels.some((entry) => entry.id === preferredModel)) {
    return preferredModel;
  }

  return resolveDefaultModelEntry(normalizedModels)?.id ?? preferredModel;
}

export function resolveModelEntry({ models, requestedModel }) {
  const normalizedModels = normalizeModelCatalog(models);
  const resolvedModelId = resolveModelSelection({
    models: normalizedModels,
    requestedModel,
  });

  return normalizedModels.find((entry) => entry.id === resolvedModelId) ?? null;
}

export function resolveReasoningSelection({
  models,
  modelId,
  requestedReasoning,
}) {
  const modelEntry = resolveModelEntry({ models, requestedModel: modelId });
  const preferredReasoning = typeof requestedReasoning === "string" ? requestedReasoning.trim() : "";

  if (!modelEntry) {
    return preferredReasoning;
  }

  const supportedReasoningEfforts = resolveSupportedReasoningEfforts(modelEntry);

  if (
    preferredReasoning
    && supportedReasoningEfforts.includes(preferredReasoning)
  ) {
    return preferredReasoning;
  }

  const defaultReasoningEffort = typeof modelEntry.defaultReasoningEffort === "string"
    ? modelEntry.defaultReasoningEffort.trim()
    : "";
  if (
    defaultReasoningEffort
    && supportedReasoningEfforts.includes(defaultReasoningEffort)
  ) {
    return defaultReasoningEffort;
  }

  return supportedReasoningEfforts[0] ?? preferredReasoning;
}

export function resolveReasoningOptions({
  models,
  modelId,
  requestedReasoning,
}) {
  const modelEntry = resolveModelEntry({ models, requestedModel: modelId });
  const supportedReasoningEfforts = resolveSupportedReasoningEfforts(modelEntry);
  if (supportedReasoningEfforts.length > 0) {
    return supportedReasoningEfforts;
  }

  const resolvedReasoning = resolveReasoningSelection({
    models,
    modelId,
    requestedReasoning,
  });
  return resolvedReasoning ? [resolvedReasoning] : [];
}

export function resolveModelSettingsUpdate({
  models,
  requestedModel,
  requestedReasoning,
}) {
  const model = resolveModelSelection({
    models,
    requestedModel,
  });
  const reasoningEffort = resolveReasoningSelection({
    models,
    modelId: model,
    requestedReasoning,
  });

  return {
    model,
    reasoningEffort,
  };
}
