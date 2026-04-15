import { app, BrowserWindow, Notification, nativeImage, shell } from "electron";

import { AppServerProcessManager } from "./runtime/app-server-process-manager.js";
import { DESKTOP_APP_VERSION } from "./app/app-version.ts";
import { DesktopSessionController } from "./session-controller.js";
import { resolveDesktopProfile } from "./bootstrap/desktop-bootstrap.js";
import { resolveSignedInDesktopProfile } from "./bootstrap/bootstrap-profile.js";
import {
  filterProfileCodexHomeRoots,
  ManagementInventoryChangeTracker,
} from "./settings/management-inventory-change.ts";
import {
  createMainWindow,
  focusMainWindow,
} from "./window";
import { resolveDesktopIconPath } from "./desktop-icon.js";
import { emitDesktopRuntimeEvent, emitDesktopThreadDelta, registerDesktopIpcHandlers, unregisterDesktopIpcHandlers } from "./ipc";
import { DESKTOP_BRIDGE_API_VERSION } from "./contracts";
import type { DesktopUpdateState } from "./contracts";
import { mapDesktopRuntimeEvent } from "./runtime/runtime-events.ts";
import { ThreadStateAccumulator } from "./session/thread-state-accumulator.js";
import { DesktopUpdateService } from "./updates/update-service.ts";
import { WorkspaceFileActivityTracker } from "./workspace/workspace-file-activity.ts";
import { collectOutOfWorkspacePathsFromRuntimeMessage } from "./workspace/workspace-boundary.ts";
import { DesktopWorkspaceStateService } from "./workspace/workspace-state-service.ts";
import { resolveDesktopInteractionState } from "./session/interaction-state.ts";
import { ThreadInputQueueService } from "./session/thread-input-queue-service.ts";
import { resolveBootstrapVisibleThreadId, shouldRestoreQueuedFollowUp } from "./session/thread-runtime-behavior.ts";
import { RuntimeFileChangeTracker } from "./session/runtime-file-change-tracker.ts";
import {
  coalesceRuntimeNotifications,
  type RuntimeNotification,
} from "./session/runtime-notification-coalescer.ts";
import type { DesktopBootstrap, DesktopSteerTurnResult, DesktopTaskRunResult, DesktopThreadInputState, DesktopThreadReadResult, DesktopThreadSnapshot, DesktopThreadSummary } from "../shared/contracts/index";

const DESKTOP_APP_NAME = "Sense-1 Workspace";
const LATEST_RELEASE_URL = "https://github.com/georgestander/sense-1-workspace/releases/latest";
const shouldEnforceSingleInstance = process.env.NODE_ENV !== "test";
app.setName(DESKTOP_APP_NAME);
const isSingleInstance = shouldEnforceSingleInstance ? app.requestSingleInstanceLock() : true;
const appServerManager = new AppServerProcessManager();
const appStartedAt = new Date().toISOString();
const runtimeInfo = {
  apiVersion: DESKTOP_BRIDGE_API_VERSION,
  appVersion: DESKTOP_APP_VERSION,
  electronVersion: process.versions.electron,
  platform: process.platform,
  startedAt: appStartedAt,
};
const SHOULD_LOG_RUNTIME_EVENTS = process.env.SENSE1_DEBUG_RUNTIME_EVENTS === "1";
const SHOULD_DEBUG_RUNTIME_PERF = process.env.SENSE1_DEBUG_PERF === "1";
const ACCUMULATOR_STREAM_FLUSH_MS = 16;
const threadAccumulator = new ThreadStateAccumulator();
const threadInputQueue = new ThreadInputQueueService();
const workspaceFileActivity = new WorkspaceFileActivityTracker();
const runtimeFileChangeTracker = new RuntimeFileChangeTracker();
const managementInventoryChangeTracker = new ManagementInventoryChangeTracker();
const workspaceState = new DesktopWorkspaceStateService({
  env: process.env,
  resolveProfile: async () => await resolveSignedInDesktopProfile(appServerManager, process.env),
});
let updateService = createDisabledUpdateService();
let currentVisibleThreadId: string | null = null;
const runtimePerfCounters = new Map<string, number>();
let runtimePerfLastFlushAt = Date.now();
let pendingAccumulatorNotifications: RuntimeNotification[] = [];
let pendingAccumulatorFlushTimer: NodeJS.Timeout | null = null;

