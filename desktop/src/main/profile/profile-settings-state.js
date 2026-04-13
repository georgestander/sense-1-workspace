import fs from "node:fs/promises";
import path from "node:path";

import {
  ensureProfileDirectories,
  fileExists,
  resolveProfileRoot,
  sanitizeProfileId,
} from "./profile-paths.js";

const SETTINGS_FILE = "settings.json";

function resolveSettingsFile(profileId, env = process.env) {
  return path.join(resolveProfileRoot(sanitizeProfileId(profileId), env), SETTINGS_FILE);
}

export async function loadDesktopSettings(profileId, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  const targetFile = resolveSettingsFile(profile, env);

  if (!(await fileExists(targetFile))) {
    return {};
  }

  try {
    const raw = await fs.readFile(targetFile, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function persistDesktopSettings(profileId, settings, env = process.env) {
  const profile = sanitizeProfileId(profileId);
  await ensureProfileDirectories(profile, env);
  const targetFile = resolveSettingsFile(profile, env);

  await fs.writeFile(
    targetFile,
    JSON.stringify(
      {
        ...settings,
        updated_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
}
