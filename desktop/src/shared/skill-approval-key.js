const SKILL_APPROVAL_SEPARATOR = "::mtime:";

export function normalizeSkillApprovalPath(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replaceAll("\\", "/");
}

export function buildSkillApprovalKey(skillPath, versionToken) {
  const normalizedPath = normalizeSkillApprovalPath(skillPath);
  const normalizedVersion = typeof versionToken === "string" ? versionToken.trim() : "";
  if (!normalizedPath) {
    return "";
  }
  if (!normalizedVersion) {
    return normalizedPath;
  }
  return `${normalizedPath}${SKILL_APPROVAL_SEPARATOR}${normalizedVersion}`;
}

export function parseSkillApprovalKey(entry) {
  const normalizedEntry = normalizeSkillApprovalPath(entry);
  if (!normalizedEntry) {
    return {
      path: null,
      versionToken: null,
    };
  }

  const separatorIndex = normalizedEntry.lastIndexOf(SKILL_APPROVAL_SEPARATOR);
  if (separatorIndex === -1) {
    return {
      path: normalizedEntry,
      versionToken: null,
    };
  }

  return {
    path: normalizedEntry.slice(0, separatorIndex),
    versionToken: normalizedEntry.slice(separatorIndex + SKILL_APPROVAL_SEPARATOR.length) || null,
  };
}

export function matchesSkillApprovalPath(entry, skillPath) {
  return parseSkillApprovalKey(entry).path === normalizeSkillApprovalPath(skillPath);
}

export function commandMatchesSkillApprovalPath(command, entry) {
  const skillPath = parseSkillApprovalKey(entry).path;
  if (!skillPath || !Array.isArray(command)) {
    return false;
  }

  return command.some((part) => normalizeSkillApprovalPath(part) === skillPath);
}

export function isSkillApprovalPath(skillPath) {
  const normalizedPath = normalizeSkillApprovalPath(skillPath);
  return Boolean(normalizedPath?.endsWith("/SKILL.md"));
}
