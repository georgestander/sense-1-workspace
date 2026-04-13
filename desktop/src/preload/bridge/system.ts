import type { IpcRenderer } from "electron";

import {
  IPC_CHANNELS,
  type DesktopBridge,
  type DesktopUpdateState,
  type WindowActionResult,
  type WindowToggleResult,
} from "../../shared/contracts/index";

type SystemBridge = Pick<DesktopBridge, "updates" | "window">;

export function createSystemBridge(ipcRenderer: IpcRenderer): SystemBridge {
  return {
    updates: {
      getState: async (): Promise<DesktopUpdateState> => {
        return ipcRenderer.invoke(IPC_CHANNELS.getUpdateState) as Promise<DesktopUpdateState>;
      },
      check: async (): Promise<DesktopUpdateState> => {
        return ipcRenderer.invoke(IPC_CHANNELS.checkForUpdates) as Promise<DesktopUpdateState>;
      },
      install: async (): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.installUpdate) as Promise<void>;
      },
      openLatestRelease: async (): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.openLatestRelease) as Promise<void>;
      },
    },
    window: {
      minimize: async (): Promise<WindowActionResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.windowMinimize) as Promise<WindowActionResult>;
      },
      toggleMaximize: async (): Promise<WindowToggleResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.windowToggleMaximize) as Promise<WindowToggleResult>;
      },
      close: async (): Promise<WindowActionResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.windowClose) as Promise<WindowActionResult>;
      },
      openExternalUrl: async (url: string): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.openExternalUrl, url) as Promise<void>;
      },
    },
  };
}
