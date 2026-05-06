import { BrowserView, BrowserWindow, session, type Event as ElectronEvent } from "electron";

import { getMainWindow } from "../window.ts";
import type {
  DesktopBrowserBounds,
  DesktopBrowserConsoleEntry,
  DesktopBrowserConsoleResult,
  DesktopBrowserInspectResult,
  DesktopBrowserNetworkEntry,
  DesktopBrowserNetworkResult,
  DesktopBrowserOpenRequest,
  DesktopBrowserScreenshotResult,
  DesktopBrowserState,
  DesktopBrowserTrustCheckResult,
  DesktopBrowserTrustDecision,
  DesktopBrowserTrustState,
  DesktopBrowserViewportPreset,
} from "../../shared/contracts/index";
import { normalizeBrowserUrl, normalizeOrigin, resolveOrigin } from "./desktop-browser-url.ts";

const DEFAULT_BROWSER_URL = "about:blank";
const BROWSER_PARTITION = "persist:sense1-browser";
const MAX_LOG_ENTRIES = 80;
const BROWSER_USE_CDP_TIMEOUT_MS = 15_000;
const VIEWPORT_WIDTHS: Record<DesktopBrowserViewportPreset, number | null> = {
  desktop: null,
  tablet: 820,
  mobile: 390,
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isIgnorableBrowserUseNavigationError(error: unknown): boolean {
  return /\bERR_ABORTED\b/u.test(errorMessage(error));
}

interface BrowserRecord {
  readonly threadId: string;
  readonly view: BrowserView;
  viewport: DesktopBrowserViewportPreset;
  bounds: DesktopBrowserBounds;
  title: string | null;
  url: string | null;
  loading: boolean;
  error: string | null;
  pendingBrowserUseOrigin: string | null;
  consoleEntries: DesktopBrowserConsoleEntry[];
  networkEntries: DesktopBrowserNetworkEntry[];
}

export interface BrowserUseTabRecord {
  readonly id: number;
  readonly title?: string;
  readonly url?: string;
  readonly active?: boolean;
}

export class DesktopBrowserService {
  readonly #allowedBrowserUseSessions = new Set<string>();
  readonly #blockedBrowserUseSessions = new Set<string>();
  readonly #allowedOrigins = new Set<string>();
  readonly #allowedOnceOrigins = new Set<string>();
  readonly #blockedOrigins = new Set<string>();
  readonly #records = new Map<string, BrowserRecord>();
  readonly #browserUseCdpListeners = new Set<(event: { tabId: string; method: string; params: unknown }) => void>();
  readonly #onStateChange: ((state: DesktopBrowserState) => void) | null;

  constructor(onStateChange: ((state: DesktopBrowserState) => void) | null = null) {
    this.#onStateChange = onStateChange;
  }

  async open(request: DesktopBrowserOpenRequest): Promise<DesktopBrowserState> {
    const window = this.#requireWindow();
    const record = this.#getOrCreateRecord(request.threadId, request.viewport ?? "desktop");
    record.bounds = request.bounds;
    this.#attach(window, record);
    this.#setBounds(record, request.bounds);
    const requestedUrl = request.url?.trim() ?? "";
    const currentUrl = record.view.webContents.getURL() || record.url;
    if (requestedUrl && !(requestedUrl === DEFAULT_BROWSER_URL && currentUrl && currentUrl !== DEFAULT_BROWSER_URL)) {
      await this.navigate(request.threadId, requestedUrl);
    }
    return this.#state(record);
  }

  close(threadId: string): void {
    const record = this.#records.get(threadId);
    if (!record) {
      return;
    }
    const window = BrowserWindow.fromBrowserView(record.view);
    window?.removeBrowserView(record.view);
  }

  destroy(threadId: string): void {
    const record = this.#records.get(threadId);
    this.close(threadId);
    if (record && !record.view.webContents.isDestroyed()) {
      record.view.webContents.close();
    }
    this.#records.delete(threadId);
  }

  setBounds(threadId: string, bounds: DesktopBrowserBounds): void {
    const record = this.#requireRecord(threadId);
    record.bounds = bounds;
    this.#setBounds(record, bounds);
  }

  async navigate(threadId: string, rawUrl: string): Promise<DesktopBrowserState> {
    const record = this.#requireRecord(threadId);
    const url = normalizeBrowserUrl(rawUrl);
    if (!url) {
      record.error = "Enter a valid http(s), localhost, file, or about:blank URL.";
      return this.#state(record);
    }
    record.error = null;
    try {
      await record.view.webContents.loadURL(url);
    } catch (error) {
      record.error = error instanceof Error ? error.message : "Failed to load page.";
    }
    return this.#state(record);
  }

  async goBack(threadId: string): Promise<DesktopBrowserState> {
    const record = this.#requireRecord(threadId);
    if (record.view.webContents.canGoBack()) {
      record.view.webContents.goBack();
    }
    return this.#state(record);
  }

  async goForward(threadId: string): Promise<DesktopBrowserState> {
    const record = this.#requireRecord(threadId);
    if (record.view.webContents.canGoForward()) {
      record.view.webContents.goForward();
    }
    return this.#state(record);
  }

  async reload(threadId: string): Promise<DesktopBrowserState> {
    const record = this.#requireRecord(threadId);
    record.view.webContents.reload();
    return this.#state(record);
  }

  async stop(threadId: string): Promise<DesktopBrowserState> {
    const record = this.#requireRecord(threadId);
    record.view.webContents.stop();
    record.loading = false;
    return this.#state(record);
  }

  setViewport(threadId: string, viewport: DesktopBrowserViewportPreset, bounds: DesktopBrowserBounds): DesktopBrowserState {
    const record = this.#requireRecord(threadId);
    record.viewport = viewport;
    record.bounds = bounds;
    this.#setBounds(record, bounds);
    return this.#state(record);
  }

  async screenshot(threadId: string): Promise<DesktopBrowserScreenshotResult> {
    const record = this.#requireRecord(threadId);
    const image = await record.view.webContents.capturePage();
    return {
      threadId,
      url: record.url,
      title: record.title,
      capturedAt: new Date().toISOString(),
      dataUrl: image.toDataURL(),
    };
  }

  async inspect(threadId: string, selector?: string | null): Promise<DesktopBrowserInspectResult> {
    const record = this.#requireRecord(threadId);
    const text = await record.view.webContents.executeJavaScript(
      `
      (() => {
        const selector = ${JSON.stringify(selector?.trim() || null)};
        const target = selector ? document.querySelector(selector) : document.body;
        if (!target) return "";
        return (target.innerText || target.textContent || "").trim().slice(0, 12000);
      })()
      `,
      true,
    ) as string;
    return {
      url: record.url,
      title: record.title,
      text,
      selector: selector?.trim() || null,
    };
  }

  async click(threadId: string, x: number, y: number): Promise<DesktopBrowserState> {
    const record = this.#requireRecord(threadId);
    record.view.webContents.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
    record.view.webContents.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: 1 });
    return this.#state(record);
  }

  async type(threadId: string, x: number, y: number, text: string): Promise<DesktopBrowserState> {
    await this.click(threadId, x, y);
    const record = this.#requireRecord(threadId);
    record.view.webContents.sendInputEvent({ type: "keyDown", keyCode: "A", modifiers: process.platform === "darwin" ? ["meta"] : ["control"] });
    record.view.webContents.sendInputEvent({ type: "keyUp", keyCode: "A", modifiers: process.platform === "darwin" ? ["meta"] : ["control"] });
    record.view.webContents.insertText(text);
    return this.#state(record);
  }

  console(threadId: string): DesktopBrowserConsoleResult {
    return {
      entries: [...this.#requireRecord(threadId).consoleEntries],
    };
  }

  network(threadId: string): DesktopBrowserNetworkResult {
    return {
      entries: [...this.#requireRecord(threadId).networkEntries],
    };
  }

  listBrowserUseTabs(sessionId: string): BrowserUseTabRecord[] {
    const record = this.#ensureBrowserUseRecord(sessionId);
    return [this.#browserUseTab(record)];
  }

  createBrowserUseTab(sessionId: string): BrowserUseTabRecord {
    const record = this.#ensureBrowserUseRecord(sessionId);
    void record.view.webContents.loadURL(DEFAULT_BROWSER_URL);
    return this.#browserUseTab(record);
  }

  getBrowserUseTab(tabId: string | number): BrowserUseTabRecord {
    return this.#browserUseTab(this.#requireRecordByTabId(tabId));
  }

  async browserUseAttach(tabId: string | number): Promise<void> {
    const record = this.#requireRecordByTabId(tabId);
    const debuggerSession = record.view.webContents.debugger;
    if (!debuggerSession.isAttached()) {
      debuggerSession.attach("1.3");
    }
  }

  async browserUseDetach(tabId: string | number): Promise<void> {
    const record = this.#requireRecordByTabId(tabId);
    const debuggerSession = record.view.webContents.debugger;
    if (debuggerSession.isAttached()) {
      debuggerSession.detach();
    }
  }

  async browserUseExecuteCdp(
    tabId: string | number,
    method: string,
    commandParams: Record<string, unknown> = {},
  ): Promise<unknown> {
    const record = this.#requireRecordByTabId(tabId);
    if (method === "Page.navigate") {
      const url = typeof commandParams.url === "string" ? normalizeBrowserUrl(commandParams.url) : null;
      if (!url) {
        return { errorText: "Invalid URL" };
      }
      record.error = null;
      try {
        await record.view.webContents.loadURL(url);
      } catch (error) {
        if (!isIgnorableBrowserUseNavigationError(error)) {
          return { errorText: errorMessage(error) };
        }
      }
      return {};
    }
    const debuggerSession = record.view.webContents.debugger;
    if (!debuggerSession.isAttached()) {
      debuggerSession.attach("1.3");
    }
    return await withTimeout(
      debuggerSession.sendCommand(method, commandParams),
      BROWSER_USE_CDP_TIMEOUT_MS,
      `Browser Use CDP command timed out: ${method}`,
    );
  }

  async browserUseMoveMouse(tabId: string | number, x: number, y: number): Promise<void> {
    const record = this.#requireRecordByTabId(tabId);
    record.view.webContents.sendInputEvent({ type: "mouseMove", x, y });
  }

  onBrowserUseCdpEvent(listener: (event: { tabId: string; method: string; params: unknown }) => void): () => void {
    this.#browserUseCdpListeners.add(listener);
    return () => {
      this.#browserUseCdpListeners.delete(listener);
    };
  }

  checkTrust(url: string, threadId: string | null = null): DesktopBrowserTrustCheckResult {
    const origin = resolveOrigin(url);
    if (!origin) {
      return {
        origin: null,
        status: "invalid",
        message: "Browser Use supports http(s), localhost, file previews, and about:blank.",
      };
    }
    const sessionId = firstString(threadId);
    if (sessionId && this.#blockedBrowserUseSessions.has(sessionId)) {
      return { origin, status: "blocked", message: "Browser Use is blocked for this session." };
    }
    if (sessionId && this.#allowedBrowserUseSessions.has(sessionId)) {
      return { origin, status: "allowed", message: null };
    }
    if (this.#blockedOrigins.has(origin)) {
      return { origin, status: "blocked", message: "This site is blocked for Browser Use." };
    }
    if (origin === DEFAULT_BROWSER_URL) {
      return { origin, status: "allowed", message: null };
    }
    if (this.#allowedOnceOrigins.has(origin)) {
      return { origin, status: "allowed", message: null };
    }
    if (this.#allowedOrigins.has(origin)) {
      return { origin, status: "allowed", message: null };
    }
    return { origin, status: "needsApproval", message: "Approve Browser Use for this session before the agent operates the browser." };
  }

  updateTrust(origin: string, decision: DesktopBrowserTrustDecision, threadId: string | null = null): DesktopBrowserTrustState {
    const normalizedOrigin = normalizeOrigin(origin);
    if (!normalizedOrigin) {
      return this.getTrustState();
    }
    const sessionId = firstString(threadId);
    if (sessionId) {
      if (decision === "block") {
        this.#allowedBrowserUseSessions.delete(sessionId);
        this.#blockedBrowserUseSessions.add(sessionId);
      } else {
        this.#blockedBrowserUseSessions.delete(sessionId);
        this.#allowedBrowserUseSessions.add(sessionId);
      }
      for (const record of this.#records.values()) {
        if (record.threadId === sessionId && record.pendingBrowserUseOrigin) {
          record.pendingBrowserUseOrigin = null;
          this.#emitState(record);
        }
      }
      return this.getTrustState();
    }
    if (decision === "block") {
      this.#allowedOrigins.delete(normalizedOrigin);
      this.#allowedOnceOrigins.delete(normalizedOrigin);
      this.#blockedOrigins.add(normalizedOrigin);
    } else {
      this.#blockedOrigins.delete(normalizedOrigin);
      if (decision === "alwaysAllow") {
        this.#allowedOrigins.add(normalizedOrigin);
        this.#allowedOnceOrigins.delete(normalizedOrigin);
      } else {
        this.#allowedOnceOrigins.add(normalizedOrigin);
      }
    }
    for (const record of this.#records.values()) {
      if (record.pendingBrowserUseOrigin === normalizedOrigin) {
        record.pendingBrowserUseOrigin = null;
        this.#emitState(record);
      }
    }
    return this.getTrustState();
  }

  async waitForBrowserUsePermission(
    origin: string,
    timeoutMs = 60_000,
    threadId: string | null = null,
  ): Promise<"accept" | "decline"> {
    const normalizedOrigin = normalizeOrigin(origin);
    if (!normalizedOrigin) {
      return "decline";
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const trust = this.checkTrust(normalizedOrigin, threadId);
      if (trust.status === "allowed") {
        return "accept";
      }
      if (trust.status === "blocked" || trust.status === "invalid") {
        return "decline";
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return "decline";
  }

  async requestBrowserUsePermission(
    threadId: string,
    origin: string,
    timeoutMs = 60_000,
  ): Promise<"accept" | "decline"> {
    const normalizedOrigin = normalizeOrigin(origin);
    if (!normalizedOrigin) {
      return "decline";
    }
    const currentTrust = this.checkTrust(normalizedOrigin, threadId);
    if (currentTrust.status === "allowed") {
      return "accept";
    }
    if (currentTrust.status === "blocked" || currentTrust.status === "invalid") {
      return "decline";
    }

    const record = this.#ensureBrowserUseRecord(threadId);
    record.pendingBrowserUseOrigin = normalizedOrigin;
    this.#emitState(record);

    const decision = await this.waitForBrowserUsePermission(normalizedOrigin, timeoutMs, threadId);
    if (record.pendingBrowserUseOrigin === normalizedOrigin) {
      record.pendingBrowserUseOrigin = null;
      this.#emitState(record);
    }
    return decision;
  }

  getTrustState(): DesktopBrowserTrustState {
    return {
      allowedOrigins: [...this.#allowedOrigins].sort(),
      blockedOrigins: [...this.#blockedOrigins].sort(),
      allowedSessionIds: [...this.#allowedBrowserUseSessions].sort(),
      blockedSessionIds: [...this.#blockedBrowserUseSessions].sort(),
    };
  }

  #getOrCreateRecord(threadId: string, viewport: DesktopBrowserViewportPreset): BrowserRecord {
    const existing = this.#records.get(threadId);
    if (existing) {
      return existing;
    }
    const view = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        session: session.fromPartition(BROWSER_PARTITION),
      },
    });
    const record: BrowserRecord = {
      threadId,
      view,
      viewport,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      title: null,
      url: null,
      loading: false,
      error: null,
      pendingBrowserUseOrigin: null,
      consoleEntries: [],
      networkEntries: [],
    };
    this.#bind(record);
    this.#records.set(threadId, record);
    void view.webContents.loadURL(DEFAULT_BROWSER_URL);
    return record;
  }

  #ensureBrowserUseRecord(sessionId: string): BrowserRecord {
    const record = this.#getOrCreateRecord(sessionId, "desktop");
    const window = this.#requireWindow();
    this.#attach(window, record);
    if (record.bounds.width <= 0 || record.bounds.height <= 0) {
      const [width, height] = window.getContentSize();
      const leftRailWidth = 420;
      const topOffset = 80;
      record.bounds = {
        x: Math.min(leftRailWidth, Math.max(0, width - 320)),
        y: topOffset,
        width: Math.max(320, width - leftRailWidth),
        height: Math.max(240, height - topOffset),
      };
      this.#setBounds(record, record.bounds);
    }
    return record;
  }

  #browserUseTab(record: BrowserRecord): BrowserUseTabRecord {
    const webContents = record.view.webContents;
    return {
      id: webContents.id,
      title: webContents.getTitle() || record.title || undefined,
      url: webContents.getURL() || record.url || undefined,
      active: true,
    };
  }

  #requireRecordByTabId(tabId: string | number): BrowserRecord {
    const normalizedTabId = Number(tabId);
    if (!Number.isInteger(normalizedTabId) || normalizedTabId <= 0) {
      throw new Error(`Invalid Browser Use tab id: ${String(tabId)}`);
    }
    for (const record of this.#records.values()) {
      if (record.view.webContents.id === normalizedTabId) {
        return record;
      }
    }
    throw new Error(`Browser Use tab not found: ${String(tabId)}`);
  }

  #bind(record: BrowserRecord): void {
    const webContents = record.view.webContents;
    webContents.debugger.on("message", (_event: ElectronEvent, method: string, params: unknown) => {
      for (const listener of this.#browserUseCdpListeners) {
        listener({
          tabId: String(webContents.id),
          method,
          params,
        });
      }
    });
    webContents.on("page-title-updated", (_event, title) => {
      record.title = title || null;
      this.#emitState(record);
    });
    webContents.on("did-start-loading", () => {
      record.loading = true;
      record.error = null;
      this.#emitState(record);
    });
    webContents.on("did-navigate", (_event, url) => {
      record.url = url || webContents.getURL() || record.url;
      record.error = null;
      this.#emitState(record);
    });
    webContents.on("did-navigate-in-page", (_event, url) => {
      record.url = url || webContents.getURL() || record.url;
      record.error = null;
      this.#emitState(record);
    });
    webContents.on("did-stop-loading", () => {
      record.loading = false;
      record.url = webContents.getURL() || null;
      record.title = webContents.getTitle() || record.title;
      this.#emitState(record);
    });
    webContents.on("did-fail-load", (_event, _errorCode, errorDescription, validatedUrl) => {
      record.loading = false;
      record.url = validatedUrl || webContents.getURL() || record.url;
      record.error = errorDescription || "Page failed to load.";
      this.#emitState(record);
    });
    webContents.on("console-message", (_event, level, message) => {
      record.consoleEntries = [
        ...record.consoleEntries,
        { level: String(level), message, occurredAt: new Date().toISOString() },
      ].slice(-MAX_LOG_ENTRIES);
    });
    webContents.session.webRequest.onCompleted((details) => {
      if (details.webContentsId !== webContents.id) {
        return;
      }
      record.networkEntries = [
        ...record.networkEntries,
        {
          url: details.url,
          method: details.method,
          status: details.statusCode ?? null,
          failed: false,
        },
      ].slice(-MAX_LOG_ENTRIES);
    });
    webContents.session.webRequest.onErrorOccurred((details) => {
      if (details.webContentsId !== webContents.id) {
        return;
      }
      record.networkEntries = [
        ...record.networkEntries,
        {
          url: details.url,
          method: details.method,
          status: null,
          failed: true,
        },
      ].slice(-MAX_LOG_ENTRIES);
    });
  }

  #attach(window: BrowserWindow, record: BrowserRecord): void {
    if (BrowserWindow.fromBrowserView(record.view) === window) {
      return;
    }
    BrowserWindow.fromBrowserView(record.view)?.removeBrowserView(record.view);
    window.addBrowserView(record.view);
  }

  #setBounds(record: BrowserRecord, bounds: DesktopBrowserBounds): void {
    const viewportWidth = VIEWPORT_WIDTHS[record.viewport];
    const width = viewportWidth ? Math.min(bounds.width, viewportWidth) : bounds.width;
    const x = bounds.x + Math.max(0, Math.floor((bounds.width - width) / 2));
    record.view.setBounds({
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(bounds.y)),
      width: Math.max(0, Math.round(width)),
      height: Math.max(0, Math.round(bounds.height)),
    });
    record.view.setAutoResize({ width: false, height: false });
  }

  #state(record: BrowserRecord): DesktopBrowserState {
    const webContents = record.view.webContents;
    record.url = webContents.getURL() || record.url;
    record.title = webContents.getTitle() || record.title;
    return {
      threadId: record.threadId,
      url: record.url,
      title: record.title,
      canGoBack: webContents.canGoBack(),
      canGoForward: webContents.canGoForward(),
      loading: record.loading,
      viewport: record.viewport,
      error: record.error,
      pendingBrowserUseOrigin: record.pendingBrowserUseOrigin,
    };
  }

  #emitState(record: BrowserRecord): void {
    this.#onStateChange?.(this.#state(record));
  }

  #requireRecord(threadId: string): BrowserRecord {
    const record = this.#records.get(threadId);
    if (!record) {
      throw new Error("Browser pane is not open for this thread.");
    }
    return record;
  }

  #requireWindow(): BrowserWindow {
    const window = getMainWindow();
    if (!window) {
      throw new Error("Main window is not available.");
    }
    return window;
  }
}
