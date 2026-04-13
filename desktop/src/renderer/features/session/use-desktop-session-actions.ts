import type { DesktopSessionActionDependencies, DesktopSessionActionHandlers } from "./session-action-types.js";

import { createSessionProfileActions } from "./actions/session-profile-actions.js";
import { createSessionThreadActions } from "./actions/session-thread-actions.js";
import { createSessionWorkspaceActions } from "./actions/session-workspace-actions.js";
import { createSessionUpdateActions } from "./actions/session-update-actions.js";
import { createSessionRunActions } from "./actions/session-run-actions.js";

export type { DesktopSessionActionDependencies, DesktopSessionActionHandlers } from "./session-action-types.js";

export function createDesktopSessionActions(
  deps: DesktopSessionActionDependencies,
): DesktopSessionActionHandlers {
  const profileActions = createSessionProfileActions(deps);
  const threadActions = createSessionThreadActions(deps);
  const runActions = createSessionRunActions(deps);
  const workspaceActions = createSessionWorkspaceActions(deps, runActions.runTask);
  const updateActions = createSessionUpdateActions(deps);

  return {
    ...profileActions,
    ...threadActions,
    ...workspaceActions,
    ...runActions,
    ...updateActions,
  };
}
