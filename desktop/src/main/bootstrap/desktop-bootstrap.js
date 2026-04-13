import {
  loadLastSelectedThreadId,
  loadRecentWorkspaceFolders,
  loadThreadInteractionStates,
  loadThreadWorkspaceBindings,
  loadWorkspaceSidebarOrder,
  persistLastSelectedThreadId,
  resolveProfileSubstrateDbPath,
} from "../profile/profile-state.js";
import { isE2EAuthFixtureEnabled, readE2EAuthFixtureProfile } from "../e2e-auth-fixture.ts";
import { readDesktopThread } from "../runtime/live-thread-runtime.js";
import { buildDesktopRunContext } from "../session/run-context.ts";
import { listRecentWorkspaces, listRecentSessions } from "../substrate/substrate-reader.js";
import { ensureProfileSubstrate, getSubstrateActor } from "../substrate/substrate.js";
import { buildDesktopTeamSetupState, toDesktopBootstrapTenant } from "../tenant/desktop-tenant-service.ts";
import { applyTenantMembershipToActor, resolveTenantMembershipForProfile } from "../tenant/tenant-state.ts";
import { isWorkspaceArchived } from "../../shared/lifecycle.js";
import {
  buildProfileOptions,
  canonicalizeDesktopProfile,
  normalizeAuthState,
  resolveChatgptSignInUrl,
  resolveDesktopProfile,
  selectDesktopProfile,
} from "./bootstrap-profile.js";
import {
  applyBlockingSetup,
  buildRuntimeSetup,
  buildRuntimeStatus,
  classifyBootstrapRestoreSetup,
  classifyRuntimeSetup,
  ensureRuntimeReady,
  normalizeRuntimeState,
} from "./bootstrap-runtime.js";
import {
  buildSelectedThreadFallback,
  hydrateThreadInputRequestState,
  loadRecentThreads,
  loadThreadReviewContext,
  mergeRecentThreadMetadata,
  mergeSubstrateSessionsIntoRecentThreads,
  normalizeRecentThreads,
  resolveThreadWorkspaceRoot,
} from "./bootstrap-threads.js";
import { firstString } from "./bootstrap-shared.js";

const ACCOUNT_READ_PARAMS = { refreshToken: false };
const THREAD_LIST_PARAMS = {
  limit: 20,
  sortKey: "updated_at",
  sourceKinds: ["appServer"],
};

export {
  normalizeRecentThreads,
  resolveChatgptSignInUrl,
  resolveDesktopProfile,
  resolveThreadWorkspaceRoot,
  selectDesktopProfile,
};

