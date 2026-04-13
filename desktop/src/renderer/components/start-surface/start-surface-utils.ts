import type { ProjectedWorkspaceRecord, ProjectedSessionRecord } from "../../../main/contracts";
import { folderDisplayName } from "../../state/session/session-selectors.js";

export function formatSessionActivity(value: string | null | undefined): string {
  if (!value) {
    return "Recent session";
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return "Recent session";
  }
  return new Date(parsed).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function workspaceDisplayName(workspace: Pick<ProjectedWorkspaceRecord, "display_name" | "root_path">): string {
  return workspace.display_name || folderDisplayName(workspace.root_path);
}

export function isResumableProjectedSession(session: ProjectedSessionRecord): boolean {
  return Boolean(session.codex_thread_id?.trim());
}
