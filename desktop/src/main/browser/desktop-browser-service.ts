import { BrowserView, BrowserWindow, session } from "electron";

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
const VIEWPORT_WIDTHS: Record<DesktopBrowserViewportPreset, number | null> = {
  desktop: null,
  tablet: 820,
  mobile: 390,
};

interface BrowserRecord {
  readonly threadId: string;
  readonly view: BrowserView;
  viewport: DesktopBrowserViewportPreset;
  bounds: DesktopBrowserBounds;
  title: string | null;
  url: string | null;
  loading: boolean;
  error: string | null;
  consoleEntries: DesktopBrowserConsoleEntry[];
  networkEntries: DesktopBrowserNetworkEntry[];
}

export class DesktopBrowserService {
  readonly #allowedOrigins = new Set<string>();
  readonly #allowedOnceOrigins = new Set<string>();
  readonly #blockedOrigins = new Set<string>();
  readonly #records = new Map<string, BrowserRecord>();

  async open(request: DesktopBrowserOpenRequest): Promise<DesktopBrowserState> {
    const window = this.#requireWindow();
    const record = this.#getOrCreateRecord(request.threadId, request.viewport ?? "desktop");
    record.bounds = request.bounds;
    this.#attach(window, record);
    this.#setBounds(record, request.bounds);
    if (request.url?.trim()) {
      await this.navigate(request.threadId, request.url);
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

  checkTrust(url: string): DesktopBrowserTrustCheckResult {
    const origin = resolveOrigin(url);
    if (!origin) {
      return {
        origin: null,
        status: "invalid",
        message: "Browser Use supports http(s), localhost, file previews, and about:blank.",
      };
    }
    if (this.#blockedOrigins.has(origin)) {
      return { origin, status: "blocked", message: "This site is blocked for Browser Use." };
    }
    if (this.#allowedOnceOrigins.has(origin)) {
      return { origin, status: "allowed", message: null };
    }
    if (this.#allowedOrigins.has(origin)) {
      return { origin, status: "allowed", message: null };
    }
    return { origin, status: "needsApproval", message: "Allow Browser Use before the agent operates this site." };
  }

  updateTrust(origin: string, decision: DesktopBrowserTrustDecision): DesktopBrowserTrustState {
    const normalizedOrigin = normalizeOrigin(origin);
    if (!normalizedOrigin) {
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
    return this.getTrustState();
  }

  getTrustState(): DesktopBrowserTrustState {
    return {
      allowedOrigins: [...this.#allowedOrigins].sort(),
      blockedOrigins: [...this.#blockedOrigins].sort(),
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
      consoleEntries: [],
      networkEntries: [],
    };
    this.#bind(record);
    this.#records.set(threadId, record);
    void view.webContents.loadURL(DEFAULT_BROWSER_URL);
    return record;
  }

  #bind(record: BrowserRecord): void {
    const webContents = record.view.webContents;
    webContents.on("page-title-updated", (_event, title) => {
      record.title = title || null;
    });
    webContents.on("did-start-loading", () => {
      record.loading = true;
      record.error = null;
    });
    webContents.on("did-stop-loading", () => {
      record.loading = false;
      record.url = webContents.getURL() || null;
      record.title = webContents.getTitle() || record.title;
    });
    webContents.on("did-fail-load", (_event, _errorCode, errorDescription, validatedUrl) => {
      record.loading = false;
      record.url = validatedUrl || webContents.getURL() || record.url;
      record.error = errorDescription || "Page failed to load.";
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
    };
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
