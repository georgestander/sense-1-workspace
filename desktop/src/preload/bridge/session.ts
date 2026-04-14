import type { IpcRenderer } from "electron";

import {
  IPC_CHANNELS,
  type DesktopApprovalResponseRequest,
  type DesktopBootstrap,
  type DesktopBridge,
  type DesktopInputResponseRequest,
  type DesktopInterruptTurnRequest,
  type DesktopLastSelectedThreadRequest,
  type DesktopModelListResult,
  type DesktopQueueTurnInputRequest,
  type DesktopRuntimeEvent,
  type DesktopSteerTurnResult,
  type DesktopTaskRunRequest,
  type DesktopTaskRunResult,
  type DesktopThreadArchiveRequest,
  type DesktopThreadDeleteRequest,
  type DesktopThreadDelta,
  type DesktopThreadRenameRequest,
  type DesktopThreadRestoreRequest,
  type DesktopSteerTurnRequest,
  type LaunchChatgptSignInResult,
  type LogoutChatgptResult,
  type RuntimeInfo,
  type SelectDesktopProfileResult,
  type DesktopVoiceAppendAudioRequest,
  type DesktopVoiceStartRequest,
  type DesktopVoiceStopRequest,
} from "../../shared/contracts/index";
import { shouldRefreshSessionSnapshot } from "./utils";

type SessionBridge = Pick<
  DesktopBridge,
  "runtime" | "session" | "auth" | "profiles" | "threads" | "turns" | "approvals" | "models" | "input" | "voice"
>;

export function createSessionBridge(ipcRenderer: IpcRenderer): SessionBridge {
  return {
    runtime: {
      getInfo: async (): Promise<RuntimeInfo> => {
        return ipcRenderer.invoke(IPC_CHANNELS.runtimeInfo) as Promise<RuntimeInfo>;
      },
    },
    session: {
      get: async (): Promise<DesktopBootstrap> => {
        return ipcRenderer.invoke(IPC_CHANNELS.getDesktopBootstrap) as Promise<DesktopBootstrap>;
      },
      subscribe: (listener: (bootstrap: DesktopBootstrap) => void): (() => void) => {
        let emissionId = 0;
        const wrapped = (_event: Electron.IpcRendererEvent, payload: DesktopRuntimeEvent) => {
          if (!shouldRefreshSessionSnapshot(payload)) {
            return;
          }
          const nextEmissionId = ++emissionId;
          void ipcRenderer
            .invoke(IPC_CHANNELS.getDesktopBootstrap)
            .then((bootstrap) => {
              if (nextEmissionId !== emissionId) {
                return;
              }
              listener(bootstrap as DesktopBootstrap);
            })
            .catch((error) => {
              console.error(
                `[desktop:session] Failed to refresh session snapshot: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            });
        };
        ipcRenderer.on(IPC_CHANNELS.runtimeEvent, wrapped);
        return () => {
          ipcRenderer.removeListener(IPC_CHANNELS.runtimeEvent, wrapped);
        };
      },
      onRuntimeEvent: (listener: (event: DesktopRuntimeEvent) => void): (() => void) => {
        const wrapped = (_event: Electron.IpcRendererEvent, payload: DesktopRuntimeEvent) => {
          listener(payload);
        };
        ipcRenderer.on(IPC_CHANNELS.runtimeEvent, wrapped);
        return () => {
          ipcRenderer.removeListener(IPC_CHANNELS.runtimeEvent, wrapped);
        };
      },
    },
    auth: {
      launchChatgptSignIn: async (): Promise<LaunchChatgptSignInResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.launchChatgptSignIn) as Promise<LaunchChatgptSignInResult>;
      },
      logoutChatgpt: async (): Promise<LogoutChatgptResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.logoutChatgpt) as Promise<LogoutChatgptResult>;
      },
    },
    profiles: {
      select: async (profileId: string): Promise<SelectDesktopProfileResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.selectDesktopProfile, profileId) as Promise<SelectDesktopProfileResult>;
      },
    },
    threads: {
      rememberLastSelected: async (request: DesktopLastSelectedThreadRequest): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.rememberLastSelectedThread, request) as Promise<void>;
      },
      rename: async (request: DesktopThreadRenameRequest): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.renameDesktopThread, request) as Promise<void>;
      },
      archive: async (request: DesktopThreadArchiveRequest): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.archiveDesktopThread, request) as Promise<void>;
      },
      restore: async (request: DesktopThreadRestoreRequest): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.restoreDesktopThread, request) as Promise<void>;
      },
      delete: async (request: DesktopThreadDeleteRequest): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.deleteDesktopThread, request) as Promise<void>;
      },
      onDelta: (listener: (delta: DesktopThreadDelta) => void): (() => void) => {
        const wrapped = (_event: Electron.IpcRendererEvent, payload: DesktopThreadDelta | DesktopThreadDelta[]) => {
          const deltas = Array.isArray(payload) ? payload : [payload];
          for (const delta of deltas) {
            listener(delta);
          }
        };
        ipcRenderer.on(IPC_CHANNELS.threadDelta, wrapped);
        return () => {
          ipcRenderer.removeListener(IPC_CHANNELS.threadDelta, wrapped);
        };
      },
    },
    turns: {
      run: async (request: DesktopTaskRunRequest): Promise<DesktopTaskRunResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.runDesktopTask, request) as Promise<DesktopTaskRunResult>;
      },
      interrupt: async (request: DesktopInterruptTurnRequest): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.interruptDesktopTurn, request) as Promise<void>;
      },
      steer: async (request: DesktopSteerTurnRequest): Promise<DesktopSteerTurnResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.steerTurn, request) as Promise<DesktopSteerTurnResult>;
      },
      queue: async (request: DesktopQueueTurnInputRequest): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.queueTurnInput, request) as Promise<void>;
      },
    },
    approvals: {
      respond: async (request: DesktopApprovalResponseRequest): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.respondToDesktopApproval, request) as Promise<void>;
      },
    },
    models: {
      list: async (): Promise<DesktopModelListResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.listModels) as Promise<DesktopModelListResult>;
      },
    },
    input: {
      respond: async (request: DesktopInputResponseRequest): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.respondToInputRequest, request) as Promise<void>;
      },
    },
    voice: {
      start: async (request: DesktopVoiceStartRequest): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.startDesktopVoice, request) as Promise<void>;
      },
      appendAudio: async (request: DesktopVoiceAppendAudioRequest): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.appendDesktopVoiceAudio, request) as Promise<void>;
      },
      stop: async (request: DesktopVoiceStopRequest): Promise<void> => {
        return ipcRenderer.invoke(IPC_CHANNELS.stopDesktopVoice, request) as Promise<void>;
      },
    },
  };
}
