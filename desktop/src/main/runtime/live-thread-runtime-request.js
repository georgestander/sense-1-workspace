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

function mapDesktopVerbosityToModelVerbosity(verbosity = null) {
  const resolved = firstString(verbosity);
  if (resolved === "terse" || resolved === "low") {
    return "low";
  }

  if (resolved === "balanced" || resolved === "medium") {
    return "medium";
  }

  if (resolved === "detailed" || resolved === "high") {
    return "high";
  }

  return null;
}

export function buildCollaborationMode({
  mode = "default",
  model = null,
  reasoningEffort = null,
  serviceTier = "flex",
  verbosity = null,
} = {}) {
  return {
    mode,
    settings: {
      developer_instructions: null,
      model: firstString(model) ?? "",
      reasoning_effort: firstString(reasoningEffort),
      service_tier: firstString(serviceTier),
      verbosity: mapDesktopVerbosityToModelVerbosity(verbosity),
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

function resolveWritableRoots(workspaceRoot = null, cwd = null, grantRoots = []) {
  return Array.from(
    new Set(
      [
        workspaceRoot,
        ...grantRoots,
        cwd,
      ]
        .map((rootPath) => resolveRuntimePath(rootPath))
        .filter(Boolean),
    ),
  );
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

export function buildTurnSandboxPolicy(sandboxPolicy, workspaceRoot = null, cwd = null, grantRoots = []) {
  const resolvedWorkspaceRoot = resolveRuntimePath(workspaceRoot);
  const resolvedCwd = resolveRuntimePath(cwd);
  const writableRoots = resolveWritableRoots(resolvedWorkspaceRoot, resolvedCwd, grantRoots);
  if (sandboxPolicy === "danger-full-access") {
    return {
      type: "dangerFullAccess",
    };
  }

  if (sandboxPolicy === "read-only" || sandboxPolicy === "readOnly") {
    if (!resolvedWorkspaceRoot && writableRoots.length > 0) {
      return {
        type: "workspaceWrite",
        networkAccess: true,
        writableRoots,
      };
    }

    return {
      type: "readOnly",
    };
  }

  if (sandboxPolicy === "workspace-write" || sandboxPolicy === "workspaceWrite") {
    if (writableRoots.length === 0) {
      return {
        type: "readOnly",
      };
    }

    return {
      type: "workspaceWrite",
      networkAccess: true,
      writableRoots,
    };
  }

  if (writableRoots.length > 0) {
    return {
      type: "workspaceWrite",
      networkAccess: true,
      writableRoots,
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
  verbosity = null,
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
    // The settings field is additive developer guidance, not an editor for the base product prompt.
    runtimeInstructions,
    settings,
    verbosity,
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
      // Keep user guidance additive in developer_instructions while the base product prompt stays in instructions.
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
  );
  const grantRoots = Array.isArray(baseContext.grants)
    ? baseContext.grants
        .map((grant) => firstString(grant?.rootPath))
        .filter(Boolean)
    : [];
  const executionPolicyMode = firstString(baseContext.policy?.executionPolicyMode);
  const sandboxPolicy = firstString(
    baseContext.policy?.sandboxPolicy,
    executionPolicyMode === "preview" ? "readOnly" : null,
    executionPolicyMode === "auto" || executionPolicyMode === "apply" ? "workspaceWrite" : null,
  ) || (resolvedWorkspaceRoot ? "workspaceWrite" : "readOnly");
  const resolvedWritableRoots =
    sandboxPolicy === "workspaceWrite"
      ? resolveWritableRoots(resolvedWorkspaceRoot, request?.cwd, grantRoots)
      : !resolvedWorkspaceRoot && request?.cwd
        ? resolveWritableRoots(null, request?.cwd, grantRoots)
        : resolveWritableRoots(null, null, grantRoots);
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
    grants: resolvedWritableRoots.length > 0
      ? resolvedWritableRoots.map((rootPath) => ({
          kind: "workspaceRoot",
          rootPath,
          access: "workspaceWrite",
        }))
      : [],
    policy: {
      executionPolicyMode: executionPolicyMode || "defaultProfilePrivateScope",
      approvalPolicy,
      sandboxPolicy,
      trustLevel,
    },
  };
}
