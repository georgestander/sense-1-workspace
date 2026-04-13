import { firstString } from "./policy-intent.js";

export const DESKTOP_POLICY_CAPABILITIES = Object.freeze({
  actorManage: Object.freeze({
    description: "Manage product actors and their authority.",
    risk: "admin",
    value: "actor.manage",
  }),
  approvalRespond: Object.freeze({
    description: "Respond to approval prompts for governed actions.",
    risk: "standard",
    value: "approval.respond",
  }),
  artifactWrite: Object.freeze({
    description: "Write product artifacts into the session artifact root.",
    risk: "standard",
    value: "artifact.write",
  }),
  policyManage: Object.freeze({
    description: "Change product policy configuration.",
    risk: "admin",
    value: "policy.manage",
  }),
  sessionStart: Object.freeze({
    description: "Start desktop sessions and runs.",
    risk: "standard",
    value: "session.start",
  }),
  settingsManage: Object.freeze({
    description: "Change desktop product defaults and settings.",
    risk: "admin",
    value: "settings.manage",
  }),
  scopeCross: Object.freeze({
    description: "Operate outside the actor's home scope.",
    risk: "elevated",
    value: "scope.cross",
  }),
  workspaceUse: Object.freeze({
    description: "Use a workspace as part of a run.",
    risk: "standard",
    value: "workspace.use",
  }),
  workspaceWrite: Object.freeze({
    description: "Write to an attached workspace.",
    risk: "elevated",
    value: "workspace.write",
  }),
});

const ADMIN_CAPABILITIES = new Set([
  "actor.manage",
  "policy.manage",
  "settings.manage",
]);

const LOW_TRUST_ESCALATION_CAPABILITIES = new Set([
  "artifact.write",
  "workspace.write",
]);

const ROLE_DEFAULTS = Object.freeze({
  admin: Object.freeze({
    capabilities: [
      "actor.manage",
      "approval.respond",
      "artifact.write",
      "policy.manage",
      "session.start",
      "settings.manage",
      "scope.cross",
      "workspace.use",
      "workspace.write",
    ],
    trustLevel: "high",
  }),
  assistant: Object.freeze({
    capabilities: [
      "artifact.write",
      "session.start",
      "workspace.use",
      "workspace.write",
    ],
    trustLevel: "low",
  }),
  member: Object.freeze({
    capabilities: [
      "approval.respond",
      "artifact.write",
      "session.start",
      "workspace.use",
      "workspace.write",
    ],
    trustLevel: "medium",
  }),
  observer: Object.freeze({
    capabilities: [
      "session.start",
      "workspace.use",
    ],
    trustLevel: "medium",
  }),
  owner: Object.freeze({
    capabilities: [
      "actor.manage",
      "approval.respond",
      "artifact.write",
      "policy.manage",
      "session.start",
      "settings.manage",
      "scope.cross",
      "workspace.use",
      "workspace.write",
    ],
    trustLevel: "medium",
  }),
  service: Object.freeze({
    capabilities: [
      "artifact.write",
      "session.start",
      "workspace.use",
      "workspace.write",
    ],
    trustLevel: "medium",
  }),
});

const KNOWN_CAPABILITIES = new Set(
  Object.values(DESKTOP_POLICY_CAPABILITIES)
    .map((entry) => entry.value)
    .filter(Boolean),
);

export function listDesktopPolicyCapabilities() {
  return [...KNOWN_CAPABILITIES].sort();
}

export function normalizeActorKind(value, fallback = "user") {
  const resolved = firstString(value);
  if (resolved === "agent" || resolved === "service" || resolved === "user") {
    return resolved;
  }

  return fallback;
}

export function normalizeActorTrustLevel(value, fallback = "medium") {
  const resolved = firstString(value);
  if (resolved === "low" || resolved === "medium" || resolved === "high") {
    return resolved;
  }

  return fallback;
}

export function normalizeActorRole(value, kind = "user", fallback = null) {
  const resolved = firstString(value);
  if (resolved && ROLE_DEFAULTS[resolved]) {
    return resolved;
  }

  const resolvedFallback = firstString(fallback);
  if (resolvedFallback && ROLE_DEFAULTS[resolvedFallback]) {
    return resolvedFallback;
  }

  if (normalizeActorKind(kind, "user") === "service") {
    return "service";
  }

  return "member";
}

