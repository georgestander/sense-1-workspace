import fs from "node:fs/promises";
import path from "node:path";

import type { AppServerProcessManager } from "../runtime/app-server-process-manager.js";
import {
  resolveProfileCodexHome,
  resolveProfileArtifactRoot,
  resolveProfileSubstrateDbPath,
  resolveSessionArtifactRoot,
} from "../profile/profile-state.js";
import type {
  DesktopAuditEvent,
  DesktopAppServerInputItem,
  DesktopLastSelectedThreadRequest,
  DesktopRunContext,
  DesktopStartedTaskRunResult,
  DesktopTaskRunRequest,
  DesktopTaskRunResult,
} from "../contracts";
import {
  runDesktopTask as executeDesktopTask,
} from "../runtime/live-thread-runtime.js";
import {
  classifyDesktopExecutionIntent,
  evaluateDesktopRunPolicy,
  normalizeDesktopSettingsLayer,
  resolveDesktopSettings,
  validateDesktopResolvedSettings,
} from "../settings/policy.js";
import { buildDesktopRunContext } from "./run-context.ts";
import {
  createSubstrateSessionShell,
  deleteSubstrateSession,
  ensureProfileSubstrate,
  ensureSubstrateSessionForThread,
  finalizeSubstrateSessionStart,
  getSubstrateActor,
  getSubstrateScope,
  loadWorkspacePolicy,
} from "../substrate/substrate.js";
import {
  writeSessionRecord,
} from "./session-record.ts";
import { buildRuntimeContinuityInstruction } from "./workspace-thread-continuity.ts";
import {
  getSession as querySession,
} from "../substrate/substrate-reader.js";
import type { DesktopApprovalService } from "./desktop-approval-service.ts";
import { recordDesktopPolicyOutcome } from "./policy-outcome-recorder.ts";
import type { SessionSubstrateSync } from "./session-substrate-sync.ts";
import {
  normalizeAttachmentPaths,
  promptSummary,
} from "./session-controller-support.ts";
import type { DesktopWorkspaceService } from "../workspace/desktop-workspace-service.ts";
import {
  deriveWorkspaceGrantRoot,
  findPromptPathsOutsideWorkspace,
} from "../workspace/workspace-boundary.ts";
import { DESKTOP_DEFAULT_SETTINGS } from "../settings/desktop-settings-service.ts";
import {
  findBlockedDesktopSettingsOverride,
  loadSupportedModels,
  resolveDesktopSettingsLayers,
  resolveSignedInEmail,
} from "./desktop-run-start-settings.ts";
import { createPermissionRequiredResult } from "./desktop-run-start-results.ts";
import { applyTenantMembershipToActor, resolveTenantMembershipForProfile } from "../tenant/tenant-state.ts";
import type { DesktopExtensionService } from "../settings/desktop-extension-service.ts";
import { extractPromptShortcutTokens, resolvePromptShortcutInputItems } from "./desktop-prompt-shortcuts.ts";
import { collectSkillApprovalKeys } from "./skill-approval-state.ts";

const PROFILE_CODEX_HOME_SHORTCUTS = new Set([
  "plugin-creator",
  "skill-creator",
  "skill-installer",
]);

function firstShortcutName(inputItems: DesktopAppServerInputItem[]): string[] {
  return inputItems
    .filter((item): item is DesktopAppServerInputItem & { type: "mention"; name?: string } => item.type === "mention")
    .map((item) => typeof item.name === "string" ? item.name.trim() : "")
    .filter(Boolean);
}

function resolveProfileCodexHomeShortcutNames(inputItems: DesktopAppServerInputItem[]): Set<string> {
  return new Set(
    firstShortcutName(inputItems)
      .map((name) => name.split(":").at(-1)?.trim().toLowerCase() ?? "")
      .filter((localName) => PROFILE_CODEX_HOME_SHORTCUTS.has(localName)),
  );
}

