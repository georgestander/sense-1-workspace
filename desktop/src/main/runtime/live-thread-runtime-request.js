import nodePath from "node:path";
import { realpathSync } from "node:fs";

import {
  buildExecutionOverrides,
  buildInstructionSet,
  cloneDesktopThreadConfig,
  DEFAULT_DESKTOP_MODEL,
  normalizeDesktopPersonality,
} from "./live-thread-runtime-policy.js";

function firstString(...values) {
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

function asRecord(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value;
}

function cloneRunContext(runContext) {
  const record = asRecord(runContext);
  const actor = asRecord(record?.actor);
  const scope = asRecord(record?.scope);
  const policy = asRecord(record?.policy);
  if (!record || !actor || !scope || !policy) {
    return null;
  }

  return {
    actor: { ...actor },
    scope: { ...scope },
    grants: Array.isArray(record.grants)
      ? record.grants
          .map((grant) => asRecord(grant))
          .filter(Boolean)
          .map((grant) => ({ ...grant }))
      : [],
    policy: { ...policy },
  };
}

const DEFAULT_DESKTOP_SERVICE_NAME = "sense_1";

export function buildCollaborationMode({
  mode = "default",
  model = null,
  reasoningEffort = null,
} = {}) {
  return {
    mode,
    settings: {
      developer_instructions: null,
      model: firstString(model) ?? "",
      reasoning_effort: firstString(reasoningEffort),
    },
  };
}

function describeAuthority(runContext = null) {
  const actorLabel =
    firstString(runContext?.actor?.displayName, runContext?.actor?.email) ?? "the signed-in user";
  const scopeLabel = firstString(runContext?.scope?.displayName, runContext?.scope?.id) ?? "the private profile scope";
  return `${actorLabel} working inside ${scopeLabel}`;
}

function formatWorkspaceContextPath(pathValue, workspaceRoot = null) {
  const resolvedPath = firstString(pathValue);
  if (!resolvedPath) {
    return null;
  }

  const resolvedWorkspaceRoot = firstString(workspaceRoot);
  if (resolvedWorkspaceRoot) {
    const relativePath = nodePath.relative(resolvedWorkspaceRoot, resolvedPath).replace(/\\/g, "/");
    if (relativePath && !relativePath.startsWith("..")) {
      return relativePath.replace(/^\.\//, "");
    }
  }

  return nodePath.basename(resolvedPath);
}

function buildWorkspaceContextInstruction(contextPaths = [], workspaceRoot = null) {
  const normalizedContextPaths = Array.isArray(contextPaths)
    ? contextPaths
        .map((entry) => formatWorkspaceContextPath(entry, workspaceRoot))
        .filter(Boolean)
    : [];
  if (normalizedContextPaths.length === 0) {
    return null;
  }

  const visibleContextPaths = normalizedContextPaths.slice(0, 10);
  return `Key files in this workspace: ${visibleContextPaths.join(", ")}. Read these first to understand the project before making changes.`;
}

export function resolveRuntimePath(pathValue) {
  const resolvedPath = firstString(pathValue);
  if (!resolvedPath) {
    return null;
  }

  try {
    return typeof realpathSync.native === "function"
      ? realpathSync.native(resolvedPath)
      : realpathSync(resolvedPath);
  } catch {
    return nodePath.resolve(resolvedPath);
  }
}

function normalizeRuntimeGrant(grant, fallbackRootPath = null) {
  const record = asRecord(grant);
  if (!record) {
    return null;
  }

  const kind = firstString(record.kind);
  const rootPath = resolveRuntimePath(firstString(record.rootPath, fallbackRootPath));
  return {
    ...record,
    ...(kind ? { kind } : {}),
    ...(rootPath ? { rootPath } : {}),
  };
}

export function normalizeRuntimeRunContext(runContext, { workspaceRoot = null, cwd = null } = {}) {
  const baseContext = cloneRunContext(runContext);
  if (!baseContext?.actor || !baseContext?.scope || !baseContext?.policy) {
    return null;
  }

  const resolvedWorkspaceRoot = resolveRuntimePath(workspaceRoot);
  const resolvedCwd = resolveRuntimePath(cwd);
  const normalizedGrants = Array.isArray(baseContext.grants)
    ? baseContext.grants
        .map((grant) => normalizeRuntimeGrant(grant, resolvedWorkspaceRoot ?? resolvedCwd))
        .filter(Boolean)
    : [];

  return {
    ...baseContext,
    grants: normalizedGrants,
  };
}

export function buildTurnSandboxPolicy(sandboxPolicy, workspaceRoot = null, cwd = null) {
  const resolvedWorkspaceRoot = resolveRuntimePath(workspaceRoot);
  const resolvedCwd = resolveRuntimePath(cwd);
  if (sandboxPolicy === "danger-full-access") {
    return {
      type: "dangerFullAccess",
    };
  }

  if (sandboxPolicy === "read-only" || sandboxPolicy === "readOnly") {
    if (!resolvedWorkspaceRoot && resolvedCwd) {
      return {
        type: "workspaceWrite",
        networkAccess: true,
        writableRoots: [resolvedCwd],
      };
    }

    return {
      type: "readOnly",
    };
  }

  const writableRoot = resolvedWorkspaceRoot || resolvedCwd;
  if (sandboxPolicy === "workspace-write" || sandboxPolicy === "workspaceWrite") {
    if (!writableRoot) {
      return {
        type: "readOnly",
      };
    }

    return {
      type: "workspaceWrite",
      networkAccess: true,
      writableRoots: [writableRoot],
    };
  }

  if (writableRoot) {
    return {
      type: "workspaceWrite",
      networkAccess: true,
      writableRoots: [writableRoot],
    };
  }

  return {
    type: "readOnly",
  };
}

export function buildDesktopThreadRequest({
  cwd = null,
  contextPaths = [],
  executionContext = null,
  model = null,
  personality = null,
  runContext = null,
  runtimeInstructions = null,
  settings = null,
  workspaceRoot = null,
} = {}) {
  const resolvedModel = firstString(model) || DEFAULT_DESKTOP_MODEL;
  const resolvedPersonality = normalizeDesktopPersonality(personality);
  const executionOverrides = buildExecutionOverrides(executionContext);
  const runtimeCwd = firstString(workspaceRoot)
    ? resolveRuntimePath(cwd)
    : firstString(cwd);
  const instructionSet = buildInstructionSet({
    authority: describeAuthority(runContext),
    cwd,
    runtimeInstructions,
    settings,
    workspaceContextInstruction: firstString(workspaceRoot)
      ? buildWorkspaceContextInstruction(contextPaths, workspaceRoot)
      : null,
    workspaceRoot,
  });
  return {
    approvalPolicy: executionOverrides.approvalPolicy,
    baseInstructions: instructionSet.baseInstructions,
    config: {
      ...cloneDesktopThreadConfig(),
      developer_instructions: instructionSet.developerInstructions,
      instructions: instructionSet.baseInstructions,
      model: resolvedModel,
    },
    cwd: runtimeCwd ?? null,
    developerInstructions: instructionSet.developerInstructions,
    model: resolvedModel,
    personality: resolvedPersonality,
    sandbox: executionOverrides.sandboxPolicy,
    serviceName: DEFAULT_DESKTOP_SERVICE_NAME,
  };
}

export function buildRunContext(request, workspaceRoot = null) {
  const baseContext = normalizeRuntimeRunContext(request?.runContext, {
    cwd: request?.cwd,
    workspaceRoot,
  });
  if (!baseContext?.actor || !baseContext?.scope) {
    return null;
  }

  const resolvedWorkspaceRoot = firstString(
    workspaceRoot,
    request?.workspaceRoot,
    Array.isArray(baseContext.grants) ? firstString(baseContext.grants[0]?.rootPath) : null,
  );
  const executionPolicyMode = firstString(baseContext.policy?.executionPolicyMode);
  const sandboxPolicy = firstString(
    baseContext.policy?.sandboxPolicy,
    executionPolicyMode === "preview" ? "readOnly" : null,
    executionPolicyMode === "auto" || executionPolicyMode === "apply" ? "workspaceWrite" : null,
  ) || (resolvedWorkspaceRoot ? "workspaceWrite" : "readOnly");
  const resolvedWritableRoot = sandboxPolicy === "workspaceWrite"
    ? firstString(resolvedWorkspaceRoot, request?.cwd)
    : null;
  const approvalPolicy = firstString(
    baseContext.policy?.approvalPolicy,
    executionPolicyMode === "preview" || executionPolicyMode === "auto" || executionPolicyMode === "apply"
      ? "onRequest"
      : null,
  ) || "onRequest";
  const trustLevel = firstString(baseContext.policy?.trustLevel) || "medium";

  return {
    actor: baseContext.actor,
    scope: baseContext.scope,
    grants: resolvedWritableRoot
      ? [
          {
            kind: "workspaceRoot",
            rootPath: resolvedWritableRoot,
            access: "workspaceWrite",
          },
        ]
      : [],
    policy: {
      executionPolicyMode: executionPolicyMode || "defaultProfilePrivateScope",
      approvalPolicy,
      sandboxPolicy,
      trustLevel,
    },
  };
}
