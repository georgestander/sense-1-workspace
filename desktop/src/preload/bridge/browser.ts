import type { IpcRenderer } from "electron";

import {
  IPC_CHANNELS,
  type DesktopBridge,
} from "../../shared/contracts/index";

type BrowserBridge = Pick<DesktopBridge, "browser">;

export function createBrowserBridge(ipcRenderer: IpcRenderer): BrowserBridge {
  return {
    browser: {
      open: async (request) => ipcRenderer.invoke(IPC_CHANNELS.browserOpen, request),
      close: async (request) => ipcRenderer.invoke(IPC_CHANNELS.browserClose, request),
      setBounds: async (request) => ipcRenderer.invoke(IPC_CHANNELS.browserSetBounds, request),
      navigate: async (request) => ipcRenderer.invoke(IPC_CHANNELS.browserNavigate, request),
      goBack: async (request) => ipcRenderer.invoke(IPC_CHANNELS.browserGoBack, request),
      goForward: async (request) => ipcRenderer.invoke(IPC_CHANNELS.browserGoForward, request),
      reload: async (request) => ipcRenderer.invoke(IPC_CHANNELS.browserReload, request),
      stop: async (request) => ipcRenderer.invoke(IPC_CHANNELS.browserStop, request),
      setViewport: async (request) => ipcRenderer.invoke(IPC_CHANNELS.browserSetViewport, request),
      screenshot: async (request) => ipcRenderer.invoke(IPC_CHANNELS.browserScreenshot, request),
      inspect: async (request) => ipcRenderer.invoke(IPC_CHANNELS.browserInspect, request),
      click: async (request) => ipcRenderer.invoke(IPC_CHANNELS.browserClick, request),
      type: async (request) => ipcRenderer.invoke(IPC_CHANNELS.browserType, request),
      console: async (request) => ipcRenderer.invoke(IPC_CHANNELS.browserConsole, request),
      network: async (request) => ipcRenderer.invoke(IPC_CHANNELS.browserNetwork, request),
      checkTrust: async (request) => ipcRenderer.invoke(IPC_CHANNELS.browserTrustCheck, request),
      updateTrust: async (request) => ipcRenderer.invoke(IPC_CHANNELS.browserTrustUpdate, request),
      getTrustState: async () => ipcRenderer.invoke(IPC_CHANNELS.browserTrustState),
    },
  };
}
