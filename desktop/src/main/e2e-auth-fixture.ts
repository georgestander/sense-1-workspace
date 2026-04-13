import fs from "node:fs/promises";
import path from "node:path";

import { resolveRuntimeStateRoot, sanitizeProfileId } from "./profile/profile-state.js";

const E2E_AUTH_FIXTURE_FILE = "_e2e-auth-fixture.json";

type E2EAuthFixtureProfile = {
  accountType: string;
  email: string;
  updatedAt?: string;
};

type E2EAuthFixtureState = {
  profiles: Record<string, E2EAuthFixtureProfile>;
};

type SetE2EAuthFixtureSignedInOptions = {
  accountType?: string | null;
  email?: string | null;
};

function resolveFixturePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveRuntimeStateRoot(env), E2E_AUTH_FIXTURE_FILE);
}

export function isE2EAuthFixtureEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "test" && env.SENSE1_E2E_AUTH_FIXTURE === "1";
}

async function readFixtureState(env: NodeJS.ProcessEnv = process.env): Promise<E2EAuthFixtureState> {
  const fixturePath = resolveFixturePath(env);

  try {
    const raw = await fs.readFile(fixturePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { profiles: {} };
    }

    const profiles = (parsed as { profiles?: unknown }).profiles;
    if (!profiles || typeof profiles !== "object") {
      return { profiles: {} };
    }

    return { profiles: profiles as Record<string, E2EAuthFixtureProfile> };
  } catch {
    return { profiles: {} };
  }
}

async function writeFixtureState(
  state: E2EAuthFixtureState,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const fixturePath = resolveFixturePath(env);
  await fs.mkdir(path.dirname(fixturePath), { recursive: true });
  await fs.writeFile(fixturePath, JSON.stringify(state, null, 2), "utf8");
}

export async function readE2EAuthFixtureProfile(
  profileId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ email: string; accountType: string } | null> {
  if (!isE2EAuthFixtureEnabled(env)) {
    return null;
  }

  const state = await readFixtureState(env);
  const profile = state.profiles[sanitizeProfileId(profileId)];
  if (!profile || typeof profile !== "object") {
    return null;
  }

  const email = typeof profile.email === "string" ? profile.email.trim() : "";
  if (!email) {
    return null;
  }

  const accountType = typeof profile.accountType === "string" ? profile.accountType.trim() : "chatgpt";

  return {
    email,
    accountType: accountType || "chatgpt",
  };
}

export async function setE2EAuthFixtureSignedIn(
  profileId: string,
  env: NodeJS.ProcessEnv = process.env,
  options: SetE2EAuthFixtureSignedInOptions = {},
): Promise<void> {
  if (!isE2EAuthFixtureEnabled(env)) {
    return;
  }

  const profile = sanitizeProfileId(profileId);
  const state = await readFixtureState(env);
  const email =
    (typeof options.email === "string" && options.email.trim()) ||
    `${profile}@example.com`;
  const accountType =
    (typeof options.accountType === "string" && options.accountType.trim()) ||
    "chatgpt";

  await writeFixtureState(
    {
      ...state,
      profiles: {
        ...state.profiles,
        [profile]: {
          email,
          accountType,
          updatedAt: new Date().toISOString(),
        },
      },
    },
    env,
  );
}

export async function clearE2EAuthFixtureProfile(
  profileId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!isE2EAuthFixtureEnabled(env)) {
    return;
  }

  const profile = sanitizeProfileId(profileId);
  const state = await readFixtureState(env);
  const nextProfiles = { ...state.profiles };
  delete nextProfiles[profile];

  await writeFixtureState(
    {
      ...state,
      profiles: nextProfiles,
    },
    env,
  );
}
