import {
  ensureProfileDirectories,
  loadProfileIdentity,
  persistActiveProfileId,
  persistProfileIdentity,
  resolveProfileCodexHome,
  resolveProfileRoot,
  resolveProfileSubstrateDbPath,
  sanitizeProfileId,
} from "../profile/profile-state.js";
import { ensurePrimaryDesktopProfile } from "../profile/profile-merge.js";
import { isE2EAuthFixtureEnabled, readE2EAuthFixtureProfile } from "../e2e-auth-fixture.ts";
import { ensureProfileSubstrate } from "../substrate/substrate.js";
import { firstString } from "./bootstrap-shared.js";

const DEFAULT_SIGN_IN_URL = "https://chatgpt.com/auth/login";
const ACCOUNT_READ_PARAMS = { refreshToken: false };

export async function resolveDesktopProfile(env = process.env) {
  const override = env.SENSE1_PROFILE_ID?.trim();
  if (override) {
    const profileId = sanitizeProfileId(override);
    const ensured = await ensureProfileDirectories(profileId, env);
    await ensureProfileSubstrate({
      dbPath: resolveProfileSubstrateDbPath(profileId, env),
      profileId,
    });
    return {
      id: profileId,
      source: "environment",
      rootPath: ensured.profileRoot,
      codexHome: ensured.codexHome,
    };
  }

  const profile = await ensurePrimaryDesktopProfile({ env });
  await ensureProfileSubstrate({
    dbPath: resolveProfileSubstrateDbPath(profile.id, env),
    profileId: profile.id,
  });
  return profile;
}

export async function selectDesktopProfile(profileId, env = process.env) {
  const requested = sanitizeProfileId(profileId);
  const override = env.SENSE1_PROFILE_ID?.trim();
  if (override) {
    const fixedProfileId = sanitizeProfileId(override);
    if (requested !== fixedProfileId) {
      return {
        success: false,
        reason: `Desktop profile is pinned to "${fixedProfileId}" by SENSE1_PROFILE_ID.`,
      };
    }

    const profile = await resolveDesktopProfile(env);
    return {
      success: true,
      profile,
    };
  }

  const ensured = await ensureProfileDirectories(requested, env);
  await persistActiveProfileId(requested, env);
  await ensureProfileSubstrate({
    dbPath: resolveProfileSubstrateDbPath(requested, env),
    profileId: requested,
  });
  return {
    success: true,
    profile: {
      id: requested,
      source: "stored",
      rootPath: resolveProfileRoot(requested, env),
      codexHome: ensured.codexHome,
    },
  };
}

export function resolveChatgptSignInUrl(env = process.env) {
  const explicitUrl = env.SENSE1_CHATGPT_SIGNIN_URL?.trim();
  return explicitUrl || DEFAULT_SIGN_IN_URL;
}

export function normalizeAuthState(result) {
  const account = result?.account ?? null;
  const email = firstString(account?.email);
  const name = firstString(account?.name);
  const accountType = firstString(account?.type);
  const normalizedAccountType = accountType?.toLowerCase() ?? null;
  const requiresOpenaiAuth =
    typeof result?.requiresOpenaiAuth === "boolean" ? result.requiresOpenaiAuth : email === null;

  return {
    isSignedIn: email !== null || normalizedAccountType === "apikey",
    email,
    name,
    accountType,
    requiresOpenaiAuth,
  };
}

export async function canonicalizeDesktopProfile(profile, auth, env = process.env) {
  if (env.SENSE1_PROFILE_ID?.trim()) {
    if (auth?.email) {
      await persistProfileIdentity(profile.id, {
        displayName: auth.name ?? null,
        email: auth.email,
        lastSignedInAt: new Date().toISOString(),
      }, env);
    }
    return profile;
  }

  return await ensurePrimaryDesktopProfile({
    currentProfileId: profile.id,
    displayName: auth?.name ?? null,
    email: auth?.email ?? null,
    env,
  });
}

export async function buildProfileOptions(profile, env = process.env) {
  if (env.SENSE1_PROFILE_ID?.trim()) {
    const identity = await loadProfileIdentity(profile.id, env);
    return [{
      id: profile.id,
      label: identity?.displayName || identity?.email || profile.id,
    }];
  }
  return [];
}

export async function resolveSignedInDesktopProfile(manager, env = process.env) {
  const profile = await resolveDesktopProfile(env);

  try {
    if (isE2EAuthFixtureEnabled(env)) {
      const fixtureAuth = await readE2EAuthFixtureProfile(profile.id, env);
      return await canonicalizeDesktopProfile(profile, {
        email: fixtureAuth?.email ?? null,
        name: null,
      }, env);
    }

    const authResult = await manager.request("account/read", ACCOUNT_READ_PARAMS);
    return await canonicalizeDesktopProfile(profile, normalizeAuthState(authResult), env);
  } catch {
    return profile;
  }
}
