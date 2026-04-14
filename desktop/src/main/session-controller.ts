import fs from "node:fs/promises";
import path from "node:path";

import type { AppServerProcessManager } from "./runtime/app-server-process-manager.js";
import { launchDesktopChatgptSignIn, logoutDesktopChatgpt } from "./auth/desktop-auth.ts";
import {
  getDesktopBootstrap,
  selectDesktopProfile,
} from "./bootstrap/desktop-bootstrap.js";
import { resolveSignedInDesktopProfile } from "./bootstrap/bootstrap-profile.js";
import {
  DEFAULT_DESKTOP_SETTINGS,
  applyDesktopSettingsPatch,
  resolveDesktopSettings as resolveStoredDesktopSettings,
  type DesktopSettingsPatch,
} from "./settings/desktop-settings.js";
import type {
  DesktopAppRemoveRequest,
  DesktopAppInstallRequest,
  DesktopAppEnabledRequest,
  DesktopAutomationDeleteRequest,
  DesktopAutomationDetailResult,
  DesktopAutomationListResult,
  DesktopAutomationRunNowRequest,
  DesktopAutomationSaveRequest,
  DesktopAuditEvent,
  DesktopApprovalResponseRequest,
  DesktopBootstrap,
  DesktopExtensionOverviewRequest,
  DesktopExtensionOverviewResult,
  DesktopInputResponseRequest,
  DesktopInterruptTurnRequest,
  DesktopLastSelectedThreadRequest,
  DesktopMcpServerEnabledRequest,
  DesktopRuntimeEvent,
  DesktopRunContext,
  DesktopPolicyRulesResult,
  DesktopPluginEnabledRequest,
  DesktopPluginInstallRequest,
  DesktopPluginUninstallRequest,
  DesktopTaskRunRequest,
  DesktopTaskRunResult,
  DesktopSkillEnabledRequest,
  DesktopSkillUninstallRequest,
  DesktopThreadArchiveRequest,
  DesktopThreadDeleteRequest,
  DesktopThreadReadResult,
  DesktopThreadRenameRequest,
  DesktopThreadRestoreRequest,
  DesktopTeamStateResult,
  DesktopCreateFirstTeamRequest,
  DesktopSaveTeamMemberRequest,
  DesktopVoiceAppendAudioRequest,
  DesktopVoiceStartRequest,
  DesktopVoiceStopRequest,
  DesktopWorkspaceArchiveRequest,
  DesktopWorkspaceDeleteRequest,
  DesktopWorkspacePermissionGrantRequest,
  DesktopThreadWorkspaceRootRequest,
  DesktopWorkspaceHydrateResult,
  DesktopWorkspacePolicyResult,
  DesktopWorkspaceRestoreRequest,
  DesktopWorkspaceOperatingModeRequest,
  LaunchChatgptSignInResult,
  SelectDesktopProfileResult,
  RuntimeInfo,
  DesktopSettings,
  DesktopSettingsResult,
  DesktopWorkspaceSidebarOrderRequest,
  SubstrateEventsResult,
  SubstrateObjectRefsResult,
  SubstrateSessionDetailResult,
  SubstrateSessionsResult,
  SubstrateWorkspaceDetailResult,
  SubstrateWorkspacesResult,
  ProjectedWorkspacesResult,
  ProjectedWorkspaceDetailResult,
  ProjectedSessionsResult,
  DesktopModelListResult,
} from "./contracts";
import {
  DesktopApprovalService,
} from "./session/desktop-approval-service.ts";
import { respondToDesktopInputRequest } from "./session/input-request-service.ts";
import { appendApprovalEventRecord } from "./session/approval-event-recorder.ts";
import { DesktopRunStartService } from "./session/desktop-run-start-service.ts";
import { SessionSubstrateSync } from "./session/session-substrate-sync.ts";
import { ThreadReviewService } from "./session/thread-review-service.ts";
import { ThreadTurnControlService } from "./session/thread-turn-control-service.ts";
import { firstString } from "./session/session-controller-support.ts";
import {
  appendAuditEvent,
  handleRuntimeEvent,
  handleRuntimeMessage,
  restoreWorkspacePermissionModes,
} from "./session/session-controller-runtime-hooks.ts";
import { DesktopWorkspaceStateService } from "./workspace/workspace-state-service.ts";
import { DesktopWorkspaceService } from "./workspace/desktop-workspace-service.ts";
import { DesktopSettingsService } from "./settings/desktop-settings-service.ts";
import { DesktopExtensionService } from "./settings/desktop-extension-service.ts";
import { DesktopQueryService } from "./substrate/desktop-query-service.ts";
import { DesktopAutomationService } from "./automation/desktop-automation-service.ts";
import { DesktopTenantService } from "./tenant/desktop-tenant-service.ts";
import { updateSubstrateSessionThreadTitle } from "./substrate/substrate.js";
import {
  loadDesktopSettings,
  persistDesktopSettings,
  resolveProfileCodexHome,
  resolveProfileSubstrateDbPath,
} from "./profile/profile-state.js";
import {
  type DesktopVoiceClient,
  DesktopRealtimeTranscriptionClient,
} from "./voice/desktop-realtime-transcription-client.ts";

