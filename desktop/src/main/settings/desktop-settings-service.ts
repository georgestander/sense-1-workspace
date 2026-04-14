import type { AppServerProcessManager } from "../runtime/app-server-process-manager.js";
import {
  DEFAULT_DESKTOP_SETTINGS,
  applyDesktopSettingsPatch,
  resolveDesktopSettings as resolveStoredDesktopSettings,
  resolveDesktopSettingsState as resolveStoredDesktopSettingsState,
  type DesktopSettingsPatch,
} from "../settings/desktop-settings.js";
import {
  loadDesktopSettings,
  persistDesktopSettings,
  resolveProfileSubstrateDbPath,
} from "../profile/profile-state.js";
import {
  evaluateDesktopSettingsUpdatePolicy,
  normalizeDesktopSettingsLayer,
  resolveDesktopRoleSettingsPolicy,
  resolveDesktopSettings,
  validateDesktopResolvedSettings,
} from "./policy.js";
import { describePolicyRules } from "../runtime/live-thread-runtime.js";
import { buildDesktopRunContext } from "../session/run-context.ts";
import {
  appendSubstrateEvent,
  ensureProfileSubstrate,
  getSubstrateActor,
  getSubstrateScope,
} from "../substrate/substrate.js";
import { applyTenantMembershipToActor, resolveTenantMembershipForProfile } from "../tenant/tenant-state.ts";
import type {
  DesktopAuditEvent,
  DesktopModelListResult,
  DesktopPolicyRulesResult,
  DesktopSettings,
  DesktopSettingsResult,
  DesktopRunContext,
} from "../contracts.ts";

export const DESKTOP_DEFAULT_SETTINGS: DesktopSettings = {
  model: DEFAULT_DESKTOP_SETTINGS.model,
  reasoningEffort: DEFAULT_DESKTOP_SETTINGS.reasoningEffort,
  personality: DEFAULT_DESKTOP_SETTINGS.personality,
  defaultOperatingMode: DEFAULT_DESKTOP_SETTINGS.defaultOperatingMode,
  runtimeInstructions: DEFAULT_DESKTOP_SETTINGS.runtimeInstructions,
  approvalPosture: DEFAULT_DESKTOP_SETTINGS.approvalPosture,
  sandboxPosture: DEFAULT_DESKTOP_SETTINGS.sandboxPosture,
  adminApprovalPosture: DEFAULT_DESKTOP_SETTINGS.adminApprovalPosture,
  roleApprovalLevel: DEFAULT_DESKTOP_SETTINGS.roleApprovalLevel,
  workspaceReadonly: DEFAULT_DESKTOP_SETTINGS.workspaceReadonly,
  workspaceFolderBinding: DEFAULT_DESKTOP_SETTINGS.workspaceFolderBinding,
  approvalOperationPosture: DEFAULT_DESKTOP_SETTINGS.approvalOperationPosture,
  approvalTrustedWorkspaces: DEFAULT_DESKTOP_SETTINGS.approvalTrustedWorkspaces,
  trustedSkillApprovals: DEFAULT_DESKTOP_SETTINGS.trustedSkillApprovals,
};

type RecordAuditEvent = (input: {
  details?: Record<string, unknown>;
  eventType: DesktopAuditEvent["eventType"];
  runContext: DesktopRunContext | null;
  threadId?: string | null;
  turnId?: string | null;
}) => void;

type DesktopSettingsServiceOptions = {
  env?: NodeJS.ProcessEnv;
  manager: AppServerProcessManager;
  recordAuditEvent: RecordAuditEvent;
  resolveProfile: () => Promise<{ id: string }>;
  resolveSignedInEmail: (profileId: string) => Promise<string | null>;
};

export class DesktopSettingsService {
  readonly #env: NodeJS.ProcessEnv;
  readonly #manager: AppServerProcessManager;
  readonly #recordAuditEvent: RecordAuditEvent;
  readonly #resolveProfile: () => Promise<{ id: string }>;
  readonly #resolveSignedInEmail: (profileId: string) => Promise<string | null>;

