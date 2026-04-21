import { DEFAULT_DESKTOP_RUNTIME_INSTRUCTIONS } from "../runtime/live-thread-runtime.js";

export const DEFAULT_DESKTOP_SETTINGS = Object.freeze({
  model: "gpt-5.4-mini",
  reasoningEffort: "xhigh",
  serviceTier: "flex",
  verbosity: "balanced",
  personality: "friendly",
  defaultOperatingMode: "auto",
  runtimeInstructions: DEFAULT_DESKTOP_RUNTIME_INSTRUCTIONS,
  approvalPosture: "onRequest",
  sandboxPosture: "workspaceWrite",
  approvalOperationPosture: "askAll",
  approvalTrustedWorkspaces: "",
  trustedSkillApprovals: [],
  adminApprovalPosture: "requireRisky",
  roleApprovalLevel: "ownerOnly",
  workspaceReadonly: "allow",
  workspaceFolderBinding: "inherit",
});

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value;
}

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

function normalizePersonality(value) {
  const resolved = firstString(value);
  if (resolved === "none" || resolved === "friendly" || resolved === "pragmatic") {
    return resolved;
  }

  if (resolved === "concise" || resolved === "formal" || resolved === "detailed") {
    return "pragmatic";
  }

  return undefined;
}

function normalizeServiceTier(value) {
  const resolved = firstString(value);
  if (resolved === "flex" || resolved === "fast") {
    return resolved;
  }

  return undefined;
}

function normalizeVerbosity(value) {
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

  return undefined;
}

function normalizeApprovalPosture(value) {
  const resolved = firstString(value);
  if (resolved === "onRequest" || resolved === "unlessTrusted" || resolved === "never") {
    return resolved;
  }

  return undefined;
}

function normalizeSandboxPosture(value) {
  const resolved = firstString(value);
  if (resolved === "workspaceWrite" || resolved === "readOnly") {
    return resolved;
  }

  return undefined;
}

function normalizeOperatingMode(value) {
  const resolved = firstString(value);
  if (resolved === "preview" || resolved === "auto" || resolved === "apply") {
    return resolved;
  }

  return undefined;
}

function normalizeWorkspaceReadonly(value) {
  const resolved = firstString(value);
  if (resolved === "allow" || resolved === "readonly") {
    return resolved;
  }

  return undefined;
}

function normalizeWorkspaceFolderBinding(value) {
  const resolved = firstString(value);
  if (resolved === "inherit" || resolved === "none") {
    return resolved;
  }

  return undefined;
}

function normalizeRuntimeInstructions(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.replace(/\r\n?/g, "\n");
}

function normalizeAdminApprovalPosture(value) {
  const resolved = firstString(value);
  if (resolved === "requireAll" || resolved === "requireRisky" || resolved === "none") {
    return resolved;
  }

  return undefined;
}

function normalizeApprovalOperationPosture(value) {
  const resolved = firstString(value);
  if (resolved === "askAll" || resolved === "askRisky" || resolved === "autoAll") {
    return resolved;
  }

  return undefined;
}

function normalizeApprovalTrustedWorkspaces(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim();
}

function normalizeTrustedSkillApprovals(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const seen = new Set();
  const approvals = [];
  for (const entry of value) {
    const resolved = firstString(entry)?.replaceAll("\\", "/");
    if (!resolved || seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);
    approvals.push(resolved);
  }

  return approvals;
}

function normalizeRoleApprovalLevel(value) {
  const resolved = firstString(value);
  if (resolved === "ownerOnly" || resolved === "anyAuthenticated") {
    return resolved;
  }

  return undefined;
}