function findShortcutMention(
  inputItems: DesktopAppServerInputItem[],
  localName: string,
): (DesktopAppServerInputItem & { type: "mention"; name?: string; path?: string }) | null {
  const normalizedLocalName = localName.trim().toLowerCase();
  return inputItems.find((item): item is DesktopAppServerInputItem & { type: "mention"; name?: string; path?: string } => {
    if (item.type !== "mention") {
      return false;
    }

    const resolvedLocalName = typeof item.name === "string"
      ? item.name.split(":").at(-1)?.trim().toLowerCase() ?? ""
      : "";
    return resolvedLocalName === normalizedLocalName;
  }) ?? null;
}

function mergeRuntimeInstructions(baseInstructions: string, extraInstruction: string | null): string {
  const trimmedBase = baseInstructions.trim();
  const trimmedExtra = extraInstruction?.trim() ?? "";
  if (!trimmedExtra) {
    return trimmedBase;
  }
  if (!trimmedBase) {
    return trimmedExtra;
  }
  return `${trimmedBase}\n\n${trimmedExtra}`;
}

function withAdditionalWritableRoots(
  runContext: DesktopRunContext,
  additionalRoots: Array<string | null | undefined>,
): DesktopRunContext {
  const uniqueRoots = Array.from(
    new Set(
      [
        ...runContext.grants.map((grant) => grant.rootPath),
        ...additionalRoots,
      ]
        .map((rootPath) => typeof rootPath === "string" ? rootPath.trim() : "")
        .filter(Boolean)
        .map((rootPath) => path.resolve(rootPath)),
    ),
  );

  if (uniqueRoots.length === 0) {
    return runContext;
  }

  return {
    ...runContext,
    grants: uniqueRoots.map((rootPath) => ({
      kind: "workspaceRoot",
      rootPath,
      access: "workspaceWrite",
    })),
  };
}

function buildProfileExtensionRuntimeInstruction({
  inputItems,
  profileCodexHome,
  shortcutNames,
}: {
  inputItems: DesktopAppServerInputItem[];
  profileCodexHome: string;
  shortcutNames: Set<string>;
}): string | null {
  if (shortcutNames.size === 0) {
    return null;
  }

  const instructions: string[] = [];
  const profilePluginsDir = `${profileCodexHome}/plugins`;
  const profileMarketplacePath = `${profileCodexHome}/.agents/plugins/marketplace.json`;

  if (shortcutNames.has("skill-creator") || shortcutNames.has("skill-installer")) {
    instructions.push(
      `When creating or installing Sense-1 skills, treat ${profileCodexHome} as the active profile CODEX_HOME. Install them there so they are callable from any thread in this profile.`,
    );
    instructions.push(
      `This run already has write access to ${profileCodexHome}. Do not claim sandbox, workspace-boundary, or permission blocking for profile skill installation when writing under that root.`,
    );
    instructions.push(
      `These managed skill tasks are an explicit exception to the normal workspace deliverable rule. The finished installed skill belongs in ${profileCodexHome}/skills, not in the selected workspace or session artifact folder, unless the user explicitly asked for a workspace-local draft.`,
    );
    instructions.push(
      `Do not report success until the final installed skill exists under ${profileCodexHome} and you can reference that installed location. A workspace draft or scaffold does not satisfy a managed install request.`,
    );
    if (shortcutNames.has("skill-creator")) {
      instructions.push(
        `When the user asks for a new Sense-1 skill, finish with a callable installed profile skill in ${profileCodexHome}/skills. Do not stop at a TODO-only template, placeholder scaffold, or a draft left in the selected workspace for later move/install unless the user explicitly asked for workspace-local scaffold output.`,
      );
    }
  }

  if (shortcutNames.has("plugin-creator")) {
    const pluginCreatorSkillPath = findShortcutMention(inputItems, "plugin-creator")?.path?.trim() ?? "";
    const pluginCreatorSkillDir = pluginCreatorSkillPath ? path.dirname(pluginCreatorSkillPath) : "";
    const pluginCreatorScriptPath = pluginCreatorSkillDir
      ? path.join(pluginCreatorSkillDir, "scripts", "create_basic_plugin.py")
      : "";
    instructions.push(
      `When scaffolding a Sense-1 profile plugin, treat ${profileCodexHome} as the active home root. Create the plugin under ${profilePluginsDir} and, if you need a marketplace entry for home-local discovery, write it to ${profileMarketplacePath}.`,
    );
    instructions.push(
      `Do not leave the finished plugin scaffold in the selected workspace for later manual move/install when ${profileCodexHome} is writable in this run.`,
    );
    instructions.push(
      `This managed plugin task is also an explicit exception to the normal workspace deliverable rule. The finished plugin belongs in ${profilePluginsDir} with any required marketplace metadata under ${profileMarketplacePath}; a workspace draft does not satisfy the request unless the user explicitly asked for one.`,
    );
    if (pluginCreatorSkillPath && pluginCreatorScriptPath) {
      instructions.push(
        `The plugin-creator skill entrypoint is ${pluginCreatorSkillPath}. If it references relative helper paths, resolve them from ${pluginCreatorSkillDir}; when you need the scaffold script directly from this profile-root cwd, use ${pluginCreatorScriptPath}.`,
      );
    }
  }

  return instructions.join("\n");
}

