import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDesktopActorPolicyMetadata,
  classifyDesktopExecutionIntent,
  evaluateDesktopPolicy,
  evaluateDesktopRunPolicy,
  evaluateDesktopSettingsUpdatePolicy,
  listDesktopPolicyCapabilities,
  resolveDesktopRoleSettingsPolicy,
  resolveDesktopSettings,
  validateDesktopResolvedSettings,
} from "./policy.js";

test("buildDesktopActorPolicyMetadata expands a primary user into an owner capability profile", () => {
  assert.deepEqual(
    buildDesktopActorPolicyMetadata({}, {
      email: "george@example.com",
      primary: true,
    }),
    {
      capabilities: listDesktopPolicyCapabilities(),
      email: "george@example.com",
      primary: true,
      role: "owner",
      trustLevel: "medium",
    },
  );
});

test("classifyDesktopExecutionIntent keeps plainly read-only workspace chat lightweight", () => {
  const result = classifyDesktopExecutionIntent({
    prompt: "Brainstorm a homepage",
    workspaceRoot: "/tmp/workspace",
  });

  assert.deepEqual(result, {
    kind: "lightweightConversation",
    matchedRule: "lightweight-keyword",
    reason: "This prompt asks for discussion, explanation, or ideation without clearly requesting execution.",
    workspaceBound: true,
  });
});

test("classifyDesktopExecutionIntent treats explicit read-only directive as lightweight even with execution words", () => {
  const result = classifyDesktopExecutionIntent({
    prompt: "Can you talk through what a good landing page should include? Do not change any files.",
    workspaceRoot: "/tmp/workspace",
  });

  assert.deepEqual(result, {
    kind: "lightweightConversation",
    matchedRule: "workspace-readonly-override",
    reason: "The prompt contains an explicit read-only directive that overrides incidental execution-sounding words.",
    workspaceBound: true,
  });
});

test("classifyDesktopExecutionIntent treats 'do not inspect or change' as read-only override", () => {
  const result = classifyDesktopExecutionIntent({
    prompt: "Talk me through options. Do not inspect or change files.",
    workspaceRoot: "/tmp/workspace",
  });

  assert.deepEqual(result, {
    kind: "lightweightConversation",
    matchedRule: "workspace-readonly-override",
    reason: "The prompt contains an explicit read-only directive that overrides incidental execution-sounding words.",
    workspaceBound: true,
  });
});

test("classifyDesktopExecutionIntent keeps greetings conversational inside a workspace", () => {
  const result = classifyDesktopExecutionIntent({
    prompt: "hello",
    workspaceRoot: "/tmp/workspace",
  });

  assert.deepEqual(result, {
    kind: "lightweightConversation",
    matchedRule: "greeting",
    reason: "Greetings stay in conversation mode until the user clearly asks Sense-1 to act.",
    workspaceBound: true,
  });
});

test("classifyDesktopExecutionIntent keeps conversational framing out of execution mode", () => {
  const result = classifyDesktopExecutionIntent({
    prompt: "I think we should build a landing page for the robotics startup.",
    workspaceRoot: "/tmp/workspace",
  });

  assert.deepEqual(result, {
    kind: "lightweightConversation",
    matchedRule: "conversation-override",
    reason: "Conversational framing keeps this turn in discussion mode unless the user clearly asks Sense-1 to execute work.",
    workspaceBound: true,
  });
});

test("classifyDesktopExecutionIntent still treats genuine execution intent as execution even with workspace", () => {
  const result = classifyDesktopExecutionIntent({
    prompt: "Build a landing page",
    workspaceRoot: "/tmp/workspace",
  });

  assert.deepEqual(result, {
    kind: "executionIntent",
    matchedRule: "execution-keyword",
    reason: "This prompt clearly asks Sense-1 to perform work in the selected workspace.",
    workspaceBound: true,
  });
});

test("classifyDesktopExecutionIntent keeps workspace repo inspection conversational", () => {
  const result = classifyDesktopExecutionIntent({
    prompt: "Review this repo for implementation risks",
    workspaceRoot: "/tmp/workspace",
  });

  assert.deepEqual(result, {
    kind: "lightweightConversation",
    matchedRule: "project-inspection-conversation",
    reason: "Reviewing or inspecting a project without asking for changes stays in conversation mode.",
    workspaceBound: true,
  });
});

test("classifyDesktopExecutionIntent keeps lightweight ideation chat as conversation", () => {
  const result = classifyDesktopExecutionIntent({
    prompt: "Brainstorm landing page ideas",
  });

  assert.deepEqual(result, {
    kind: "lightweightConversation",
    matchedRule: "lightweight-keyword",
    reason: "This prompt asks for discussion, explanation, or ideation without clearly requesting execution.",
    workspaceBound: false,
  });
});

