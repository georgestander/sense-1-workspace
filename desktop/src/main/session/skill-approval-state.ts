import fs from "node:fs/promises";

import type { DesktopAppServerInputItem } from "../contracts";
import {
  buildSkillApprovalKey,
  isSkillApprovalPath,
  normalizeSkillApprovalPath,
} from "../../shared/skill-approval-key.js";

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

export async function resolveSkillApprovalKey(skillPath: string): Promise<string | null> {
  const normalizedPath = normalizeSkillApprovalPath(skillPath);
  if (!normalizedPath || !isSkillApprovalPath(normalizedPath)) {
    return null;
  }

  try {
    const stat = await fs.stat(normalizedPath);
    return buildSkillApprovalKey(normalizedPath, String(Math.floor(stat.mtimeMs)));
  } catch {
    return buildSkillApprovalKey(normalizedPath, "missing");
  }
}

export async function collectSkillApprovalKeys(
  inputItems: DesktopAppServerInputItem[],
): Promise<string[]> {
  const skillPaths = uniqueStrings(
    inputItems
      .filter((item): item is DesktopAppServerInputItem & { type: "mention"; path?: string } => item.type === "mention")
      .map((item) => normalizeSkillApprovalPath(item.path))
      .filter((skillPath): skillPath is string => Boolean(skillPath && isSkillApprovalPath(skillPath))),
  );

  return uniqueStrings(
    await Promise.all(
      skillPaths.map(async (skillPath) => await resolveSkillApprovalKey(skillPath)),
    ),
  );
}
