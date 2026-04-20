import { getDesktopBootstrap, resolveChatgptSignInUrl, resolveDesktopProfile } from "../bootstrap/desktop-bootstrap.js";
import type {
  DesktopAuthLoginMethod,
  DesktopAuthLoginRequest,
  DesktopAuthLogoutResult,
  DesktopAuthStartResult,
} from "../contracts";
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

type StartDesktopAuthLoginOptions = {
  request: DesktopAuthLoginRequest;
  appStartedAt?: string;
  env?: NodeJS.ProcessEnv;
  openExternal: (url: string) => Promise<unknown>;
  runtimeInfo?: RuntimeInfo;
};

type LogoutDesktopAuthOptions = {
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

function buildAuthStartFailure(method: DesktopAuthLoginMethod, reason: string): DesktopAuthStartResult {
  return {
    success: false,
    method,
    url: null,
    reason,
  };
}

export async function startDesktopAuthLogin(
  manager: AppServerProcessManager,
  {
    request,
    appStartedAt,
    env = process.env,
    openExternal,
    runtimeInfo = {},
  }: StartDesktopAuthLoginOptions,
): Promise<DesktopAuthStartResult> {
  const fallbackUrl = resolveChatgptSignInUrl(env);
  const method = request.method;

  if (isE2EAuthFixtureEnabled(env)) {
    const fixtureEmail = env.SENSE1_E2E_AUTH_EMAIL?.trim() || null;
    const fixtureProfileId = (await resolveDesktopProfile(env)).id;
    await persistActiveProfileId(fixtureProfileId, env);
    await setE2EAuthFixtureSignedIn(fixtureProfileId, env, {
      accountType: method === "apiKey" ? "apiKey" : "chatgpt",
      email: fixtureEmail,
    });
    return {
      success: true,
      method,
      url: method === "chatgpt" ? fallbackUrl : null,
      completed: true,
    };
  }

  try {
    await getDesktopBootstrap(manager, { env, appStartedAt, runtimeInfo });
  } catch {
    // Continue anyway so auth can still be attempted even if bootstrap is degraded.
  }

  if (method === "apiKey") {
    const apiKey = typeof request.apiKey === "string" ? request.apiKey.trim() : "";
    if (!apiKey) {
      return buildAuthStartFailure("apiKey", "Enter an OpenAI API key to continue.");
    }

    try {
      await manager.request("account/login/start", {
        type: "apiKey",
        apiKey,
      });
      return {
        success: true,
        method: "apiKey",
        url: null,
        completed: true,
      };
    } catch (error) {
      return buildAuthStartFailure("apiKey", formatError(error));
    }
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
        method: "chatgpt",
        url: authUrl,
        reason: `Fell back to direct ChatGPT login: ${formatError(error)}`,
      };
    } catch (openError) {
      return {
        success: false,
        method: "chatgpt",
        url: authUrl,
        reason: formatError(openError),
      };
    }
  }

  try {
    await openExternal(authUrl);
    return {
      success: true,
      method: "chatgpt",
      url: authUrl,
    };
  } catch (error) {
    return {
      success: false,
      method: "chatgpt",
      url: authUrl,
      reason: formatError(error),
    };
  }
}

export async function logoutDesktopAuth(
  manager: AppServerProcessManager,
  { env = process.env }: LogoutDesktopAuthOptions = {},
): Promise<DesktopAuthLogoutResult> {
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