test("classifyDesktopExecutionIntent treats executable chat asks as execution intent", () => {
  const result = classifyDesktopExecutionIntent({
    prompt: "Build a landing page",
  });

  assert.deepEqual(result, {
    kind: "executionIntent",
    matchedRule: "execution-keyword",
    reason: "This prompt clearly asks Sense-1 to perform work rather than only discuss it.",
    workspaceBound: false,
  });
});

test("classifyDesktopExecutionIntent keeps project inspection conversational even without a workspace", () => {
  const result = classifyDesktopExecutionIntent({
    prompt: "Review this repo for implementation risks",
  });

  assert.deepEqual(result, {
    kind: "lightweightConversation",
    matchedRule: "project-inspection-conversation",
    reason: "Reviewing or inspecting a project without asking for changes stays in conversation mode.",
    workspaceBound: false,
  });
});

test("classifyDesktopExecutionIntent treats empty prompts as lightweight conversation", () => {
  const result = classifyDesktopExecutionIntent({});

  assert.deepEqual(result, {
    kind: "lightweightConversation",
    matchedRule: "empty-prompt-default",
    reason: "Prompts without executable content default to lightweight conversation.",
    workspaceBound: false,
  });
});

test("classifyDesktopExecutionIntent falls back to lightweight chat for ambiguous prompts", () => {
  const result = classifyDesktopExecutionIntent({
    prompt: "Keep notes for this chat",
  });

  assert.deepEqual(result, {
    kind: "lightweightConversation",
    matchedRule: "chat-default",
    reason: "Chat-only turns default to lightweight conversation unless they clearly imply execution.",
    workspaceBound: false,
  });
});

test("evaluateDesktopPolicy escalates an actor operating outside its home scope", () => {
  const decision = evaluateDesktopPolicy({
    actor: {
      id: "actor_assistant",
      kind: "agent",
      scope_id: "scope_private",
      metadata: {
        capabilities: ["session.start", "workspace.use"],
        role: "assistant",
        trustLevel: "medium",
      },
    },
    capability: "workspace.use",
    scope: { id: "scope_shared" },
  });

  assert.deepEqual(decision, {
    actorId: "actor_assistant",
    capability: "workspace.use",
    decision: "escalate",
    matchedRule: "scope-mismatch",
    reason: "This actor is operating outside its home scope and needs elevated review.",
    requiresApproval: true,
    role: "assistant",
    scopeId: "scope_shared",
    trustLevel: "medium",
  });
});

test("evaluateDesktopRunPolicy blocks a chat-only run when the actor cannot write artifacts", () => {
  const outcome = evaluateDesktopRunPolicy({
    actor: {
      id: "actor_observer",
      kind: "agent",
      scope_id: "scope_private",
      metadata: {
        role: "observer",
        trustLevel: "medium",
      },
    },
    scope: { id: "scope_private" },
    workspaceRoot: null,
  });

  assert.equal(outcome.decision, "block");
  assert.equal(outcome.matchedRule, "missing-capability-grant");
  assert.equal(outcome.checks.length, 2);
  assert.equal(outcome.checks[1].capability, "artifact.write");
});

test("evaluateDesktopRunPolicy escalates a workspace run for a low-trust assistant", () => {
  const outcome = evaluateDesktopRunPolicy({
    actor: {
      id: "actor_assistant",
      kind: "agent",
      scope_id: "scope_private",
      metadata: {
        capabilities: ["session.start", "workspace.use", "workspace.write"],
        role: "assistant",
        trustLevel: "low",
      },
    },
    scope: { id: "scope_private" },
    workspaceRoot: "/tmp/workspace",
  });

  assert.equal(outcome.decision, "escalate");
  assert.equal(outcome.matchedRule, "low-trust-agent-escalation");
  assert.equal(outcome.checks.length, 3);
  assert.equal(outcome.checks[2].capability, "workspace.write");
});

test("evaluateDesktopSettingsUpdatePolicy blocks weakening approval posture", () => {
  const outcome = evaluateDesktopSettingsUpdatePolicy({
    actor: {
      id: "actor_owner",
      kind: "user",
      scope_id: "scope_private",
      metadata: {
        role: "owner",
        trustLevel: "medium",
      },
    },
    currentSettings: {
      approvalPosture: "onRequest",
      sandboxPosture: "workspaceWrite",
    },
    nextSettings: {
      approvalPosture: "never",
      sandboxPosture: "workspaceWrite",
    },
    scope: { id: "scope_private" },
  });

  assert.equal(outcome.decision, "block");
  assert.equal(outcome.matchedRule, "settings-approval-weakening-blocked");
});