export type DesktopSessionControllerOptions = {
  readonly appStartedAt: string;
  readonly desktopVoiceClient?: DesktopVoiceClient;
  readonly env?: NodeJS.ProcessEnv;
  readonly openExternal: (url: string) => Promise<void>;
  readonly onDesktopRunStarted?: (result: DesktopTaskRunResult) => void | Promise<void>;
  readonly onDesktopTaskResult?: (result: DesktopTaskRunResult) => void | Promise<void>;
  readonly onThreadTitleChanged?: (threadId: string, title: string) => void | Promise<void>;
  readonly onRuntimeEvent?: (event: DesktopRuntimeEvent) => void | Promise<void>;
  readonly runtimeInfo: RuntimeInfo;
};

async function resolveDesktopRealtimeAccessToken(codexHome: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  const explicitRealtimeToken = firstString(env.SENSE1_REALTIME_OPENAI_API_KEY);
  if (explicitRealtimeToken) {
    return explicitRealtimeToken;
  }

  const authPath = path.join(codexHome, "auth.json");
  try {
    const parsed = JSON.parse(await fs.readFile(authPath, "utf8"));
    const authMode = firstString(parsed?.auth_mode);
    const accessToken = firstString(parsed?.tokens?.access_token);
    if (authMode !== "chatgpt" || !accessToken) {
      return null;
    }

    return accessToken;
  } catch {
    return null;
  }
}

