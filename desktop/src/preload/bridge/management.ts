import type { IpcRenderer } from "electron";

import {
  type DesktopAppRemoveRequest,
  IPC_CHANNELS,
  type DesktopAppInstallRequest,
  type DesktopAppEnabledRequest,
  type DesktopAutomationDeleteRequest,
  type DesktopAutomationDetailResult,
  type DesktopAutomationListResult,
  type DesktopAutomationRunNowRequest,
  type DesktopAutomationSaveRequest,
  type DesktopBridge,
  type DesktopExtensionOverviewRequest,
  type DesktopExtensionOverviewResult,
  type DesktopMcpServerEnabledRequest,
  type DesktopPluginInstallRequest,
  type DesktopPluginUninstallRequest,
  type DesktopPluginEnabledRequest,
  type DesktopSkillEnabledRequest,
  type DesktopSkillUninstallRequest,
} from "../../shared/contracts/index";

type ManagementBridge = Pick<DesktopBridge, "management" | "automations">;

export function createManagementBridge(ipcRenderer: IpcRenderer): ManagementBridge {
  return {
    management: {
      getOverview: async (request: DesktopExtensionOverviewRequest = {}): Promise<DesktopExtensionOverviewResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.getDesktopExtensionOverview, request) as Promise<DesktopExtensionOverviewResult>;
      },
      installPlugin: async (request: DesktopPluginInstallRequest): Promise<DesktopExtensionOverviewResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.installDesktopPlugin, request) as Promise<DesktopExtensionOverviewResult>;
      },
      uninstallPlugin: async (request: DesktopPluginUninstallRequest): Promise<DesktopExtensionOverviewResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.uninstallDesktopPlugin, request) as Promise<DesktopExtensionOverviewResult>;
      },
      setPluginEnabled: async (request: DesktopPluginEnabledRequest): Promise<DesktopExtensionOverviewResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.setDesktopPluginEnabled, request) as Promise<DesktopExtensionOverviewResult>;
      },
      openAppInstall: async (request: DesktopAppInstallRequest): Promise<DesktopExtensionOverviewResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.openDesktopAppInstall, request) as Promise<DesktopExtensionOverviewResult>;
      },
      removeApp: async (request: DesktopAppRemoveRequest): Promise<DesktopExtensionOverviewResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.removeDesktopApp, request) as Promise<DesktopExtensionOverviewResult>;
      },
      setAppEnabled: async (request: DesktopAppEnabledRequest): Promise<DesktopExtensionOverviewResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.setDesktopAppEnabled, request) as Promise<DesktopExtensionOverviewResult>;
      },
      setMcpServerEnabled: async (request: DesktopMcpServerEnabledRequest): Promise<DesktopExtensionOverviewResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.setDesktopMcpServerEnabled, request) as Promise<DesktopExtensionOverviewResult>;
      },
      setSkillEnabled: async (request: DesktopSkillEnabledRequest): Promise<DesktopExtensionOverviewResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.setDesktopSkillEnabled, request) as Promise<DesktopExtensionOverviewResult>;
      },
      uninstallSkill: async (request: DesktopSkillUninstallRequest): Promise<DesktopExtensionOverviewResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.uninstallDesktopSkill, request) as Promise<DesktopExtensionOverviewResult>;
      },
    },
    automations: {
      list: async (): Promise<DesktopAutomationListResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.listDesktopAutomations) as Promise<DesktopAutomationListResult>;
      },
      get: async (id: string): Promise<DesktopAutomationDetailResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.getDesktopAutomation, id) as Promise<DesktopAutomationDetailResult>;
      },
      save: async (request: DesktopAutomationSaveRequest): Promise<DesktopAutomationDetailResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.saveDesktopAutomation, request) as Promise<DesktopAutomationDetailResult>;
      },
      delete: async (request: DesktopAutomationDeleteRequest): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.deleteDesktopAutomation, request) as Promise<void>;
      },
      runNow: async (request: DesktopAutomationRunNowRequest): Promise<DesktopAutomationDetailResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.runDesktopAutomationNow, request) as Promise<DesktopAutomationDetailResult>;
      },
    },
  };
}
