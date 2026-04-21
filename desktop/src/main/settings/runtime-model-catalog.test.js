import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeRuntimeModelCatalog,
  projectSupportedRuntimeModels,
} from "./runtime-model-catalog.js";

test("ChatGPT and API-key auth normalize the same alpha OpenAI model surface", () => {
  const runtimeModels = [
    {
      id: "gpt-5.4-mini",
      name: "GPT-5.4 Mini",
      supportedReasoningEfforts: ["minimal", "low", "medium", "high", "xhigh"],
      defaultReasoningEffort: "medium",
    },
    {
      id: "gpt-5.4",
      name: "GPT-5.4",
      isDefault: true,
      supportedReasoningEfforts: ["low", "medium", "high"],
      defaultReasoningEffort: "high",
    },
    {
      id: "o3",
      name: "o3",
      supportedReasoningEfforts: ["high"],
    },
  ];

  const chatgptSurface = normalizeRuntimeModelCatalog(runtimeModels, { accountType: "chatgpt" });
  const apiKeySurface = normalizeRuntimeModelCatalog(runtimeModels, { accountType: "apiKey" });

  assert.deepEqual(chatgptSurface, apiKeySurface);
  assert.deepEqual(
    chatgptSurface.map((entry) => entry.id),
    ["gpt-5.4-mini", "gpt-5.4"],
  );
  assert.deepEqual(chatgptSurface[0].supportedReasoningEfforts, ["minimal", "low", "medium", "high", "xhigh"]);
  assert.deepEqual(chatgptSurface[1].supportedReasoningEfforts, ["low", "medium", "high"]);
});

test("OpenAI alpha shaping preserves raw runtime catalogs when the alpha models are absent", () => {
  const runtimeModels = [
    {
      id: "o3",
      name: "o3",
      supportedReasoningEfforts: ["high"],
    },
  ];

  assert.deepEqual(
    normalizeRuntimeModelCatalog(runtimeModels, { accountType: "chatgpt" }),
    runtimeModels,
  );
});

test("allowed model restrictions apply after auth-mode shaping", () => {
  const runtimeModels = [
    {
      id: "gpt-5.4-mini",
      name: "GPT-5.4 Mini",
      supportedReasoningEfforts: ["medium", "high", "xhigh"],
    },
    {
      id: "gpt-5.4",
      name: "GPT-5.4",
      supportedReasoningEfforts: ["low", "medium", "high"],
    },
  ];

  assert.deepEqual(
    normalizeRuntimeModelCatalog(runtimeModels, {
      accountType: "apikey",
      allowedModels: ["gpt-5.4"],
    }),
    [
      {
        id: "gpt-5.4",
        name: "GPT-5.4",
        supportedReasoningEfforts: ["low", "medium", "high"],
      },
    ],
  );
});

test("projectSupportedRuntimeModels reuses the same shaped auth-parity surface", () => {
  const runtimeModels = [
    {
      id: "gpt-5.4-mini",
      name: "GPT-5.4 Mini",
      supportedReasoningEfforts: ["medium", "high", "xhigh"],
    },
    {
      id: "gpt-5.4",
      name: "GPT-5.4",
      supportedReasoningEfforts: ["low", "medium", "high"],
    },
    {
      id: "o3",
      name: "o3",
      supportedReasoningEfforts: ["high"],
    },
  ];

  assert.deepEqual(
    projectSupportedRuntimeModels(runtimeModels, { authMode: "apikey" }),
    [
      {
        id: "gpt-5.4-mini",
        supportedReasoningEfforts: ["medium", "high", "xhigh"],
      },
      {
        id: "gpt-5.4",
        supportedReasoningEfforts: ["low", "medium", "high"],
      },
    ],
  );
});
