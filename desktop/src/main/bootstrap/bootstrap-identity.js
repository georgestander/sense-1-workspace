import { loadProfileIdentity, persistProfileIdentity } from "../profile/profile-state.js";

export async function buildDesktopIdentityState(profile, auth, env = process.env) {
  const identity = await loadProfileIdentity(profile.id, env);
  const displayName = typeof identity?.displayName === "string" && identity.displayName.trim()
    ? identity.displayName.trim()
    : null;
  const needsDisplayName = Boolean(auth?.isSignedIn) && !displayName;
  return {
    displayName,
    inferredDisplayName: displayName,
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
