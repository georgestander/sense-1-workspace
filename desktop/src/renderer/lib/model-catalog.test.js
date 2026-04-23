import assert from "node:assert/strict";
import test from "node:test";

import {
  MODEL_CATALOG_CACHE_KEY,
  normalizeModelCatalog,
  readCachedModelCatalog,
  readRuntimeReasoningEfforts,
  resolveModelSettingsUpdate,
  resolveModelSelection,
  resolveReasoningOptions,
  resolveReasoningSelection,
  writeCachedModelCatalog,
} from "./model-catalog.js";

function createMockStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("resolveModelSelection prefers the requested runtime model and otherwise falls back to the runtime default", () => {
  const models = [
    { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", supportedReasoningEfforts: ["medium"] },
    { id: "gpt-5.4", isDefault: true, name: "GPT-5.4", supportedReasoningEfforts: ["low", "high"] },
  ];

  assert.equal(resolveModelSelection({ models, requestedModel: "gpt-5.4-mini" }), "gpt-5.4-mini");
  assert.equal(resolveModelSelection({ models, requestedModel: "missing-model" }), "gpt-5.4");
  assert.equal(resolveModelSelection({ models, requestedModel: "" }), "gpt-5.4");
});

test("resolveReasoningSelection prefers supported requested reasoning and otherwise falls back to the model default", () => {
  const models = [
    {
      id: "gpt-5.4",
      name: "GPT-5.4",
      supportedReasoningEfforts: ["medium", "high"],
      defaultReasoningEffort: "high",
    },
  ];

  assert.equal(
    resolveReasoningSelection({
      models,
      modelId: "gpt-5.4",
      requestedReasoning: "medium",
    }),
    "medium",
  );
  assert.equal(
    resolveReasoningSelection({
      models,
      modelId: "gpt-5.4",
      requestedReasoning: "xhigh",
    }),
    "high",
  );
  assert.deepEqual(
    resolveReasoningOptions({
      models,
      modelId: "gpt-5.4",
      requestedReasoning: "xhigh",
    }),
    ["medium", "high"],
  );
});

test("resolveModelSettingsUpdate keeps the selected model and picks a compatible reasoning effort", () => {
  const models = [
    {
      id: "gpt-5.4-mini",
      name: "GPT-5.4 Mini",
      supportedReasoningEfforts: ["low", "medium", "high", "xhigh"],
      defaultReasoningEffort: "medium",
    },
    {
      id: "gpt-5.4",
      name: "GPT-5.4",
      supportedReasoningEfforts: ["low", "medium", "high"],
      defaultReasoningEffort: "high",
    },
  ];

  assert.deepEqual(
    resolveModelSettingsUpdate({
      models,
      requestedModel: "gpt-5.4",
      requestedReasoning: "xhigh",
    }),
    {
      model: "gpt-5.4",
      reasoningEffort: "high",
    },
  );
});

test("resolveReasoningOptions falls back to the documented GPT-5 family efforts when the runtime omits them", () => {
  const modernModels = [
    {
      id: "gpt-5.4-mini",
      name: "GPT-5.4 Mini",
      supportedReasoningEfforts: [],
      defaultReasoningEffort: "medium",
    },
  ];

  assert.deepEqual(
    resolveReasoningOptions({
      models: modernModels,
      modelId: "gpt-5.4-mini",
      requestedReasoning: "",
    }),
    ["low", "medium", "high", "xhigh"],
  );
  assert.equal(
    resolveReasoningSelection({
      models: modernModels,
      modelId: "gpt-5.4-mini",
      requestedReasoning: "xhigh",
    }),
    "xhigh",
  );

  const gpt51Models = [
    {
      id: "gpt-5.1",
      name: "GPT-5.1",
      supportedReasoningEfforts: [],
      defaultReasoningEffort: "none",
    },
  ];

  assert.deepEqual(
    resolveReasoningOptions({
      models: gpt51Models,
      modelId: "gpt-5.1",
      requestedReasoning: "",
    }),
    ["none", "low", "medium", "high"],
  );
  assert.equal(
    resolveReasoningSelection({
      models: gpt51Models,
      modelId: "gpt-5.1",
      requestedReasoning: "xhigh",
    }),
    "none",
  );

  const proModels = [
    {
      id: "gpt-5-pro",
      name: "GPT-5 Pro",
      supportedReasoningEfforts: [],
      defaultReasoningEffort: "high",
    },
  ];

  assert.deepEqual(
    resolveReasoningOptions({
      models: proModels,
      modelId: "gpt-5-pro",
      requestedReasoning: "",
    }),
    ["high"],
  );
});

test("cached model catalog round-trips normalized runtime models", () => {
  const storage = createMockStorage();
  writeCachedModelCatalog(
    [
      {
        id: "gpt-5.4",
        isDefault: true,
        name: "GPT-5.4",
        supportedReasoningEfforts: ["low", "medium"],
        defaultReasoningEffort: "medium",
      },
      {
        id: "gpt-5.4",
        name: "Duplicate GPT-5.4",
        supportedReasoningEfforts: ["high"],
      },
    ],
    storage,
  );

  assert.deepEqual(readCachedModelCatalog(storage), [
    {
      id: "gpt-5.4",
      isDefault: true,
      name: "GPT-5.4",
      supportedReasoningEfforts: ["low", "medium"],
      defaultReasoningEffort: "medium",
    },
  ]);
  assert.equal(typeof storage.getItem(MODEL_CATALOG_CACHE_KEY), "string");
});

test("normalizeModelCatalog drops invalid entries before the picker sees them", () => {
  assert.deepEqual(
    normalizeModelCatalog([
      null,
      {},
      { id: " ", name: "Blank", supportedReasoningEfforts: [] },
      {
        model: "gpt-5.5",
        displayName: "GPT-5.5",
        supportedReasoningEfforts: [
          { reasoningEffort: "medium", description: "Balanced" },
          { effort: "high", description: "Deeper reasoning" },
        ],
      },
      { id: "gpt-5.4", name: "", supportedReasoningEfforts: ["high"] },
    ]),
    [
      {
        id: "gpt-5.5",
        name: "GPT-5.5",
        supportedReasoningEfforts: ["medium", "high"],
      },
      {
        id: "gpt-5.4",
        name: "gpt-5.4",
        supportedReasoningEfforts: ["high"],
      },
    ],
  );
});

test("identical runtime catalogs produce identical renderer options across auth modes", () => {
  const sharedCatalog = [
    {
      id: "gpt-5.4",
      name: "GPT-5.4",
      isDefault: true,
      supportedReasoningEfforts: ["low", "medium", "high"],
      defaultReasoningEffort: "medium",
    },
    {
      id: "gpt-5.4-mini",
      name: "GPT-5.4 Mini",
      supportedReasoningEfforts: ["low", "medium", "high", "xhigh"],
      defaultReasoningEffort: "medium",
    },
  ];

  const chatgptModels = normalizeModelCatalog(sharedCatalog);
  const apiKeyModels = normalizeModelCatalog(sharedCatalog);

  assert.deepEqual(
    chatgptModels.map((entry) => entry.id),
    apiKeyModels.map((entry) => entry.id),
  );

  for (const modelId of ["gpt-5.4", "gpt-5.4-mini"]) {
    assert.deepEqual(
      resolveReasoningOptions({ models: chatgptModels, modelId, requestedReasoning: "" }),
      resolveReasoningOptions({ models: apiKeyModels, modelId, requestedReasoning: "" }),
    );
    assert.equal(
      resolveReasoningSelection({ models: chatgptModels, modelId, requestedReasoning: "high" }),
      resolveReasoningSelection({ models: apiKeyModels, modelId, requestedReasoning: "high" }),
    );
  }
});

test("runtime-provided reasoning efforts are not augmented by the fallback heuristic", () => {
  const runtimeRestrictedPro = [
    {
      id: "gpt-5-pro",
      name: "GPT-5 Pro",
      supportedReasoningEfforts: ["medium", "high"],
      defaultReasoningEffort: "high",
    },
  ];

  assert.deepEqual(
    resolveReasoningOptions({
      models: runtimeRestrictedPro,
      modelId: "gpt-5-pro",
      requestedReasoning: "",
    }),
    ["medium", "high"],
  );

  const runtimeRestrictedGpt51 = [
    {
      id: "gpt-5.1",
      name: "GPT-5.1",
      supportedReasoningEfforts: ["low", "high"],
      defaultReasoningEffort: "low",
    },
  ];

  assert.deepEqual(
    resolveReasoningOptions({
      models: runtimeRestrictedGpt51,
      modelId: "gpt-5.1",
      requestedReasoning: "",
    }),
    ["low", "high"],
  );
});

test("readRuntimeReasoningEfforts exposes runtime data without falling through to heuristics", () => {
  assert.deepEqual(readRuntimeReasoningEfforts(null), []);
  assert.deepEqual(readRuntimeReasoningEfforts(undefined), []);
  assert.deepEqual(
    readRuntimeReasoningEfforts({
      id: "gpt-5-pro",
      name: "GPT-5 Pro",
      supportedReasoningEfforts: [],
      defaultReasoningEffort: "high",
    }),
    [],
  );
  assert.deepEqual(
    readRuntimeReasoningEfforts({
      id: "gpt-5.4",
      name: "GPT-5.4",
      supportedReasoningEfforts: ["low", "medium"],
    }),
    ["low", "medium"],
  );
});

test("composer and settings surfaces derive the same options from the same catalog", () => {
  const models = normalizeModelCatalog([
    {
      id: "gpt-5.4",
      name: "GPT-5.4",
      isDefault: true,
      supportedReasoningEfforts: ["low", "medium", "high"],
      defaultReasoningEffort: "medium",
    },
  ]);

  const composerOptions = resolveReasoningOptions({
    models,
    modelId: "gpt-5.4",
    requestedReasoning: "medium",
  });
  const settingsOptions = resolveReasoningOptions({
    models,
    modelId: "gpt-5.4",
    requestedReasoning: "medium",
  });

  assert.deepEqual(composerOptions, settingsOptions);
  assert.deepEqual(composerOptions, ["low", "medium", "high"]);
});
