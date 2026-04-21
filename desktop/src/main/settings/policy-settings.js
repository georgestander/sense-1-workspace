import { firstString, normalizePersonality } from "./policy-intent.js";
import { buildDesktopActorPolicyProfile, evaluateDesktopPolicy } from "./policy-actors.js";

const APPROVAL_POSTURE_RANK = Object.freeze({
  onRequest: 0,
  unlessTrusted: 1,
  never: 2,
});

const SANDBOX_POSTURE_RANK = Object.freeze({
  readOnly: 0,
  workspaceWrite: 1,
});

const ADMIN_APPROVAL_POSTURE_RANK = Object.freeze({
  requireAll: 0,
  requireRisky: 1,
  none: 2,
});

const DESKTOP_SETTING_KEYS = Object.freeze([
  "model",
  "reasoningEffort",
  "serviceTier",
  "verbosity",
  "personality",
  "runtimeInstructions",
  "approvalPosture",
  "sandboxPosture",
  "approvalOperationPosture",
  "approvalTrustedWorkspaces",
  "trustedSkillApprovals",
  "adminApprovalPosture",
  "roleApprovalLevel",
  "workspaceReadonly",
  "workspaceFolderBinding",
]);

function normalizeApprovalPosture(value, fallback = "onRequest") {
  const resolved = firstString(value);
  if (resolved === "onRequest" || resolved === "unlessTrusted" || resolved === "never") {
    return resolved;
  }

  return fallback;
}

function normalizeSandboxPosture(value, fallback = "workspaceWrite") {
  const resolved = firstString(value);
  if (resolved === "workspaceWrite" || resolved === "readOnly") {
    return resolved;
  }

  return fallback;
}

function normalizeOperatingMode(value, fallback = "auto") {
  const resolved = firstString(value);
  if (resolved === "preview" || resolved === "auto" || resolved === "apply") {
    return resolved;
  }

  return fallback;
}

function normalizeVerbosity(value, fallback = "balanced") {
  const resolved = firstString(value);
  if (resolved === "terse" || resolved === "balanced" || resolved === "detailed") {
    return resolved;
  }

  if (resolved === "low") {
    return "terse";
  }
  if (resolved === "medium") {
    return "balanced";
  }
  if (resolved === "high") {
    return "detailed";
  }

  return fallback;
}

function normalizeAdminApprovalPosture(value, fallback = "requireRisky") {
  const resolved = firstString(value);
  if (resolved === "requireAll" || resolved === "requireRisky" || resolved === "none") {
    return resolved;
  }

  return fallback;
}

function normalizeRoleApprovalLevel(value, fallback = "ownerOnly") {
  const resolved = firstString(value);
  if (resolved === "ownerOnly" || resolved === "anyAuthenticated") {
    return resolved;
  }

  return fallback;
}

function normalizeWorkspaceReadonly(value, fallback = "allow") {
  const resolved = firstString(value);
  if (resolved === "allow" || resolved === "readonly") {
    return resolved;
  }

  return fallback;
}

function normalizeWorkspaceFolderBinding(value, fallback = "inherit") {
  const resolved = firstString(value);
  if (resolved === "inherit" || resolved === "none") {
    return resolved;
  }

  return fallback;
}

function normalizeApprovalOperationPosture(value, fallback = "askAll") {
  const resolved = firstString(value);
  if (resolved === "askAll" || resolved === "askRisky" || resolved === "autoAll") {
    return resolved;
  }

  return fallback;
}

function normalizeApprovalTrustedWorkspaces(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim();
}

function normalizeTrustedSkillApprovals(value, fallback = []) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const seen = new Set();
  const approvals = [];
  for (const entry of value) {
    const resolved = firstString(entry);
    if (!resolved) {
      continue;
    }
    const normalized = resolved.replaceAll("\\", "/");
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    approvals.push(normalized);
  }

  return approvals;
}

function normalizeRuntimeInstructions(value, fallback = null) {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.replace(/\r\n?/g, "\n");
}