function recordRuntimePerfCounter(name: string): void {
  if (!SHOULD_DEBUG_RUNTIME_PERF) {
    return;
  }

  runtimePerfCounters.set(name, (runtimePerfCounters.get(name) ?? 0) + 1);
  const now = Date.now();
  if (now - runtimePerfLastFlushAt < 2000) {
    return;
  }

  const snapshot = [...runtimePerfCounters.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .map(([counter, count]) => ({ counter, count }));
  if (snapshot.length > 0) {
    console.info("[sense1:perf:main]", snapshot);
  }
  runtimePerfLastFlushAt = now;
}

function createNoopUpdater() {
  return {
    checkForUpdates: async () => undefined,
    quitAndInstall: () => {},
    on: () => undefined,
  };
}

function flushAccumulatorNotifications(): void {
  if (pendingAccumulatorFlushTimer) {
    clearTimeout(pendingAccumulatorFlushTimer);
    pendingAccumulatorFlushTimer = null;
  }

  if (pendingAccumulatorNotifications.length === 0) {
    return;
  }

  const notifications = coalesceRuntimeNotifications(pendingAccumulatorNotifications);
  pendingAccumulatorNotifications = [];
  const touchedThreadIds = new Set<string>();

  for (const notification of notifications) {
    processAccumulatorNotification(notification, touchedThreadIds);
  }

  syncUpdaterBusyState();
  for (const threadId of touchedThreadIds) {
    void persistInteractionState(threadId).catch(() => {});
  }
}

function scheduleAccumulatorNotificationFlush(): void {
  if (pendingAccumulatorFlushTimer) {
    return;
  }

  pendingAccumulatorFlushTimer = setTimeout(() => {
    pendingAccumulatorFlushTimer = null;
    flushAccumulatorNotifications();
  }, ACCUMULATOR_STREAM_FLUSH_MS);
}

function processAccumulatorNotification(
  notification: RuntimeNotification,
  touchedThreadIds: Set<string>,
): void {
  if (notification && typeof notification === "object" && "method" in notification) {
    recordRuntimePerfCounter(`accumulator.${String(notification.method)}`);
  }

  const deltas = threadAccumulator.applyNotification(notification);
  for (const delta of deltas) {
    emitDesktopThreadDelta(delta);
  }

  const params =
    notification && typeof notification === "object" && "params" in notification && notification.params && typeof notification.params === "object"
      ? notification.params as { threadId?: string }
      : null;
  const threadId = typeof params?.threadId === "string" ? params.threadId.trim() : "";
  if (threadId && deltas.length > 0) {
    touchedThreadIds.add(threadId);
  }
}

function enqueueAccumulatorNotification(notification: RuntimeNotification): void {
  if (notification?.method === "item/agentMessage/delta") {
    pendingAccumulatorNotifications.push(notification);
    scheduleAccumulatorNotificationFlush();
    return;
  }

  flushAccumulatorNotifications();
  const touchedThreadIds = new Set<string>();
  processAccumulatorNotification(notification, touchedThreadIds);
  syncUpdaterBusyState();
  for (const threadId of touchedThreadIds) {
    void persistInteractionState(threadId).catch(() => {});
  }
}

function createDisabledUpdateService() {
  return new DesktopUpdateService({
    currentVersion: DESKTOP_APP_VERSION,
    updater: createNoopUpdater(),
    enabled: false,
    unsupportedMessage:
      process.platform === "darwin"
        ? "Updates are only available in packaged Sense-1 Workspace builds."
        : "In-app updates are available on packaged macOS builds.",
  });
}

function bindUpdateService(service: DesktopUpdateService): void {
  service.on("state-changed", (update: DesktopUpdateState) => {
    emitDesktopRuntimeEvent({
      kind: "updateStateChanged",
      update,
    });
  });
}

async function createUpdateService(): Promise<DesktopUpdateService> {
  if (!app.isPackaged || process.platform !== "darwin") {
    return createDisabledUpdateService();
  }

  try {
    const { autoUpdater } = await import("electron-updater");
    return new DesktopUpdateService({
      currentVersion: DESKTOP_APP_VERSION,
      updater: autoUpdater,
      installUpdateAndRestart: async () => {
        if (appServerManager.state !== "idle" && appServerManager.state !== "stopped") {
          await appServerManager.stop();
        }
        unregisterDesktopIpcHandlers();
        autoUpdater.quitAndInstall(false, true);
      },
    });
  } catch (error) {
    console.error(`[desktop:update] Failed to initialize updater: ${formatError(error)}`);
    return createDisabledUpdateService();
  }
}

function syncUpdaterBusyState(): void {
  updateService.setBusy(threadAccumulator.hasBlockingWork());
}

async function persistInteractionState(threadId: string): Promise<void> {
  const currentThreadState = threadAccumulator.getThreadState(threadId);
  if (!currentThreadState) {
    return;
  }

  await workspaceState.rememberThreadInteractionState(threadId, currentThreadState.interactionState);
}

function initializeActiveThread(result: {
  threadId: string;
  thread: { title: string };
  workspaceRoot: string | null;
  cwd?: string | null;
}) {
  const folderRoot = result.workspaceRoot ?? result.cwd ?? null;
  const buffer = threadAccumulator.getBuffer(result.threadId);
  buffer.state = "running";
  buffer.interactionState = resolveDesktopInteractionState({
    previousInteractionState: buffer.interactionState,
    threadState: "running",
    workspaceRoot: folderRoot,
  });
  buffer.title = result.thread.title;
  buffer.workspaceRoot = result.workspaceRoot;
  buffer.cwd = result.cwd ?? null;
  threadAccumulator.setActiveThread(result.threadId);
  if (folderRoot) {
    workspaceFileActivity.start(result.threadId, folderRoot);
  }
  emitThreadInputStateDelta(result.threadId, threadInputQueue.markThreadStarted(result.threadId));
  syncUpdaterBusyState();
  void persistInteractionState(result.threadId).catch(() => {});
}

function firstString(...values: Array<unknown>): string | null {
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

function isNonEmptyString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}

function completionStatusLabel(status: string | null | undefined): "completed" | "failed" | "interrupted" {
  const resolved = firstString(status)?.toLowerCase();
  if (resolved === "failed") {
    return "failed";
  }
  if (resolved === "interrupted" || resolved === "cancelled" || resolved === "canceled") {
    return "interrupted";
  }
  return "completed";
}

function latestRecordedFileChangePaths(
  threadState: ReturnType<typeof threadAccumulator.getThreadState>,
): Set<string> {
  const entries = Array.isArray(threadState?.entries) ? threadState.entries : [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.kind !== "fileChange") {
      continue;
    }

    return new Set(
      (Array.isArray(entry.changes) ? entry.changes : [])
        .map((change) => firstString(change?.path))
        .filter(isNonEmptyString),
    );
  }

  return new Set();
}