  constructor(options: DesktopSettingsServiceOptions) {
    this.#env = options.env ?? process.env;
    this.#manager = options.manager;
    this.#recordAuditEvent = options.recordAuditEvent;
    this.#resolveProfile = options.resolveProfile;
    this.#resolveSignedInEmail = options.resolveSignedInEmail;
  }

  async getDesktopSettings(): Promise<DesktopSettingsResult> {
    const profile = await this.#resolveProfile();
    const dbPath = resolveProfileSubstrateDbPath(profile.id, this.#env);
    const substrateIdentity = await ensureProfileSubstrate({
      dbPath,
      profileId: profile.id,
    });
    const actor = await getSubstrateActor({
      actorId: substrateIdentity.actorId,
      dbPath,
    });
    const { orgPolicy, profileSettings, rolePolicy } = await this.#resolveDesktopSettingsLayers({
      actor,
      dbPath,
      profileId: profile.id,
    });
    const resolved = resolveDesktopSettings({
      orgPolicy,
      platformDefaults: DESKTOP_DEFAULT_SETTINGS as unknown as Record<string, unknown>,
      profileSettings,
      rolePolicy,
    });

    return {
      settings: resolved.settings as unknown as DesktopSettings,
    };
  }

  async getDesktopPolicyRules(): Promise<DesktopPolicyRulesResult> {
    const { settings } = await this.getDesktopSettings();
    return {
      groups: describePolicyRules(settings as unknown as Record<string, unknown>),
    };
  }

  async updateDesktopSettings(partial: DesktopSettingsPatch): Promise<DesktopSettingsResult> {
    const profile = await this.#resolveProfile();
    const dbPath = resolveProfileSubstrateDbPath(profile.id, this.#env);
    const normalizedPatch = normalizeDesktopSettingsLayer(partial as unknown as Record<string, unknown>);
    const invalidPatchMessage = describeInvalidDesktopSettingsPatch(partial, normalizedPatch);
    if (invalidPatchMessage) {
      throw new Error(invalidPatchMessage);
    }

    const saved = await loadDesktopSettings(profile.id, this.#env);
    const nextStoredSettings = applyDesktopSettingsPatch(saved, partial);
    const nextLocalSettings = resolveStoredDesktopSettings(
      nextStoredSettings as unknown as Record<string, unknown>,
    ) as unknown as Record<string, unknown>;
    const email = await this.#resolveSignedInEmail(profile.id);
    const substrateIdentity = await ensureProfileSubstrate({
      actorEmail: email,
      dbPath,
      profileId: profile.id,
    });
    const actor = await getSubstrateActor({
      actorId: substrateIdentity.actorId,
      dbPath,
    });
    const tenant = await resolveTenantMembershipForProfile({
      profileId: profile.id,
      email,
      env: this.#env,
    });
    const scopedActor = applyTenantMembershipToActor(actor, tenant);
    const runContext = buildDesktopRunContext({
      actor: scopedActor,
      email,
      profileId: profile.id,
      tenant: tenant
        ? {
            actorDisplayName: tenant.actorDisplayName,
            actorId: tenant.actorId,
            role: tenant.role,
            scopeDisplayName: tenant.scopeDisplayName,
            scopeId: tenant.scopeId,
            tenantDisplayName: tenant.tenantDisplayName,
            tenantId: tenant.tenantId,
          }
        : null,
      workspaceRoot: null,
    });
    if (!runContext) {
      throw new Error("Sense-1 could not resolve settings authority for this profile.");
    }

    const settingsActor = scopedActor ?? {
      id: runContext.actor.id,
      kind: runContext.actor.kind,
      scope_id: runContext.scope.id,
      metadata: {
        capabilities: runContext.actor.capabilities,
        email,
        primary: true,
        role: runContext.actor.role,
        trustLevel: runContext.actor.trustLevel,
      },
    };
    const { orgPolicy, profileSettings, rolePolicy } = await this.#resolveDesktopSettingsLayers({
      actor: settingsActor,
      dbPath,
      profileId: profile.id,
      scopeId: runContext.scope.id,
    });
    const currentResolution = resolveDesktopSettings({
      orgPolicy,
      platformDefaults: DESKTOP_DEFAULT_SETTINGS as unknown as Record<string, unknown>,
      profileSettings,
      rolePolicy,
    });
    const nextResolution = resolveDesktopSettings({
      orgPolicy,
      platformDefaults: DESKTOP_DEFAULT_SETTINGS as unknown as Record<string, unknown>,
      profileSettings: nextLocalSettings,
      rolePolicy,
    });

    const blockedOverrideMessage = findBlockedDesktopSettingsOverride({
      normalizedPatch,
      resolvedSettings: nextResolution.settings,
      sources: nextResolution.sources,
    });
    if (blockedOverrideMessage) {
      throw new Error(blockedOverrideMessage);
    }

    const settingsOutcome = evaluateDesktopSettingsUpdatePolicy({
      actor: settingsActor,
      currentSettings: currentResolution.settings,
      nextSettings: nextResolution.settings,
      scope: { id: runContext.scope.id },
    });
    if (settingsOutcome.decision !== "allow") {
      throw new Error(settingsOutcome.reason);
    }

    const supportedModels = await this.#loadSupportedModels();
    const validationOutcome = validateDesktopResolvedSettings({
      settings: nextResolution.settings,
      supportedModels,
    });
    if (validationOutcome.decision !== "allow") {
      throw new Error(validationOutcome.reason);
    }

    const persistedSettings = nextStoredSettings as unknown as Parameters<typeof persistDesktopSettings>[1];
    await persistDesktopSettings(profile.id, persistedSettings, this.#env);

    const changedKeys = changedSettingsKeys(
      currentResolution.settings as unknown as DesktopSettings,
      nextResolution.settings as unknown as DesktopSettings,
    );
    this.#recordAuditEvent({
      eventType: "settings.updated",
      runContext,
      details: { changedKeys },
    });
    await appendSubstrateEvent({
      actorId: runContext.actor.id,
      afterState: nextResolution.settings,
      beforeState: currentResolution.settings,
      dbPath,
      detail: {
        changedKeys,
        orgPolicy,
        rolePolicy,
      },
      profileId: profile.id,
      scopeId: runContext.scope.id,
      subjectId: "desktop.defaults",
      subjectType: "settings",
      verb: "settings.updated",
    });

    return {
      settings: nextResolution.settings as unknown as DesktopSettings,
    };
  }

  async listModels(): Promise<DesktopModelListResult> {
    try {
      const profile = await this.#resolveProfile();
      const settingsState = resolveStoredDesktopSettingsState(await loadDesktopSettings(profile.id, this.#env));
      const result = await this.#manager.request("model/list", {}) as {
        data?: Array<{
          id?: string;
          name?: string;
          isDefault?: boolean;
          defaultReasoningEffort?: string;
          supportedReasoningEfforts?: string[];
        }>;
      };

      const models = (Array.isArray(result?.data) ? result.data : [])
        .map((entry) => {
          const normalized = {
            id: typeof entry?.id === "string" ? entry.id : "unknown",
            name:
              typeof entry?.name === "string"
                ? entry.name
                : (typeof entry?.id === "string" ? entry.id : "Unknown model"),
            supportedReasoningEfforts: Array.isArray(entry?.supportedReasoningEfforts)
              ? entry.supportedReasoningEfforts.filter((effort): effort is string => typeof effort === "string")
              : [],
          } as DesktopModelListResult["models"][number];

          return {
            ...normalized,
            ...(typeof entry?.isDefault === "boolean" ? { isDefault: entry.isDefault } : {}),
            ...(
              typeof entry?.defaultReasoningEffort === "string" && entry.defaultReasoningEffort.trim()
                ? { defaultReasoningEffort: entry.defaultReasoningEffort.trim() }
                : {}
            ),
          };
        })
        .filter((entry) =>
          !settingsState.modelRestrictions.allowedModels
          || settingsState.modelRestrictions.allowedModels.includes(entry.id),
        );

      return { models };
    } catch {
      return { models: [] };
    }
  }

  async #loadSupportedModels(): Promise<Array<{ id: string; supportedReasoningEfforts: string[] }>> {
    try {
      const result = await this.#manager.request("model/list", {}) as {
        data?: Array<{
          id?: string;
          supportedReasoningEfforts?: string[];
        }>;
      };

      return (Array.isArray(result?.data) ? result.data : [])
        .map((entry) => ({
          id: typeof entry?.id === "string" ? entry.id : "",
          supportedReasoningEfforts: Array.isArray(entry?.supportedReasoningEfforts)
            ? entry.supportedReasoningEfforts.filter((effort): effort is string => typeof effort === "string")
            : [],
        }))
        .filter((entry) => Boolean(entry.id));
    } catch {
      return [];
    }
  }

  async #resolveDesktopSettingsLayers({
    actor = null,
    dbPath,
    profileId,
    scopeId = null,
    workspaceRoot = null,
  }: {
    actor?: Record<string, unknown> | null;
    dbPath: string;
    profileId: string;
    scopeId?: string | null;
    workspaceRoot?: string | null;
  }) {
    const resolvedScopeId =
      scopeId?.trim()
      || (typeof actor?.scope_id === "string" ? actor.scope_id.trim() : "")
      || null;
    const scope = resolvedScopeId
      ? await getSubstrateScope({
          dbPath,
          scopeId: resolvedScopeId,
        })
      : null;

    const storedSettingsState = resolveStoredDesktopSettingsState(
      await loadDesktopSettings(profileId, this.#env),
      workspaceRoot,
    );

    return {
      orgPolicy: extractScopeSettingsPolicy(scope),
      modelRestrictions: storedSettingsState.modelRestrictions,
      profileSettings: storedSettingsState.effectiveSettings as unknown as Record<string, unknown>,
      rolePolicy: resolveDesktopRoleSettingsPolicy(actor),
      scope,
    };
  }
}

