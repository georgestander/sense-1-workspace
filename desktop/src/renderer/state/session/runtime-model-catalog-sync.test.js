import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { syncRuntimeModelCatalog } from "./runtime-model-catalog-sync.ts";

function createMockBridge(listFn) {
  return {
    models: {
      list: listFn,
    },
  };
}

function createStubStorage() {
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
  globalThis.localStorage = storage;
  return storage;
}

function runEffectWithDeps({ deps, prevDeps, prevCleanup, effect }) {
  const depsChanged = !prevDeps || deps.some((value, index) => !Object.is(value, prevDeps[index]));
  if (!depsChanged) {
    return { deps, cleanup: prevCleanup };
  }
  if (prevCleanup) {
    prevCleanup();
  }
  return { deps, cleanup: effect() };
}

test("syncRuntimeModelCatalog applies runtime models when the effect is still active", async () => {
  createStubStorage();
  const applied = [];
  const bridge = createMockBridge(async () => ({
    models: [
      { id: "gpt-5.4", name: "GPT-5.4", supportedReasoningEfforts: ["low", "high"] },
    ],
  }));

  await syncRuntimeModelCatalog({
    bridge,
    setAvailableModels: (models) => applied.push(models),
    isActive: () => true,
  });

  assert.equal(applied.length, 1);
  assert.equal(applied[0][0].id, "gpt-5.4");
});

test("syncRuntimeModelCatalog skips stale results when the effect has been cleaned up", async () => {
  createStubStorage();
  const applied = [];
  const bridge = createMockBridge(async () => ({
    models: [
      { id: "gpt-5.4", name: "GPT-5.4", supportedReasoningEfforts: ["low"] },
    ],
  }));

  await syncRuntimeModelCatalog({
    bridge,
    setAvailableModels: (models) => applied.push(models),
    isActive: () => false,
  });

  assert.equal(applied.length, 0);
});

test("syncRuntimeModelCatalog swallows bridge errors so the last-known catalog survives", async () => {
  createStubStorage();
  const applied = [];
  const bridge = createMockBridge(async () => {
    throw new Error("boom");
  });

  await assert.doesNotReject(() =>
    syncRuntimeModelCatalog({
      bridge,
      setAvailableModels: (models) => applied.push(models),
      isActive: () => true,
    }),
  );
  assert.equal(applied.length, 0);
});

test("re-running syncRuntimeModelCatalog after an accountType flip refetches runtime models", async () => {
  createStubStorage();
  const calls = [];
  const responses = [
    {
      models: [
        { id: "gpt-5.4", name: "GPT-5.4", supportedReasoningEfforts: ["low", "medium", "high"] },
      ],
    },
    {
      models: [
        { id: "gpt-5.4", name: "GPT-5.4", supportedReasoningEfforts: ["low", "medium"] },
      ],
    },
  ];
  const bridge = createMockBridge(async () => {
    calls.push({});
    return responses[calls.length - 1];
  });
  const applied = [];

  const firstState = { accountType: "chatgpt", isSignedIn: true };
  const secondState = { accountType: "apikey", isSignedIn: true };

  function runEffect(state) {
    let active = true;
    const depsArray = [state.accountType, state.isSignedIn];
    const effect = () => {
      void syncRuntimeModelCatalog({
        bridge,
        setAvailableModels: (models) => applied.push(models),
        isActive: () => active,
      });
      return () => {
        active = false;
      };
    };
    return { depsArray, effect };
  }

  const first = runEffect(firstState);
  let lifecycle = runEffectWithDeps({
    deps: first.depsArray,
    prevDeps: null,
    prevCleanup: null,
    effect: first.effect,
  });
  await Promise.resolve();
  await Promise.resolve();

  const second = runEffect(secondState);
  lifecycle = runEffectWithDeps({
    deps: second.depsArray,
    prevDeps: lifecycle.deps,
    prevCleanup: lifecycle.cleanup,
    effect: second.effect,
  });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(calls.length, 2, "bridge.models.list() should refetch on accountType changes");
  assert.equal(applied.length, 2);
  assert.deepEqual(applied[0][0].supportedReasoningEfforts, ["low", "medium", "high"]);
  assert.deepEqual(applied[1][0].supportedReasoningEfforts, ["low", "medium"]);

  if (lifecycle.cleanup) {
    lifecycle.cleanup();
  }
});

test("use-session-shell-effects binds the model-list effect to accountType and isSignedIn", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(here, "use-session-shell-effects.ts"), "utf8");
  const pattern = /syncRuntimeModelCatalog\([\s\S]*?\}, \[([^\]]+)\]\);/;
  const match = source.match(pattern);
  assert.ok(match, "expected syncRuntimeModelCatalog to be driven by a useEffect dep array");
  const deps = match[1].split(",").map((token) => token.trim());
  assert.ok(deps.includes("accountType"), "model-list useEffect must depend on accountType so auth-mode switches refetch");
  assert.ok(deps.includes("isSignedIn"), "model-list useEffect must depend on isSignedIn so sign-in transitions refetch");
});