function decorateThreadSummary(thread: DesktopThreadSummary): DesktopThreadSummary {
  const liveThreadState = threadAccumulator.getThreadState(thread.id);
  const liveTitle = firstString(liveThreadState?.title);
  const liveSubtitle = firstString(liveThreadState?.subtitle);
  return {
    ...thread,
    title: liveTitle && liveTitle !== "Untitled thread" ? liveTitle : thread.title,
    subtitle: liveSubtitle ?? thread.subtitle,
    state: liveThreadState?.state ?? thread.state,
    interactionState: liveThreadState?.interactionState ?? thread.interactionState,
    updatedAt: liveThreadState?.updatedAt ?? thread.updatedAt,
    workspaceRoot: liveThreadState?.workspaceRoot ?? thread.workspaceRoot ?? null,
    cwd: liveThreadState?.cwd ?? thread.cwd ?? null,
    threadInputState: threadInputQueue.getThreadInputState(thread.id) ?? thread.threadInputState ?? null,
  };
}

function decorateThreadSnapshot(thread: DesktopThreadSnapshot): DesktopThreadSnapshot {
  return {
    ...thread,
    threadInputState: threadInputQueue.getThreadInputState(thread.id) ?? thread.threadInputState ?? null,
  };
}

function decorateBootstrap(bootstrap: DesktopBootstrap): DesktopBootstrap {
  return {
    ...bootstrap,
    recentThreads: bootstrap.recentThreads.map((thread) => decorateThreadSummary(thread)),
    selectedThread: bootstrap.selectedThread ? decorateThreadSnapshot(bootstrap.selectedThread) : null,
  };
}

function emitThreadInputStateDelta(threadId: string, threadInputState: DesktopThreadInputState | null): void {
  emitDesktopThreadDelta(threadAccumulator.setThreadInputState(threadId, threadInputState));
}

function updateVisibleThread(threadId: string | null): void {
  currentVisibleThreadId = firstString(threadId);
  if (!currentVisibleThreadId) {
    return;
  }

  emitThreadInputStateDelta(currentVisibleThreadId, threadInputQueue.markThreadViewed(currentVisibleThreadId));
}

