import { BrowserWindow, shell } from "electron";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDesktopIconDataUrl, resolveDesktopIconPath } from "./desktop-icon.js";

const BUNDLED_RENDERER_RETRY_DELAY_MS = 1000;
const BUNDLED_RENDERER_MAX_RETRIES = 30;
const DESKTOP_AUTH_CALLBACK_PORT = "1455";
const DESKTOP_AUTH_CALLBACK_PATH = "/auth/callback";

let mainWindow: BrowserWindow | null = null;
let authWindow: BrowserWindow | null = null;
let authWindowCloseTimer: NodeJS.Timeout | null = null;
const managedAuthWindows = new Set<BrowserWindow>();

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  const runtimeDir = dirname(fileURLToPath(import.meta.url));
  const preloadPath = resolve(runtimeDir, "../preload/index.mjs");
  const bundledRendererPath = resolve(runtimeDir, "../renderer/index.html");

  const window = new BrowserWindow({
    show: false,
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 560,
    title: "sense-1",
    autoHideMenuBar: true,
    icon: resolveDesktopIconPath() ?? undefined,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow = window;

  window.on("closed", () => {
    mainWindow = null;
  });

  window.on("ready-to-show", () => {
    window.maximize();
    window.show();
    window.focus();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });

  void (async () => {
    const bundledRendererTargets = uniqueTargets([
      process.env.ELECTRON_RENDERER_URL,
      bundledRendererPath,
    ]);

    const loadedBundledRenderer = await loadFirstAvailableTarget(window, bundledRendererTargets);
    if (loadedBundledRenderer !== null) {
      return;
    }

    scheduleBundledRendererReconnect(window, bundledRendererTargets);
  })();

  return window;
}

export function focusMainWindow(): void {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  mainWindow.focus();
}

export async function openDesktopAuthWindow(authUrl: string): Promise<void> {
  const window = getOrCreateAuthWindow();
  clearAuthWindowCloseTimer();
  await window.loadURL(authUrl);
  if (!window.isVisible()) {
    window.show();
  }
  window.focus();
}

export async function openDesktopManagedAuthWindow(authUrl: string): Promise<void> {
  const window = createManagedAuthWindow();
  await window.loadURL(authUrl);
  if (!window.isVisible()) {
    window.show();
  }
  window.focus();
}

export function markDesktopAuthCallbackSeen(targetUrl: string): void {
  if (!authWindow || authWindow.isDestroyed() || !isDesktopAuthCallbackUrl(targetUrl)) {
    return;
  }

  clearAuthWindowCloseTimer();
  void authWindow.loadURL(
    buildAuthStatusPage({
      title: "Finishing sign-in",
      message: "sense-1 is completing your sign-in. You can return to the app in a moment.",
    }),
  );
}

export function completeDesktopAuthWindow(): void {
  if (!authWindow || authWindow.isDestroyed()) {
    focusMainWindow();
    return;
  }

  clearAuthWindowCloseTimer();
  void authWindow.loadURL(
    buildAuthStatusPage({
      title: "You can return to sense-1",
      message: "Sign-in is complete. This window will close automatically.",
    }),
  );
  authWindowCloseTimer = setTimeout(() => {
    if (authWindow && !authWindow.isDestroyed()) {
      authWindow.close();
    }
    authWindow = null;
  }, 1200);
  focusMainWindow();
}

function getOrCreateAuthWindow(): BrowserWindow {
  if (authWindow && !authWindow.isDestroyed()) {
    return authWindow;
  }

  const window = createAuthWindow("Sign in to sense-1");

  authWindow = window;

  window.on("closed", () => {
    clearAuthWindowCloseTimer();
    authWindow = null;
  });

  window.on("ready-to-show", () => {
    window.show();
    window.focus();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  const maybeCaptureCallback = (targetUrl: string) => {
    if (!isDesktopAuthCallbackUrl(targetUrl)) {
      return;
    }

    markDesktopAuthCallbackSeen(targetUrl);
  };

  window.webContents.on("did-navigate", (_event, targetUrl) => {
    maybeCaptureCallback(targetUrl);
  });
  window.webContents.on("did-redirect-navigation", (_event, targetUrl) => {
    maybeCaptureCallback(targetUrl);
  });

  return window;
}

function createManagedAuthWindow(): BrowserWindow {
  const window = createAuthWindow("Connect app in sense-1");
  managedAuthWindows.add(window);
  window.on("closed", () => {
    managedAuthWindows.delete(window);
  });
  return window;
}

function createAuthWindow(title: string): BrowserWindow {
  return new BrowserWindow({
    show: false,
    width: 520,
    height: 760,
    minWidth: 420,
    minHeight: 620,
    title,
    autoHideMenuBar: true,
    parent: mainWindow ?? undefined,
    modal: false,
    icon: resolveDesktopIconPath() ?? undefined,
  });
}

function uniqueTargets(targets: Array<string | undefined>): string[] {
  return [...new Set(targets.map(normalizeTarget).filter((target) => target !== null))];
}

async function loadFirstAvailableTarget(
  window: BrowserWindow,
  targets: string[],
): Promise<string | null> {
  for (const target of targets) {
    const loaded = await loadTarget(window, target);
    if (loaded) {
      return target;
    }
  }

  return null;
}

async function loadTarget(window: BrowserWindow, target: string): Promise<boolean> {
  try {
    if (isHttpUrl(target)) {
      await window.loadURL(target);
    } else {
      await window.loadFile(target);
    }

    return true;
  } catch {
    return false;
  }
}

function normalizeTarget(target: string | undefined): string | null {
  const trimmed = target?.trim();
  return trimmed ? trimmed : null;
}

function isHttpUrl(target: string): boolean {
  return target.startsWith("http://") || target.startsWith("https://");
}

function scheduleBundledRendererReconnect(
  window: BrowserWindow,
  bundledRendererTargets: string[],
  attempt = 1,
): void {
  if (attempt > BUNDLED_RENDERER_MAX_RETRIES || window.isDestroyed()) {
    console.warn(
      `[desktop:window] Desktop renderer failed to load after ${BUNDLED_RENDERER_MAX_RETRIES} retry attempts. Tried: ${bundledRendererTargets.join(
        ", ",
      )}`,
    );
    return;
  }

  setTimeout(() => {
    void (async () => {
      if (window.isDestroyed()) {
        return;
      }

      const loaded = await loadFirstAvailableTarget(window, bundledRendererTargets);
      if (!loaded) {
        scheduleBundledRendererReconnect(window, bundledRendererTargets, attempt + 1);
      }
    })();
  }, BUNDLED_RENDERER_RETRY_DELAY_MS);
}

function isAllowedExternalUrl(target: string): boolean {
  try {
    const url = new URL(target);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isDesktopAuthCallbackUrl(target: string): boolean {
  try {
    const url = new URL(target);
    if (url.protocol !== "http:") {
      return false;
    }

    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return isLocalhost && url.port === DESKTOP_AUTH_CALLBACK_PORT && url.pathname === DESKTOP_AUTH_CALLBACK_PATH;
  } catch {
    return false;
  }
}

function buildAuthStatusPage({
  title,
  message,
}: {
  title: string;
  message: string;
}): string {
  const iconDataUrl = resolveDesktopIconDataUrl();
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escape(title)}</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(180deg, #f7f5f0 0%, #f3efe5 100%);
        color: #171717;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(420px, calc(100vw - 32px));
        padding: 32px 28px;
        border-radius: 28px;
        border: 1px solid rgba(23, 23, 23, 0.08);
        background: rgba(255, 255, 255, 0.94);
        box-shadow: 0 24px 60px rgba(23, 23, 23, 0.10);
        text-align: center;
      }
      .eyebrow {
        margin: 0 0 12px;
        font-size: 12px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: rgba(23, 23, 23, 0.55);
      }
      .mark {
        display: block;
        width: 72px;
        height: 72px;
        margin: 0 auto 16px;
        border-radius: 18px;
        box-shadow: 0 12px 28px rgba(23, 23, 23, 0.12);
        user-select: none;
        -webkit-user-drag: none;
      }
      h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.1;
      }
      p {
        margin: 14px 0 0;
        font-size: 14px;
        line-height: 1.6;
        color: rgba(23, 23, 23, 0.68);
      }
    </style>
  </head>
  <body>
    <main>
      ${iconDataUrl ? `<img class="mark" src="${escape(iconDataUrl)}" alt="" aria-hidden="true" />` : ""}
      <p class="eyebrow">sense-1 desktop</p>
      <h1>${escape(title)}</h1>
      <p>${escape(message)}</p>
    </main>
  </body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function clearAuthWindowCloseTimer(): void {
  if (!authWindowCloseTimer) {
    return;
  }

  clearTimeout(authWindowCloseTimer);
  authWindowCloseTimer = null;
}
