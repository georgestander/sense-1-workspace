import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeRuntimeModelCatalog,
  projectSupportedRuntimeModels,
} from "./runtime-model-catalog.js";

test("ChatGPT and API-key auth preserve the live runtime model surface", () => {
  const runtimeModels = [
    {
      id: "gpt-5.5",
      model: "gpt-5.5",
      displayName: "GPT-5.5",
      supportedReasoningEfforts: [
        { reasoningEffort: "low", description: "Lower latency" },
        { reasoningEffort: "medium", description: "Balanced" },
        { reasoningEffort: "high", description: "Deeper reasoning" },
      ],
      defaultReasoningEffort: "medium",
      isDefault: true,
    },
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
    ["gpt-5.5", "gpt-5.4-mini", "gpt-5.4", "o3"],
  );
  assert.equal(chatgptSurface[0].name, "GPT-5.5");
  assert.deepEqual(chatgptSurface[0].supportedReasoningEfforts, ["low", "medium", "high"]);
  assert.deepEqual(chatgptSurface[1].supportedReasoningEfforts, ["minimal", "low", "medium", "high", "xhigh"]);
  assert.deepEqual(chatgptSurface[2].supportedReasoningEfforts, ["low", "medium", "high"]);
});

test("runtime catalog normalization can fall back to model when id is absent", () => {
  const runtimeModels = [
    {
      model: "gpt-5.5",
      displayName: "GPT-5.5",
      supportedReasoningEfforts: [{ effort: "xhigh" }],
    },
  ];

  assert.deepEqual(
    normalizeRuntimeModelCatalog(runtimeModels, { accountType: "chatgpt" }),
    [
      {
        id: "gpt-5.5",
        name: "GPT-5.5",
        supportedReasoningEfforts: ["xhigh"],
      },
    ],
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
      id: "gpt-5.5",
      name: "GPT-5.5",
      supportedReasoningEfforts: [
        { reasoningEffort: "medium", description: "Balanced" },
        { reasoningEffort: "high", description: "Deeper reasoning" },
      ],
    },
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
        id: "gpt-5.5",
        supportedReasoningEfforts: ["medium", "high"],
      },
      {
        id: "gpt-5.4-mini",
        supportedReasoningEfforts: ["medium", "high", "xhigh"],
      },
      {
        id: "gpt-5.4",
        supportedReasoningEfforts: ["low", "medium", "high"],
      },
      {
        id: "o3",
        supportedReasoningEfforts: ["high"],
      },
    ],
  );
});