function shouldNotifyForThread(threadId: string): boolean {
  const visibleThreadId = currentVisibleThreadId ?? null;
  const windowFocused = BrowserWindow.getAllWindows().some((window) => !window.isDestroyed() && window.isFocused());
  return !windowFocused || visibleThreadId !== threadId;
}

function showCompletionNotification(threadId: string, status: "completed" | "failed" | "interrupted"): void {
  if (!Notification.isSupported()) {
    return;
  }

  const threadState = threadAccumulator.getThreadState(threadId);
  const title = status === "completed"
    ? "Sense-1 Workspace task finished"
    : status === "failed"
      ? "Sense-1 Workspace task failed"
      : "Sense-1 Workspace task stopped";
  const body = threadState?.title
    ? `${threadState.title}`
    : "A background thread changed state.";

  new Notification({
    title,
    body,
    silent: true,
  }).show();
}

async function drainQueuedFollowUp(threadId: string, queuedMessage: { text: string; id: string; enqueuedAt: string }): Promise<void> {
  const threadState = threadAccumulator.getThreadState(threadId);
  try {
    const result = await desktopSessionController.runDesktopTask({
      prompt: queuedMessage.text,
      threadId,
      cwd: threadState?.cwd ?? threadState?.workspaceRoot ?? undefined,
      workspaceRoot: threadState?.workspaceRoot ?? undefined,
    });
    if (result.status === "started") {
      initializeActiveThread(result);
      return;
    }
    if (result.status === "approvalRequired" && result.threadId) {
      await emitApprovalRefresh(result.threadId);
      return;
    }
    if (shouldRestoreQueuedFollowUp(result)) {
      emitDesktopRuntimeEvent({
        kind: "permissionRequired",
        rootPath: result.permissionRequest.rootPath,
        displayName: result.permissionRequest.displayName,
      });
      emitThreadInputStateDelta(threadId, threadInputQueue.restoreQueuedMessage(threadId, queuedMessage));
    }
  } catch (error) {
    console.error(`[desktop:queue] Failed to start queued follow-up: ${formatError(error)}`);
    emitThreadInputStateDelta(threadId, threadInputQueue.restoreQueuedMessage(threadId, queuedMessage));
  }
}

async function steerOrQueueTurn(threadId: string, input: string): Promise<DesktopSteerTurnResult> {
  try {
    await desktopSessionController.steerTurn(threadId, input);
    return {
      status: "steered",
      threadInputState: threadInputQueue.getThreadInputState(threadId),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/ActiveTurnNotSteerable|not steerable/i.test(message)) {
      throw error;
    }

    const threadInputState = threadInputQueue.queueInput(threadId, input);
    emitThreadInputStateDelta(threadId, threadInputState);
    return {
      status: "queued",
      threadInputState,
    };
  }
}

async function emitApprovalRefresh(threadId: string) {
  const bootstrap = await desktopSessionController.getBootstrap();
  const approval =
    bootstrap.pendingApprovals.find((entry) => entry.threadId === threadId)
    ?? bootstrap.pendingApprovals.at(-1)
    ?? null;
  if (!approval) {
    return;
  }

  emitDesktopRuntimeEvent({
    kind: "approvalRequested",
    approval,
  });
}

const desktopSessionController = new DesktopSessionController(appServerManager, {
  appStartedAt,
  env: process.env,
  openExternal: async (url) => {
    await shell.openExternal(url);
  },
  onRuntimeEvent: async (event) => {
    emitDesktopRuntimeEvent(event);
  },
  onDesktopRunStarted: async (result) => {
    if (result.status === "started") {
      initializeActiveThread(result);
    }
  },
  onDesktopTaskResult: async (result) => {
    if (result.status === "started") {
      initializeActiveThread(result);
      return;
    }
    if (result.status === "approvalRequired" && result.threadId) {
      await emitApprovalRefresh(result.threadId);
      return;
    }
    if (result.status === "permissionRequired" && result.permissionRequest) {
      emitDesktopRuntimeEvent({
        kind: "permissionRequired",
        rootPath: result.permissionRequest.rootPath,
        displayName: result.permissionRequest.displayName,
      });
      return;
    }
  },
  onThreadTitleChanged: async (threadId, title) => {
    enqueueAccumulatorNotification({
      method: "thread/name/updated",
      params: {
        threadId,
        name: title,
      },
    });
  },
  runtimeInfo,
});
let runtimeStartInFlight: Promise<void> | null = null;
let isGracefulQuitInProgress = false;

appServerManager.on("state:crashed", (summary) => {
  console.error(
    `[desktop:runtime] App-server crashed (restartCount=${summary.restartCount}, lastError=${summary.lastError ?? "none"}).`,
  );
});