export class DesktopSessionController {
  static readonly DEFAULT_SETTINGS: DesktopSettings = {
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

  readonly #manager: AppServerProcessManager;
  readonly #appStartedAt: string;
  readonly #env: NodeJS.ProcessEnv;
  readonly #openExternal: (url: string) => Promise<void>;
  readonly #onDesktopRunStarted: ((result: DesktopTaskRunResult) => void | Promise<void>) | null;
  readonly #onDesktopTaskResult: ((result: DesktopTaskRunResult) => void | Promise<void>) | null;
  readonly #onThreadTitleChanged: ((threadId: string, title: string) => void | Promise<void>) | null;
  readonly #runtimeInfo: RuntimeInfo;
  readonly #workspaceState: DesktopWorkspaceStateService;
  readonly #workspaceService: DesktopWorkspaceService;
  readonly #desktopQueries: DesktopQueryService;
  readonly #desktopSettings: DesktopSettingsService;
  readonly #desktopExtensions: DesktopExtensionService;
  readonly #desktopTenant: DesktopTenantService;
  readonly #desktopAutomations: DesktopAutomationService;
  readonly #approvals: DesktopApprovalService;
  readonly #auditEvents: DesktopAuditEvent[] = [];
  readonly #runContextByThreadId = new Map<string, DesktopRunContext | null>();
  readonly #pendingExplicitThreadTitles = new Map<string, string>();
  readonly #selectedThreadIdByProfile = new Map<string, string | null>();
  readonly #runtimeArchivedThreadIds = new Set<string>();
  readonly #substrateSync: SessionSubstrateSync;
  readonly #threadReview: ThreadReviewService;
  readonly #turnControl: ThreadTurnControlService;
  readonly #runStart: DesktopRunStartService;
  readonly #desktopVoice: DesktopVoiceClient;
  readonly #resolveProfile: () => Promise<{ id: string }>;
  readonly #onRuntimeEvent: ((event: DesktopRuntimeEvent) => void | Promise<void>) | null;
  #nextAuditEventId = 1;
  #resolvedProfilePromise: Promise<{ id: string }> | null = null;
  #workspacePermissionRestoreReady: Promise<void>;

  constructor(manager: AppServerProcessManager, options: DesktopSessionControllerOptions) {
    this.#manager = manager;
    this.#appStartedAt = options.appStartedAt;
    this.#env = options.env ?? process.env;
    this.#openExternal = options.openExternal;
    this.#resolveProfile = async () => await this.#resolveCurrentProfile();
    this.#onRuntimeEvent = options.onRuntimeEvent ?? null;
    this.#onDesktopRunStarted = options.onDesktopRunStarted ?? null;
    this.#onDesktopTaskResult = options.onDesktopTaskResult ?? null;
    this.#onThreadTitleChanged = options.onThreadTitleChanged ?? null;
    this.#runtimeInfo = options.runtimeInfo;
    this.#workspaceState = new DesktopWorkspaceStateService({
      env: this.#env,
      resolveProfile: this.#resolveProfile,
    });
    this.#workspaceService = new DesktopWorkspaceService({
      env: this.#env,
      manager: this.#manager,
      resolveProfile: this.#resolveProfile,
      workspaceState: this.#workspaceState,
    });
    this.#desktopQueries = new DesktopQueryService({
      env: this.#env,
      resolveProfile: this.#resolveProfile,
    });
    this.#desktopSettings = new DesktopSettingsService({
      env: this.#env,
      manager: this.#manager,
      recordAuditEvent: (input) => {
        this.#recordAuditEvent(input);
      },
      resolveProfile: this.#resolveProfile,
      resolveSignedInEmail: async (profileId) => await this.#runStart.resolveSignedInEmail(profileId),
    });
    this.#desktopExtensions = new DesktopExtensionService({
      env: this.#env,
      manager: this.#manager,
      openExternal: this.#openExternal,
      resolveProfile: this.#resolveProfile,
    });
    this.#desktopTenant = new DesktopTenantService({
      env: this.#env,
      resolveProfile: this.#resolveProfile,
      resolveSignedInEmail: async (profileId) => await this.#runStart.resolveSignedInEmail(profileId),
    });
    this.#desktopAutomations = new DesktopAutomationService({
      env: this.#env,
      resolveProfile: this.#resolveProfile,
    });
    this.#substrateSync = new SessionSubstrateSync({
      env: this.#env,
      onThreadTitleSuggested: async (threadId, title) => {
        await this.#applySuggestedThreadTitle(threadId, title);
      },
      resolveProfile: this.#resolveProfile,
      resolveSessionContextByThreadId: async (threadId) =>
        await this.#workspaceService.resolveSubstrateSessionByThreadId(threadId),
    });
    this.#threadReview = new ThreadReviewService({
      env: this.#env,
      manager: this.#manager,
      resolveProfile: this.#resolveProfile,
      workspaceState: this.#workspaceState,
      workspaceService: this.#workspaceService,
    });
    this.#turnControl = new ThreadTurnControlService(this.#manager);
    this.#approvals = new DesktopApprovalService({
      appendApprovalEvent: async (input) => {
        await appendApprovalEventRecord({
          ...input,
          env: this.#env,
          resolveProfile: this.#resolveProfile,
        });
      },
      loadPersistedApprovals: async () => await this.#workspaceState.loadPendingApprovals(),
      loadTrustedSkillApprovals: async () => {
        const profile = await this.#resolveProfile();
        const settings = resolveStoredDesktopSettings(
          await loadDesktopSettings(profile.id, this.#env) as unknown as Record<string, unknown>,
        );
        return settings.trustedSkillApprovals;
      },
      persistPendingApprovals: async (approvals) =>
        await this.#workspaceState.persistPendingApprovals(approvals),
      persistTrustedSkillApprovals: async (approvals) => {
        const profile = await this.#resolveProfile();
        const saved = await loadDesktopSettings(profile.id, this.#env);
        const nextTrustedSettings = applyDesktopSettingsPatch(
          saved as unknown as Record<string, unknown>,
          {
            trustedSkillApprovals: approvals,
          },
        ) as unknown as Parameters<typeof persistDesktopSettings>[1];
        await persistDesktopSettings(
          profile.id,
          nextTrustedSettings,
          this.#env,
        );
      },
      queueApprovalEvent: (input) => {
        this.#substrateSync.enqueueWrite(async () => {
          await appendApprovalEventRecord({
            ...input,
            env: this.#env,
            resolveProfile: this.#resolveProfile,
          });
        });
      },
      recordAuditEvent: (input) => {
        this.#recordAuditEvent(input);
      },
      rememberThreadInteractionState: async (threadId, interactionState) =>
        await this.#workspaceService.rememberThreadInteractionState(threadId, interactionState),
      respondRuntimeApproval: (requestId, approval, decision) => {
        if (approval?.kind === "permissions" || approval?.kind === "network") {
          this.#manager.respond(
            requestId,
            decision === "accept" || decision === "acceptForSession"
              ? {
                  permissions: approval.permissions ?? {},
                  scope: decision === "acceptForSession" ? "session" : "turn",
                }
              : {
                  permissions: {},
                  scope: "turn",
                },
          );
          return;
        }

        this.#manager.respond(requestId, decision);
      },
    });
    this.#runStart = new DesktopRunStartService({
      approvals: this.#approvals,
      desktopExtensions: this.#desktopExtensions,
      env: this.#env,
      manager: this.#manager,
      onDesktopRunStarted: this.#onDesktopRunStarted,
      onDesktopTaskResult: this.#onDesktopTaskResult,
      recordAuditEvent: (input) => {
        this.#recordAuditEvent(input);
      },
      resolveProfile: this.#resolveProfile,
      rememberLastSelectedThread: async (request) => await this.rememberLastSelectedThread(request),
      setRunContextByThreadId: (threadId, runContext) => {
        this.#runContextByThreadId.set(threadId, runContext);
      },
      substrateSync: this.#substrateSync,
      waitUntilWorkspacePermissionsRestored: async () => await this.#workspacePermissionRestoreReady,
      workspaceService: this.#workspaceService,
    });
    this.#desktopVoice = options.desktopVoiceClient ?? new DesktopRealtimeTranscriptionClient({
      emitEvent: async (event) => {
        this.ingestRuntimeEvent(event);
        await this.#onRuntimeEvent?.(event);
      },
      resolveAccessToken: async () => {
        const profile = await this.#resolveProfile();
        const codexHome = resolveProfileCodexHome(profile.id, this.#env);
        return await resolveDesktopRealtimeAccessToken(codexHome, this.#env);
      },
    });
    this.#workspacePermissionRestoreReady = this.#restoreWorkspacePermissionModes();
  }

  async #resolveCurrentProfile(): Promise<{ id: string }> {
    if (!this.#resolvedProfilePromise) {
      this.#resolvedProfilePromise = resolveSignedInDesktopProfile(this.#manager, this.#env).catch((error: unknown) => {
        this.#resolvedProfilePromise = null;
        throw error;
      });
    }

    const resolvedProfilePromise = this.#resolvedProfilePromise;
    if (!resolvedProfilePromise) {
      throw new Error("Sense-1 could not resolve the current desktop profile.");
    }

    return await resolvedProfilePromise;
  }

  #invalidateResolvedProfile(): void {
    this.#resolvedProfilePromise = null;
  }

  async #restoreWorkspacePermissionModes(): Promise<void> {
    await restoreWorkspacePermissionModes(this.#env, this.#resolveProfile);
  }

  #recordAuditEvent({
    details,
    eventType,
    runContext,
    threadId = null,
    turnId = null,
  }: {
    details?: Record<string, unknown>;
    eventType: DesktopAuditEvent["eventType"];
    runContext: DesktopRunContext | null;
    threadId?: string | null;
    turnId?: string | null;
  }): void {
    this.#nextAuditEventId = appendAuditEvent({
      auditEvents: this.#auditEvents,
      details,
      eventType,
      nextAuditEventId: this.#nextAuditEventId,
      runContext,
      threadId,
      turnId,
    });
  }

  async #applySuggestedThreadTitle(threadId: string, title: string): Promise<void> {
    const resolvedThreadId = firstString(threadId);
    const resolvedTitle = firstString(title);
    if (!resolvedThreadId || !resolvedTitle) {
      return;
    }

    if (this.#pendingExplicitThreadTitles.has(resolvedThreadId)) {
      return;
    }

    await this.#manager.request("thread/name/set", {
      threadId: resolvedThreadId,
      name: resolvedTitle,
    });
    if (this.#onThreadTitleChanged) {
      await this.#onThreadTitleChanged(resolvedThreadId, resolvedTitle);
    }
  }

  ingestRuntimeEvent(event: DesktopRuntimeEvent): void {
    handleRuntimeEvent({
      approvals: this.#approvals,
      event,
      recordAuditEvent: (input) => {
        this.#recordAuditEvent(input);
      },
      runContextByThreadId: this.#runContextByThreadId,
    });
  }

  ingestRuntimeMessage(message: unknown): void {
    const method = firstString((message as { method?: unknown } | null)?.method);
    const params = typeof message === "object" && message !== null
      ? (message as { params?: { threadId?: unknown; name?: unknown } | null }).params
      : null;
    const runtimeThreadId = firstString(params?.threadId);
    if (method === "thread/name/updated" && runtimeThreadId) {
      const pendingTitle = this.#pendingExplicitThreadTitles.get(runtimeThreadId);
      const updatedTitle = firstString(params?.name);
      if (!pendingTitle || (updatedTitle && pendingTitle === updatedTitle)) {
        this.#pendingExplicitThreadTitles.delete(runtimeThreadId);
      }
    }

    handleRuntimeMessage({
      env: this.#env,
      message,
      resolveProfile: this.#resolveProfile,
      substrateSync: this.#substrateSync,
      workspaceService: this.#workspaceService,
    });
  }

  async getBootstrap(): Promise<DesktopBootstrap> {
    await this.#approvals.waitUntilRestored();
    return await getDesktopBootstrap(this.#manager, {
      appStartedAt: this.#appStartedAt,
      env: this.#env,
      runtimeInfo: this.#runtimeInfo,
      auditEvents: this.#auditEvents,
      pendingApprovals: this.#approvals.listPendingApprovals(),
      selectedThreadIdByProfile: Object.fromEntries(this.#selectedThreadIdByProfile),
    });
  }

  async launchChatgptSignIn(): Promise<LaunchChatgptSignInResult> {
    const result = await launchDesktopChatgptSignIn(this.#manager, {
      appStartedAt: this.#appStartedAt,
      env: this.#env,
      runtimeInfo: this.#runtimeInfo,
      openExternal: this.#openExternal,
    });
    this.#invalidateResolvedProfile();
    return result;
  }

  async logoutChatgpt() {
    await this.#desktopVoice.dispose();
    const result = await logoutDesktopChatgpt(this.#manager, {
      env: this.#env,
    });
    this.#invalidateResolvedProfile();
    return result;
  }

  async rememberLastSelectedThread({ threadId }: DesktopLastSelectedThreadRequest): Promise<void> {
    const profileId = await this.#workspaceService.rememberLastSelectedThread({ threadId });
    this.#selectedThreadIdByProfile.set(profileId, threadId);
  }

  async renameDesktopThread({ threadId, title }: DesktopThreadRenameRequest): Promise<void> {
    const resolvedThreadId = firstString(threadId);
    const resolvedTitle = firstString(title);
    if (resolvedThreadId && resolvedTitle) {
      this.#pendingExplicitThreadTitles.set(resolvedThreadId, resolvedTitle);
    }

    try {
      await this.#workspaceService.renameDesktopThread({ threadId, title });
      const profile = await this.#resolveProfile();
      const session = resolvedThreadId
        ? await this.#workspaceService.resolveSubstrateSessionByThreadId(resolvedThreadId)
        : null;
      if (session?.codex_thread_id && session.title !== resolvedTitle) {
        await updateSubstrateSessionThreadTitle({
          codexThreadId: session.codex_thread_id,
          dbPath: session.profile_id
            ? resolveProfileSubstrateDbPath(session.profile_id, this.#env)
            : resolveProfileSubstrateDbPath(profile.id, this.#env),
          title: resolvedTitle,
        });
      }
    } catch (error) {
      if (resolvedThreadId && this.#pendingExplicitThreadTitles.get(resolvedThreadId) === resolvedTitle) {
        this.#pendingExplicitThreadTitles.delete(resolvedThreadId);
      }
      throw error;
    }
  }

  async archiveDesktopThread({ threadId }: DesktopThreadArchiveRequest): Promise<void> {
    await this.#substrateSync.waitForIdle();
    await this.#workspaceService.archiveDesktopThread({ threadId });
  }

  async restoreDesktopThread({ threadId }: DesktopThreadRestoreRequest): Promise<void> {
    await this.#workspaceService.restoreDesktopThread({ threadId });
  }

  async deleteDesktopThread({ threadId }: DesktopThreadDeleteRequest): Promise<void> {
    await this.#workspaceService.deleteDesktopThread({ threadId });
  }

  async rememberThreadWorkspaceRoot({
    threadId,
    workspaceRoot,
  }: DesktopThreadWorkspaceRootRequest): Promise<void> {
    await this.#workspaceService.rememberThreadWorkspaceRoot({ threadId, workspaceRoot });
  }

  async rememberWorkspaceSidebarOrder({
    rootPaths,
  }: DesktopWorkspaceSidebarOrderRequest): Promise<void> {
    await this.#workspaceService.rememberWorkspaceSidebarOrder({ rootPaths });
  }

  async archiveWorkspace({ workspaceId }: DesktopWorkspaceArchiveRequest): Promise<void> {
    await this.#workspaceService.archiveWorkspace({ workspaceId });
  }

  async restoreWorkspace({ workspaceId }: DesktopWorkspaceRestoreRequest): Promise<void> {
    await this.#workspaceService.restoreWorkspace({ workspaceId });
  }

  async deleteWorkspace({ workspaceId }: DesktopWorkspaceDeleteRequest): Promise<void> {
    await this.#workspaceService.deleteWorkspace({ workspaceId });
  }

  async readDesktopThread(threadId: string): Promise<DesktopThreadReadResult> {
    return await this.#threadReview.readDesktopThread(threadId);
  }

  getThreadRunContext(threadId: string | null | undefined): DesktopRunContext | null {
    const resolvedThreadId = threadId?.trim();
    if (!resolvedThreadId) {
      return null;
    }

    return this.#runContextByThreadId.get(resolvedThreadId) ?? null;
  }

  async runDesktopTask(request: DesktopTaskRunRequest): Promise<DesktopTaskRunResult> {
    return await this.#runStart.runDesktopTask(request);
  }

  async interruptTurn({ threadId, turnId }: DesktopInterruptTurnRequest): Promise<void> {
    await this.#turnControl.interruptTurn({ threadId, turnId });
  }

  async steerTurn(threadId: string, input: string): Promise<void> {
    await this.#turnControl.steerTurn(threadId, input);
  }

  async respondToDesktopApproval({
    decision,
    requestId,
  }: DesktopApprovalResponseRequest): Promise<void> {
    await this.#approvals.respondToApproval({ decision, requestId });
  }

  async respondToInputRequest({ requestId, text }: DesktopInputResponseRequest): Promise<void> {
    await respondToDesktopInputRequest({
      env: this.#env,
      manager: this.#manager,
      resolveProfile: this.#resolveProfile,
      request: {
        requestId,
        text,
      },
    });
  }

  async startDesktopVoice({
    outputModality,
    prompt,
    sessionId,
    threadId,
    transport,
  }: DesktopVoiceStartRequest): Promise<void> {
    const resolvedThreadId = firstString(threadId);
    if (!resolvedThreadId) {
      throw new Error("Choose a thread before starting voice input.");
    }

    const request: {
      threadId: string;
      outputModality: "text" | "audio";
      prompt?: string;
      sessionId?: string;
      transport?: {
        type: "websocket";
      } | {
        type: "webrtc";
        sdp: string;
      };
    } = {
      outputModality: outputModality === "audio" ? "audio" : "text",
      threadId: resolvedThreadId,
    };
    if (typeof prompt === "string") {
      request.prompt = prompt;
    }
    const resolvedSessionId = firstString(sessionId);
    const resolvedTransport =
      transport?.type === "webrtc"
        ? {
            type: "webrtc" as const,
            sdp: firstString(transport.sdp) ?? "",
          }
        : transport?.type === "websocket"
          ? {
              type: "websocket" as const,
            }
          : null;
    if (resolvedSessionId) {
      request.sessionId = resolvedSessionId;
    }
    if (resolvedTransport) {
      if (resolvedTransport.type === "webrtc" && !resolvedTransport.sdp) {
        throw new Error("Desktop voice start requires a WebRTC SDP offer.");
      }
      request.transport = resolvedTransport;
    }

    if (request.outputModality === "text" && !request.transport) {
      await this.#desktopVoice.start({
        prompt,
        threadId: resolvedThreadId,
      });
      return;
    }

    try {
      await this.#manager.request("thread/realtime/start", request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/\bthread not found\b|\bno rollout found for thread id\b/i.test(message)) {
        throw error;
      }

      await this.#resumeVoiceThread(resolvedThreadId);
      await this.#manager.request("thread/realtime/start", request);
    }
  }

  async #resumeVoiceThread(threadId: string): Promise<void> {
    await this.#manager.request("thread/resume", {
      threadId,
    });
  }

  async appendDesktopVoiceAudio({
    audio,
    threadId,
  }: DesktopVoiceAppendAudioRequest): Promise<void> {
    const resolvedThreadId = firstString(threadId);
    const resolvedAudioData = firstString(audio?.data);
    if (!resolvedThreadId) {
      throw new Error("Choose a thread before sending voice audio.");
    }
    if (!resolvedAudioData) {
      throw new Error("Voice audio chunk was empty.");
    }

    const sampleRate = Number(audio?.sampleRate);
    const numChannels = Number(audio?.numChannels);
    const samplesPerChannel = audio?.samplesPerChannel == null ? null : Number(audio.samplesPerChannel);
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new Error("Voice audio sample rate must be greater than zero.");
    }
    if (!Number.isFinite(numChannels) || numChannels <= 0) {
      throw new Error("Voice audio channel count must be greater than zero.");
    }
    if (samplesPerChannel !== null && (!Number.isFinite(samplesPerChannel) || samplesPerChannel <= 0)) {
      throw new Error("Voice audio sample count must be greater than zero.");
    }

    if (this.#desktopVoice.hasSession(resolvedThreadId)) {
      await this.#desktopVoice.appendAudio({
        audio: {
          data: resolvedAudioData,
          itemId: firstString(audio?.itemId),
          numChannels,
          sampleRate,
          samplesPerChannel,
        },
        threadId: resolvedThreadId,
      });
      return;
    }

    await this.#manager.request("thread/realtime/appendAudio", {
      threadId: resolvedThreadId,
      audio: {
        data: resolvedAudioData,
        itemId: firstString(audio?.itemId),
        numChannels,
        sampleRate,
        samplesPerChannel,
      },
    });
  }

  async stopDesktopVoice({ threadId }: DesktopVoiceStopRequest): Promise<void> {
    const resolvedThreadId = firstString(threadId);
    if (!resolvedThreadId) {
      throw new Error("Choose a thread before stopping voice input.");
    }

    if (this.#desktopVoice.hasSession(resolvedThreadId)) {
      await this.#desktopVoice.stop({
        threadId: resolvedThreadId,
      });
      return;
    }

    await this.#manager.request("thread/realtime/stop", {
      threadId: resolvedThreadId,
    });
  }

  async selectDesktopProfile(profileId: string): Promise<SelectDesktopProfileResult> {
    const selected = await selectDesktopProfile(profileId, this.#env);
    if (!selected.success) {
      return selected;
    }

    this.#invalidateResolvedProfile();
    this.#approvals.resetForProfileChange();
    this.#auditEvents.length = 0;
    this.#runContextByThreadId.clear();
    this.#substrateSync.clearDeferredMessages();
    this.#nextAuditEventId = 1;
    await this.#desktopVoice.dispose();
    await this.#manager.handleProfileChange(selected.profile.codexHome);
    this.#workspacePermissionRestoreReady = this.#restoreWorkspacePermissionModes();
    return {
      success: true,
      bootstrap: await this.getBootstrap(),
    };
  }

  async rememberWorkspaceFolder(folderPath: string): Promise<void> {
    await this.#workspacePermissionRestoreReady;
    await this.#workspaceService.rememberWorkspaceFolder(folderPath);
  }

  async getWorkspacePolicy(rootPath: string): Promise<DesktopWorkspacePolicyResult> {
    await this.#workspacePermissionRestoreReady;
    return await this.#workspaceService.getWorkspacePolicy(rootPath);
  }

  async grantWorkspacePermission({
    mode,
    rootPath,
  }: DesktopWorkspacePermissionGrantRequest): Promise<DesktopWorkspacePolicyResult> {
    await this.#workspacePermissionRestoreReady;
    return await this.#workspaceService.grantWorkspacePermission({ mode, rootPath });
  }

  async setWorkspaceOperatingMode({
    mode,
    rootPath,
  }: DesktopWorkspaceOperatingModeRequest): Promise<DesktopWorkspacePolicyResult> {
    await this.#workspacePermissionRestoreReady;
    return await this.#workspaceService.setWorkspaceOperatingMode({ mode, rootPath });
  }

  async hydrateWorkspace(rootPath: string): Promise<DesktopWorkspaceHydrateResult> {
    await this.#workspacePermissionRestoreReady;
    return await this.#workspaceService.hydrateWorkspace(rootPath);
  }

  async getDesktopSettings(): Promise<DesktopSettingsResult> {
    return await this.#desktopSettings.getDesktopSettings();
  }

  async getDesktopPolicyRules(): Promise<DesktopPolicyRulesResult> {
    return await this.#desktopSettings.getDesktopPolicyRules();
  }

  async updateDesktopSettings(partial: DesktopSettingsPatch): Promise<DesktopSettingsResult> {
    return await this.#desktopSettings.updateDesktopSettings(partial);
  }

  async getDesktopExtensionOverview(
    request: DesktopExtensionOverviewRequest = {},
  ): Promise<DesktopExtensionOverviewResult> {
    return await this.#desktopExtensions.getOverview(request);
  }

  async installDesktopPlugin(
    request: DesktopPluginInstallRequest,
  ): Promise<DesktopExtensionOverviewResult> {
    return await this.#desktopExtensions.installPlugin(request);
  }

  async uninstallDesktopPlugin(
    request: DesktopPluginUninstallRequest,
  ): Promise<DesktopExtensionOverviewResult> {
    return await this.#desktopExtensions.uninstallPlugin(request);
  }

  async setDesktopPluginEnabled(
    request: DesktopPluginEnabledRequest,
  ): Promise<DesktopExtensionOverviewResult> {
    return await this.#desktopExtensions.setPluginEnabled(request);
  }

  async openDesktopAppInstall(
    request: DesktopAppInstallRequest,
  ): Promise<DesktopExtensionOverviewResult> {
    return await this.#desktopExtensions.openAppInstall(request);
  }

  async removeDesktopApp(
    request: DesktopAppRemoveRequest,
  ): Promise<DesktopExtensionOverviewResult> {
    return await this.#desktopExtensions.removeApp(request);
  }

  async setDesktopAppEnabled(
    request: DesktopAppEnabledRequest,
  ): Promise<DesktopExtensionOverviewResult> {
    return await this.#desktopExtensions.setAppEnabled(request);
  }

  async setDesktopMcpServerEnabled(
    request: DesktopMcpServerEnabledRequest,
  ): Promise<DesktopExtensionOverviewResult> {
    return await this.#desktopExtensions.setMcpServerEnabled(request);
  }

  async setDesktopSkillEnabled(
    request: DesktopSkillEnabledRequest,
  ): Promise<DesktopExtensionOverviewResult> {
    return await this.#desktopExtensions.setSkillEnabled(request);
  }

  async uninstallDesktopSkill(
    request: DesktopSkillUninstallRequest,
  ): Promise<DesktopExtensionOverviewResult> {
    return await this.#desktopExtensions.uninstallSkill(request);
  }

  async getDesktopTeamState(): Promise<DesktopTeamStateResult> {
    return await this.#desktopTenant.getTeamState();
  }

  async createDesktopFirstTeam(request: DesktopCreateFirstTeamRequest): Promise<DesktopTeamStateResult> {
    return await this.#desktopTenant.createFirstTeam(request);
  }

  async saveDesktopTeamMember(request: DesktopSaveTeamMemberRequest): Promise<DesktopTeamStateResult> {
    return await this.#desktopTenant.saveTeamMember(request);
  }

  async listDesktopAutomations(): Promise<DesktopAutomationListResult> {
    return await this.#desktopAutomations.listAutomations();
  }

  async getDesktopAutomation(id: string): Promise<DesktopAutomationDetailResult> {
    return await this.#desktopAutomations.getAutomation(id);
  }

  async saveDesktopAutomation(
    request: DesktopAutomationSaveRequest,
  ): Promise<DesktopAutomationDetailResult> {
    return await this.#desktopAutomations.saveAutomation(request);
  }

  async deleteDesktopAutomation(request: DesktopAutomationDeleteRequest): Promise<void> {
    await this.#desktopAutomations.deleteAutomation(request);
  }

  async runDesktopAutomationNow(
    request: DesktopAutomationRunNowRequest,
  ): Promise<DesktopAutomationDetailResult> {
    const detail = await this.#desktopAutomations.getAutomation(request.id);
    const cwd = detail.automation.cwds[0] ?? null;
    const startedAt = new Date().toISOString();
    try {
      const result = await this.runDesktopTask({
        prompt: detail.automation.prompt,
        cwd,
        workspaceRoot: detail.automation.executionEnvironment === "worktree" ? cwd : null,
        model: detail.automation.model,
        reasoningEffort: detail.automation.reasoningEffort,
      });
      return await this.#desktopAutomations.recordAutomationRun(request.id, {
        startedAt,
        finishedAt: result.status === "permissionRequired" ? new Date().toISOString() : null,
        status: result.status === "permissionRequired" ? "failed" : "started",
        threadId: result.threadId,
        note:
          result.status === "permissionRequired"
            ? "Workspace permission required."
            : result.status === "approvalRequired"
              ? "Awaiting approval from the Automations page."
              : "Started from the Automations page.",
      });
    } catch (error) {
      return await this.#desktopAutomations.recordAutomationRun(request.id, {
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "failed",
        threadId: null,
        note: error instanceof Error ? error.message : "Automation run failed.",
      });
    }
  }

  async substrateRecentWorkspaces(limit = 20): Promise<SubstrateWorkspacesResult> {
    return await this.#desktopQueries.substrateRecentWorkspaces(limit);
  }

  async substrateRecentSessions(limit = 20): Promise<SubstrateSessionsResult> {
    return await this.#desktopQueries.substrateRecentSessions(limit);
  }

  async substrateSessionsByWorkspace(workspaceId: string, limit = 20): Promise<SubstrateSessionsResult> {
    return await this.#desktopQueries.substrateSessionsByWorkspace(workspaceId, limit);
  }

  async substrateSessionDetail(sessionId: string): Promise<SubstrateSessionDetailResult> {
    return await this.#desktopQueries.substrateSessionDetail(sessionId);
  }

  async substrateWorkspaceDetail(workspaceId: string): Promise<SubstrateWorkspaceDetailResult> {
    return await this.#desktopQueries.substrateWorkspaceDetail(workspaceId);
  }

  async substrateEventsBySession(sessionId: string, limit = 100): Promise<SubstrateEventsResult> {
    return await this.#desktopQueries.substrateEventsBySession(sessionId, limit);
  }

  async substrateObjectRefsBySession(sessionId: string, limit = 100): Promise<SubstrateObjectRefsResult> {
    return await this.#desktopQueries.substrateObjectRefsBySession(sessionId, limit);
  }

  async projectedWorkspaces(limit = 20): Promise<ProjectedWorkspacesResult> {
    return await this.#desktopQueries.projectedWorkspaces(limit);
  }

  async projectedWorkspaceByRoot(rootPath: string): Promise<ProjectedWorkspaceDetailResult> {
    return await this.#desktopQueries.projectedWorkspaceByRoot(rootPath);
  }

  async projectedSessions(workspaceId: string | null = null, limit = 20): Promise<ProjectedSessionsResult> {
    return await this.#desktopQueries.projectedSessions(workspaceId, limit);
  }

  async listModels(): Promise<DesktopModelListResult> {
    return await this.#desktopSettings.listModels();
  }
}