type RecordAuditEventInput = {
  details?: Record<string, unknown>;
  eventType: DesktopAuditEvent["eventType"];
  runContext: DesktopRunContext | null;
  threadId?: string | null;
  turnId?: string | null;
};

type DesktopRunStartServiceOptions = {
  approvals: DesktopApprovalService;
  desktopExtensions: DesktopExtensionService;
  env: NodeJS.ProcessEnv;
  manager: AppServerProcessManager;
  onDesktopRunStarted: ((result: DesktopTaskRunResult) => void | Promise<void>) | null;
  onDesktopTaskResult: ((result: DesktopTaskRunResult) => void | Promise<void>) | null;
  recordAuditEvent: (input: RecordAuditEventInput) => void;
  resolveProfile: () => Promise<{ id: string }>;
  rememberLastSelectedThread: (request: DesktopLastSelectedThreadRequest) => Promise<void>;
  setRunContextByThreadId: (threadId: string, runContext: DesktopRunContext | null) => void;
  substrateSync: SessionSubstrateSync;
  waitUntilWorkspacePermissionsRestored: () => Promise<void>;
  workspaceService: DesktopWorkspaceService;
};

export class DesktopRunStartService {
  readonly #approvals: DesktopApprovalService;
  readonly #desktopExtensions: DesktopExtensionService;
  readonly #env: NodeJS.ProcessEnv;
  readonly #manager: AppServerProcessManager;
  readonly #onDesktopRunStarted: ((result: DesktopTaskRunResult) => void | Promise<void>) | null;
  readonly #onDesktopTaskResult: ((result: DesktopTaskRunResult) => void | Promise<void>) | null;
  readonly #recordAuditEvent: (input: RecordAuditEventInput) => void;
  readonly #resolveProfile: () => Promise<{ id: string }>;
  readonly #rememberLastSelectedThread: (request: DesktopLastSelectedThreadRequest) => Promise<void>;
  readonly #setRunContextByThreadId: (threadId: string, runContext: DesktopRunContext | null) => void;
  readonly #substrateSync: SessionSubstrateSync;
  readonly #waitUntilWorkspacePermissionsRestored: () => Promise<void>;
  readonly #workspaceService: DesktopWorkspaceService;

  constructor(options: DesktopRunStartServiceOptions) {
    this.#approvals = options.approvals;
    this.#desktopExtensions = options.desktopExtensions;
    this.#env = options.env;
    this.#manager = options.manager;
    this.#onDesktopRunStarted = options.onDesktopRunStarted;
    this.#onDesktopTaskResult = options.onDesktopTaskResult;
    this.#recordAuditEvent = options.recordAuditEvent;
    this.#resolveProfile = options.resolveProfile;
    this.#rememberLastSelectedThread = options.rememberLastSelectedThread;
    this.#setRunContextByThreadId = options.setRunContextByThreadId;
    this.#substrateSync = options.substrateSync;
    this.#waitUntilWorkspacePermissionsRestored = options.waitUntilWorkspacePermissionsRestored;
    this.#workspaceService = options.workspaceService;
  }

