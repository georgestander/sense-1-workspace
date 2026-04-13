export type DesktopPolicyDecision = "allow" | "block" | "escalate";
export type DesktopActorKind = "user" | "agent" | "service";
export type DesktopActorTrustLevel = "low" | "medium" | "high";

export const DESKTOP_POLICY_CAPABILITIES: Record<
  string,
  {
    readonly description: string;
    readonly risk: "standard" | "elevated" | "admin";
    readonly value: string;
  }
>;

export function listDesktopPolicyCapabilities(): string[];
export function classifyDesktopExecutionIntent(options?: {
  prompt?: string | null;
  workspaceRoot?: string | null;
}): {
  kind: "executionIntent" | "lightweightConversation";
  matchedRule: string;
  reason: string;
  workspaceBound: boolean;
};
export function normalizeActorKind(value: unknown, fallback?: DesktopActorKind): DesktopActorKind;
export function normalizeActorTrustLevel(
  value: unknown,
  fallback?: DesktopActorTrustLevel,
): DesktopActorTrustLevel;
export function normalizeActorRole(
  value: unknown,
  kind?: DesktopActorKind,
  fallback?: string | null,
): string;
export function normalizeActorCapabilities(capabilities: unknown, role?: string): string[];
export function buildDesktopActorPolicyMetadata(
  metadata?: Record<string, unknown>,
  overrides?: Record<string, unknown>,
): Record<string, unknown>;
export function normalizeDesktopSettingsLayer(
  settings?: Record<string, unknown> | null,
): Record<string, string>;
export function resolveDesktopRoleSettingsPolicy(
  actor?: Record<string, unknown> | null,
): Record<string, string>;
export function resolveDesktopSettings(options?: {
  orgPolicy?: Record<string, unknown> | null;
  platformDefaults?: Record<string, unknown> | null;
  profileSettings?: Record<string, unknown> | null;
  rolePolicy?: Record<string, unknown> | null;
}): {
  layers: {
    orgPolicy: Record<string, string>;
    platformDefaults: Record<string, string>;
    profileSettings: Record<string, string>;
    rolePolicy: Record<string, string>;
  };
  settings: Record<string, string>;
  sources: Record<string, string>;
};
export function validateDesktopResolvedSettings(options?: {
  settings?: Record<string, unknown> | null;
  supportedModels?: Array<{
    id?: string | null;
    supportedReasoningEfforts?: string[] | null;
  }> | null;
}): {
  decision: "allow" | "block";
  matchedRule: string;
  reason: string;
};
export function buildDesktopActorPolicyProfile(actor?: Record<string, unknown> | null): {
  capabilities: string[];
  email: string | null;
  homeScopeId: string | null;
  id: string | null;
  kind: DesktopActorKind;
  primary: boolean;
  role: string;
  trustLevel: DesktopActorTrustLevel;
};
export function evaluateDesktopPolicy(options?: {
  actor?: Record<string, unknown> | null;
  capability?: string | null;
  scope?: { id?: string | null } | null;
}): {
  actorId: string | null;
  capability: string | null;
  decision: DesktopPolicyDecision;
  matchedRule: string;
  reason: string;
  requiresApproval: boolean;
  role: string;
  scopeId: string | null;
  trustLevel: DesktopActorTrustLevel;
};
export function evaluateDesktopRunPolicy(options?: {
  actor?: Record<string, unknown> | null;
  scope?: { id?: string | null } | null;
  workspaceRoot?: string | null;
}): {
  actorId: string | null;
  checks: Array<{
    actorId: string | null;
    capability: string | null;
    decision: DesktopPolicyDecision;
    matchedRule: string;
    reason: string;
    requiresApproval: boolean;
    role: string;
    scopeId: string | null;
    trustLevel: DesktopActorTrustLevel;
  }>;
  decision: DesktopPolicyDecision;
  matchedRule: string;
  reason: string;
  requiresApproval: boolean;
  role: string;
  scopeId: string | null;
  trustLevel: DesktopActorTrustLevel;
};
export function evaluateDesktopSettingsUpdatePolicy(options?: {
  actor?: Record<string, unknown> | null;
  currentSettings?: Record<string, unknown> | null;
  nextSettings?: Record<string, unknown> | null;
  scope?: { id?: string | null } | null;
}): {
  actorId: string | null;
  capability: string | null;
  decision: DesktopPolicyDecision;
  matchedRule: string;
  reason: string;
  requiresApproval: boolean;
  role: string;
  scopeId: string | null;
  trustLevel: DesktopActorTrustLevel;
};
