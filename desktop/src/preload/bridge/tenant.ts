import type { IpcRenderer } from "electron";

import {
  IPC_CHANNELS,
  type DesktopBridge,
  type DesktopCreateFirstTeamRequest,
  type DesktopRemoveTeamMemberRequest,
  type DesktopSaveTeamMemberRequest,
  type DesktopTeamStateResult,
} from "../../shared/contracts/index";

type TeamBridge = Pick<DesktopBridge, "team">;

export function createTeamBridge(ipcRenderer: IpcRenderer): TeamBridge {
  return {
    team: {
      getState: async (): Promise<DesktopTeamStateResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.getDesktopTeamState) as Promise<DesktopTeamStateResult>;
      },
      createFirstTeam: async (request: DesktopCreateFirstTeamRequest): Promise<DesktopTeamStateResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.createDesktopFirstTeam, request) as Promise<DesktopTeamStateResult>;
      },
      saveMember: async (request: DesktopSaveTeamMemberRequest): Promise<DesktopTeamStateResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.saveDesktopTeamMember, request) as Promise<DesktopTeamStateResult>;
      },
      removeMember: async (request: DesktopRemoveTeamMemberRequest): Promise<DesktopTeamStateResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.removeDesktopTeamMember, request) as Promise<DesktopTeamStateResult>;
      },
    },
  };
}
