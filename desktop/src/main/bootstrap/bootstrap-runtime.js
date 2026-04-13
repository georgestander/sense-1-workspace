import { firstString } from "./bootstrap-shared.js";

const RUNTIME_READY_TIMEOUT_MS = 5000;

export function normalizeRuntimeState(manager, appStartedAt, runtimeInfo = {}) {
  const appVersion = firstString(runtimeInfo.appVersion) || "unknown";
  const electronVersion = firstString(runtimeInfo.electronVersion) || process.versions.electron || process.version;
  const platform = firstString(runtimeInfo.platform) || process.platform;

  return {
    apiVersion: runtimeInfo.apiVersion || "1.0.0",
    appVersion,
    electronVersion,
    platform,
    state: manager.state,
    lastError: manager.lastError ?? null,
    restartCount: Number.isFinite(manager.restartCount) ? manager.restartCount : 0,
    lastStateAt:
      typeof manager.lastStateAt === "string" && manager.lastStateAt.trim()
        ? manager.lastStateAt
        : appStartedAt,
    startedAt: appStartedAt,
    setupBlocked: false,
    setupCode: null,
    setupTitle: null,
    setupMessage: null,
    setupDetail: null,
  };
}

export function buildRuntimeStatus(runtime) {
  const appVersion = firstString(runtime?.appVersion);
  const platform = firstString(runtime?.platform);
  if (!appVersion || !platform) {
    return null;
  }

  return {
    appVersion,
    platform,
  };
}

export function buildRuntimeSetup(runtime) {
  if (
    runtime?.setupBlocked !== true ||
    !firstString(runtime?.setupTitle) ||
    !firstString(runtime?.setupMessage)
  ) {
    return null;
  }

  return {
    blocked: true,
    code: firstString(runtime?.setupCode),
    title: firstString(runtime?.setupTitle),
    message: firstString(runtime?.setupMessage),
    detail: firstString(runtime?.setupDetail),
  };
}

export function classifyRuntimeSetup(error) {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : String(error ?? "");
  const normalized = message.trim();
  if (!normalized) {
    return null;
  }

  if (
    /\bspawn\s+codex\b/i.test(normalized) ||
    /\bcould\s+not\s+(find|locate)\b.*\bcodex\b/i.test(normalized) ||
    /\bcodex\b.*\bon\s+path\b/i.test(normalized) ||
    /\bcodex\b.*\b(enoent|not found|no such file)\b/i.test(normalized) ||
    /\benoent\b.*\bcodex\b/i.test(normalized)
  ) {
    return {
      code: "missing_codex_runtime",
      title: "Install the Codex runtime to use Sense-1 Desktop",
      message:
        "Sense-1 could not find the local Codex runtime, so chat, sign-in, and folder work are blocked until it is available.",
      detail: normalized,
    };
  }

  return {
    code: "runtime_unavailable",
    title: "Sense-1 could not start the local runtime",
    message:
      "Sense-1 needs the local runtime to stay available before chat, sign-in, and folder work can continue.",
    detail: normalized,
  };
}

export function classifyBootstrapRestoreSetup(stage, error) {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : String(error ?? "");
  const normalized = message.trim();

  if (stage === "auth") {
    return {
      code: "auth_restore_failed",
      title: "Sense-1 could not restore sign-in state",
      message:
        "Sense-1 started the local runtime but could not verify your ChatGPT sign-in status. Startup is blocked until sign-in restore succeeds.",
      detail: normalized || "ChatGPT sign-in restore failed during desktop startup.",
    };
  }

  return {
    code: "recent_threads_restore_failed",
    title: "Sense-1 could not restore recent threads",
    message:
      "Sense-1 started the local runtime but could not load your recent threads. Startup is blocked until thread restore succeeds.",
    detail: normalized || "Recent thread restore failed during desktop startup.",
  };
}

export function applyBlockingSetup(runtime, setup, fallbackErrorMessage = null) {
  runtime.setupBlocked = true;
  runtime.setupCode = setup.code;
  runtime.setupTitle = setup.title;
  runtime.setupMessage = setup.message;
  runtime.setupDetail = setup.detail;
  runtime.lastError = firstString(runtime.lastError, setup.detail, fallbackErrorMessage);
}

function waitForRuntimeReady(manager, timeoutMs = RUNTIME_READY_TIMEOUT_MS) {
  if (manager.state === "ready" || manager.state === "busy") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting ${timeoutMs}ms for desktop runtime readiness.`));
    }, timeoutMs);

    const onState = (summary) => {
      if (summary.state === "ready" || summary.state === "busy") {
        cleanup();
        resolve();
        return;
      }

      if (summary.state === "errored") {
        cleanup();
        reject(new Error(summary.lastError || "Desktop runtime entered errored state during bootstrap."));
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      manager.off("state", onState);
    };

    manager.on("state", onState);
  });
}

export async function ensureRuntimeReady(manager) {
  if (manager.state === "idle" || manager.state === "stopped" || manager.state === "errored") {
    await manager.start();
  }

  await waitForRuntimeReady(manager);
}