export async function getDesktopBootstrap(
  manager,
  {
    env = process.env,
    appStartedAt,
    auditEvents = [],
    runtimeInfo = {},
    pendingApprovals = [],
    selectedThreadIdByProfile = {},
  } = {},
) {
  let profile = await resolveDesktopProfile(env);
  const provisionalProfileId = profile.id;
  let substrateDbPath = resolveProfileSubstrateDbPath(profile.id, env);
  let profileOptions = [];
  await manager.handleProfileChange(profile.codexHome);
  const runtime = normalizeRuntimeState(
    manager,
    appStartedAt || runtimeInfo.startedAt || new Date().toISOString(),
    runtimeInfo,
  );
  let runtimeSetup = null;

  try {
    await ensureRuntimeReady(manager);
  } catch (error) {
    const runtimeErrorMessage =
      firstString(manager.lastError) ||
      (error instanceof Error ? error.message : String(error));
    runtime.state = manager.state;
    runtime.restartCount = Number.isFinite(manager.restartCount) ? manager.restartCount : runtime.restartCount;
    runtime.lastStateAt =
      typeof manager.lastStateAt === "string" && manager.lastStateAt.trim()
        ? manager.lastStateAt
        : runtime.lastStateAt;
    runtimeSetup = classifyRuntimeSetup(runtimeErrorMessage);
    applyBlockingSetup(runtime, runtimeSetup, runtimeErrorMessage);
  }

  let auth = {
    isSignedIn: false,
    email: null,
    name: null,
    accountType: null,
    requiresOpenaiAuth: true,
  };
  let recentThreads = [];
  let recentFolders = [];
  let workspaceSidebarOrder = [];
  let lastSelectedThreadId = null;
  let effectiveLastSelectedThreadId = null;
  let primaryActor = null;
  let tenant = null;
  let selectedThread = null;
  let selectedThreadReadFailed = false;
  let workspaceRootByThreadId = {};
  let interactionStateByThreadId = {};
  let sessionTitleByThreadId = {};
  let archivedWorkspaceRoots = new Set();
  let archivedThreadIds = new Set();
  let recentSessions = [];
  let recentWorkspaces = [];

  if (!runtimeSetup) {
    try {
      if (isE2EAuthFixtureEnabled(env)) {
        const fixtureAuth = await readE2EAuthFixtureProfile(profile.id, env);
        auth = fixtureAuth
          ? {
              isSignedIn: true,
              email: fixtureAuth.email,
              accountType: fixtureAuth.accountType,
              requiresOpenaiAuth: false,
            }
          : {
              isSignedIn: false,
              email: null,
              accountType: null,
              requiresOpenaiAuth: true,
            };
      } else {
        const authResult = await manager.request("account/read", ACCOUNT_READ_PARAMS);
        auth = normalizeAuthState(authResult);
      }
      profile = await canonicalizeDesktopProfile(profile, auth, env);
      substrateDbPath = resolveProfileSubstrateDbPath(profile.id, env);
      profileOptions = await buildProfileOptions(profile, env);
      await manager.handleProfileChange(profile.codexHome);

      try {
        const bindings = await loadThreadWorkspaceBindings(profile.id, env);
        workspaceRootByThreadId = Object.fromEntries(
          bindings.map((binding) => [binding.threadId, binding.workspaceRoot]),
        );
      } catch {
        workspaceRootByThreadId = {};
      }

      try {
        const interactionStates = await loadThreadInteractionStates(profile.id, env);
        interactionStateByThreadId = Object.fromEntries(
          interactionStates.map((entry) => [entry.threadId, entry.interactionState]),
        );
      } catch {
        interactionStateByThreadId = {};
      }

      try {
        lastSelectedThreadId = await loadLastSelectedThreadId(profile.id, env);
      } catch {
        lastSelectedThreadId = null;
      }

      const selectedThreadIdOverrideExists =
        selectedThreadIdByProfile && (
          Object.prototype.hasOwnProperty.call(selectedThreadIdByProfile, profile.id)
          || Object.prototype.hasOwnProperty.call(selectedThreadIdByProfile, provisionalProfileId)
        );
      effectiveLastSelectedThreadId = selectedThreadIdOverrideExists
        ? firstString(
            selectedThreadIdByProfile[profile.id],
            selectedThreadIdByProfile[provisionalProfileId],
          )
        : lastSelectedThreadId;

      const substrateBootstrap = await ensureProfileSubstrate({
        actorEmail: auth.email,
        dbPath: substrateDbPath,
        profileId: profile.id,
      });
      tenant = await resolveTenantMembershipForProfile({
        profileId: profile.id,
        email: auth.email,
        env,
      });
      primaryActor = await getSubstrateActor({
        actorId: substrateBootstrap.actorId,
        dbPath: substrateDbPath,
      });
      primaryActor = applyTenantMembershipToActor(primaryActor, tenant);
      try {
        [recentSessions, recentWorkspaces] = await Promise.all([
          listRecentSessions({
            dbPath: substrateDbPath,
            profileId: profile.id,
            limit: 200,
          }),
          listRecentWorkspaces({
            dbPath: substrateDbPath,
            profileId: profile.id,
            limit: 200,
          }),
        ]);
        archivedThreadIds = new Set(
          recentSessions
            .filter((session) => session.status === "archived" && typeof session.codex_thread_id === "string")
            .map((session) => session.codex_thread_id.trim())
            .filter(Boolean),
        );
        archivedWorkspaceRoots = new Set(
          recentWorkspaces
            .filter((workspace) => isWorkspaceArchived(workspace.metadata))
            .map((workspace) => workspace.root_path)
            .filter(Boolean),
        );
      } catch {
        archivedThreadIds = new Set();
        archivedWorkspaceRoots = new Set();
        recentSessions = [];
        recentWorkspaces = [];
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      auth = {
        isSignedIn: false,
        email: null,
        name: null,
        accountType: null,
        requiresOpenaiAuth: true,
        error: message,
      };
      runtimeSetup = classifyBootstrapRestoreSetup("auth", error);
      applyBlockingSetup(runtime, runtimeSetup, message);
    }

    if (!runtimeSetup) {
      try {
        recentThreads = await loadRecentThreads(
          manager,
          profile.id,
          workspaceRootByThreadId,
          effectiveLastSelectedThreadId,
          interactionStateByThreadId,
          env,
          THREAD_LIST_PARAMS,
        );
      } catch (error) {
        recentThreads = [];
        runtimeSetup = classifyBootstrapRestoreSetup("threads", error);
        applyBlockingSetup(runtime, runtimeSetup);
      }
    }

    try {
      const recentSessions = await listRecentSessions({
        dbPath: substrateDbPath,
        profileId: profile.id,
        limit: 50,
      });
      sessionTitleByThreadId = Object.fromEntries(
        recentSessions
          .map((session) => [firstString(session.codex_thread_id), firstString(session.title)])
          .filter(([threadId, title]) => Boolean(threadId && title)),
      );
    } catch {
      sessionTitleByThreadId = {};
    }

    if (!runtimeSetup && effectiveLastSelectedThreadId) {
      try {
        const selectedWorkspaceRoot = await resolveThreadWorkspaceRoot(
          profile.id,
          effectiveLastSelectedThreadId,
          workspaceRootByThreadId,
          env,
        );
        const reviewContext = await loadThreadReviewContext(profile.id, effectiveLastSelectedThreadId, env);
        const selectedThreadResult = await readDesktopThread(
          manager,
          effectiveLastSelectedThreadId,
          selectedWorkspaceRoot,
          interactionStateByThreadId[effectiveLastSelectedThreadId] ?? null,
          reviewContext,
          reviewContext,
        );
        selectedThread = await hydrateThreadInputRequestState(selectedThreadResult.thread, substrateDbPath);
        if (!selectedThread) {
          selectedThread =
            buildSelectedThreadFallback(
              recentThreads.find((thread) => thread.id === effectiveLastSelectedThreadId) ?? null,
            );
        }
      } catch (error) {
        selectedThread = null;
        const message = error instanceof Error ? error.message : String(error);
        selectedThreadReadFailed = /\bthread\b.*\b(not found|does not exist|unknown)\b/i.test(message);
      }
    }
  }

  if (profileOptions.length === 0) {
    profileOptions = await buildProfileOptions(profile, env);
  }

  if (!selectedThread && effectiveLastSelectedThreadId && !selectedThreadReadFailed) {
    selectedThread =
      buildSelectedThreadFallback(
        recentThreads.find((thread) => thread.id === effectiveLastSelectedThreadId) ?? null,
      );
  }

  recentThreads = mergeRecentThreadMetadata(recentThreads, {
    lastSelectedThreadId: effectiveLastSelectedThreadId,
    selectedThread,
    sessionTitleByThreadId,
  });
  recentThreads = mergeSubstrateSessionsIntoRecentThreads(recentThreads, {
    sessions: recentSessions,
    workspaces: recentWorkspaces,
    interactionStateByThreadId,
    lastSelectedThreadId: effectiveLastSelectedThreadId,
  });
  const selectedThreadStillVisible = Boolean(
    effectiveLastSelectedThreadId
      && recentThreads.some((thread) => thread.id === effectiveLastSelectedThreadId),
  );
  recentThreads = recentThreads.filter((thread) => {
    const workspaceRoot = firstString(thread.workspaceRoot);
    return !archivedThreadIds.has(thread.id) && !(workspaceRoot && archivedWorkspaceRoots.has(workspaceRoot));
  });

  const selectedThreadWorkspaceRoot = firstString(selectedThread?.workspaceRoot);
  const selectedThreadHidden = Boolean(
    (selectedThread && archivedThreadIds.has(selectedThread.id))
      || (selectedThreadWorkspaceRoot && archivedWorkspaceRoots.has(selectedThreadWorkspaceRoot)),
  );
  if (selectedThreadHidden) {
    selectedThread = null;
  }

  if (selectedThreadReadFailed && effectiveLastSelectedThreadId && !selectedThreadStillVisible) {
    try {
      await persistLastSelectedThreadId(profile.id, null, env);
    } catch {
      // Ignore persistence failures during bootstrap recovery and fall back to the in-memory reset below.
    }
  }

  try {
    recentFolders = await loadRecentWorkspaceFolders(profile.id, env);
  } catch {
    recentFolders = [];
  }
  recentFolders = recentFolders.filter((folder) => !archivedWorkspaceRoots.has(folder.path));

  try {
    workspaceSidebarOrder = await loadWorkspaceSidebarOrder(profile.id, env);
  } catch {
    workspaceSidebarOrder = [];
  }
  workspaceSidebarOrder = workspaceSidebarOrder.filter((rootPath) => !archivedWorkspaceRoots.has(rootPath));

  const runContext = buildDesktopRunContext(
    {
      actor: primaryActor,
      email: auth.email,
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
      workspaceRoot: firstString(
        selectedThread?.workspaceRoot,
        firstString(workspaceRootByThreadId[effectiveLastSelectedThreadId]),
      ),
    },
  );

  return {
    profile,
    auth,
    runtime,
    profileId: profile.id,
    profileOptions,
    isSignedIn: auth.isSignedIn,
    accountEmail: auth.email,
    runtimeStatus: buildRuntimeStatus(runtime),
    runtimeSetup: buildRuntimeSetup(runtime),
    tenant: toDesktopBootstrapTenant(tenant),
    teamSetup: buildDesktopTeamSetupState({
      accountEmail: auth.email,
      tenant,
    }),
    runContext,
    auditEvents: Array.isArray(auditEvents) ? auditEvents : [],
    recentThreads,
    recentFolders,
    workspaceSidebarOrder,
    lastSelectedThreadId:
      selectedThreadReadFailed && !selectedThread && !selectedThreadStillVisible
        ? null
        : effectiveLastSelectedThreadId,
    selectedThread,
    pendingApprovals: Array.isArray(pendingApprovals) ? pendingApprovals : [],
  };
}
