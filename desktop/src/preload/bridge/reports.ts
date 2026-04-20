import type { IpcRenderer } from "electron";

import {
  IPC_CHANNELS,
  type DesktopBridge,
  type DesktopBugReportDraft,
  type DesktopBugReportResult,
  type DesktopBugReportingStatus,
  type DesktopCrashReportAcknowledgeRequest,
  type DesktopCrashReportAcknowledgeResult,
} from "../../shared/contracts/index";

type ReportsBridge = Pick<DesktopBridge, "reports">;

export function createReportsBridge(ipcRenderer: IpcRenderer): ReportsBridge {
  return {
    reports: {
      submit: async (request: DesktopBugReportDraft): Promise<DesktopBugReportResult> => {
        return ipcRenderer.invoke(IPC_CHANNELS.submitDesktopBugReport, request) as Promise<DesktopBugReportResult>;
      },
      getStatus: async (): Promise<DesktopBugReportingStatus> => {
        return ipcRenderer.invoke(IPC_CHANNELS.getDesktopBugReportingStatus) as Promise<DesktopBugReportingStatus>;
      },
      acknowledgeCrashReport: async (
        request: DesktopCrashReportAcknowledgeRequest,
      ): Promise<DesktopCrashReportAcknowledgeResult> => {
        return ipcRenderer.invoke(
          IPC_CHANNELS.acknowledgeDesktopCrashReport,
          request,
        ) as Promise<DesktopCrashReportAcknowledgeResult>;
      },
    },
  };
}