export function normalizeActorCapabilities(capabilities, role = "member") {
  const defaults = ROLE_DEFAULTS[normalizeActorRole(role)] ?? ROLE_DEFAULTS.member;
  const rawValues = Array.isArray(capabilities)
    ? capabilities
    : typeof capabilities === "string"
      ? capabilities.split(",")
      : defaults.capabilities;

  return [...new Set(
    rawValues
      .map((entry) => firstString(entry))
      .filter((entry) => entry && KNOWN_CAPABILITIES.has(entry))
      .sort(),
  )];
}

export function buildDesktopActorPolicyMetadata(metadata = {}, overrides = {}) {
  const baseMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata
    : {};
  const nextMetadata = overrides && typeof overrides === "object" && !Array.isArray(overrides)
    ? Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => value !== undefined && value !== null),
    )
    : {};
  const merged = {
    ...baseMetadata,
    ...nextMetadata,
  };
  const kind = normalizeActorKind(merged.kind, "user");
  const primary = Boolean(merged.primary);
  const role = normalizeActorRole(
    merged.role,
    kind,
    primary ? "owner" : kind === "agent" ? "assistant" : "member",
  );
  const capabilities = primary
    ? listDesktopPolicyCapabilities()
    : normalizeActorCapabilities(merged.capabilities, role);
  const trustLevel = normalizeActorTrustLevel(
    merged.trustLevel,
    (ROLE_DEFAULTS[role] ?? ROLE_DEFAULTS.member).trustLevel,
  );

  return {
    ...merged,
    capabilities,
    role,
    trustLevel,
  };
}

export function buildDesktopActorPolicyProfile(actor = null) {
  const record = actor && typeof actor === "object" && !Array.isArray(actor)
    ? actor
    : {};
  const metadataOverrides = {};
  if (Array.isArray(record.capabilities)) {
    metadataOverrides.capabilities = record.capabilities;
  }
  const role = firstString(record.role);
  if (role) {
    metadataOverrides.role = role;
  }
  const trustLevel = firstString(record.trust_level, record.trustLevel);
  if (trustLevel) {
    metadataOverrides.trustLevel = trustLevel;
  }
  const metadata = buildDesktopActorPolicyMetadata(
    record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
      ? record.metadata
      : {},
    metadataOverrides,
  );

  return {
    capabilities: metadata.capabilities,
    email: firstString(record.email, metadata.email),
    homeScopeId: firstString(record.homeScopeId, record.scope_id, record.scopeId),
    id: firstString(record.id, record.actor_id),
    kind: normalizeActorKind(record.kind, "user"),
    primary: Boolean(metadata.primary),
    role: metadata.role,
    trustLevel: metadata.trustLevel,
  };
}

