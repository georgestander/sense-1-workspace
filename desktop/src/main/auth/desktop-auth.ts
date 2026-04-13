import { getDesktopBootstrap, resolveChatgptSignInUrl, resolveDesktopProfile } from "../bootstrap/desktop-bootstrap.js";
import type { LaunchChatgptSignInResult, LogoutChatgptResult } from "../contracts";
import {
  clearE2EAuthFixtureProfile,
  isE2EAuthFixtureEnabled,
  setE2EAuthFixtureSignedIn,
} from "../e2e-auth-fixture.ts";
import { persistActiveProfileId } from "../profile/profile-state.js";
import type { AppServerProcessManager } from "../runtime/app-server-process-manager.js";

type RuntimeInfo = {
  apiVersion?: "1.0.0";
  appVersion?: string;
  electronVersion?: string;
  platform?: NodeJS.Platform;
  startedAt?: string;
};

type LaunchDesktopChatgptSignInOptions = {
  appStartedAt?: string;
  env?: NodeJS.ProcessEnv;
  openExternal: (url: string) => Promise<unknown>;
  runtimeInfo?: RuntimeInfo;
};

type LogoutDesktopChatgptOptions = {
  env?: NodeJS.ProcessEnv;
};

type AccountLoginStartResult = {
  authUrl?: unknown;
};

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function launchDesktopChatgptSignIn(
  manager: AppServerProcessManager,
  {
    appStartedAt,
    env = process.env,
    openExternal,
    runtimeInfo = {},
  }: LaunchDesktopChatgptSignInOptions,
): Promise<LaunchChatgptSignInResult> {
  const fallbackUrl = resolveChatgptSignInUrl(env);

  if (isE2EAuthFixtureEnabled(env)) {
    const fixtureEmail = env.SENSE1_E2E_AUTH_EMAIL?.trim() || null;
    const fixtureProfileId = (await resolveDesktopProfile(env)).id;
    await persistActiveProfileId(fixtureProfileId, env);
    await setE2EAuthFixtureSignedIn(fixtureProfileId, env, {
      accountType: "chatgpt",
      email: fixtureEmail,
    });
    return {
      success: true,
      url: fallbackUrl,
      completed: true,
    };
  }

  try {
    await getDesktopBootstrap(manager, { env, appStartedAt, runtimeInfo });
  } catch {
    // Continue anyway so auth can still be attempted even if bootstrap is degraded.
  }

  let authUrl = fallbackUrl;
  try {
    const result = (await manager.request("account/login/start", {
      type: "chatgpt",
    })) as AccountLoginStartResult;
    authUrl =
      (typeof result?.authUrl === "string" && result.authUrl.trim()) ||
      fallbackUrl;
  } catch (error) {
    authUrl = fallbackUrl;
    try {
      await openExternal(authUrl);
      return {
        success: true,
        url: authUrl,
        reason: `Fell back to direct ChatGPT login: ${formatError(error)}`,
      };
    } catch (openError) {
      return {
        success: false,
        url: authUrl,
        reason: formatError(openError),
      };
    }
  }

  try {
    await openExternal(authUrl);
    return {
      success: true,
      url: authUrl,
    };
  } catch (error) {
    return {
      success: false,
      url: authUrl,
      reason: formatError(error),
    };
  }
}

export async function logoutDesktopChatgpt(
  manager: AppServerProcessManager,
  { env = process.env }: LogoutDesktopChatgptOptions = {},
): Promise<LogoutChatgptResult> {
  if (isE2EAuthFixtureEnabled(env)) {
    const profile = await resolveDesktopProfile(env);
    await clearE2EAuthFixtureProfile(profile.id, env);
    return {
      success: true,
    };
  }

  try {
    await manager.request("account/logout");
    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      reason: formatError(error),
    };
  }
}