test("evaluateDesktopSettingsUpdatePolicy blocks weakening sandbox posture", () => {
  const outcome = evaluateDesktopSettingsUpdatePolicy({
    actor: {
      id: "actor_owner",
      kind: "user",
      scope_id: "scope_private",
      metadata: {
        role: "owner",
        trustLevel: "medium",
      },
    },
    currentSettings: {
      approvalPosture: "onRequest",
      sandboxPosture: "readOnly",
    },
    nextSettings: {
      approvalPosture: "onRequest",
      sandboxPosture: "workspaceWrite",
    },
    scope: { id: "scope_private" },
  });

  assert.equal(outcome.decision, "block");
  assert.equal(outcome.matchedRule, "settings-sandbox-weakening-blocked");
});

test("evaluateDesktopSettingsUpdatePolicy allows safe desktop settings updates for owners", () => {
  const outcome = evaluateDesktopSettingsUpdatePolicy({
    actor: {
      id: "actor_owner",
      kind: "user",
      scope_id: "scope_private",
      metadata: {
        role: "owner",
        trustLevel: "medium",
      },
    },
    currentSettings: {
      approvalPosture: "onRequest",
      sandboxPosture: "workspaceWrite",
    },
    nextSettings: {
      approvalPosture: "onRequest",
      personality: "concise",
      sandboxPosture: "workspaceWrite",
    },
    scope: { id: "scope_private" },
  });

  assert.equal(outcome.decision, "allow");
  assert.equal(outcome.matchedRule, "settings-update-allowed");
});

test("evaluateDesktopSettingsUpdatePolicy blocks weakening admin approval posture", () => {
  const outcome = evaluateDesktopSettingsUpdatePolicy({
    actor: {
      id: "actor_owner",
      kind: "user",
      scope_id: "scope_private",
      metadata: { role: "owner", trustLevel: "medium" },
    },
    currentSettings: { adminApprovalPosture: "requireAll" },
    nextSettings: { adminApprovalPosture: "none" },
    scope: { id: "scope_private" },
  });

  assert.equal(outcome.decision, "block");
  assert.equal(outcome.matchedRule, "settings-admin-approval-weakening-blocked");
});

test("evaluateDesktopSettingsUpdatePolicy allows strengthening admin policy fields", () => {
  const outcome = evaluateDesktopSettingsUpdatePolicy({
    actor: {
      id: "actor_owner",
      kind: "user",
      scope_id: "scope_private",
      metadata: { role: "owner", trustLevel: "medium" },
    },
    currentSettings: {
      adminApprovalPosture: "none",
    },
    nextSettings: {
      adminApprovalPosture: "requireAll",
    },
    scope: { id: "scope_private" },
  });

  assert.equal(outcome.decision, "allow");
  assert.equal(outcome.matchedRule, "settings-update-allowed");
});

test("resolveDesktopSettings applies precedence from platform defaults through profile, role, and org policy", () => {
  const resolved = resolveDesktopSettings({
    platformDefaults: {
      model: "gpt-5.4-mini",
      reasoningEffort: "xhigh",
      verbosity: "balanced",
      personality: "friendly",
      approvalPosture: "never",
      sandboxPosture: "workspaceWrite",
    },
    profileSettings: {
      model: "gpt-5.4",
      verbosity: "terse",
      personality: "concise",
      sandboxPosture: "workspaceWrite",
    },
    rolePolicy: {
      approvalPosture: "unlessTrusted",
      sandboxPosture: "readOnly",
    },
    orgPolicy: {
      personality: "formal",
    },
  });

  assert.deepEqual(resolved.settings, {
    approvalPosture: "unlessTrusted",
    model: "gpt-5.4",
    personality: "pragmatic",
    reasoningEffort: "xhigh",
    sandboxPosture: "readOnly",
    verbosity: "terse",
  });
  assert.deepEqual(resolved.sources, {
    approvalPosture: "rolePolicy",
    model: "profileSettings",
    personality: "orgPolicy",
    reasoningEffort: "platformDefaults",
    sandboxPosture: "rolePolicy",
    verbosity: "profileSettings",
  });
});

test("resolveDesktopRoleSettingsPolicy forces a read-only posture for actors without workspace write access", () => {
  const rolePolicy = resolveDesktopRoleSettingsPolicy({
    id: "actor_observer",
    kind: "user",
    scope_id: "scope_private",
    metadata: {
      role: "observer",
      trustLevel: "medium",
    },
  });

  assert.deepEqual(rolePolicy, {
    sandboxPosture: "readOnly",
  });
});

test("validateDesktopResolvedSettings rejects reasoning effort the runtime does not support for the chosen model", () => {
  const outcome = validateDesktopResolvedSettings({
    settings: {
      model: "gpt-5.4-mini",
      reasoningEffort: "xhigh",
    },
    supportedModels: [
      {
        id: "gpt-5.4-mini",
        supportedReasoningEfforts: ["low", "medium"],
      },
    ],
  });

  assert.equal(outcome.decision, "block");
  assert.equal(outcome.matchedRule, "settings-reasoning-unsupported");
});