function changedSettingsKeys(before: DesktopSettings, after: DesktopSettings): string[] {
  const changedKeys: string[] = [];
  for (const [key, beforeValue] of Object.entries(before)) {
    const afterValue = after[key as keyof DesktopSettings];
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changedKeys.push(key);
    }
  }

  return changedKeys.sort((left, right) => left.localeCompare(right));
}

function describeDesktopSettingKey(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function describeInvalidDesktopSettingsPatch(
  rawPatch: DesktopSettingsPatch,
  normalizedPatch: Record<string, unknown>,
): string | null {
  const rawKeys = Object.keys(rawPatch as Record<string, unknown>);
  if (rawKeys.length === 0) {
    return "Choose at least one desktop setting to update.";
  }

  if (Object.keys(normalizedPatch).length > 0) {
    return null;
  }

  const attemptedKeys = rawKeys
    .map((key) => describeDesktopSettingKey(key))
    .join(", ");
  return `Sense-1 could not apply the requested desktop settings update for: ${attemptedKeys}.`;
}

function findBlockedDesktopSettingsOverride({
  normalizedPatch,
  resolvedSettings,
  sources,
}: {
  normalizedPatch: Record<string, unknown>;
  resolvedSettings: Record<string, unknown>;
  sources: Record<string, string>;
}): string | null {
  for (const key of Object.keys(normalizedPatch)) {
    const resolvedValue = resolvedSettings[key];
    const requestedValue = normalizedPatch[key];
    if (JSON.stringify(resolvedValue) === JSON.stringify(requestedValue)) {
      continue;
    }

    const source = sources[key];
    if (!source || source === "profile") {
      continue;
    }

    return `Sense-1 cannot change ${describeDesktopSettingKey(key)} here because it is controlled by ${source}.`;
  }

  return null;
}

function extractScopeSettingsPolicy(scope: Record<string, unknown> | null): Record<string, string> {
  const metadata = scope?.metadata;
  if (!metadata || typeof metadata !== "object") {
    return {};
  }

  const policy = (metadata as Record<string, unknown>).settingsPolicy;
  if (!policy || typeof policy !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(policy).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}
