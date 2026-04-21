import type { AppServerProcessManager } from "../runtime/app-server-process-manager.js";
import { isE2EAuthFixtureEnabled, readE2EAuthFixtureProfile } from "../e2e-auth-fixture.ts";
import { loadDesktopSettings } from "../profile/profile-state.js";
import { resolveDesktopSettingsState as resolveStoredDesktopSettingsState } from "../settings/desktop-settings.js";
import {
  normalizeDesktopSettingsLayer,
  resolveDesktopRoleSettingsPolicy,
} from "../settings/policy.js";
import { projectSupportedRuntimeModels } from "../settings/runtime-model-catalog.js";
import { getSubstrateScope } from "../substrate/substrate.js";

type AccountReadResult = {
  account?: {
    email?: string | null;
    type?: string | null;
  } | null;
  authMode?: string | null;
  requiresOpenaiAuth?: boolean;
};

export type ResolvedDesktopSignIn = {
  accountType: string | null;
  authMode: string | null;
  email: string | null;
  isSignedIn: boolean;
  requiresOpenaiAuth: boolean;
};

const ACCOUNT_READ_PARAMS = { refreshToken: false } as const;

const DESKTOP_SETTING_LABELS: Record<string, string> = Object.freeze({
  adminApprovalPosture: "admin approval posture",
  defaultOperatingMode: "default operating mode",
  approvalPosture: "approval posture",
  approvalOperationPosture: "operation approval posture",
  approvalTrustedWorkspaces: "trusted workspace rules",
  model: "model",
  personality: "personality",
  reasoningEffort: "reasoning effort",
  runtimeInstructions: "runtime instructions",
  verbosity: "verbosity",
  roleApprovalLevel: "role approval level",
  sandboxPosture: "sandbox posture",
  workspaceFolderBinding: "folder-bound thread behavior",
  workspaceReadonly: "workspace read-only mode",
});

function describeDesktopSettingKey(key: string): string {
  return DESKTOP_SETTING_LABELS[key] ?? key;
}

function extractScopeSettingsPolicy(scope: Record<string, unknown> | null): Record<string, string> {
  const metadata =
    scope?.metadata && typeof scope.metadata === "object" && !Array.isArray(scope.metadata)
      ? scope.metadata as Record<string, unknown>
      : {};
  const settingsPolicy =
    metadata.settingsPolicy && typeof metadata.settingsPolicy === "object" && !Array.isArray(metadata.settingsPolicy)
      ? metadata.settingsPolicy as Record<string, unknown>
      : {};

  return normalizeDesktopSettingsLayer(settingsPolicy);
}

export function findBlockedDesktopSettingsOverride({
  normalizedPatch,
  resolvedSettings,
  sources,
}: {
  normalizedPatch: Record<string, unknown>;
  resolvedSettings: Record<string, unknown>;
  sources: Record<string, string>;
}): string | null {
  for (const [key, value] of Object.entries(normalizedPatch)) {
    const source = sources[key];
    if (
      (source === "orgPolicy" || source === "rolePolicy")
      && resolvedSettings[key] !== value
    ) {
      const sourceLabel = source === "orgPolicy" ? "org policy" : "role policy";
      return `Sense-1 cannot set ${describeDesktopSettingKey(key)} to "${value}" because ${sourceLabel} keeps it at "${resolvedSettings[key]}".`;
    }
  }

  return null;
}

export async function resolveSignedInEmail({
  env,
  manager,
  profileId,
}: {
  env: NodeJS.ProcessEnv;
  manager: AppServerProcessManager;
  profileId: string;
}): Promise<string | null> {
  const resolved = await resolveSignedInAccount({
    env,
    manager,
    profileId,
  });
  return resolved.email;
}

export async function resolveSignedInAccount({
  env,
  manager,
  profileId,
}: {
  env: NodeJS.ProcessEnv;
  manager: AppServerProcessManager;
  profileId: string;
}): Promise<ResolvedDesktopSignIn> {
  if (isE2EAuthFixtureEnabled(env)) {
    const fixtureProfile = await readE2EAuthFixtureProfile(profileId, env);
    if (fixtureProfile) {
      const accountType = typeof fixtureProfile.accountType === "string" && fixtureProfile.accountType.trim()
        ? fixtureProfile.accountType.trim()
        : "chatgpt";
      return {
        accountType,
        authMode: accountType,
        email: fixtureProfile.email,
        isSignedIn: true,
        requiresOpenaiAuth: false,
      };
    }
  }

  try {
    const authResult = await manager.request("account/read", ACCOUNT_READ_PARAMS) as AccountReadResult;
    const email = typeof authResult?.account?.email === "string" && authResult.account.email.trim()
      ? authResult.account.email.trim()
      : null;
    const accountType = typeof authResult?.account?.type === "string" && authResult.account.type.trim()
      ? authResult.account.type.trim()
      : null;
    const authMode = typeof authResult?.authMode === "string" && authResult.authMode.trim()
      ? authResult.authMode.trim()
      : null;
    const normalizedAuthType = (accountType ?? authMode)?.trim().toLowerCase() ?? null;

    return {
      accountType,
      authMode,
      email,
      isSignedIn: email !== null || normalizedAuthType === "apikey",
      requiresOpenaiAuth: typeof authResult?.requiresOpenaiAuth === "boolean" ? authResult.requiresOpenaiAuth : email === null,
    };
  } catch {
    return {
      accountType: null,
      authMode: null,
      email: null,
      isSignedIn: false,
      requiresOpenaiAuth: true,
    };
  }
}

export async function loadSupportedModels(
  manager: AppServerProcessManager,
  signIn: Pick<ResolvedDesktopSignIn, "accountType" | "authMode"> = { accountType: null, authMode: null },
): Promise<Array<{ id: string; supportedReasoningEfforts: string[] }>> {
  try {
    const result = await manager.request("model/list", {}) as {
      data?: Array<{
        id?: string;
        supportedReasoningEfforts?: string[];
      }>;
    };

    return projectSupportedRuntimeModels(Array.isArray(result?.data) ? result.data : [], {
      accountType: signIn.accountType,
      authMode: signIn.authMode,
    });
  } catch {
    return [];
  }
}

export async function resolveDesktopSettingsLayers({
  actor = null,
  dbPath,
  env,
  profileId,
  scopeId = null,
  workspaceRoot = null,
}: {
  actor?: Record<string, unknown> | null;
  dbPath: string;
  env: NodeJS.ProcessEnv;
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
    await loadDesktopSettings(profileId, env),
    workspaceRoot,
  );

  return {
    modelRestrictions: storedSettingsState.modelRestrictions,
    orgPolicy: extractScopeSettingsPolicy(scope),
    profileSettings: storedSettingsState.effectiveSettings as unknown as Record<string, unknown>,
    rolePolicy: resolveDesktopRoleSettingsPolicy(actor),
    scope,
  };
}
