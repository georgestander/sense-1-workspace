import type {
  DesktopApprovalEvent,
  DesktopBootstrapTeamSetup,
  DesktopThreadSnapshot,
} from "../../../main/contracts";
export type { TenantIdentity } from "./tenant-identity.js";
export type TeamSetupIdentity = DesktopBootstrapTeamSetup;

export type RuntimeStatus = {
  appVersion: string;
  platform: string;
} | null;

export type RuntimeSetupState = {
  blocked: boolean;
  code: string | null;
  title: string;
  message: string;
  detail: string | null;
} | null;

export type ProfileOption = {
  id: string;
  label: string;
};

export type FolderOption = {
  name: string;
  path: string;
};

export type ThreadRecord = DesktopThreadSnapshot;

export type PendingApproval = DesktopApprovalEvent;

export type SidebarState = {
  planState: DesktopThreadSnapshot["planState"];
  diffState: DesktopThreadSnapshot["diffState"];
  inputRequestState: DesktopThreadSnapshot["inputRequestState"];
};