export function evaluateDesktopPolicy({
  actor = null,
  capability = null,
  scope = null,
} = {}) {
  const actorProfile = buildDesktopActorPolicyProfile(actor);
  const resolvedCapability = firstString(capability);
  const scopeId = firstString(scope?.id, actorProfile.homeScopeId);

  if (!resolvedCapability) {
    return {
      actorId: actorProfile.id,
      capability: null,
      decision: "block",
      matchedRule: "missing-capability",
      reason: "A capability is required before the product can evaluate actor authority.",
      requiresApproval: false,
      role: actorProfile.role,
      scopeId,
      trustLevel: actorProfile.trustLevel,
    };
  }

  if (!KNOWN_CAPABILITIES.has(resolvedCapability)) {
    return {
      actorId: actorProfile.id,
      capability: resolvedCapability,
      decision: "block",
      matchedRule: "unknown-capability",
      reason: `The capability "${resolvedCapability}" is not part of the desktop policy model.`,
      requiresApproval: false,
      role: actorProfile.role,
      scopeId,
      trustLevel: actorProfile.trustLevel,
    };
  }

  if (!scopeId) {
    return {
      actorId: actorProfile.id,
      capability: resolvedCapability,
      decision: "block",
      matchedRule: "missing-scope",
      reason: "This action needs a scope before policy can be evaluated.",
      requiresApproval: false,
      role: actorProfile.role,
      scopeId: null,
      trustLevel: actorProfile.trustLevel,
    };
  }

  if (actorProfile.homeScopeId && actorProfile.homeScopeId !== scopeId) {
    if (!actorProfile.capabilities.includes("scope.cross")) {
      return {
        actorId: actorProfile.id,
        capability: resolvedCapability,
        decision: "escalate",
        matchedRule: "scope-mismatch",
        reason: "This actor is operating outside its home scope and needs elevated review.",
        requiresApproval: true,
        role: actorProfile.role,
        scopeId,
        trustLevel: actorProfile.trustLevel,
      };
    }
  }

  if (!actorProfile.capabilities.includes(resolvedCapability)) {
    return {
      actorId: actorProfile.id,
      capability: resolvedCapability,
      decision: "block",
      matchedRule: "missing-capability-grant",
      reason: `This actor does not have the "${resolvedCapability}" capability.`,
      requiresApproval: false,
      role: actorProfile.role,
      scopeId,
      trustLevel: actorProfile.trustLevel,
    };
  }

  if (ADMIN_CAPABILITIES.has(resolvedCapability) && actorProfile.role !== "owner" && actorProfile.role !== "admin") {
    return {
      actorId: actorProfile.id,
      capability: resolvedCapability,
      decision: "block",
      matchedRule: "admin-role-required",
      reason: `Only owner or admin actors can use "${resolvedCapability}".`,
      requiresApproval: false,
      role: actorProfile.role,
      scopeId,
      trustLevel: actorProfile.trustLevel,
    };
  }

  if (
    actorProfile.kind === "agent"
    && actorProfile.trustLevel === "low"
    && LOW_TRUST_ESCALATION_CAPABILITIES.has(resolvedCapability)
  ) {
    return {
      actorId: actorProfile.id,
      capability: resolvedCapability,
      decision: "escalate",
      matchedRule: "low-trust-agent-escalation",
      reason: `Low-trust agents need approval before using "${resolvedCapability}".`,
      requiresApproval: true,
      role: actorProfile.role,
      scopeId,
      trustLevel: actorProfile.trustLevel,
    };
  }

  return {
    actorId: actorProfile.id,
    capability: resolvedCapability,
    decision: "allow",
    matchedRule: "capability-granted",
    reason: `This actor is allowed to use "${resolvedCapability}" in the requested scope.`,
    requiresApproval: false,
    role: actorProfile.role,
    scopeId,
    trustLevel: actorProfile.trustLevel,
  };
}

export function evaluateDesktopRunPolicy({
  actor = null,
  scope = null,
  workspaceRoot = null,
} = {}) {
  const checks = [
    evaluateDesktopPolicy({
      actor,
      capability: "session.start",
      scope,
    }),
  ];

  if (firstString(workspaceRoot)) {
    checks.push(
      evaluateDesktopPolicy({
        actor,
        capability: "workspace.use",
        scope,
      }),
      evaluateDesktopPolicy({
        actor,
        capability: "workspace.write",
        scope,
      }),
    );
  } else {
    checks.push(
      evaluateDesktopPolicy({
        actor,
        capability: "artifact.write",
        scope,
      }),
    );
  }

  const blockingDecision = checks.find((decision) => decision.decision === "block") ?? null;
  const escalationDecision = checks.find((decision) => decision.decision === "escalate") ?? null;
  const primaryDecision = blockingDecision ?? escalationDecision ?? checks.at(-1) ?? {
    actorId: null,
    capability: null,
    decision: "allow",
    matchedRule: "no-checks",
    reason: "No policy checks were required for this run.",
    requiresApproval: false,
    role: "member",
    scopeId: firstString(scope?.id),
    trustLevel: "medium",
  };

  return {
    actorId: primaryDecision.actorId,
    checks,
    decision: primaryDecision.decision,
    matchedRule: primaryDecision.matchedRule,
    reason: primaryDecision.reason,
    requiresApproval: checks.some((decision) => decision.requiresApproval),
    role: primaryDecision.role,
    scopeId: primaryDecision.scopeId,
    trustLevel: primaryDecision.trustLevel,
  };
}
