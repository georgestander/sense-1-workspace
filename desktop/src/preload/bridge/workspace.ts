import type { IpcRenderer } from "electron";

import {
  IPC_CHANNELS,
  type DesktopBridge,
  type DesktopPolicyRulesResult,
  type DesktopSettingsResult,
  type DesktopSettingsUpdateRequest,
  type DesktopThreadWorkspaceRootRequest,
  type DesktopWorkspaceArchiveRequest,
  type DesktopWorkspaceDeleteRequest,
  type DesktopWorkspaceHydrateResult,
  type DesktopWorkspaceOperatingModeRequest,
  type DesktopWorkspacePermissionGrantRequest,
  type DesktopWorkspacePolicyRequest,
  type DesktopWorkspacePolicyResult,
  type DesktopWorkspaceRestoreRequest,
  type DesktopWorkspaceSidebarOrderRequest,
  type FilePickerResult,
  type ProjectedSessionsRequest,
  type ProjectedSessionsResult,
  type ProjectedWorkspaceByRootRequest,
  type ProjectedWorkspaceDetailResult,
  type ProjectedWorkspacesRequest,
  type ProjectedWorkspacesResult,
  type SubstrateEventsBySessionRequest,
  type SubstrateEventsResult,
  type SubstrateObjectRefsBySessionRequest,
  type SubstrateObjectRefsResult,
  type SubstrateRecentSessionsRequest,
  type SubstrateRecentWorkspacesRequest,
  type SubstrateSessionDetailRequest,
  type SubstrateSessionDetailResult,
  type SubstrateSessionsByWorkspaceRequest,
  type SubstrateSessionsResult,
  type SubstrateWorkspaceDetailRequest,
  type SubstrateWorkspaceDetailResult,
  type SubstrateWorkspacesResult,
  type WorkspaceFolderPickerResult,
} from "../../shared/contracts/index";

type WorkspaceBridge = Pick<DesktopBridge, "workspace" | "settings" | "projections" | "substrate">;

export function createWorkspaceBridge(ipcRenderer: IpcRenderer): WorkspaceBridge {
  return {
    workspace: {
      pickFolder: async (): Promise<WorkspaceFolderPickerResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.pickWorkspaceFolder) as Promise<WorkspaceFolderPickerResult>;
      },
      pickFiles: async (): Promise<FilePickerResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.pickFiles) as Promise<FilePickerResult>;
      },
      archive: async (request: DesktopWorkspaceArchiveRequest): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.archiveWorkspace, request) as Promise<void>;
      },
      restore: async (request: DesktopWorkspaceRestoreRequest): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.restoreWorkspace, request) as Promise<void>;
      },
      delete: async (request: DesktopWorkspaceDeleteRequest): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.deleteWorkspace, request) as Promise<void>;
      },
      getPolicy: async (request: DesktopWorkspacePolicyRequest): Promise<DesktopWorkspacePolicyResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.getWorkspacePolicy, request) as Promise<DesktopWorkspacePolicyResult>;
      },
      hydrate: async (request: DesktopWorkspacePolicyRequest): Promise<DesktopWorkspaceHydrateResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.hydrateWorkspace, request) as Promise<DesktopWorkspaceHydrateResult>;
      },
      grantPermission: async (request: DesktopWorkspacePermissionGrantRequest): Promise<DesktopWorkspacePolicyResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.grantWorkspacePermission, request) as Promise<DesktopWorkspacePolicyResult>;
      },
      setOperatingMode: async (request: DesktopWorkspaceOperatingModeRequest): Promise<DesktopWorkspacePolicyResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.setWorkspaceOperatingMode, request) as Promise<DesktopWorkspacePolicyResult>;
      },
      rememberThreadRoot: async (request: DesktopThreadWorkspaceRootRequest): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.rememberThreadWorkspaceRoot, request) as Promise<void>;
      },
      rememberSidebarOrder: async (request: DesktopWorkspaceSidebarOrderRequest): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.rememberWorkspaceSidebarOrder, request) as Promise<void>;
      },
      openFilePath: async (filePath: string): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.openFilePath, filePath) as Promise<void>;
      },
    },
    settings: {
      get: async (): Promise<DesktopSettingsResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.getDesktopSettings) as Promise<DesktopSettingsResult>;
      },
      getPolicyRules: async (): Promise<DesktopPolicyRulesResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.getDesktopPolicyRules) as Promise<DesktopPolicyRulesResult>;
      },
      update: async (request: DesktopSettingsUpdateRequest): Promise<DesktopSettingsResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.updateDesktopSettings, request) as Promise<DesktopSettingsResult>;
      },
    },
    projections: {
      workspaces: async (request: ProjectedWorkspacesRequest): Promise<ProjectedWorkspacesResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.projectedWorkspaces, request) as Promise<ProjectedWorkspacesResult>;
      },
      workspaceByRoot: async (request: ProjectedWorkspaceByRootRequest): Promise<ProjectedWorkspaceDetailResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.projectedWorkspaceByRoot, request) as Promise<ProjectedWorkspaceDetailResult>;
      },
      sessions: async (request: ProjectedSessionsRequest): Promise<ProjectedSessionsResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.projectedSessions, request) as Promise<ProjectedSessionsResult>;
      },
    },
    substrate: {
      recentWorkspaces: async (request: SubstrateRecentWorkspacesRequest): Promise<SubstrateWorkspacesResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.substrateRecentWorkspaces, request) as Promise<SubstrateWorkspacesResult>;
      },
      recentSessions: async (request: SubstrateRecentSessionsRequest): Promise<SubstrateSessionsResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.substrateRecentSessions, request) as Promise<SubstrateSessionsResult>;
      },
      sessionsByWorkspace: async (request: SubstrateSessionsByWorkspaceRequest): Promise<SubstrateSessionsResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.substrateSessionsByWorkspace, request) as Promise<SubstrateSessionsResult>;
      },
      sessionDetail: async (request: SubstrateSessionDetailRequest): Promise<SubstrateSessionDetailResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.substrateSessionDetail, request) as Promise<SubstrateSessionDetailResult>;
      },
      workspaceDetail: async (request: SubstrateWorkspaceDetailRequest): Promise<SubstrateWorkspaceDetailResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.substrateWorkspaceDetail, request) as Promise<SubstrateWorkspaceDetailResult>;
      },
      eventsBySession: async (request: SubstrateEventsBySessionRequest): Promise<SubstrateEventsResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.substrateEventsBySession, request) as Promise<SubstrateEventsResult>;
      },
      objectRefsBySession: async (request: SubstrateObjectRefsBySessionRequest): Promise<SubstrateObjectRefsResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.substrateObjectRefsBySession, request) as Promise<SubstrateObjectRefsResult>;
      },
    },
  };
}