export function normalizeDesktopSettingsLayer(settings = {}) {
  const record = settings && typeof settings === "object" && !Array.isArray(settings)
    ? settings
    : {};
  const normalized = {};
  const model = firstString(record.model);
  if (model) {
    normalized.model = model;
  }
  const reasoningEffort = firstString(record.reasoningEffort);
  if (reasoningEffort) {
    normalized.reasoningEffort = reasoningEffort;
  }
  const serviceTier = firstString(record.serviceTier);
  if (serviceTier === "flex" || serviceTier === "fast") {
    normalized.serviceTier = serviceTier;
  }
  const verbosity = normalizeVerbosity(record.verbosity, null);
  if (verbosity) {
    normalized.verbosity = verbosity;
  }
  const personality = normalizePersonality(record.personality, null);
  if (personality) {
    normalized.personality = personality;
  }
  const defaultOperatingMode = normalizeOperatingMode(record.defaultOperatingMode, null);
  if (defaultOperatingMode) {
    normalized.defaultOperatingMode = defaultOperatingMode;
  }
  if (typeof record.runtimeInstructions === "string") {
    normalized.runtimeInstructions = normalizeRuntimeInstructions(record.runtimeInstructions, "");
  }
  const approvalPosture = normalizeApprovalPosture(record.approvalPosture, null);
  if (approvalPosture) {
    normalized.approvalPosture = approvalPosture;
  }
  const sandboxPosture = normalizeSandboxPosture(record.sandboxPosture, null);
  if (sandboxPosture) {
    normalized.sandboxPosture = sandboxPosture;
  }
  const approvalOperationPosture = normalizeApprovalOperationPosture(record.approvalOperationPosture, null);
  if (approvalOperationPosture) {
    normalized.approvalOperationPosture = approvalOperationPosture;
  }
  if (typeof record.approvalTrustedWorkspaces === "string") {
    normalized.approvalTrustedWorkspaces = normalizeApprovalTrustedWorkspaces(record.approvalTrustedWorkspaces, "");
  }
  if (Array.isArray(record.trustedSkillApprovals)) {
    normalized.trustedSkillApprovals = normalizeTrustedSkillApprovals(record.trustedSkillApprovals, []);
  }
  const adminApprovalPosture = normalizeAdminApprovalPosture(record.adminApprovalPosture, null);
  if (adminApprovalPosture) {
    normalized.adminApprovalPosture = adminApprovalPosture;
  }
  const roleApprovalLevel = normalizeRoleApprovalLevel(record.roleApprovalLevel, null);
  if (roleApprovalLevel) {
    normalized.roleApprovalLevel = roleApprovalLevel;
  }
  const workspaceReadonly = normalizeWorkspaceReadonly(record.workspaceReadonly, null);
  if (workspaceReadonly) {
    normalized.workspaceReadonly = workspaceReadonly;
  }
  const workspaceFolderBinding = normalizeWorkspaceFolderBinding(record.workspaceFolderBinding, null);
  if (workspaceFolderBinding) {
    normalized.workspaceFolderBinding = workspaceFolderBinding;
  }

  return normalized;
}

export function resolveDesktopRoleSettingsPolicy(actor = null) {
  const actorProfile = buildDesktopActorPolicyProfile(actor);
  const rolePolicy = {};

  if (actorProfile.kind === "agent" && actorProfile.trustLevel === "low") {
    rolePolicy.approvalPosture = "unlessTrusted";
  }

  if (!actorProfile.capabilities.includes("workspace.write")) {
    rolePolicy.sandboxPosture = "readOnly";
  }

  return rolePolicy;
}

export function resolveDesktopSettings({
  orgPolicy = {},
  platformDefaults = {},
  profileSettings = {},
  rolePolicy = {},
} = {}) {
  const layers = Object.freeze({
    orgPolicy: normalizeDesktopSettingsLayer(orgPolicy),
    platformDefaults: normalizeDesktopSettingsLayer(platformDefaults),
    profileSettings: normalizeDesktopSettingsLayer(profileSettings),
    rolePolicy: normalizeDesktopSettingsLayer(rolePolicy),
  });
  const order = [
    ["platformDefaults", layers.platformDefaults],
    ["profileSettings", layers.profileSettings],
    ["rolePolicy", layers.rolePolicy],
    ["orgPolicy", layers.orgPolicy],
  ];
  const settings = {};
  const sources = {};

  for (const [layerName, layerSettings] of order) {
    for (const key of DESKTOP_SETTING_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(layerSettings, key)) {
        continue;
      }

      settings[key] = layerSettings[key];
      sources[key] = layerName;
    }
  }

  return {
    layers,
    settings,
    sources,
  };
}