appServerManager.on("state:errored", (summary) => {
  console.error(
    `[desktop:runtime] App-server entered errored state (lastError=${summary.lastError ?? "unknown"}).`,
  );
});

appServerManager.on("transport:error", (error) => {
  console.error(`[desktop:runtime] Transport error: ${formatError(error)}`);
});

appServerManager.on("notification", (message) => {
  // Log key lifecycle events (not streaming deltas) for debugging
  if (SHOULD_LOG_RUNTIME_EVENTS && message && typeof message === "object" && "method" in message) {
    const m = String(message.method);
    if (!m.includes("/delta") && !m.includes("rateLimits") && !m.includes("tokenUsage")) {
      console.log(`[sense1:event] ${m}`);
    }
  }
  if (message && typeof message === "object" && "method" in message) {
    recordRuntimePerfCounter(`notification.${String(message.method)}`);
  }
  const messageParams =
    message && typeof message === "object" && "params" in message && message.params && typeof message.params === "object"
      ? message.params as { threadId?: string; status?: string; turn?: { status?: string } | null }
      : null;
  const threadId = typeof messageParams?.threadId === "string" ? messageParams.threadId.trim() : "";
  const currentThreadState = threadId ? threadAccumulator.getThreadState(threadId) : null;

  if (message.method === "account/login/completed") {
    focusMainWindow();
  }
  runtimeFileChangeTracker.observe(message);
  if (threadId) {
    const threadRunContext = desktopSessionController.getThreadRunContext(threadId);
    managementInventoryChangeTracker.observe(
      message,
      filterProfileCodexHomeRoots(threadRunContext?.grants.map((grant) => grant.rootPath) ?? []),
    );
  }
  if (threadId) {
    const folderRoot = currentThreadState?.workspaceRoot ?? currentThreadState?.cwd ?? null;
    const runContext = desktopSessionController.getThreadRunContext(threadId);
    const outsideWorkspacePaths = collectOutOfWorkspacePathsFromRuntimeMessage(
      message,
      folderRoot,
      runContext?.grants.map((grant) => grant.rootPath) ?? [],
    );
    if (outsideWorkspacePaths.length > 0) {
      const blockedPath = outsideWorkspacePaths[0];
      const entryDelta = threadAccumulator.appendSyntheticEntry(threadId, {
        id: `workspace-boundary-${Date.now()}`,
        kind: "activity",
        title: "Workspace boundary blocked",
        body: `Sense-1 Workspace stopped this run because it touched ${blockedPath} outside the selected folder.`,
        status: "blocked",
      });
      for (const delta of entryDelta) {
        emitDesktopThreadDelta(delta);
      }
      void persistInteractionState(threadId).catch(() => {});
      void appServerManager.request("turn/interrupt", { threadId }).catch(() => {});
    }
  }

  // Raw notifications remain the substrate-writer source of truth.
  // The renderer-facing event mapper intentionally drops detail that
  // the product audit trail still needs to keep.
  desktopSessionController.ingestRuntimeMessage(message);

  const runContext = threadId ? desktopSessionController.getThreadRunContext(threadId) : null;
  const accumulatorMessage =
    message.method === "turn/plan/updated" && messageParams
      ? {
          ...message,
          params: {
            ...messageParams,
            runContext,
            workspaceRoot: currentThreadState?.workspaceRoot ?? currentThreadState?.cwd ?? null,
          },
        }
      : message;

  // Push-based delta pipeline: apply streaming events to the accumulator
  // and emit granular deltas to the renderer instead of triggering
  // full bootstrap refetches. High-frequency streaming deltas are
  // coalesced before the accumulator sees them so the main process
  // does not rebuild thread state for every tiny chunk.
  enqueueAccumulatorNotification(accumulatorMessage);

  if (message.method === "turn/completed" && threadId) {
    const changedPaths = workspaceFileActivity.finish(threadId);
    if (changedPaths.length > 0) {
      if (runtimeFileChangeTracker.consumeFallbackRequirement(threadId)) {
        desktopSessionController.ingestRuntimeMessage({
          method: "turn/diff/updated",
          params: {
            threadId,
            diffs: changedPaths.map((changedPath: string) => ({
              hunks: [],
              path: changedPath,
            })),
          },
        });
      }
      const latestFileChangePaths = latestRecordedFileChangePaths(currentThreadState);
      const supplementalChangedPaths = changedPaths.filter((changedPath) => !latestFileChangePaths.has(changedPath));
      if (supplementalChangedPaths.length > 0) {
        const entryDeltas = threadAccumulator.appendSyntheticEntry(threadId, {
          id: `workspace-file-change-${Date.now()}`,
          kind: "fileChange",
          title: "File changes",
          status: "complete",
          changes: supplementalChangedPaths.map((changedPath: string) => ({
            kind: "modified",
            path: changedPath,
          })),
        });
        for (const delta of entryDeltas) {
          emitDesktopThreadDelta(delta);
        }
      }
      const diffDeltas = threadAccumulator.setDiffState(
        threadId,
        changedPaths.map((changedPath: string) => ({ path: changedPath })),
      );
      for (const delta of diffDeltas) {
        emitDesktopThreadDelta(delta);
      }
      void persistInteractionState(threadId).catch(() => {});
    }
    runtimeFileChangeTracker.clear(threadId);
    if (managementInventoryChangeTracker.consume(threadId)) {
      emitDesktopRuntimeEvent({ kind: "managementInventoryChanged" });
    }

    const completionStatus = completionStatusLabel(messageParams?.turn?.status ?? messageParams?.status);
    const completionResult = threadInputQueue.handleTurnCompleted({
      threadId,
      visibleThreadId: currentVisibleThreadId,
      windowFocused: BrowserWindow.getAllWindows().some((window) => !window.isDestroyed() && window.isFocused()),
      status: completionStatus,
    });
    emitThreadInputStateDelta(threadId, completionResult.threadInputState);
    if (completionResult.nextQueuedMessage) {
      void drainQueuedFollowUp(threadId, completionResult.nextQueuedMessage);
    } else if (completionResult.shouldNotify && shouldNotifyForThread(threadId)) {
      showCompletionNotification(threadId, completionStatus);
    }
  }

  // Continue processing approval, audit, and lifecycle events through
  // the existing runtime event pipeline. Thread content events that
  // were previously handled by triggering full refetches are now
  // handled by the delta pipeline above. The runtime event is still
  // emitted for approval and account change events.
  const desktopEvent = mapDesktopRuntimeEvent(message);
  if (desktopEvent) {
    desktopSessionController.ingestRuntimeEvent(desktopEvent);
    // Only emit runtime events for non-content changes (approvals,
    // account changes, thread list changes). Content changes are
    // handled by the delta pipeline.
    if (desktopEvent.kind !== "threadContentChanged") {
      emitDesktopRuntimeEvent(desktopEvent);
    }
  }
});

