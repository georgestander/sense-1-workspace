import { contextBridge, ipcRenderer } from "electron";
import * as Sentry from "@sentry/electron/renderer";

import {
  DESKTOP_BRIDGE_API_VERSION,
  type DesktopBridge,
} from "../shared/contracts/index";
import { createSessionBridge } from "./bridge/session";
import { createManagementBridge } from "./bridge/management";
import { createSystemBridge } from "./bridge/system";
import { createTeamBridge } from "./bridge/tenant";
import { createWorkspaceBridge } from "./bridge/workspace";
import { createReportsBridge } from "./bridge/reports";

Sentry.init();

const desktopBridge: DesktopBridge = {
  apiVersion: DESKTOP_BRIDGE_API_VERSION,
  ...createSessionBridge(ipcRenderer),
  ...createManagementBridge(ipcRenderer),
  ...createTeamBridge(ipcRenderer),
  ...createWorkspaceBridge(ipcRenderer),
  ...createSystemBridge(ipcRenderer),
  ...createReportsBridge(ipcRenderer),
};

contextBridge.exposeInMainWorld(
  "sense1Desktop",
  Object.freeze({
    ...desktopBridge,
    runtime: Object.freeze(desktopBridge.runtime),
    updates: Object.freeze(desktopBridge.updates),
    session: Object.freeze(desktopBridge.session),
    auth: Object.freeze(desktopBridge.auth),
    profiles: Object.freeze(desktopBridge.profiles),
    threads: Object.freeze(desktopBridge.threads),
    turns: Object.freeze(desktopBridge.turns),
    approvals: Object.freeze(desktopBridge.approvals),
    input: Object.freeze(desktopBridge.input),
    voice: Object.freeze(desktopBridge.voice),
    models: Object.freeze(desktopBridge.models),
    workspace: Object.freeze(desktopBridge.workspace),
    settings: Object.freeze(desktopBridge.settings),
    management: Object.freeze(desktopBridge.management),
    team: Object.freeze(desktopBridge.team),
    reports: Object.freeze(desktopBridge.reports),
    automations: Object.freeze(desktopBridge.automations),
    projections: Object.freeze(desktopBridge.projections),
    substrate: Object.freeze(desktopBridge.substrate),
    window: Object.freeze(desktopBridge.window),
  }),
);

export {};
