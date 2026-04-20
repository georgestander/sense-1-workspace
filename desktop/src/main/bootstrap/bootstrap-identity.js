import { loadProfileIdentity, persistProfileIdentity } from "../profile/profile-state.js";

function humanizeEmailLocalPart(localPart) {
  if (typeof localPart !== "string") {
    return null;
  }
  const base = localPart.split("+")[0];
  const normalized = base.replace(/[._-]+/g, " ").trim().replace(/\s+/g, " ");
  if (!normalized || !/[a-zA-Z]/.test(normalized)) {
    return null;
  }
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function inferDisplayNameFromAuth(auth) {
  const name = typeof auth?.name === "string" ? auth.name.trim() : "";
  if (name) {
    return name;
  }

  const email = typeof auth?.email === "string" ? auth.email.trim() : "";
  if (!email) {
    return null;
  }
  const atIndex = email.indexOf("@");
  const localPart = atIndex === -1 ? email : email.slice(0, atIndex);
  return humanizeEmailLocalPart(localPart);
}

export async function buildDesktopIdentityState(profile, auth, env = process.env) {
  const identity = await loadProfileIdentity(profile.id, env);
  const persistedDisplayName = typeof identity?.displayName === "string" && identity.displayName.trim()
    ? identity.displayName.trim()
    : null;
  const inferredFromAuth = inferDisplayNameFromAuth(auth);
  const inferredDisplayName = persistedDisplayName ?? inferredFromAuth;
  const needsDisplayName = Boolean(auth?.isSignedIn) && !persistedDisplayName && !inferredFromAuth;
  return {
    displayName: persistedDisplayName,
    inferredDisplayName,
    needsDisplayName,
  };
}

export async function completeDesktopDisplayName({ profileId, displayName, env = process.env }) {
  const trimmed = typeof displayName === "string" ? displayName.trim() : "";
  if (!trimmed) {
    return { success: false, reason: "Enter a name before continuing." };
  }

  try {
    await persistProfileIdentity(profileId, { displayName: trimmed }, env);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