export function validateDesktopResolvedSettings({
  settings = {},
  supportedModels = [],
} = {}) {
  const normalizedSettings = normalizeDesktopSettingsLayer(settings);
  const resolvedModel = firstString(normalizedSettings.model);
  const resolvedReasoningEffort = firstString(normalizedSettings.reasoningEffort);
  const normalizedModels = Array.isArray(supportedModels)
    ? supportedModels
        .map((entry) => entry && typeof entry === "object" && !Array.isArray(entry)
          ? {
              id: firstString(entry.id),
              supportedReasoningEfforts: Array.isArray(entry.supportedReasoningEfforts)
                ? entry.supportedReasoningEfforts
                    .map((effort) => firstString(effort))
                    .filter(Boolean)
                : [],
            }
          : null)
        .filter(Boolean)
    : [];

  if (!resolvedModel || normalizedModels.length === 0) {
    return {
      decision: "allow",
      matchedRule: "settings-validation-skipped",
      reason: "No model validation rules were available for these settings.",
    };
  }

  const matchedModel = normalizedModels.find((entry) => entry.id === resolvedModel) ?? null;
  if (!matchedModel) {
    return {
      decision: "block",
      matchedRule: "settings-model-unsupported",
      reason: `Sense-1 cannot use "${resolvedModel}" because this runtime does not list it as an available model.`,
    };
  }

  if (
    resolvedReasoningEffort
    && matchedModel.supportedReasoningEfforts.length > 0
    && !matchedModel.supportedReasoningEfforts.includes(resolvedReasoningEffort)
  ) {
    return {
      decision: "block",
      matchedRule: "settings-reasoning-unsupported",
      reason: `Sense-1 cannot use reasoning effort "${resolvedReasoningEffort}" with model "${resolvedModel}".`,
    };
  }

  return {
    decision: "allow",
    matchedRule: "settings-validated",
    reason: "The resolved settings are supported by the current runtime.",
  };
}

export function evaluateDesktopSettingsUpdatePolicy({
  actor = null,
  currentSettings = {},
  nextSettings = {},
  scope = null,
} = {}) {
  const authorityDecision = evaluateDesktopPolicy({
    actor,
    capability: "settings.manage",
    scope,
  });

  if (authorityDecision.decision !== "allow") {
    return authorityDecision;
  }

  const currentApproval = normalizeApprovalPosture(currentSettings?.approvalPosture, "onRequest");
  const nextApproval = normalizeApprovalPosture(nextSettings?.approvalPosture, currentApproval);
  if (APPROVAL_POSTURE_RANK[nextApproval] > APPROVAL_POSTURE_RANK[currentApproval]) {
    return {
      ...authorityDecision,
      capability: "settings.manage",
      decision: "block",
      matchedRule: "settings-approval-weakening-blocked",
      reason: `Sense-1 cannot weaken approval posture from "${currentApproval}" to "${nextApproval}".`,
      requiresApproval: false,
    };
  }

  const currentSandbox = normalizeSandboxPosture(currentSettings?.sandboxPosture, "workspaceWrite");
  const nextSandbox = normalizeSandboxPosture(nextSettings?.sandboxPosture, currentSandbox);
  if (SANDBOX_POSTURE_RANK[nextSandbox] > SANDBOX_POSTURE_RANK[currentSandbox]) {
    return {
      ...authorityDecision,
      capability: "settings.manage",
      decision: "block",
      matchedRule: "settings-sandbox-weakening-blocked",
      reason: `Sense-1 cannot weaken sandbox posture from "${currentSandbox}" to "${nextSandbox}".`,
      requiresApproval: false,
    };
  }

  const currentAdminApproval = normalizeAdminApprovalPosture(currentSettings?.adminApprovalPosture, "requireRisky");
  const nextAdminApproval = normalizeAdminApprovalPosture(nextSettings?.adminApprovalPosture, currentAdminApproval);
  if (ADMIN_APPROVAL_POSTURE_RANK[nextAdminApproval] > ADMIN_APPROVAL_POSTURE_RANK[currentAdminApproval]) {
    return {
      ...authorityDecision,
      capability: "settings.manage",
      decision: "block",
      matchedRule: "settings-admin-approval-weakening-blocked",
      reason: `Sense-1 cannot weaken admin approval posture from "${currentAdminApproval}" to "${nextAdminApproval}".`,
      requiresApproval: false,
    };
  }

  return {
    ...authorityDecision,
    capability: "settings.manage",
    decision: "allow",
    matchedRule: "settings-update-allowed",
    reason: "The requested settings update stays within the current authority bounds.",
    requiresApproval: authorityDecision.requiresApproval,
  };
}