if (!isSingleInstance) {
  app.quit();
  process.exit(0);
}

if (isSingleInstance && app.isReady()) {
  void bootstrapMainProcess();
} else if (isSingleInstance) {
  app.whenReady().then(() => {
    void bootstrapMainProcess();
  });
}

async function bootstrapMainProcess(): Promise<void> {
  if (!app.isReady()) {
    return;
  }

  setDesktopDockIcon();
  ensureRuntimeStarted();
  updateService = await createUpdateService();
  bindUpdateService(updateService);
  registerDesktopIpcHandlers({
    getRuntimeInfo: () => runtimeInfo,
    getUpdateState: async () => updateService.getState(),
    checkForUpdates: async () => await updateService.checkForUpdates(),
    installUpdate: async () => await updateService.installUpdate(),
    openLatestRelease: async () => {
      await shell.openExternal(LATEST_RELEASE_URL);
    },
    launchChatgptSignIn: async () => await desktopSessionController.launchChatgptSignIn(),
    logoutChatgpt: async () => await desktopSessionController.logoutChatgpt(),
    getBootstrap: async () => {
      const bootstrap = await desktopSessionController.getBootstrap();
      updateVisibleThread(resolveBootstrapVisibleThreadId(bootstrap));
      return decorateBootstrap(bootstrap);
    },
    rememberLastSelectedThread: async (request) => {
      await desktopSessionController.rememberLastSelectedThread(request);
      updateVisibleThread(request.threadId ?? null);
    },
    renameDesktopThread: async (request) => await desktopSessionController.renameDesktopThread(request),
    archiveDesktopThread: async (request) => {
      threadInputQueue.dropThread(request.threadId);
      await desktopSessionController.archiveDesktopThread(request);
    },
    restoreDesktopThread: async (request) => await desktopSessionController.restoreDesktopThread(request),
    deleteDesktopThread: async (request) => {
      threadInputQueue.dropThread(request.threadId);
      await desktopSessionController.deleteDesktopThread(request);
    },
    rememberThreadWorkspaceRoot: async (request) => await desktopSessionController.rememberThreadWorkspaceRoot(request),
    rememberWorkspaceSidebarOrder: async (request) => await desktopSessionController.rememberWorkspaceSidebarOrder(request),
    readDesktopThread: async (threadId: string) => {
      updateVisibleThread(threadId);
      const result = await desktopSessionController.readDesktopThread(threadId);
      const decoratedResult: DesktopThreadReadResult = {
        thread: result.thread ? decorateThreadSnapshot(result.thread) : null,
      };
      // Load the full snapshot into the accumulator so subsequent
      // streaming deltas can be applied incrementally, then emit
      // the snapshot delta (which carries preserved sidebar state)
      // so the renderer can restore plan/diff/input-request state.
      if (decoratedResult.thread) {
        const snapshotDelta = threadAccumulator.loadSnapshot(threadId, decoratedResult.thread);
        threadAccumulator.setActiveThread(threadId);
        emitDesktopThreadDelta(snapshotDelta);
        syncUpdaterBusyState();
        void persistInteractionState(threadId).catch(() => {});
      }
      return decoratedResult;
    },
    runDesktopTask: async (request) => {
      const result = await desktopSessionController.runDesktopTask(request);
      if (result.status === "started") {
        initializeActiveThread(result);
      } else if (result.status === "approvalRequired" && result.threadId) {
        await emitApprovalRefresh(result.threadId);
      }
      return result;
    },
    interruptTurn: async (request) => {
      try {
        await desktopSessionController.interruptTurn(request);
      } catch (error) {
        workspaceFileActivity.stop(request.threadId);
        runtimeFileChangeTracker.clear(request.threadId);
        throw error;
      }
    },
    steerTurn: async (threadId: string, input: string) => await steerOrQueueTurn(threadId, input),
    queueTurnInput: async (request) => {
      emitThreadInputStateDelta(request.threadId, threadInputQueue.queueInput(request.threadId, request.input));
    },
    respondToDesktopApproval: async (request) => await desktopSessionController.respondToDesktopApproval(request),
    selectDesktopProfile: async (profileId: string) => {
      workspaceFileActivity.clear();
      runtimeFileChangeTracker.clearAll();
      threadAccumulator.clear();
      threadInputQueue.clear();
      currentVisibleThreadId = null;
      syncUpdaterBusyState();
      return await desktopSessionController.selectDesktopProfile(profileId);
    },
    listModels: async () => await desktopSessionController.listModels(),
    respondToInputRequest: async (request) => await desktopSessionController.respondToInputRequest(request),
    startDesktopVoice: async (request) => await desktopSessionController.startDesktopVoice(request),
    appendDesktopVoiceAudio: async (request) => await desktopSessionController.appendDesktopVoiceAudio(request),
    stopDesktopVoice: async (request) => await desktopSessionController.stopDesktopVoice(request),
    rememberWorkspaceFolder: async (folderPath: string) => await desktopSessionController.rememberWorkspaceFolder(folderPath),
    archiveWorkspace: async (request) => await desktopSessionController.archiveWorkspace(request),
    restoreWorkspace: async (request) => await desktopSessionController.restoreWorkspace(request),
    deleteWorkspace: async (request) => await desktopSessionController.deleteWorkspace(request),
    getWorkspacePolicy: async (request) => await desktopSessionController.getWorkspacePolicy(request.rootPath),
    hydrateWorkspace: async (request) => await desktopSessionController.hydrateWorkspace(request.rootPath),
    grantWorkspacePermission: async (request) => await desktopSessionController.grantWorkspacePermission(request),
    setWorkspaceOperatingMode: async (request) => await desktopSessionController.setWorkspaceOperatingMode(request),
    substrateRecentWorkspaces: async (request) => await desktopSessionController.substrateRecentWorkspaces(request.limit),
    substrateRecentSessions: async (request) => await desktopSessionController.substrateRecentSessions(request.limit),
    substrateSessionsByWorkspace: async (request) => await desktopSessionController.substrateSessionsByWorkspace(request.workspaceId, request.limit),
    substrateSessionDetail: async (request) => await desktopSessionController.substrateSessionDetail(request.sessionId),
    substrateWorkspaceDetail: async (request) => await desktopSessionController.substrateWorkspaceDetail(request.workspaceId),
    substrateEventsBySession: async (request) => await desktopSessionController.substrateEventsBySession(request.sessionId, request.limit),
    substrateObjectRefsBySession: async (request) => await desktopSessionController.substrateObjectRefsBySession(request.sessionId, request.limit),
    projectedWorkspaces: async (request) => await desktopSessionController.projectedWorkspaces(request.limit),
    projectedWorkspaceByRoot: async (request) => await desktopSessionController.projectedWorkspaceByRoot(request.rootPath),
    projectedSessions: async (request) => await desktopSessionController.projectedSessions(request.workspaceId, request.limit),
    getDesktopSettings: async () => await desktopSessionController.getDesktopSettings(),
    getDesktopPolicyRules: async () => await desktopSessionController.getDesktopPolicyRules(),
    updateDesktopSettings: async (request) => await desktopSessionController.updateDesktopSettings(request.settings),
    getDesktopExtensionOverview: async (request) => await desktopSessionController.getDesktopExtensionOverview(request),
    readDesktopPluginDetail: async (request) => await desktopSessionController.readDesktopPluginDetail(request),
    installDesktopPlugin: async (request) => await desktopSessionController.installDesktopPlugin(request),
    uninstallDesktopPlugin: async (request) => await desktopSessionController.uninstallDesktopPlugin(request),
    setDesktopPluginEnabled: async (request) => await desktopSessionController.setDesktopPluginEnabled(request),
    openDesktopAppInstall: async (request) => await desktopSessionController.openDesktopAppInstall(request),
    removeDesktopApp: async (request) => await desktopSessionController.removeDesktopApp(request),
    setDesktopAppEnabled: async (request) => await desktopSessionController.setDesktopAppEnabled(request),
    startDesktopMcpServerAuth: async (request) => await desktopSessionController.startDesktopMcpServerAuth(request),
    setDesktopMcpServerEnabled: async (request) => await desktopSessionController.setDesktopMcpServerEnabled(request),
    readDesktopSkillDetail: async (request) => await desktopSessionController.readDesktopSkillDetail(request),
    setDesktopSkillEnabled: async (request) => await desktopSessionController.setDesktopSkillEnabled(request),
    uninstallDesktopSkill: async (request) => await desktopSessionController.uninstallDesktopSkill(request),
    getDesktopTeamState: async () => await desktopSessionController.getDesktopTeamState(),
    createDesktopFirstTeam: async (request) => await desktopSessionController.createDesktopFirstTeam(request),
    saveDesktopTeamMember: async (request) => await desktopSessionController.saveDesktopTeamMember(request),
    listDesktopAutomations: async () => await desktopSessionController.listDesktopAutomations(),
    getDesktopAutomation: async (id) => await desktopSessionController.getDesktopAutomation(id),
    saveDesktopAutomation: async (request) => await desktopSessionController.saveDesktopAutomation(request),
    deleteDesktopAutomation: async (request) => await desktopSessionController.deleteDesktopAutomation(request),
    runDesktopAutomationNow: async (request) => await desktopSessionController.runDesktopAutomationNow(request),
  });
  createMainWindow();
  syncUpdaterBusyState();
  updateService.start();
}

