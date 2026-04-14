import type {
  DesktopApprovalEvent,
  DesktopRunContext,
  DesktopRuntimeEvent,
} from "../contracts.ts";

interface AppServerNotification {
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

function firstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function cloneRunContext(runContext: DesktopRunContext | null | undefined): DesktopRunContext | null {
  if (!runContext) {
    return null;
  }

  return {
    actor: { ...runContext.actor },
    scope: { ...runContext.scope },
    grants: runContext.grants.map((grant) => ({ ...grant })),
    policy: { ...runContext.policy },
  };
}

const APPROVAL_METHOD_KINDS: Record<string, DesktopApprovalEvent["kind"]> = {
  "item/commandExecution/requestApproval": "command",
  "item/fileChange/requestApproval": "file",
  "item/permissions/requestApproval": "permissions",
};

function firstPermissionPath(permissions: DesktopApprovalEvent["permissions"]): string | null {
  const writePath = Array.isArray(permissions?.fileSystem?.write)
    ? permissions.fileSystem.write.find((value) => typeof value === "string" && value.trim())
    : null;
  if (writePath) {
    return writePath;
  }

  const readPath = Array.isArray(permissions?.fileSystem?.read)
    ? permissions.fileSystem.read.find((value) => typeof value === "string" && value.trim())
    : null;
  if (readPath) {
    return readPath;
  }

  return null;
}

function isNetworkPermissionRequest(permissions: DesktopApprovalEvent["permissions"]): boolean {
  return permissions?.network?.enabled === true;
}

function resolvePermissionApprovalKind(
  permissions: DesktopApprovalEvent["permissions"],
): DesktopApprovalEvent["kind"] {
  return isNetworkPermissionRequest(permissions) ? "network" : "permissions";
}

function describePermissionApproval(permissions: DesktopApprovalEvent["permissions"]): string {
  const permissionPath = firstPermissionPath(permissions);
  if (permissionPath) {
    return `Additional permissions needed for ${permissionPath}`;
  }

  if (isNetworkPermissionRequest(permissions)) {
    return "Network access required.";
  }

  return "Additional permissions required.";
}

const ACCOUNT_CHANGE_METHODS = new Set([
  "account/updated",
  "account/login/completed",
]);

const THREAD_LIST_CHANGE_METHODS = new Set([
  "thread/started",
  "thread/status/changed",
  "thread/archived",
  "thread/unarchived",
  "thread/name/updated",
]);

const THREAD_CONTENT_CHANGE_METHODS = new Set([
  "turn/started",
  "turn/completed",
  "item/started",
  "item/completed",
  "item/agentMessage/delta",
  "turn/plan/updated",
  "turn/diff/updated",
  "tool/requestUserInput",
]);

export function mapDesktopRuntimeEvent(
  message: AppServerNotification,
): DesktopRuntimeEvent | null {
  const method = firstString(message?.method);
  if (!method) {
    return null;
  }

  if (method in APPROVAL_METHOD_KINDS) {
    if (typeof message?.id !== "number") {
      return null;
    }

    const params = message.params && typeof message.params === "object"
      ? message.params as Record<string, unknown>
      : null;
    const threadId = firstString(params?.threadId);
    if (!threadId) {
      return null;
    }

    const permissions =
      method === "item/permissions/requestApproval" &&
      params?.permissions &&
      typeof params.permissions === "object"
        ? params.permissions as DesktopApprovalEvent["permissions"]
        : null;

    return {
      kind: "approvalRequested",
      approval: {
        id: message.id,
        kind:
          method === "item/permissions/requestApproval"
            ? resolvePermissionApprovalKind(permissions)
            : APPROVAL_METHOD_KINDS[method],
        threadId,
        reason:
          firstString(params?.reason) ||
          (method === "item/permissions/requestApproval"
            ? describePermissionApproval(permissions)
            : null),
        command: Array.isArray(params?.command)
          ? params.command.filter((value): value is string => typeof value === "string")
          : [],
        cwd: firstString(params?.cwd),
        grantRoot:
          method === "item/permissions/requestApproval"
            ? null
            : firstString(params?.grantRoot),
        permissions,
        runContext: cloneRunContext(
          params?.runContext && typeof params.runContext === "object"
            ? params.runContext as DesktopRunContext
            : null,
        ),
      },
    };
  }

  if (method === "serverRequest/resolved") {
    const params = message.params && typeof message.params === "object"
      ? message.params as Record<string, unknown>
      : null;
    const requestId = typeof params?.requestId === "number" ? params.requestId : null;
    if (requestId === null) {
      return null;
    }

    return {
      kind: "approvalResolved",
      requestId,
    };
  }

  if (ACCOUNT_CHANGE_METHODS.has(method)) {
    return {
      kind: "accountChanged",
    };
  }

  if (THREAD_LIST_CHANGE_METHODS.has(method)) {
    const params = message.params && typeof message.params === "object"
      ? message.params as Record<string, unknown>
      : null;
    return {
      kind: "threadListChanged",
      threadId: firstString(params?.threadId),
    };
  }

  if (THREAD_CONTENT_CHANGE_METHODS.has(method)) {
    const params = message.params && typeof message.params === "object"
      ? message.params as Record<string, unknown>
      : null;
    return {
      kind: "threadContentChanged",
      threadId: firstString(params?.threadId),
    };
  }

  if (method === "thread/realtime/started") {
    const params = message.params && typeof message.params === "object"
      ? message.params as Record<string, unknown>
      : null;
    const threadId = firstString(params?.threadId);
    if (!threadId) {
      return null;
    }

    return {
      kind: "voiceStateChanged",
      threadId,
      state: "active",
      sessionId: firstString(params?.sessionId),
      reason: null,
    };
  }

  if (method === "thread/realtime/transcriptUpdated") {
    const params = message.params && typeof message.params === "object"
      ? message.params as Record<string, unknown>
      : null;
    const threadId = firstString(params?.threadId);
    const role = firstString(params?.role);
    const text = firstString(params?.text);
    if (!threadId || !role || text === null) {
      return null;
    }

    return {
      kind: "voiceTranscriptUpdated",
      threadId,
      role,
      text,
    };
  }

  if (method === "thread/realtime/error") {
    const params = message.params && typeof message.params === "object"
      ? message.params as Record<string, unknown>
      : null;
    const threadId = firstString(params?.threadId);
    const detail = firstString(params?.message);
    if (!threadId || !detail) {
      return null;
    }

    return {
      kind: "voiceError",
      threadId,
      message: detail,
    };
  }

  if (method === "thread/realtime/closed") {
    const params = message.params && typeof message.params === "object"
      ? message.params as Record<string, unknown>
      : null;
    const threadId = firstString(params?.threadId);
    if (!threadId) {
      return null;
    }

    return {
      kind: "voiceStateChanged",
      threadId,
      state: "stopped",
      sessionId: null,
      reason: firstString(params?.reason),
    };
  }

  return null;
}

export function normalizeDesktopApprovalEvent(
  approval: DesktopApprovalEvent | null | undefined,
  runContext: DesktopRunContext | null = null,
): DesktopApprovalEvent | null {
  if (!approval) {
    return null;
  }

  return {
    ...approval,
    runContext: cloneRunContext(runContext),
  };
}