function normalizeAllowedModels(value) {
  if (value === null) {
    return null;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const seen = new Set();
  const allowedModels = [];
  for (const entry of value) {
    const resolved = firstString(entry);
    if (!resolved || seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);
    allowedModels.push(resolved);
  }

  return allowedModels.length > 0 ? allowedModels : null;
}

function normalizeWorkspaceDefaults(value) {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const workspaceDefaults = {};
  const model = firstString(record.model);
  const reasoningEffort = firstString(record.reasoningEffort);
  const serviceTier = normalizeServiceTier(record.serviceTier);
  const verbosity = normalizeVerbosity(record.verbosity);
  const personality = normalizePersonality(record.personality);

  if (model) {
    workspaceDefaults.model = model;
  }
  if (reasoningEffort) {
    workspaceDefaults.reasoningEffort = reasoningEffort;
  }
  if (serviceTier) {
    workspaceDefaults.serviceTier = serviceTier;
  }
  if (verbosity) {
    workspaceDefaults.verbosity = verbosity;
  }
  if (personality) {
    workspaceDefaults.personality = personality;
  }

  return Object.keys(workspaceDefaults).length > 0 ? workspaceDefaults : undefined;
}

function normalizeApprovalDefaults(value) {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const approvalDefaults = {};
  const approvalPosture = normalizeApprovalPosture(record.approvalPosture);
  const sandboxPosture = normalizeSandboxPosture(record.sandboxPosture);
  const approvalOperationPosture = normalizeApprovalOperationPosture(record.approvalOperationPosture);
  const approvalTrustedWorkspaces = normalizeApprovalTrustedWorkspaces(record.approvalTrustedWorkspaces);
  const trustedSkillApprovals = normalizeTrustedSkillApprovals(record.trustedSkillApprovals);

  if (approvalPosture) {
    approvalDefaults.approvalPosture = approvalPosture;
  }
  if (sandboxPosture) {
    approvalDefaults.sandboxPosture = sandboxPosture;
  }
  if (approvalOperationPosture) {
    approvalDefaults.approvalOperationPosture = approvalOperationPosture;
  }
  if (approvalTrustedWorkspaces !== undefined) {
    approvalDefaults.approvalTrustedWorkspaces = approvalTrustedWorkspaces;
  }
  if (trustedSkillApprovals !== undefined) {
    approvalDefaults.trustedSkillApprovals = trustedSkillApprovals;
  }

  return Object.keys(approvalDefaults).length > 0 ? approvalDefaults : undefined;
}

function normalizeGeneralDefaults(value) {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const generalDefaults = {};
  const defaultOperatingMode = normalizeOperatingMode(record.defaultOperatingMode);
  const runtimeInstructions = normalizeRuntimeInstructions(record.runtimeInstructions);
  const adminApprovalPosture = normalizeAdminApprovalPosture(record.adminApprovalPosture);
  const roleApprovalLevel = normalizeRoleApprovalLevel(record.roleApprovalLevel);
  const workspaceReadonly = normalizeWorkspaceReadonly(record.workspaceReadonly);
  const workspaceFolderBinding = normalizeWorkspaceFolderBinding(record.workspaceFolderBinding);

  if (defaultOperatingMode) {
    generalDefaults.defaultOperatingMode = defaultOperatingMode;
  }
  if (runtimeInstructions !== undefined) {
    generalDefaults.runtimeInstructions = runtimeInstructions;
  }
  if (adminApprovalPosture) {
    generalDefaults.adminApprovalPosture = adminApprovalPosture;
  }
  if (roleApprovalLevel) {
    generalDefaults.roleApprovalLevel = roleApprovalLevel;
  }
  if (workspaceReadonly) {
    generalDefaults.workspaceReadonly = workspaceReadonly;
  }
  if (workspaceFolderBinding) {
    generalDefaults.workspaceFolderBinding = workspaceFolderBinding;
  }

  return Object.keys(generalDefaults).length > 0 ? generalDefaults : undefined;
}

function normalizeModelRestrictions(value) {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const allowedModels = normalizeAllowedModels(record.allowedModels);
  if (allowedModels === undefined) {
    return undefined;
  }

  return {
    allowedModels,
  };
}

function normalizeSettingsLayer(value) {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const workspaceDefaults = normalizeWorkspaceDefaults(record.workspaceDefaults);
  const approvalDefaults = normalizeApprovalDefaults(record.approvalDefaults);
  const generalDefaults = normalizeGeneralDefaults(record.generalDefaults);
  const modelRestrictions = normalizeModelRestrictions(record.modelRestrictions);
  if (!workspaceDefaults && !approvalDefaults && !generalDefaults && !modelRestrictions) {
    return null;
  }

  return {
    ...(workspaceDefaults ? { workspaceDefaults } : {}),
    ...(approvalDefaults ? { approvalDefaults } : {}),
    ...(generalDefaults ? { generalDefaults } : {}),
    ...(modelRestrictions ? { modelRestrictions } : {}),
  };
}

function buildLegacyProfileLayer(raw) {
  const workspaceDefaults = normalizeWorkspaceDefaults(raw);
  const approvalDefaults = normalizeApprovalDefaults({
    approvalPosture: raw.approvalPosture,
    sandboxPosture: raw.sandboxPosture,
    approvalOperationPosture: raw.approvalOperationPosture,
    approvalTrustedWorkspaces: raw.approvalTrustedWorkspaces,
    trustedSkillApprovals: raw.trustedSkillApprovals,
  });
  const generalDefaults = normalizeGeneralDefaults(raw);
  const modelRestrictions = normalizeModelRestrictions(raw.modelRestrictions);

  if (!workspaceDefaults && !approvalDefaults && !generalDefaults && !modelRestrictions) {
    return null;
  }

  return {
    ...(workspaceDefaults ? { workspaceDefaults } : {}),
    ...(approvalDefaults ? { approvalDefaults } : {}),
    ...(generalDefaults ? { generalDefaults } : {}),
    ...(modelRestrictions ? { modelRestrictions } : {}),
  };
}

function mergeSettingsLayer(current, patch) {
  if (!patch) {
    return current;
  }

  return normalizeSettingsLayer({
    workspaceDefaults: {
      ...(current?.workspaceDefaults ?? {}),
      ...(patch.workspaceDefaults ?? {}),
    },
    approvalDefaults: {
      ...(current?.approvalDefaults ?? {}),
      ...(patch.approvalDefaults ?? {}),
    },
    generalDefaults: {
      ...(current?.generalDefaults ?? {}),
      ...(patch.generalDefaults ?? {}),
    },
    modelRestrictions: {
      ...(current?.modelRestrictions ?? {}),
      ...(patch.modelRestrictions ?? {}),
    },
  });
}

function buildPatchLayer(patch = {}) {
  return normalizeSettingsLayer({
    workspaceDefaults: {
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      ...(patch.reasoningEffort !== undefined ? { reasoningEffort: patch.reasoningEffort } : {}),
      ...(patch.serviceTier !== undefined ? { serviceTier: patch.serviceTier } : {}),
      ...(patch.verbosity !== undefined ? { verbosity: patch.verbosity } : {}),
      ...(patch.personality !== undefined ? { personality: normalizePersonality(patch.personality) } : {}),
      ...(patch.workspaceDefaults ?? {}),
    },
    approvalDefaults: {
      ...(patch.approvalPosture !== undefined ? { approvalPosture: patch.approvalPosture } : {}),
      ...(patch.sandboxPosture !== undefined ? { sandboxPosture: patch.sandboxPosture } : {}),
      ...(patch.approvalOperationPosture !== undefined ? { approvalOperationPosture: patch.approvalOperationPosture } : {}),
      ...(patch.approvalTrustedWorkspaces !== undefined
        ? { approvalTrustedWorkspaces: patch.approvalTrustedWorkspaces }
        : {}),
      ...(patch.trustedSkillApprovals !== undefined
        ? { trustedSkillApprovals: patch.trustedSkillApprovals }
        : {}),
      ...(patch.approvalDefaults ?? {}),
    },
    generalDefaults: {
      ...(patch.defaultOperatingMode !== undefined ? { defaultOperatingMode: patch.defaultOperatingMode } : {}),
      ...(patch.runtimeInstructions !== undefined ? { runtimeInstructions: patch.runtimeInstructions } : {}),
      ...(patch.adminApprovalPosture !== undefined ? { adminApprovalPosture: patch.adminApprovalPosture } : {}),
      ...(patch.roleApprovalLevel !== undefined ? { roleApprovalLevel: patch.roleApprovalLevel } : {}),
      ...(patch.workspaceReadonly !== undefined ? { workspaceReadonly: patch.workspaceReadonly } : {}),
      ...(patch.workspaceFolderBinding !== undefined ? { workspaceFolderBinding: patch.workspaceFolderBinding } : {}),
      ...(patch.generalDefaults ?? {}),
    },
    modelRestrictions: patch.modelRestrictions ?? {},
  });
}

export function flattenDesktopSettingsLayer(layer = null) {
  return {
    ...(layer?.workspaceDefaults ?? {}),
    ...(layer?.approvalDefaults ?? {}),
    ...(layer?.generalDefaults ?? {}),
  };
}

export function normalizeStoredDesktopSettings(raw = {}) {
  const policyRecord = asRecord(raw.policy);
  const workspacesRecord = asRecord(policyRecord?.workspaces);
  const workspaces = {};

  if (workspacesRecord) {
    for (const [workspaceRoot, value] of Object.entries(workspacesRecord)) {
      const normalizedLayer = normalizeSettingsLayer(value);
      const normalizedWorkspaceRoot = firstString(workspaceRoot);
      if (!normalizedLayer || !normalizedWorkspaceRoot) {
        continue;
      }

      workspaces[normalizedWorkspaceRoot] = normalizedLayer;
    }
  }

  const hasStructuredPolicy = Number(raw.version) === 2 && policyRecord;
  const profileLayer = hasStructuredPolicy
    ? normalizeSettingsLayer(policyRecord?.profile)
    : buildLegacyProfileLayer(raw);

  return {
    version: 2,
    policy: {
      system: hasStructuredPolicy ? normalizeSettingsLayer(policyRecord?.system) : null,
      organization: hasStructuredPolicy ? normalizeSettingsLayer(policyRecord?.organization) : null,
      profile: profileLayer,
      workspaces,
    },
  };
}

export function resolveDesktopSettingsState(raw = {}, workspaceRoot = null) {
  const storedSettings = normalizeStoredDesktopSettings(raw);
  const effectiveSettings = {
    ...DEFAULT_DESKTOP_SETTINGS,
  };
  let allowedModels = null;
  const settingsLayers = {
    system: {},
    organization: {},
    profile: {},
    workspace: {},
  };

  const normalizedWorkspaceRoot = firstString(workspaceRoot);
  const layers = [
    ["system", storedSettings.policy.system],
    ["organization", storedSettings.policy.organization],
    ["profile", storedSettings.policy.profile],
    ["workspace", normalizedWorkspaceRoot ? storedSettings.policy.workspaces[normalizedWorkspaceRoot] ?? null : null],
  ];

  for (const [layerName, layer] of layers) {
    if (!layer) {
      continue;
    }

    const flattenedLayer = flattenDesktopSettingsLayer(layer);
    settingsLayers[layerName] = flattenedLayer;
    Object.assign(effectiveSettings, flattenedLayer);
    if (layer.modelRestrictions && Object.hasOwn(layer.modelRestrictions, "allowedModels")) {
      allowedModels = layer.modelRestrictions.allowedModels ?? null;
    }
  }

  if (allowedModels && !allowedModels.includes(effectiveSettings.model)) {
    effectiveSettings.model = allowedModels[0] ?? DEFAULT_DESKTOP_SETTINGS.model;
  }

  return {
    effectiveSettings,
    settingsLayers,
    modelRestrictions: {
      allowedModels,
    },
    storedSettings,
  };
}

export function resolveDesktopSettings(raw = {}, workspaceRoot = null) {
  return resolveDesktopSettingsState(raw, workspaceRoot).effectiveSettings;
}

export function applyDesktopSettingsPatch(raw = {}, patch = {}) {
  const storedSettings = normalizeStoredDesktopSettings(raw);
  const nextStoredSettings = {
    ...storedSettings,
    policy: {
      ...storedSettings.policy,
      profile: mergeSettingsLayer(storedSettings.policy.profile, buildPatchLayer(patch)),
    },
  };
  const requestedModel =
    firstString(patch.workspaceDefaults?.model)
    ?? firstString(patch.model);
  const nextState = resolveDesktopSettingsState(nextStoredSettings);
  if (
    requestedModel
    && nextState.modelRestrictions.allowedModels
    && !nextState.modelRestrictions.allowedModels.includes(requestedModel)
  ) {
    throw new Error("Sense-1 cannot set a default model outside the allowed model restrictions.");
  }

  return nextStoredSettings;
}