  async resolveSignedInEmail(profileId: string): Promise<string | null> {
    return await resolveSignedInEmail({
      env: this.#env,
      manager: this.#manager,
      profileId,
    });
  }

  async runDesktopTask(request: DesktopTaskRunRequest): Promise<DesktopTaskRunResult> {
    await this.#approvals.waitUntilReady();
    await this.#waitUntilWorkspacePermissionsRestored();

    const profile = await this.#resolveProfile();
    const substrateDbPath = resolveProfileSubstrateDbPath(profile.id, this.#env);
    const profileArtifactRoot = await resolveProfileArtifactRoot(profile.id, this.#env);
    const persistedWorkspaceRoot =
      request.threadId && !request.workspaceRoot && !request.cwd
        ? await this.#workspaceService.resolveThreadWorkspaceRoot(request.threadId)
        : null;
    const requestedWorkspaceRoot =
      request.workspaceRoot?.trim() || request.cwd?.trim() || persistedWorkspaceRoot || null;
    const promptOutsideWorkspace = requestedWorkspaceRoot
      ? findPromptPathsOutsideWorkspace(request.prompt, requestedWorkspaceRoot)
      : [];
    const effectiveWorkspaceRoot = promptOutsideWorkspace.length > 0
      ? deriveWorkspaceGrantRoot(promptOutsideWorkspace)
      : requestedWorkspaceRoot;
    if (promptOutsideWorkspace.length > 0 && !effectiveWorkspaceRoot) {
      throw new Error(
        `This chat is bound to ${requestedWorkspaceRoot}. Sense-1 could not determine which external folder needs approval.`,
      );
    }

    const isFolderBound = Boolean(effectiveWorkspaceRoot);
    const executionIntent = classifyDesktopExecutionIntent({
      prompt: request.prompt,
      workspaceRoot: effectiveWorkspaceRoot,
    });
    const email = await this.resolveSignedInEmail(profile.id);
    if (!email) {
      throw new Error("Sign in with ChatGPT before starting a desktop run.");
    }

    const substrateIdentity = await ensureProfileSubstrate({
      actorEmail: email,
      dbPath: substrateDbPath,
      profileId: profile.id,
    });
    const tenant = await resolveTenantMembershipForProfile({
      profileId: profile.id,
      email,
      env: this.#env,
    });
    const workspacePolicy = effectiveWorkspaceRoot
      ? await loadWorkspacePolicy({
          dbPath: substrateDbPath,
          workspaceRoot: effectiveWorkspaceRoot,
        })
      : null;
    const requestedActorId =
      typeof request.runContext?.actor?.id === "string" && request.runContext.actor.id.trim()
        ? request.runContext.actor.id.trim()
        : substrateIdentity.actorId;
    let runActor = await getSubstrateActor({
      actorId: requestedActorId,
      dbPath: substrateDbPath,
    });
    if ((!runActor || runActor.profile_id !== profile.id) && requestedActorId !== substrateIdentity.actorId) {
      runActor = await getSubstrateActor({
        actorId: substrateIdentity.actorId,
        dbPath: substrateDbPath,
      });
    }
    if (!runActor || runActor.profile_id !== profile.id) {
      throw new Error("Sense-1 could not resolve the requested actor for this profile.");
    }
    runActor = applyTenantMembershipToActor(runActor, tenant);

    const { modelRestrictions, orgPolicy, profileSettings, rolePolicy } = await resolveDesktopSettingsLayers({
      actor: runActor,
      dbPath: substrateDbPath,
      env: this.#env,
      profileId: profile.id,
      workspaceRoot: effectiveWorkspaceRoot,
    });
    const requestedRunSettings = normalizeDesktopSettingsLayer({
      model: request.model,
      personality: request.personality,
      reasoningEffort: request.reasoningEffort,
      serviceTier: request.serviceTier,
    });
    const resolvedSettings = resolveDesktopSettings({
      orgPolicy,
      platformDefaults: DESKTOP_DEFAULT_SETTINGS as unknown as Record<string, unknown>,
      profileSettings: {
        ...profileSettings,
        ...requestedRunSettings,
      },
      rolePolicy,
    });
    const blockedRunOverrideMessage = findBlockedDesktopSettingsOverride({
      normalizedPatch: requestedRunSettings,
      resolvedSettings: resolvedSettings.settings,
      sources: resolvedSettings.sources,
    });
    if (blockedRunOverrideMessage) {
      throw new Error(blockedRunOverrideMessage);
    }

    const runtimeSettingsValidation = validateDesktopResolvedSettings({
      settings: resolvedSettings.settings,
      supportedModels: await loadSupportedModels(this.#manager),
    });
    if (runtimeSettingsValidation.decision !== "allow") {
      throw new Error(runtimeSettingsValidation.reason);
    }

    const effectiveOperatingMode = workspacePolicy?.operating_mode ?? resolvedSettings.settings.defaultOperatingMode ?? "auto";
    const runContext = buildDesktopRunContext({
      actor: runActor,
      email,
      operatingMode: effectiveOperatingMode,
      profileId: profile.id,
      settings: resolvedSettings.settings,
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
      workspaceRoot: effectiveWorkspaceRoot,
    });
    if (!runContext) {
      throw new Error("Sense-1 could not resolve the desktop run context.");
    }

    const runPolicyOutcome = evaluateDesktopRunPolicy({
      actor: runActor,
      scope: { id: runContext.scope.id },
      workspaceRoot: effectiveWorkspaceRoot,
    });
    if (runPolicyOutcome.decision !== "allow") {
      await recordDesktopPolicyOutcome({
        dbPath: substrateDbPath,
        outcome: runPolicyOutcome,
        recordAuditEvent: (event) => {
          this.#recordAuditEvent(event);
        },
        runContext,
        threadId: request.threadId ?? null,
        workspaceRoot: effectiveWorkspaceRoot,
      });
      throw new Error(
        runPolicyOutcome.decision === "escalate"
          ? `${runPolicyOutcome.reason} Choose a more trusted actor or update policy before starting this run.`
          : runPolicyOutcome.reason,
      );
    }

    if (
      requestedRunSettings.model
      && modelRestrictions.allowedModels
      && !modelRestrictions.allowedModels.includes(requestedRunSettings.model)
    ) {
      throw new Error(
        `Sense-1 cannot use "${requestedRunSettings.model}" because workspace policy only allows ${modelRestrictions.allowedModels.join(", ")}.`,
      );
    }

    if (effectiveWorkspaceRoot && workspacePolicy?.read_granted !== 1) {
      return createPermissionRequiredResult({
        runContext,
        workspaceRoot: effectiveWorkspaceRoot,
      });
    }

    const resolvedModel = resolvedSettings.settings.model || DESKTOP_DEFAULT_SETTINGS.model;
    const resolvedEffort = resolvedSettings.settings.reasoningEffort || null;
    const resolvedPersonality = resolvedSettings.settings.personality || DESKTOP_DEFAULT_SETTINGS.personality;
    const baseRuntimeInstructions =
      typeof resolvedSettings.settings.runtimeInstructions === "string"
        ? resolvedSettings.settings.runtimeInstructions
        : DESKTOP_DEFAULT_SETTINGS.runtimeInstructions;

    let pendingSessionId: string | null = null;
    let existingSession = null;
    let effectiveCwd = effectiveWorkspaceRoot;
    if (request.threadId) {
      existingSession = await this.#workspaceService.resolveSubstrateSessionByThreadId(request.threadId);
    }
    if (!isFolderBound && request.threadId) {
      effectiveCwd = resolveSessionArtifactRoot(
        profileArtifactRoot,
        existingSession?.id ?? `thread-${request.threadId}`,
      );
    }
    if (!request.threadId) {
      const pendingSession = await createSubstrateSessionShell({
        actorId: runContext.actor.id,
        artifactRoot: null,
        dbPath: substrateDbPath,
        effort: resolvedEffort,
        initialPrompt: request.prompt,
        model: resolvedModel,
        profileId: profile.id,
        scopeId: runContext.scope.id,
        title: promptSummary(request.prompt),
        workspaceRoot: effectiveWorkspaceRoot,
      });
      pendingSessionId = pendingSession.sessionId;
      if (!isFolderBound) {
        effectiveCwd = resolveSessionArtifactRoot(profileArtifactRoot, pendingSessionId);
      }
    }
    if (!effectiveCwd) {
      throw new Error("Sense-1 could not resolve where this run should write local files.");
    }
    await fs.mkdir(effectiveCwd, { recursive: true });

    const attachmentSessionId = pendingSessionId ?? existingSession?.id ?? (request.threadId ? `thread-${request.threadId}` : null);
    const attachmentArtifactRoot = attachmentSessionId
      ? resolveSessionArtifactRoot(profileArtifactRoot, attachmentSessionId)
      : effectiveCwd;

    let runtimeRunContext = runContext;
    let result: DesktopStartedTaskRunResult;
    try {
      const normalizedAttachments = await normalizeAttachmentPaths({
        attachments: request.attachments,
        sessionArtifactRoot: attachmentArtifactRoot,
        workspaceRoot: effectiveWorkspaceRoot,
      });
      let inputItems: DesktopAppServerInputItem[] = [];
      if (extractPromptShortcutTokens(request.prompt).length > 0) {
        try {
          inputItems = resolvePromptShortcutInputItems(
            request.prompt,
            await this.#desktopExtensions.getOverview(),
          );
        } catch (error) {
          console.warn(
            "[desktop:shortcut-resolution] Failed to resolve prompt shortcuts; continuing without mention enrichment.",
            error instanceof Error ? error.message : String(error),
          );
        }
      }
      const skillApprovalKeys = await collectSkillApprovalKeys(inputItems);
      const profileCodexHomeShortcutNames = resolveProfileCodexHomeShortcutNames(inputItems);
      const profileCodexHome = resolveProfileCodexHome(profile.id, this.#env);
      if (profileCodexHomeShortcutNames.size > 0) {
        runtimeRunContext = withAdditionalWritableRoots(runContext, [profileCodexHome]);
      }
      const resolvedRuntimeInstructions = mergeRuntimeInstructions(
        mergeRuntimeInstructions(
          baseRuntimeInstructions,
          await buildRuntimeContinuityInstruction({
            artifactRoot: profileArtifactRoot,
            currentSessionId: existingSession?.id ?? pendingSessionId,
            dbPath: substrateDbPath,
            profileId: profile.id,
            workspaceRoot: effectiveWorkspaceRoot,
          }),
        ),
        buildProfileExtensionRuntimeInstruction({
          inputItems,
          profileCodexHome,
          shortcutNames: profileCodexHomeShortcutNames,
        }),
      );
      result = await executeDesktopTask(this.#manager, {
        ...request,
        attachments: normalizedAttachments.length > 0 ? normalizedAttachments : undefined,
        contextPaths: workspacePolicy?.context_paths ?? [],
        cwd: effectiveCwd,
        inputItems: inputItems.length > 0 ? inputItems : undefined,
        model: resolvedModel,
        onThreadReady: async (threadId) => {
          this.#approvals.rememberThreadSkillApprovals(threadId, skillApprovalKeys);
        },
        personality: resolvedPersonality,
        reasoningEffort: resolvedEffort ?? undefined,
        serviceTier: resolvedSettings.settings.serviceTier === "fast" ? "fast" : "flex",
        runtimeInstructions: resolvedRuntimeInstructions,
        settings: resolvedSettings.settings as unknown as Record<string, unknown>,
        workspaceRoot: effectiveWorkspaceRoot,
        runContext: runtimeRunContext,
      });
    } catch (error) {
      if (pendingSessionId) {
        await deleteSubstrateSession({
          dbPath: substrateDbPath,
          sessionId: pendingSessionId,
        });
      }
      throw error;
    }

    const substrateSession = pendingSessionId
      ? await finalizeSubstrateSessionStart({
          actorId: runContext.actor.id,
          artifactRoot: isFolderBound ? null : effectiveCwd,
          codexThreadId: result.threadId,
          dbPath: substrateDbPath,
          effort: resolvedEffort,
          initialPrompt: request.prompt,
          model: resolvedModel,
          profileId: profile.id,
          scopeId: runContext.scope.id,
          sessionId: pendingSessionId,
          threadTitle: result.thread.title,
          turnId: result.turnId ?? null,
          workspaceRoot: effectiveWorkspaceRoot,
        })
      : await ensureSubstrateSessionForThread({
          actorId: runContext.actor.id,
          artifactRoot: isFolderBound ? null : effectiveCwd,
          codexThreadId: result.threadId,
          dbPath: substrateDbPath,
          effort: resolvedEffort,
          model: resolvedModel,
          profileId: profile.id,
          scopeId: runContext.scope.id,
          threadTitle: result.thread.title,
          turnId: result.turnId ?? null,
          workspaceRoot: effectiveWorkspaceRoot,
        });

    if (substrateSession?.sessionId) {
      try {
        const sessionRecord = await querySession({
          dbPath: substrateDbPath,
          sessionId: substrateSession.sessionId,
        });
        await writeSessionRecord({
          artifactRoot: profileArtifactRoot,
          intent: request.prompt,
          logCursor: {
            from_ts: sessionRecord?.started_at ?? new Date().toISOString(),
          },
          sessionId: substrateSession.sessionId,
          startedAt: sessionRecord?.started_at ?? new Date().toISOString(),
          workspaceRoot: effectiveWorkspaceRoot,
        });
      } catch {
        // Non-fatal — substrate remains the canonical session store.
      }
    }

    this.#setRunContextByThreadId(result.threadId, result.runContext ?? runtimeRunContext ?? runContext ?? null);
    await recordDesktopPolicyOutcome({
      dbPath: substrateDbPath,
      outcome: runPolicyOutcome,
      recordAuditEvent: (event) => {
        this.#recordAuditEvent(event);
      },
      runContext: result.runContext ?? runtimeRunContext ?? runContext ?? null,
      sessionId: substrateSession?.sessionId ?? null,
      threadId: result.threadId,
      workspaceRoot: effectiveWorkspaceRoot,
    });
    this.#recordAuditEvent({
      eventType: "run.started",
      runContext: result.runContext ?? runtimeRunContext ?? runContext ?? null,
      threadId: result.threadId,
      turnId: result.turnId,
      details: {
        executionIntent: executionIntent.kind,
        executionIntentReason: executionIntent.reason,
        executionIntentRule: executionIntent.matchedRule,
        model: resolvedModel,
        workspaceRoot: result.workspaceRoot,
      },
    });
    if (effectiveWorkspaceRoot) {
      await this.#workspaceService.rememberThreadWorkspaceRoot({
        threadId: result.threadId,
        workspaceRoot: effectiveWorkspaceRoot,
      });
    }
    await this.#rememberLastSelectedThread({ threadId: result.threadId });
    if (substrateSession?.sessionId) {
      this.#setRunContextByThreadId(result.threadId, result.runContext ?? runtimeRunContext ?? runContext ?? null);
    }
    await this.#substrateSync.flushDeferredMessages(result.threadId, substrateDbPath);
    await this.#workspaceService.rememberThreadInteractionState(
      result.threadId,
      result.thread.interactionState,
    );

    return result;
  }

}