function setDesktopDockIcon(): void {
  if (process.platform !== "darwin" || !app.dock) {
    return;
  }

  const iconPath = resolveDesktopIconPath();
  if (!iconPath) {
    return;
  }

  app.dock.setIcon(nativeImage.createFromPath(iconPath));
}

app.on("second-instance", () => {
  focusMainWindow();
});

app.on("activate", () => {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length === 0) {
    createMainWindow();
  } else {
    focusMainWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (isGracefulQuitInProgress) {
    return;
  }

  if (appServerManager.state !== "idle" && appServerManager.state !== "stopped") {
    event.preventDefault();
    isGracefulQuitInProgress = true;
    void stopRuntimeForQuit();
    return;
  }

  unregisterDesktopIpcHandlers();
});

function ensureRuntimeStarted(): void {
  if (runtimeStartInFlight) {
    return;
  }

  runtimeStartInFlight = resolveDesktopProfile(process.env)
    .then(async (profile) => {
      await appServerManager.handleProfileChange(profile.codexHome);
      await appServerManager.start();
    })
    .catch((error) => {
      console.error(`[desktop:runtime] Failed to start app-server: ${formatError(error)}`);
    })
    .finally(() => {
      runtimeStartInFlight = null;
    });
}

async function stopRuntimeForQuit(): Promise<void> {
  try {
    await appServerManager.stop();
  } catch (error) {
    console.error(`[desktop:runtime] Failed to stop app-server during quit: ${formatError(error)}`);
  } finally {
    unregisterDesktopIpcHandlers();
    app.quit();
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
